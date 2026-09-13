import { db, Registration, Group, OdhkanEvent } from './db';
import { parseISTDate } from './ist';

export interface ParticipantAnalytics {
  name: string;
  rollNumber: string;
  batch: string;
  phoneNumber: string;
  totalEventsJoined: number;
  totalEventsWithdrawn: number;
  totalCompletedParticipations: number;
  differentPeopleMet: number;
  lastEvent: string;
}

export interface EventHistoryRow {
  eventDate: string;
  eventId: string;
  name: string;
  rollNumber: string;
  batch: string;
  phoneNumber: string;
  status: string;
  groupId: string;
  participated: string;
  registrationTime: string;
  withdrawalTime: string;
}

export interface GroupHistoryRow {
  eventDate: string;
  groupId: string;
  member1Name: string;
  member1RollNumber: string;
  member1Batch: string;
  member2Name: string;
  member2RollNumber: string;
  member2Batch: string;
  member3Name: string;
  member3RollNumber: string;
  member3Batch: string;
  member4Name: string;
  member4RollNumber: string;
  member4Batch: string;
}

export interface ConnectionHistoryRow {
  person1: string;
  person1RollNumber: string;
  person1Batch: string;
  person2: string;
  person2RollNumber: string;
  person2Batch: string;
  timesTogether: number;
  lastTogether: string;
  eventsTogether: string;
}

export interface WithdrawalHistoryRow {
  eventDate: string;
  eventId: string;
  name: string;
  rollNumber: string;
  batch: string;
  phoneNumber: string;
  withdrawalDate: string;
  withdrawalTime: string;
  withdrawalTimestamp: string;
  timeSinceRegistration: string;
}

export interface EventWithdrawalAnalytics {
  eventId: string;
  eventName: string;
  eventDate: string;
  totalRegistrations: number;
  totalWithdrawals: number;
  withdrawalRate: number;
  firstWithdrawalIST: string | null;
  latestWithdrawalIST: string | null;
}

export interface WithdrawalActivityItem {
  id: string;
  name: string;
  rollNumber: string;
  batch: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  registeredAt: number;
  withdrawnAt: number;
  withdrawnStage?: string;
  formattedTimeIST: string;
  formattedDateIST: string;
  timeSinceRegistrationFormatted: string;
}

export interface HistoricalAnalyticsSummary {
  totalPublishedEvents: number;
  totalParticipants: number;
  uniquePeopleConnected: number;
  totalGroupsFormed: number;
  totalWithdrawals: number;
}

export interface HistoricalAnalyticsResult {
  summary: HistoricalAnalyticsSummary;
  participants: ParticipantAnalytics[];
  eventHistory: EventHistoryRow[];
  groupHistory: GroupHistoryRow[];
  connectionHistory: ConnectionHistoryRow[];
  withdrawalHistory: WithdrawalHistoryRow[];
  withdrawalAnalytics: EventWithdrawalAnalytics[];
  withdrawalActivity: WithdrawalActivityItem[];
}

