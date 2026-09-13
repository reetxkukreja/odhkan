import * as XLSX from 'xlsx';
import { getHistoricalAnalytics } from './analytics';

export async function generateOdhkanExcelBuffer(): Promise<Buffer> {
  const data = await getHistoricalAnalytics();

  const workbook = XLSX.utils.book_new();

  // 1. PARTICIPANTS SHEET
  const participantsRows = data.participants.map(p => ({
    'Name': p.name,
    'Roll Number': p.rollNumber,
    'Batch': p.batch,
    'Phone Number': p.phoneNumber,
    'Total Events Joined': p.totalEventsJoined,
    'Total Events Withdrawn': p.totalEventsWithdrawn,
    'Total Completed Participations': p.totalCompletedParticipations,
    'Different People Met': p.differentPeopleMet,
    'Last Event': p.lastEvent,
  }));
  const participantsSheet = XLSX.utils.json_to_sheet(participantsRows);
  XLSX.utils.book_append_sheet(workbook, participantsSheet, 'PARTICIPANTS');

  // 2. EVENT HISTORY SHEET
  const eventHistoryRows = data.eventHistory.map(e => ({
    'Event Date': e.eventDate,
    'Event ID': e.eventId,
    'Name': e.name,
    'Roll Number': e.rollNumber,
    'Batch': e.batch,
    'Phone Number': e.phoneNumber,
    'Status': e.status,
    'Group ID': e.groupId,
    'Participated': e.participated,
    'Registration Time': e.registrationTime,
    'Withdrawal Time': e.withdrawalTime,
  }));
  const eventHistorySheet = XLSX.utils.json_to_sheet(eventHistoryRows);
  XLSX.utils.book_append_sheet(workbook, eventHistorySheet, 'EVENT HISTORY');

  // 3. GROUP HISTORY SHEET
  const groupHistoryRows = data.groupHistory.map(g => ({
    'Event Date': g.eventDate,
    'Group ID': g.groupId,
    'Member 1 Name': g.member1Name,
    'Member 1 Roll Number': g.member1RollNumber,
    'Member 1 Batch': g.member1Batch,
    'Member 2 Name': g.member2Name,
    'Member 2 Roll Number': g.member2RollNumber,
    'Member 2 Batch': g.member2Batch,
    'Member 3 Name': g.member3Name,
    'Member 3 Roll Number': g.member3RollNumber,
    'Member 3 Batch': g.member3Batch,
    'Member 4 Name': g.member4Name,
    'Member 4 Roll Number': g.member4RollNumber,
    'Member 4 Batch': g.member4Batch,
  }));
  const groupHistorySheet = XLSX.utils.json_to_sheet(groupHistoryRows);
  XLSX.utils.book_append_sheet(workbook, groupHistorySheet, 'GROUP HISTORY');

  // 4. CONNECTION HISTORY SHEET
  const connectionHistoryRows = data.connectionHistory.map(c => ({
    'Person 1': c.person1,
    'Person 1 Roll Number': c.person1RollNumber,
    'Person 1 Batch': c.person1Batch,
    'Person 2': c.person2,
    'Person 2 Roll Number': c.person2RollNumber,
    'Person 2 Batch': c.person2Batch,
    'Times Together': c.timesTogether,
    'Last Together': c.lastTogether,
    'Events Together': c.eventsTogether,
  }));
  const connectionHistorySheet = XLSX.utils.json_to_sheet(connectionHistoryRows);
  XLSX.utils.book_append_sheet(workbook, connectionHistorySheet, 'CONNECTION HISTORY');

  // 5. WITHDRAWAL HISTORY SHEET
  const withdrawalHistoryRows = data.withdrawalHistory.map(w => ({
    'Event Date': w.eventDate,
    'Event ID': w.eventId,
    'Name': w.name,
    'Roll Number': w.rollNumber,
    'Batch': w.batch,
    'Phone Number': w.phoneNumber,
    'Withdrawal Date': w.withdrawalDate,
    'Withdrawal Time': w.withdrawalTime,
    'Withdrawal Timestamp': w.withdrawalTimestamp,
    'Time Since Registration': w.timeSinceRegistration,
  }));
  const withdrawalHistorySheet = XLSX.utils.json_to_sheet(withdrawalHistoryRows);
  XLSX.utils.book_append_sheet(workbook, withdrawalHistorySheet, 'WITHDRAWAL HISTORY');

  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
