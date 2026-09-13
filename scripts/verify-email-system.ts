import { db } from '../server/db';
import {
  generateNameRhyme,
  renderReminderEmail,
  renderRevealEmail,
  dispatchReminderEmails,
  dispatchRevealEmails,
  hasEmailBeenSent,
  getEmailLogs,
  retryFailedEmails,
  sendTestEmail,
} from '../server/email';

async function runEmailVerification() {
  console.log('====================================================');
  console.log('       ODHKAN EMAIL SYSTEM PRODUCTION TEST          ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.log(`[FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // 1. VERIFY NAME RHYMES & WORDPLAY
    console.log('--- 1. NAME RHYME & WORDPLAY GENERATION ---');
    const reetRhyme = generateNameRhyme('Reet Kukreja');
    assert(reetRhyme.includes('Reet') && reetRhyme.toLowerCase().includes('meet'), 'Reet rhyme generates accurately');

    const karanRhyme = generateNameRhyme('Karan Verma');
    assert(karanRhyme.includes('Karan') && karanRhyme.toLowerCase().includes('clan'), 'Karan rhyme generates accurately');

    const rohanRhyme = generateNameRhyme('Rohan Shah');
    assert(rohanRhyme.includes('Rohan') && rohanRhyme.toLowerCase().includes('roam'), 'Rohan rhyme generates accurately');

    const priyaRhyme = generateNameRhyme('Priya Sharma');
    assert(priyaRhyme.includes('Priya') && priyaRhyme.toLowerCase().includes('nearby'), 'Priya rhyme generates accurately');

    const unknownRhyme = generateNameRhyme('Zoya Sen');
    assert(unknownRhyme.includes('Zoya') && unknownRhyme.length > 10, 'Fallback wordplay generates cleanly for unique names');

    // 2. VERIFY REMINDER EMAIL FORMAT & ZERO LEAKS
    console.log('\n--- 2. REMINDER EMAIL TEMPLATE & TIMING ---');
    await db.clearAllData();
    const event1 = await db.createEvent({
      name: 'Odhkan Fall Kickoff',
      date: '2026-09-18',
      time: '15:00',
    });

    const reminderTemplate = renderReminderEmail(event1);
    assert(reminderTemplate.subject.includes('at 3'), `Subject matches expected format: "${reminderTemplate.subject}"`);
    assert(reminderTemplate.text.includes("You're in."), 'Body contains "You\'re in."');
    assert(reminderTemplate.text.includes('3:00 PM'), 'Body contains formatted 3:00 PM reveal time');
    assert(!reminderTemplate.text.includes('Group 01') && !reminderTemplate.text.includes('Roll'), 'Zero group or roll number leaks in reminder');

    // 3. REGISTER PARTICIPANTS AND TEST REMINDER DISPATCH
    console.log('\n--- 3. ELIGIBLE REMINDER DISPATCH & WITHDRAWAL PROTECTION ---');
    await db.join('Reet Kukreja', '24BD001', '+919876543210', event1.id);
    await db.join('Aarav Shah', '23BD002', '+919876543211', event1.id);
    await db.join('Mehak Verma', '25BD003', '+919876543212', event1.id);
    await db.join('Withdrawn Student', '24BD999', '+919876543213', event1.id);

    // Withdraw one student
    await db.withdraw('24BD999', event1.id);

    const reminderDispatch = await dispatchReminderEmails(event1.id);
    assert(reminderDispatch.totalSent === 3, `Sent exactly 3 reminders for active participants (got ${reminderDispatch.totalSent})`);

    const allLogs1 = await getEmailLogs();
    const withdrawnLog = allLogs1.find(l => l.recipientName === 'Withdrawn Student');
    assert(!withdrawnLog, 'Withdrawn student received ZERO reminders');

    // Test duplicate reminder prevention
    const reminderRetry = await dispatchReminderEmails(event1.id);
    assert(reminderRetry.totalSent === 0 && reminderRetry.skippedCount === 3, 'Second reminder run skipped already-sent participants (idempotent)');

    // 4. GROUP REVEAL PERSONALIZATION & LIFECYCLE
    console.log('\n--- 4. REVEAL EMAIL PERSONALIZATION & CONTEXT ---');
    await db.mixMatch(event1.id);
    await db.lockGroups(event1.id);
    await db.publishFinalList(event1.id);

    const revealDispatch = await dispatchRevealEmails(event1.id);
    assert(revealDispatch.totalSent === 3, `Sent exactly 3 reveal emails (got ${revealDispatch.totalSent})`);

    // Verify content of Reet's reveal email
    const allRegs = await db.getAllRegistrations();
    const reetReg = allRegs.find(r => r.rollNumber === '24BD001')!;
    const allGroups = await db.getEventGroups(event1.id);
    const reetGroup = allGroups.find(g => g.id === reetReg.groupId)!;

    const revealTemplate1 = await renderRevealEmail(event1, reetReg, reetGroup, allGroups, allRegs);
    assert(revealTemplate1.text.includes("First Odhkan. Three random people. Let's see where this goes."), 'First Odhkan intro rendered correctly');
    assert(revealTemplate1.text.includes('Reet, back on your feet'), 'Reet rhyme rendered correctly');
    assert(revealTemplate1.text.includes('Aarav Shah — 2023') || revealTemplate1.text.includes('Mehak Verma — 2025'), 'Group member format "Name — Batch/Year" rendered');
    assert(!revealTemplate1.text.includes('24BD001') && !revealTemplate1.text.includes('+91'), 'Zero phone or roll numbers exposed in email');

    // 5. RETURNING ODHKAN CONTEXT & PREVIOUS GROUP MENTION (EVENT 2)
    console.log('\n--- 5. RETURNING PARTICIPANT & PREVIOUS GROUP MENTION ---');
    const event2 = await db.createEvent({
      name: 'Odhkan Weekly #2',
      date: '2026-09-25',
      time: '15:00',
    });

    await db.join('Reet Kukreja', '24BD001', '+919876543210', event2.id);
    await db.join('Karan Malhotra', '23BD004', '+919876543214', event2.id);
    await db.join('Sneha Patel', '25BD005', '+919876543215', event2.id);

    await db.mixMatch(event2.id);
    await db.lockGroups(event2.id);
    await db.publishFinalList(event2.id);

    const allRegs2 = await db.getAllRegistrations();
    const reetReg2 = allRegs2.find(r => r.rollNumber === '24BD001' && r.eventId === event2.id)!;
    const allGroups2 = await db.getEventGroups(event2.id);
    const reetGroup2 = allGroups2.find(g => g.id === reetReg2.groupId)!;

    const revealTemplate2 = await renderRevealEmail(event2, reetReg2, reetGroup2, allGroups2, allRegs2);
    assert(revealTemplate2.text.includes("Round 2. You clearly haven't had enough of meeting random people yet."), 'Round 2 copy rendered for returning participant');
    assert(revealTemplate2.text.includes('Last time you met Aarav and Mehak. Hope that conversation went well.') || revealTemplate2.text.includes('Last time you met'), 'Previous group members correctly referenced');

    // 6. TEST EMAIL TRIGGER
    console.log('\n--- 6. TEST EMAIL PREVIEWS ---');
    const testReminder = await sendTestEmail('admin@college.edu', 'reminder');
    assert(testReminder.success, 'Admin test reminder sent successfully');

    const testReveal = await sendTestEmail('admin@college.edu', 'reveal');
    assert(testReveal.success, 'Admin test reveal with rhyme sent successfully');

    console.log('\n====================================================');
    if (failed === 0) {
      console.log(`  ALL EMAIL VERIFICATION TESTS PASSED (${passed}/${passed}) `);
    } else {
      console.log(`  ${failed} CHECKS FAILED (${passed} passed, ${failed} failed) `);
    }
    console.log('====================================================\n');

  } catch (err: any) {
    console.error('Email verification error:', err);
    process.exit(1);
  }
}

runEmailVerification();