export async function getHistoricalAnalytics(): Promise<HistoricalAnalyticsResult> {
  const events = await db.getEvents();
  const allRegistrations = await db.getAllRegistrations();
  const allGroups = await db.getAllGroups();

  const eventMap = new Map<string, OdhkanEvent>();
  for (const evt of events) {
    eventMap.set(evt.id, evt);
  }

  // Helper to format timestamps to readable IST strings
  const formatTime = (ts?: number | null) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    } catch {
      return '';
    }
  };

  const getEventDateString = (evt?: OdhkanEvent) => {
    if (!evt) return 'N/A';
    if (evt.eventDate) return evt.eventDate;
    const ist = parseISTDate(evt.revealTime);
    return ist.dateFormatted;
  };

  // Build registration lookup by ID
  const regById = new Map<string, Registration>();
  for (const reg of allRegistrations) {
    regById.set(reg.id, reg);
  }

  // 1. Group History
  const groupHistory: GroupHistoryRow[] = [];
  // Also collect groups per event for connection analysis
  // Group ID -> array of active/valid member registrations
  for (const group of allGroups) {
    const evt = group.eventId ? eventMap.get(group.eventId) : undefined;
    const eventDate = getEventDateString(evt);

    const members: Registration[] = [];
    for (const mId of group.memberIds) {
      const r = regById.get(mId);
      if (r) members.push(r);
    }

    // Sort members alphabetically or by roll for consistency
    members.sort((a, b) => a.name.localeCompare(b.name));

    groupHistory.push({
      eventDate,
      groupId: group.name || group.id,
      member1Name: members[0]?.name || '',
      member1RollNumber: members[0]?.rollNumber || '',
      member1Batch: members[0]?.batch || '',
      member2Name: members[1]?.name || '',
      member2RollNumber: members[1]?.rollNumber || '',
      member2Batch: members[1]?.batch || '',
      member3Name: members[2]?.name || '',
      member3RollNumber: members[2]?.rollNumber || '',
      member3Batch: members[2]?.batch || '',
      member4Name: members[3]?.name || '',
      member4RollNumber: members[3]?.rollNumber || '',
      member4Batch: members[3]?.batch || '',
    });
  }

  // 2. Connection History & Different People Met
  // We only count connections formed in PUBLISHED (or completed) events
  // Requirement: "This should count unique people they have actually shared a group with across all published Odhkan events."
  // Connection pairs map: key = `${rollA}_${rollB}` where rollA < rollB
  interface PairData {
    rollA: string;
    nameA: string;
    batchA: string;
    rollB: string;
    nameB: string;
    batchB: string;
    count: number;
    events: string[];
    lastDate: string;
  }
  const pairMap = new Map<string, PairData>();

  // Roll number -> Set of unique roll numbers met across published events
  const peopleMetMap = new Map<string, Set<string>>();

  // Find published groups
  for (const group of allGroups) {
    const evt = group.eventId ? eventMap.get(group.eventId) : undefined;
    const isPublished = evt ? (evt.isPublished || evt.status === 'completed') : false;
    if (!isPublished) continue; // Only published groups count towards official connections

    const eventNameOrDate = evt?.name || getEventDateString(evt);
    const eventDate = getEventDateString(evt);

    // Active, non-withdrawn members only
    const validMembers: Registration[] = [];
    for (const mId of group.memberIds) {
      const r = regById.get(mId);
      if (r && r.status !== 'withdrawn') {
        validMembers.push(r);
      }
    }

    // Record pairs
    for (let i = 0; i < validMembers.length; i++) {
      const p1 = validMembers[i];
      if (!peopleMetMap.has(p1.rollNumber)) {
        peopleMetMap.set(p1.rollNumber, new Set<string>());
      }
      for (let j = i + 1; j < validMembers.length; j++) {
        const p2 = validMembers[j];
        if (!peopleMetMap.has(p2.rollNumber)) {
          peopleMetMap.set(p2.rollNumber, new Set<string>());
        }

        // Add to people met (unique)
        peopleMetMap.get(p1.rollNumber)!.add(p2.rollNumber);
        peopleMetMap.get(p2.rollNumber)!.add(p1.rollNumber);

        // Canonical pair key
        const isP1First = p1.rollNumber.localeCompare(p2.rollNumber) < 0;
        const first = isP1First ? p1 : p2;
        const second = isP1First ? p2 : p1;
        const pairKey = `${first.rollNumber}___${second.rollNumber}`;

        const existing = pairMap.get(pairKey);
        if (existing) {
          existing.count += 1;
          if (!existing.events.includes(eventNameOrDate)) {
            existing.events.push(eventNameOrDate);
          }
          existing.lastDate = eventDate;
        } else {
          pairMap.set(pairKey, {
            rollA: first.rollNumber,
            nameA: first.name,
            batchA: first.batch,
            rollB: second.rollNumber,
            nameB: second.name,
            batchB: second.batch,
            count: 1,
            events: [eventNameOrDate],
            lastDate: eventDate,
          });
        }
      }
    }
  }

  const connectionHistory: ConnectionHistoryRow[] = Array.from(pairMap.values()).map(p => ({
    person1: p.nameA,
    person1RollNumber: p.rollA,
    person1Batch: p.batchA,
    person2: p.nameB,
    person2RollNumber: p.rollB,
    person2Batch: p.batchB,
    timesTogether: p.count,
    lastTogether: p.lastDate,
    eventsTogether: p.events.join(', '),
  }));

  // Sort connection history by times together descending
  connectionHistory.sort((a, b) => b.timesTogether - a.timesTogether);

  // 3. Event History
  const eventHistory: EventHistoryRow[] = [];
  for (const reg of allRegistrations) {
    const evt = reg.eventId ? eventMap.get(reg.eventId) : undefined;
    const eventDate = getEventDateString(evt);
    const isPublished = evt ? (evt.isPublished || evt.status === 'completed') : false;

    // Participated: Yes if event was published, status was active/valid, and had a group
    const participated = isPublished && (reg.status === 'active' || reg.status === 'valid') && Boolean(reg.groupId)
      ? 'Yes'
      : 'No';

    eventHistory.push({
      eventDate,
      eventId: reg.eventId || evt?.id || 'evt_current',
      name: reg.name,
      rollNumber: reg.rollNumber,
      batch: reg.batch,
      phoneNumber: reg.phoneNumber || '',
      status: reg.status,
      groupId: reg.groupId || '',
      participated,
      registrationTime: formatTime(reg.registeredAt || reg.createdAt),
      withdrawalTime: formatTime(reg.withdrawnAt),
    });
  }

  // 4. Participants Analytics (Unique by normalized roll number)
  // Group all registrations by rollNumber
  const regByRoll = new Map<string, Registration[]>();
  for (const reg of allRegistrations) {
    if (!regByRoll.has(reg.rollNumber)) {
      regByRoll.set(reg.rollNumber, []);
    }
    regByRoll.get(reg.rollNumber)!.push(reg);
  }

  const participants: ParticipantAnalytics[] = [];
  for (const [roll, regs] of regByRoll.entries()) {
    // Sort registrations by registeredAt ascending
    regs.sort((a, b) => (a.registeredAt || 0) - (b.registeredAt || 0));
    const latest = regs[regs.length - 1];

    // Total events joined: unique events they registered for
    const uniqueEvents = new Set(regs.map(r => r.eventId || 'evt_current'));
    const totalEventsJoined = uniqueEvents.size;

    // Total events withdrawn: count of events where their status was withdrawn
    const withdrawnEvents = new Set(
      regs.filter(r => r.status === 'withdrawn').map(r => r.eventId || 'evt_current')
    );
    const totalEventsWithdrawn = withdrawnEvents.size;

    // Total completed participations:
    // "Only count events where they were active, matched and the final list was published."
    let completedParticipations = 0;
    let lastCompletedEventName = '';
    for (const r of regs) {
      const evt = r.eventId ? eventMap.get(r.eventId) : undefined;
      const isPublished = evt ? (evt.isPublished || evt.status === 'completed') : false;
      if (isPublished && (r.status === 'active' || r.status === 'valid') && r.groupId) {
        completedParticipations += 1;
        lastCompletedEventName = evt?.name || getEventDateString(evt);
      }
    }

    const latestEvt = latest.eventId ? eventMap.get(latest.eventId) : undefined;
    const lastEvent = lastCompletedEventName || latestEvt?.name || getEventDateString(latestEvt);

    const differentPeopleMet = peopleMetMap.get(roll)?.size || 0;

    participants.push({
      name: latest.name,
      rollNumber: roll,
      batch: latest.batch,
      phoneNumber: latest.phoneNumber || '',
      totalEventsJoined,
      totalEventsWithdrawn,
      totalCompletedParticipations: completedParticipations,
      differentPeopleMet,
      lastEvent,
    });
  }

  // Sort participants by roll number
  participants.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  // 5. Withdrawal History & Analytics
  const formatISTDateOnly = (ts?: number | null) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          });
    } catch {
      return '—';
    }
  };

  const formatISTTimeOnly = (ts?: number | null) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return isNaN(d.getTime())
        ? '—'
        : d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata',
          }) + ' IST';
    } catch {
      return '—';
    }
  };

  const formatISTDateTime = (ts?: number | null) => {
    if (!ts) return '—';
    const dateStr = formatISTDateOnly(ts);
    const timeStr = formatISTTimeOnly(ts);
    if (dateStr === '—' || timeStr === '—') return '—';
    return `${dateStr} · ${timeStr}`;
  };

  const formatDuration = (ms: number) => {
    if (ms <= 0) return '0 minutes';
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} minutes`;
    if (minutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
  };

  const withdrawalHistory: WithdrawalHistoryRow[] = [];
  const withdrawalActivity: WithdrawalActivityItem[] = [];

  // Find all withdrawn registrations across all events
  const withdrawnRegs = allRegistrations.filter(r => r.status === 'withdrawn' || Boolean(r.withdrawnAt));

  // Sort withdrawn registrations chronologically descending for activity feed
  const sortedWithdrawn = [...withdrawnRegs].sort((a, b) => (b.withdrawnAt || 0) - (a.withdrawnAt || 0));

  for (const reg of sortedWithdrawn) {
    const evt = reg.eventId ? eventMap.get(reg.eventId) : undefined;
    const eventDate = getEventDateString(evt);
    const eventName = evt?.name || `Odhkan (${eventDate})`;
    const withAt = reg.withdrawnAt || reg.updatedAt || Date.now();
    const regAt = reg.registeredAt || reg.createdAt || withAt;
    const durationStr = formatDuration(Math.max(0, withAt - regAt));

    withdrawalHistory.push({
      eventDate,
      eventId: reg.eventId || evt?.id || 'evt_current',
      name: reg.name,
      rollNumber: reg.rollNumber,
      batch: reg.batch,
      phoneNumber: reg.phoneNumber || '',
      withdrawalDate: formatISTDateOnly(withAt),
      withdrawalTime: formatISTTimeOnly(withAt),
      withdrawalTimestamp: new Date(withAt).toISOString(),
      timeSinceRegistration: durationStr,
    });

    withdrawalActivity.push({
      id: reg.id,
      name: reg.name,
      rollNumber: reg.rollNumber,
      batch: reg.batch,
      eventId: reg.eventId || evt?.id || 'evt_current',
      eventName,
      eventDate,
      registeredAt: regAt,
      withdrawnAt: withAt,
      withdrawnStage: reg.withdrawnStage,
      formattedTimeIST: formatISTTimeOnly(withAt),
      formattedDateIST: formatISTDateOnly(withAt),
      timeSinceRegistrationFormatted: durationStr,
    });
  }

  // Calculate per-event withdrawal analytics
  const withdrawalAnalytics: EventWithdrawalAnalytics[] = [];
  for (const evt of events) {
    const evtRegs = allRegistrations.filter(r => !r.eventId || r.eventId === evt.id);
    const totalRegs = evtRegs.length;
    const withList = evtRegs.filter(r => r.status === 'withdrawn' || Boolean(r.withdrawnAt));
    const totalWithdrawals = withList.length;
    const rate = totalRegs > 0 ? parseFloat(((totalWithdrawals / totalRegs) * 100).toFixed(1)) : 0;

    let firstWithdrawalIST: string | null = null;
    let latestWithdrawalIST: string | null = null;

    if (withList.length > 0) {
      const timestamps = withList
        .map(r => r.withdrawnAt || r.updatedAt)
        .filter(Boolean) as number[];
      if (timestamps.length > 0) {
        timestamps.sort((a, b) => a - b);
        firstWithdrawalIST = formatISTTimeOnly(timestamps[0]);
        latestWithdrawalIST = formatISTTimeOnly(timestamps[timestamps.length - 1]);
      }
    }

    withdrawalAnalytics.push({
      eventId: evt.id,
      eventName: evt.name,
      eventDate: getEventDateString(evt),
      totalRegistrations: totalRegs,
      totalWithdrawals,
      withdrawalRate: rate,
      firstWithdrawalIST,
      latestWithdrawalIST,
    });
  }

  const publishedEvents = events.filter(e => e.isPublished || e.status === 'completed');
  const uniqueConnectedRolls = new Set<string>();
  for (const conn of connectionHistory) {
    uniqueConnectedRolls.add(conn.person1RollNumber);
    uniqueConnectedRolls.add(conn.person2RollNumber);
  }

  const summary: HistoricalAnalyticsSummary = {
    totalPublishedEvents: publishedEvents.length,
    totalParticipants: participants.length,
    uniquePeopleConnected: uniqueConnectedRolls.size,
    totalGroupsFormed: groupHistory.length,
    totalWithdrawals: withdrawalHistory.length,
  };

  return {
    summary,
    participants,
    eventHistory,
    groupHistory,
    connectionHistory,
    withdrawalHistory,
    withdrawalAnalytics,
    withdrawalActivity,
  };
}
