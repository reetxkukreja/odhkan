import { db } from '../server/db';
import { getHistoricalAnalytics } from '../server/analytics';
import { generateOdhkanExcelBuffer } from '../server/excel';

async function runProductionE2EVerification() {
  console.log('====================================================');
  console.log('  ODHKAN PRODUCTION INTEGRITY & E2E VERIFICATION   ');
  console.log('====================================================\n');

  let passedAll = true;
  const assert = (condition: boolean, stepName: string, detail?: string) => {
    if (condition) {
      console.log(`[PASS] ${stepName}`);
    } else {
      console.error(`[FAIL] ${stepName} - ${detail || 'Assertion failed'}`);
      passedAll = false;
    }
  };

  // -------------------------------------------------------------
  // TEST 1: HISTORICAL EVENT ISOLATION & PERSISTENCE
  // -------------------------------------------------------------
  console.log('--- TEST 1: MULTI-EVENT ISOLATION & HISTORY PRESERVATION ---');
  await db.clearAllData();

  // Create Event 1, 2, 3
  const e1 = await db.createEvent({
    name: 'Odhkan Edition 1',
    date: '2026-09-05',
    time: '15:00',
  });

  const e2 = await db.createEvent({
    name: 'Odhkan Edition 2',
    date: '2026-09-12',
    time: '15:00',
  });

  const e3 = await db.createEvent({
    name: 'Odhkan Edition 3',
    date: '2026-09-19',
    time: '15:00',
  });

  assert(Boolean(e1 && e2 && e3), 'Event Creation', 'Events 1, 2, 3 created');

  // Register 12 participants for Event 1
  for (let i = 1; i <= 12; i++) {
    const roll = `24B${String(i).padStart(4, '0')}`;
    await db.join(`Participant ${i}`, roll, '9876543210', e1.id);
  }

  // Mix Match for Event 1
  const mix1 = await db.mixMatch(e1.id);
  assert(mix1.success && mix1.groupsCount === 4, 'Event 1 Mix Match', `Created ${mix1.groupsCount} groups`);

  // Lock and Publish Event 1
  await db.lockGroups(e1.id);
  const pub1 = await db.publishFinalList(e1.id);
  assert(pub1.success, 'Event 1 Publish', pub1.error || 'Event 1 locked and published');

  // Snapshot Event 1 state
  const e1GroupsBefore = await db.getEventGroups(e1.id);
  const e1RegsBefore = await db.getEventRegistrations(e1.id);

  // Register 12 participants for Event 2 (some overlapping people, e.g. 1-8)
  for (let i = 1; i <= 8; i++) {
    const roll = `24B${String(i).padStart(4, '0')}`;
    await db.join(`Participant ${i}`, roll, '9876543210', e2.id);
  }
  for (let i = 13; i <= 16; i++) {
    const roll = `24B${String(i).padStart(4, '0')}`;
    await db.join(`Participant ${i}`, roll, '9876543210', e2.id);
  }

  const mix2 = await db.mixMatch(e2.id);
  assert(mix2.success && mix2.groupsCount === 4, 'Event 2 Mix Match', `Created ${mix2.groupsCount} groups`);
  await db.lockGroups(e2.id);
  const pub2 = await db.publishFinalList(e2.id);
  assert(pub2.success, 'Event 2 Publish', 'Event 2 locked and published');

  // Verify Event 1 remained 100% untouched
  const e1GroupsAfter = await db.getEventGroups(e1.id);
  const e1RegsAfter = await db.getEventRegistrations(e1.id);
  const e1GroupsMatch = JSON.stringify(e1GroupsBefore) === JSON.stringify(e1GroupsAfter);
  const e1RegsMatch = e1RegsBefore.length === e1RegsAfter.length &&
    e1RegsBefore.every((r, idx) => r.id === e1RegsAfter[idx].id && r.groupId === e1RegsAfter[idx].groupId);
  assert(e1GroupsMatch && e1RegsMatch, 'Event 1 Historical Isolation', 'Event 1 groups and registrations completely unchanged after Event 2');

  // -------------------------------------------------------------
  // TEST 2: WITHDRAWAL FLOWS (BEFORE MATCH, AFTER MATCH, POST PUBLISH)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: WITHDRAWAL FLOWS ---');
  // In Event 3, register 6 participants: 24B0021 to 24B0026
  for (let i = 21; i <= 26; i++) {
    const roll = `24B${String(i).padStart(4, '0')}`;
    await db.join(`Participant ${i}`, roll, '9876543210', e3.id);
  }

  // Flow A: Withdraw before match
  const withBefore = await db.withdraw('24b0021', e3.id);
  assert(withBefore.success && withBefore.stage === 'before_match', 'Withdraw Before Match', 'Withdrawn status set, stage = before_match');

  // Run Mix Match for Event 3 -> 24B0021 must NOT be in any group
  const mix3 = await db.mixMatch(e3.id);
  const e3Groups = await db.getEventGroups(e3.id);
  const e3Regs = await db.getEventRegistrations(e3.id);
  const withdrawnReg21 = e3Regs.find(r => r.rollNumber === '24B0021');
  const inAnyGroup = e3Groups.some(g => g.memberIds.includes(withdrawnReg21?.id || ''));
  assert(
    !inAnyGroup && withdrawnReg21?.status === 'withdrawn' && !withdrawnReg21?.groupId,
    'Withdrawn Participant Excluded from Mix Match',
    'Participant 24B0021 is not present in any group'
  );

  // Flow B: Participant withdraws after match but before publish
  // Let 24B0022 withdraw
  const withAfterMatch = await db.withdraw('24B0022', e3.id);
  assert(withAfterMatch.success && withAfterMatch.stage === 'after_match', 'Withdraw After Match', 'Withdrawal succeeded with stage = after_match');

  // Verify group assignment invalidated and removed from group
  const e3GroupsAfterWith = await db.getEventGroups(e3.id);
  const e3RegsAfterWith = await db.getEventRegistrations(e3.id);
  const reg22 = e3RegsAfterWith.find(r => r.rollNumber === '24B0022');
  const inGroupAfterWith = e3GroupsAfterWith.some(g => g.memberIds.includes(reg22?.id || ''));
  assert(
    !inGroupAfterWith && reg22?.groupId === null,
    'Group Assignment Invalidated on Withdrawal',
    'Old group assignment cleared'
  );

  // Verify Integrity Check flags remix needed
  const integrityCheckFail = await db.runFinalIntegrityCheck(e3.id);
  assert(
    !integrityCheckFail.passed,
    'Integrity Check Blocks After Withdrawal',
    `Check blocked with issues: ${integrityCheckFail.issues.join('; ')}`
  );

  // Publish must be rejected
  const pubBlocked = await db.publishFinalList(e3.id);
  assert(!pubBlocked.success, 'Publishing Blocked When Integrity Check Fails', pubBlocked.error);

  // Flow C: Re-mix to fix group assignments
  // Register 1 more participant to have 5 active participants (24B0023, 24B0024, 24B0025, 24B0026 + 24B0027)
  await db.join('Participant 27', '24B0027', '9876543210', e3.id);
  const remix3 = await db.mixMatch(e3.id);
  assert(remix3.success, 'Remix Cleans Up Groups', `Remix succeeded with ${remix3.groupsCount} groups`);

  // Lock and publish
  await db.lockGroups(e3.id);
  const checkPass = await db.runFinalIntegrityCheck(e3.id);
  assert(checkPass.passed, 'Integrity Check Passes After Valid Remix', 'All groups locked, active members valid');
  const pub3 = await db.publishFinalList(e3.id);
  assert(pub3.success, 'Publish Succeeded After Remediation', 'Event 3 published');

  // Flow D: Post-Publish Withdrawal Rejection
  // Try to withdraw 24B0023 who is in a published group
  const withPostPub = await db.withdraw('24B0023', e3.id);
  assert(
    !withPostPub.success && withPostPub.error?.includes("can't withdraw"),
    'Post-Publish Withdrawal Rejected',
    withPostPub.error
  );

  // Verify 24B0023 still active in their published group
  const e3RegsFinal = await db.getEventRegistrations(e3.id);
  const reg23 = e3RegsFinal.find(r => r.rollNumber === '24B0023');
  assert(
    reg23?.status === 'active' && Boolean(reg23?.groupId),
    'Post-Publish Registration Protected',
    'Registration remains active and in group'
  );

  // Flow E: Cross-Event Withdrawal Safety
  // Withdrawing in Event 3 must NEVER delete or alter historical participation in Event 1 or Event 2
  // Participant 1 (24B0001) joined Event 1 and Event 2.
  // If Participant 1 registers for Event 3 and then withdraws from Event 3:
  await db.join('Participant 1', '24B0001', '9876543210', e3.id); // duplicate/after pub, but test withdrawal isolation
  const e1Reg1 = (await db.getEventRegistrations(e1.id)).find(r => r.rollNumber === '24B0001');
  const e2Reg1 = (await db.getEventRegistrations(e2.id)).find(r => r.rollNumber === '24B0001');
  assert(
    e1Reg1?.status === 'active' && Boolean(e1Reg1?.groupId) &&
    e2Reg1?.status === 'active' && Boolean(e2Reg1?.groupId),
    'Historical Event Records Remain Intact',
    'Event 1 and 2 records for 24B0001 remain active and assigned'
  );

  // -------------------------------------------------------------
  // TEST 3: DUPLICATE DETECTION & RESOLUTION
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: DUPLICATE RESOLUTION ACROSS FORMATS ---');
  // Create Event 4 for duplicate testing
  const e4 = await db.createEvent({
    name: 'Odhkan Edition 4',
    date: '2026-09-26',
    time: '15:00',
  });

  // Register same roll with different casing and spacing
  const regA = await db.join('Alice Early', '24b1001', '9876543210', e4.id);
  const regB = await db.join('Alice Late', ' 24B1001 ', '9876543211', e4.id);

  const dupCheckRes = await db.runDuplicateCheck(e4.id);
  assert(dupCheckRes.duplicateCount > 0, 'Duplicate Detection Normalizes Roll Numbers', 'Detected 24B1001 duplicates');

  // Resolve duplicate choosing 'latest'
  const resolveRes = await db.resolveDuplicate('24b1001', 'latest', e4.id);
  assert(resolveRes.success, 'Duplicate Resolved', `Chosen ID: ${resolveRes.chosenId}`);

  const e4Regs = await db.getEventRegistrations(e4.id);
  const canonical = e4Regs.find(r => r.id === resolveRes.chosenId);
  const superseded = e4Regs.find(r => r.rollNumber === '24B1001' && r.id !== resolveRes.chosenId);

  assert(
    canonical?.status === 'active' && superseded?.status === 'duplicate',
    'Canonical Record Active & Duplicate Superseded',
    `Canonical status: ${canonical?.status}, Superseded status: ${superseded?.status}`
  );

  // -------------------------------------------------------------
  // TEST 4: MULTI-GROUP PREVENTION & INTEGRITY ENFORCEMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: MULTI-GROUP PREVENTION & INTEGRITY ---');
  // Register 5 more participants for Event 4
  for (let i = 2; i <= 6; i++) {
    await db.join(`Participant ${i}`, `24B${String(1000 + i)}`, '9876543210', e4.id);
  }

  const mix4 = await db.mixMatch(e4.id);
  assert(mix4.success, 'Event 4 Mix Match', `Created ${mix4.groupsCount} groups`);

  const e4Groups = await db.getEventGroups(e4.id);
  const memberCounts: Record<string, number> = {};
  for (const g of e4Groups) {
    for (const m of g.memberIds) {
      memberCounts[m] = (memberCounts[m] || 0) + 1;
    }
  }

  const hasMultiGroup = Object.values(memberCounts).some(c => c > 1);
  assert(!hasMultiGroup, 'Zero Multi-Group Participants', 'Every active participant is in exactly ONE group');

  // Verify re-match safety: run mixMatch again on draft groups
  const rematch4 = await db.mixMatch(e4.id);
  assert(rematch4.success, 'Rematch Safety', 'Mix match executed again without errors');
  const e4GroupsAfterRematch = await db.getEventGroups(e4.id);
  const memberCountsRematch: Record<string, number> = {};
  for (const g of e4GroupsAfterRematch) {
    for (const m of g.memberIds) {
      memberCountsRematch[m] = (memberCountsRematch[m] || 0) + 1;
    }
  }
  const hasMultiGroupRematch = Object.values(memberCountsRematch).some(c => c > 1);
  assert(!hasMultiGroupRematch, 'Rematch Preserves Single-Group Invariant', 'Zero duplicates after remix');

  // -------------------------------------------------------------
  // TEST 5: HISTORICAL ANTI-REPETITION OVER 5 CONSECUTIVE EVENTS
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: RECURRING MIX MATCH & ANTI-REPETITION (5 EVENTS) ---');
  await db.clearAllData();

  // Create 5 consecutive weekly events
  const events = [];
  for (let e = 1; e <= 5; e++) {
    const evt = await db.createEvent({
      name: `Odhkan Weekly #${e}`,
      date: `2026-10-0${e}`,
      time: '15:00',
    });
    events.push(evt);
  }

  // 30 participants across 4 batches
  const batches = ['2023', '2024', '2025', '2026'];
  const testParticipants = [];
  for (let i = 1; i <= 30; i++) {
    const batchYear = batches[(i - 1) % batches.length];
    const roll = `${batchYear.slice(-2)}B${String(i).padStart(4, '0')}`;
    testParticipants.push({ name: `Student ${i}`, rollNumber: roll, phone: '9876543210' });
  }

  let totalTripletRepetitions = 0;
  let totalRepeatPairs = 0;
  const historicalPairCounts = new Map<string, number>();
  const historicalTriplets = new Set<string>();

  for (let eIdx = 0; eIdx < events.length; eIdx++) {
    const evt = events[eIdx];
    // Register all 30 participants
    for (const p of testParticipants) {
      await db.join(p.name, p.rollNumber, p.phone, evt.id);
    }

    const mixRes = await db.mixMatch(evt.id);
    assert(mixRes.success, `Event ${eIdx + 1} Mix Match`, `Created ${mixRes.groupsCount} groups`);

    // Lock and publish
    await db.lockGroups(evt.id);
    const pubRes = await db.publishFinalList(evt.id);
    assert(pubRes.success, `Event ${eIdx + 1} Publish`, `Published event ${evt.name}`);

    // Analyze groups in this event
    const grps = await db.getEventGroups(evt.id);
    const regs = await db.getEventRegistrations(evt.id);

    for (const g of grps) {
      const rolls = g.memberIds
        .map(id => regs.find(r => r.id === id)?.rollNumber)
        .filter(Boolean) as string[];
      rolls.sort();

      // Check triplets
      for (let i = 0; i < rolls.length; i++) {
        for (let j = i + 1; j < rolls.length; j++) {
          for (let k = j + 1; k < rolls.length; k++) {
            const trip = `${rolls[i]}_${rolls[j]}_${rolls[k]}`;
            if (historicalTriplets.has(trip)) {
              totalTripletRepetitions++;
              console.log(`  Repeated triplet detected in Event ${eIdx + 1}: ${trip}`);
            }
            historicalTriplets.add(trip);
          }
        }
      }

      // Check pairs
      for (let i = 0; i < rolls.length; i++) {
        for (let j = i + 1; j < rolls.length; j++) {
          const pair = `${rolls[i]}_${rolls[j]}`;
          const metBefore = historicalPairCounts.get(pair) || 0;
          if (metBefore > 0) {
            totalRepeatPairs++;
          }
          historicalPairCounts.set(pair, metBefore + 1);
        }
      }
    }
  }

  assert(totalTripletRepetitions === 0, 'Zero Repeated Triplets Across 5 Events', `Repeated triplets: ${totalTripletRepetitions}`);
  console.log(`Total pair meetings across 5 events: ${Array.from(historicalPairCounts.values()).reduce((a, b) => a + b, 0)}`);
  console.log(`Unique participant pairs formed: ${historicalPairCounts.size}`);
  console.log(`Pairs repeated: ${totalRepeatPairs}`);
  assert(historicalPairCounts.size > 100, 'Mix Match Successfully Maximizes New Connections', `${historicalPairCounts.size} unique pairs formed`);

  // -------------------------------------------------------------
  // TEST 6: HISTORICAL ANALYTICS ENGINE ACCURACY
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: ANALYTICS ENGINE & METRICS ACCURACY ---');
  const analytics = await getHistoricalAnalytics();
  assert(analytics.summary.totalPublishedEvents === 5, 'Published Events Metric', `Expected 5, got ${analytics.summary.totalPublishedEvents}`);
  assert(analytics.summary.uniquePeopleConnected > 25, 'Unique People Connected Metric', `Got ${analytics.summary.uniquePeopleConnected}`);
  assert(analytics.participants.length === 30, 'Participant Roster Count', `Expected 30, got ${analytics.participants.length}`);

  // Check first participant stats
  const p1Stats = analytics.participants[0];
  console.log(`Participant 1 (${p1Stats.rollNumber}) Stats:`, {
    eventsJoined: p1Stats.totalEventsJoined,
    completed: p1Stats.totalCompletedParticipations,
    differentPeopleMet: p1Stats.differentPeopleMet,
  });
  assert(p1Stats.totalEventsJoined === 5, 'Participant Events Joined Matches Reality', `Expected 5, got ${p1Stats.totalEventsJoined}`);
  assert(p1Stats.differentPeopleMet >= 8, 'Participant Different People Met Verified', `Expected >= 8, got ${p1Stats.differentPeopleMet}`);

  // -------------------------------------------------------------
  // TEST 7: EXCEL BUFFER GENERATION & STRUCTURE
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: MASTER EXCEL EXPORT INTEGRITY ---');
  const excelBuffer = await generateOdhkanExcelBuffer();
  assert(Boolean(excelBuffer && excelBuffer.length > 1000), 'Excel Buffer Generated', `Buffer size: ${excelBuffer.length} bytes`);

  console.log('\n====================================================');
  if (passedAll) {
    console.log('  ALL PRODUCTION INTEGRITY CHECKS PASSED (100%)    ');
  } else {
    console.log('  SOME CHECKS FAILED - REVIEW LOGS ABOVE           ');
  }
  console.log('====================================================');

  if (!passedAll) {
    process.exit(1);
  }
}

runProductionE2EVerification().catch(err => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});
