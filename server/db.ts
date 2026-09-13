import {
  isPostgresConfigured,
  initPostgresSchema,
  query,
  getClient,
} from './postgres';
import { parseISTDate, istToUtcIso } from './ist';

export interface Registration {
  id: string;
  name: string;
  rollNumber: string;
  batch: string;
  phoneNumber: string; // Normalized e.g. +919876543210
  createdAt: number;
  updatedAt: number;
  registeredAt: number; // backward compatibility
  status: 'active' | 'withdrawn' | 'duplicate' | 'invalid' | 'valid';
  withdrawnStage?: 'before_match' | 'after_match' | 'after_reveal';
  withdrawnAt?: number | null;
  flagReason?: string;
  duplicateOfRoll?: string;
  groupId?: string | null;
  groupAssigned: boolean;
  revealed: boolean;
  eventId?: string;
}

export interface GroupMemberSummary {
  name: string;
  batch: string;
  isWithdrawn?: boolean;
}

export interface GroupContactSummary {
  name: string;
  batch: string;
  phoneNumber: string;
  isWithdrawn?: boolean;
}

export interface AdminGroupMember {
  id: string;
  name: string;
  rollNumber: string;
  batch: string;
  phoneNumber: string;
  status: string;
}

export interface Group {
  id: string;
  name: string; // "Group 01", "Group 02", etc.
  memberIds: string[]; // registration ids
  createdAt: number;
  locked: boolean;
  eventId?: string;
}

export type EventStage =
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'DUPLICATE_CHECKED'
  | 'READY_TO_MIX'
  | 'MIXED'
  | 'GROUPS_LOCKED'
  | 'READY_TO_PUBLISH'
  | 'PUBLISHED';

export interface OdhkanEvent {
  id: string;
  name: string;
  eventDate: string; // e.g. "2026-09-19"
  revealTime: string; // ISO string e.g. "2026-09-19T09:30:00.000Z"
  registrationStart?: string | null;
  registrationEnd?: string | null;
  status: 'upcoming' | 'open' | 'closed' | 'mixed' | 'revealed' | 'completed' | 'archived';
  stage: EventStage;
  registrationOpen: boolean;
  groupsLocked: boolean;
  isPublished: boolean;
  publishedAt: number | null;
  lastMixedAt: number | null;
  createdAt: number;
  updatedAt: number;
  participantsCount?: number;
  groupsCount?: number;
  eventDay?: string;
  eventTimeFormatted?: string;
  eventDisplayTitle?: string;
  isActive?: boolean;
}

export interface EventState {
  stage: EventStage;
  revealTime: string; // ISO string for event reveal in IST
  registrationOpen: boolean;
  groupsLocked: boolean;
  isPublished: boolean;
  publishedAt: number | null;
}

export interface DuplicateIssue {
  rollNumber: string;
  count: number;
  entries: Registration[];
  reason: string;
  resolved: boolean;
  chosenId?: string;
}

export interface IntegrityCheckResult {
  passed: boolean;
  issues: string[];
  stats: {
    totalRegistrations: number;
    activeParticipants: number;
    withdrawnCount: number;
    uniqueParticipants: number;
    assignedCount: number;
    unresolvedDuplicates: number;
    unassignedCount: number;
    participantsInMultipleGroups: number;
    groupsCount: number;
  };
}

export interface DatabaseSchema {
  registrations: Registration[];
  groups: Group[];
  events: OdhkanEvent[];
  activeEventId: string;
  event: EventState;
  lastMixedAt: number | null;
}

// Calculate next Friday at 3:00 PM IST (UTC+5:30)
export function getNextFriday3PMIST(): Date {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + istOffsetMs);

  const dayOfWeek = nowIST.getUTCDay(); // 0 is Sunday, 5 is Friday
  const currentHour = nowIST.getUTCHours();
  const currentMinute = nowIST.getUTCMinutes();

  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;

  if (daysUntilFriday === 0 && (currentHour > 15 || (currentHour === 15 && currentMinute >= 0))) {
    daysUntilFriday = 7;
  }

  const targetIST = new Date(nowIST);
  targetIST.setUTCDate(nowIST.getUTCDate() + daysUntilFriday);
  targetIST.setUTCHours(15, 0, 0, 0); // 15:00 IST

  return new Date(targetIST.getTime() - istOffsetMs);
}

// 40 seed registrations with exactly 38 unique participants and 2 duplicate entries
export function getInitialSeedRegistrations(): Registration[] {
  const baseTime = Date.now() - 36 * 3600 * 1000;

  const rawSeeds = [
    { name: 'Reet Kukreja', roll: '24BD1234', batch: '24BD', offsetMins: 10, phone: '+919876543201' },
    { name: 'Reet K', roll: '24BD1234', batch: '24BD', offsetMins: 15, isDup: true, reason: 'Duplicate roll number 24BD1234', phone: '+919876543201' },
    { name: 'Aarav Shah', roll: '23BD5678', batch: '23BD', offsetMins: 20, phone: '+919876543202' },
    { name: 'Aarav Shah', roll: '23BD5678', batch: '23BD', offsetMins: 25, isDup: true, reason: 'Duplicate roll number 23BD5678', phone: '+919876543202' },

    { name: 'Ananya Sharma', roll: '24BD003', batch: '24BD', offsetMins: 30, phone: '+919876543203' },
    { name: 'Kabir Mehta', roll: '24BD004', batch: '24BD', offsetMins: 35, phone: '+919876543204' },
    { name: 'Diya Singhania', roll: '24BD005', batch: '24BD', offsetMins: 40, phone: '+919876543205' },
    { name: 'Devansh Roy', roll: '24BD006', batch: '24BD', offsetMins: 45, phone: '+919876543206' },
    { name: 'Isha Nair', roll: '24BD007', batch: '24BD', offsetMins: 50, phone: '+919876543207' },
    { name: 'Reyansh Gupta', roll: '24BD008', batch: '24BD', offsetMins: 55, phone: '+919876543208' },
    { name: 'Tara Deshmukh', roll: '24BD009', batch: '24BD', offsetMins: 60, phone: '+919876543209' },
    { name: 'Yash Vardhan', roll: '24BD010', batch: '24BD', offsetMins: 65, phone: '+919876543210' },
    { name: 'Meera Chawla', roll: '24BD011', batch: '24BD', offsetMins: 70, phone: '+919876543211' },

    { name: 'Dhruv Patel', roll: '23BD001', batch: '23BD', offsetMins: 80, phone: '+919876543212' },
    { name: 'Rohan Verma', roll: '23BD002', batch: '23BD', offsetMins: 85, phone: '+919876543213' },
    { name: 'Tanvi Sen', roll: '23BD003', batch: '23BD', offsetMins: 90, phone: '+919876543214' },
    { name: 'Arjun Nambiar', roll: '23BD004', batch: '23BD', offsetMins: 95, phone: '+919876543215' },
    { name: 'Sanya Kapoor', roll: '23BD005', batch: '23BD', offsetMins: 100, phone: '+919876543216' },
    { name: 'Vihaan Malhotra', roll: '23BD006', batch: '23BD', offsetMins: 105, phone: '+919876543217' },
    { name: 'Rhea Kulkarni', roll: '23BD007', batch: '23BD', offsetMins: 110, phone: '+919876543218' },
    { name: 'Aditya Birla', roll: '23BD008', batch: '23BD', offsetMins: 115, phone: '+919876543219' },
    { name: 'Pooja Hegde', roll: '23BD009', batch: '23BD', offsetMins: 120, phone: '+919876543220' },
    { name: 'Avani Joshi', roll: '23BD011', batch: '23BD', offsetMins: 125, phone: '+919876543221' },

    { name: 'Zoya Akhtar', roll: '22BD001', batch: '22BD', offsetMins: 130, phone: '+919876543222' },
    { name: 'Ishaan Khattar', roll: '22BD002', batch: '22BD', offsetMins: 135, phone: '+919876543223' },
    { name: 'Mallika Dua', roll: '22BD003', batch: '22BD', offsetMins: 140, phone: '+919876543224' },
    { name: 'Samar Rao', roll: '22BD004', batch: '22BD', offsetMins: 145, phone: '+919876543225' },
    { name: 'Nandini Das', roll: '22BD005', batch: '22BD', offsetMins: 150, phone: '+919876543226' },
    { name: 'Pranav Swaminathan', roll: '22BD006', batch: '22BD', offsetMins: 155, phone: '+919876543227' },
    { name: 'Kavya Madhavan', roll: '22BD007', batch: '22BD', offsetMins: 160, phone: '+919876543228' },
    { name: 'Tushar Sethi', roll: '22BD008', batch: '22BD', offsetMins: 165, phone: '+919876543229' },
    { name: 'Alisha Chinai', roll: '22BD009', batch: '22BD', offsetMins: 170, phone: '+919876543230' },
    { name: 'Gautam Gambhir', roll: '22BD010', batch: '22BD', offsetMins: 175, phone: '+919876543231' },

    { name: 'Krishav Saxena', roll: '25BD001', batch: '25BD', offsetMins: 180, phone: '+919876543232' },
    { name: 'Siya Ram', roll: '25BD002', batch: '25BD', offsetMins: 185, phone: '+919876543233' },
    { name: 'Neil Bhattacharya', roll: '25BD003', batch: '25BD', offsetMins: 190, phone: '+919876543234' },
    { name: 'Pari Mathur', roll: '25BD004', batch: '25BD', offsetMins: 195, phone: '+919876543235' },
    { name: 'Aryan Agarwal', roll: '25BD005', batch: '25BD', offsetMins: 200, phone: '+919876543236' },
    { name: 'Lavanya Menon', roll: '25BD006', batch: '25BD', offsetMins: 205, phone: '+919876543237' },
    { name: 'Hridhaan Bansal', roll: '25BD007', batch: '25BD', offsetMins: 210, phone: '+919876543238' },
  ];

  return rawSeeds.map((s, idx) => {
    const regTime = baseTime + s.offsetMins * 60 * 1000;
    return {
      id: `reg_${idx + 1}_${s.roll.toLowerCase()}`,
      name: s.name,
      rollNumber: s.roll.toUpperCase(),
      batch: s.batch,
      phoneNumber: s.phone,
      createdAt: regTime,
      updatedAt: regTime,
      registeredAt: regTime,
      status: s.isDup ? 'duplicate' : 'active',
      flagReason: s.reason,
      duplicateOfRoll: s.isDup ? s.roll.toUpperCase() : undefined,
      groupId: null,
      groupAssigned: false,
      revealed: false,
      eventId: 'evt_2026_09_19',
    };
  });
}

export function getInitialSeedEvents(): OdhkanEvent[] {
  return [
    {
      id: 'evt_2026_09_19',
      name: 'Odhkan #1 - Friday Meet',
      eventDate: '2026-09-19',
      revealTime: '2026-09-19T09:30:00.000Z',
      registrationStart: '2026-09-10T00:00:00.000Z',
      registrationEnd: '2026-09-19T09:00:00.000Z',
      status: 'open',
      stage: 'REGISTRATION_OPEN',
      registrationOpen: true,
      groupsLocked: false,
      isPublished: false,
      publishedAt: null,
      lastMixedAt: null,
      createdAt: Date.now() - 3 * 86400000,
      updatedAt: Date.now(),
      eventDay: 'Friday',
      eventTimeFormatted: '3:00 PM',
      eventDisplayTitle: 'Friday · 3:00 PM',
    },
    {
      id: 'evt_2026_09_26',
      name: 'Odhkan #2 - Friday Meet',
      eventDate: '2026-09-26',
      revealTime: '2026-09-26T09:30:00.000Z',
      registrationStart: '2026-09-19T10:00:00.000Z',
      registrationEnd: '2026-09-26T09:00:00.000Z',
      status: 'upcoming',
      stage: 'REGISTRATION_OPEN',
      registrationOpen: true,
      groupsLocked: false,
      isPublished: false,
      publishedAt: null,
      lastMixedAt: null,
      createdAt: Date.now() - 2 * 86400000,
      updatedAt: Date.now(),
      eventDay: 'Friday',
      eventTimeFormatted: '3:00 PM',
      eventDisplayTitle: 'Friday · 3:00 PM',
    },
    {
      id: 'evt_2026_09_05',
      name: 'Odhkan #0 - Inaugural Meet',
      eventDate: '2026-09-05',
      revealTime: '2026-09-05T09:30:00.000Z',
      registrationStart: '2026-08-30T00:00:00.000Z',
      registrationEnd: '2026-09-05T09:00:00.000Z',
      status: 'completed',
      stage: 'PUBLISHED',
      registrationOpen: false,
      groupsLocked: true,
      isPublished: true,
      publishedAt: Date.now() - 8 * 86400000,
      lastMixedAt: Date.now() - 8 * 86400000,
      createdAt: Date.now() - 14 * 86400000,
      updatedAt: Date.now() - 8 * 86400000,
      eventDay: 'Friday',
      eventTimeFormatted: '3:00 PM',
      eventDisplayTitle: 'Friday · 3:00 PM',
    },
  ];
}

function mapRowToEvent(row: any): OdhkanEvent {
  const ist = parseISTDate(row.reveal_time);
  return {
    id: row.id,
    name: row.name,
    eventDate: row.event_date || ist.dateFormatted,
    revealTime: row.reveal_time,
    registrationStart: row.registration_start || null,
    registrationEnd: row.registration_end || null,
    status: row.status || 'open',
    stage: row.stage || 'REGISTRATION_OPEN',
    registrationOpen: Boolean(row.registration_open),
    groupsLocked: Boolean(row.groups_locked),
    isPublished: Boolean(row.is_published),
    publishedAt: row.published_at ? Number(row.published_at) : null,
    lastMixedAt: row.last_mixed_at ? Number(row.last_mixed_at) : null,
    createdAt: Number(row.created_at || Date.now()),
    updatedAt: Number(row.updated_at || Date.now()),
    eventDay: ist.dayName,
    eventTimeFormatted: ist.timeFormatted,
    eventDisplayTitle: ist.displayTitle,
  };
}

function mapRowToRegistration(row: any): Registration {
  return {
    id: row.id,
    name: row.name,
    rollNumber: row.roll_number,
    batch: row.batch,
    phoneNumber: row.phone_number,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    registeredAt: Number(row.registered_at),
    status: row.status === 'valid' ? 'active' : row.status,
    withdrawnStage: row.withdrawn_stage || undefined,
    withdrawnAt: row.withdrawn_at ? Number(row.withdrawn_at) : null,
    flagReason: row.flag_reason || undefined,
    duplicateOfRoll: row.duplicate_of_roll || undefined,
    groupId: row.group_id || null,
    groupAssigned: Boolean(row.group_assigned || row.group_id),
    revealed: Boolean(row.revealed),
    eventId: row.event_id || 'evt_2026_09_19',
  };
}

class Database {
  private inMemoryData: DatabaseSchema;
  private currentActiveEventId: string = 'evt_2026_09_19';

  constructor() {
    const seedEvents = getInitialSeedEvents();
    this.inMemoryData = {
      registrations: getInitialSeedRegistrations(),
      groups: [],
      events: seedEvents,
      activeEventId: 'evt_2026_09_19',
      event: {
        stage: 'REGISTRATION_OPEN',
        revealTime: seedEvents[0].revealTime,
        registrationOpen: true,
        groupsLocked: false,
        isPublished: false,
        publishedAt: null,
      },
      lastMixedAt: null,
    };
  }

  // Database initialization on server start
  public async init(): Promise<void> {
    if (isPostgresConfigured()) {
      console.log('[Database] Connecting to PostgreSQL via DATABASE_URL...');
      await initPostgresSchema(getNextFriday3PMIST().toISOString());
    } else {
      console.warn(
        '[Database] Notice: DATABASE_URL is not set. Running with zero-disk in-memory storage. In production, configure DATABASE_URL for PostgreSQL persistence.'
      );
    }
  }

  // Roll Number Normalization & Validation
  public normalizeRollNumber(rawRoll: string): string {
    return (rawRoll || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  public validateRollNumber(rawRoll: string): { valid: boolean; normalizedRoll: string; batch: string } {
    const normalized = this.normalizeRollNumber(rawRoll);
    if (!normalized || normalized.length < 4) {
      return { valid: false, normalizedRoll: normalized, batch: '' };
    }

    const match = normalized.match(/^(\d{2}[A-Z]{2,3})/);
    if (match) {
      return {
        valid: true,
        normalizedRoll: normalized,
        batch: match[1],
      };
    }

    const digitsOnly = normalized.replace(/\D/g, '');
    if (digitsOnly.length >= 2) {
      return {
        valid: true,
        normalizedRoll: normalized,
        batch: `B${digitsOnly.substring(0, 2)}`,
      };
    }

    return { valid: false, normalizedRoll: normalized, batch: '' };
  }

  // Phone Number Validation & Normalization for Indian Mobile Numbers
  public normalizePhoneNumber(rawPhone: string): { valid: boolean; normalizedPhone: string } {
    if (!rawPhone || typeof rawPhone !== 'string') {
      return { valid: false, normalizedPhone: '' };
    }

    const cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, '');
    const match = cleaned.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
    if (match && match[1]) {
      return { valid: true, normalizedPhone: `+91${match[1]}` };
    }

    return { valid: false, normalizedPhone: '' };
  }

  // Active participant count
  public async getActiveCount(): Promise<number> {
    if (isPostgresConfigured()) {
      const res = await query(
        `SELECT COUNT(*)::int as count FROM registrations WHERE status IN ('active', 'valid');`
      );
      return res.rows[0]?.count || 0;
    }
    return this.inMemoryData.registrations.filter(r => r.status === 'active' || r.status === 'valid').length;
  }

  // --- MULTI-EVENT MANAGEMENT METHODS ---

  public async getEvents(): Promise<OdhkanEvent[]> {
    if (isPostgresConfigured()) {
      const res = await query(`
        SELECT e.*,
          COALESCE(r.p_count, 0)::int as participants_count,
          COALESCE(g.g_count, 0)::int as groups_count
        FROM events e
        LEFT JOIN (
          SELECT event_id, COUNT(*)::int as p_count 
          FROM registrations 
          WHERE status IN ('active', 'valid') 
          GROUP BY event_id
        ) r ON e.id = r.event_id
        LEFT JOIN (
          SELECT event_id, COUNT(*)::int as g_count 
          FROM groups 
          GROUP BY event_id
        ) g ON e.id = g.event_id
        ORDER BY e.reveal_time ASC;
      `);
      return res.rows.map(row => {
        const evt = mapRowToEvent(row);
        evt.participantsCount = row.participants_count || 0;
        evt.groupsCount = row.groups_count || 0;
        evt.isActive = evt.id === this.currentActiveEventId;
        return evt;
      });
    }

    return this.inMemoryData.events.map(evt => {
      const ist = parseISTDate(evt.revealTime);
      const pCount = this.inMemoryData.registrations.filter(
        r => (!r.eventId || r.eventId === evt.id) && (r.status === 'active' || r.status === 'valid')
      ).length;
      const gCount = this.inMemoryData.groups.filter(g => !g.eventId || g.eventId === evt.id).length;
      return {
        ...evt,
        participantsCount: pCount,
        groupsCount: gCount,
        eventDay: ist.dayName,
        eventTimeFormatted: ist.timeFormatted,
        eventDisplayTitle: ist.displayTitle,
        isActive: evt.id === this.currentActiveEventId,
      };
    });
  }

  public async getEventById(id: string): Promise<OdhkanEvent | null> {
    const events = await this.getEvents();
    return events.find(e => e.id === id) || null;
  }

  public async getActiveEvent(): Promise<OdhkanEvent> {
    const now = Date.now();
    const events = await this.getEvents();

    // 1. If admin explicitly pinned/selected an active event
    if (this.currentActiveEventId) {
      const pinned = events.find(e => e.id === this.currentActiveEventId);
      if (pinned && pinned.status !== 'completed' && pinned.status !== 'archived') {
        return pinned;
      }
    }

    // 2. Automatic progression:
    // Event 1 -> Event 2 after Event 1 is over!
    // An event remains the active display event while upcoming OR within 12 hours after its reveal time.
    const sorted = [...events].sort(
      (a, b) => new Date(a.revealTime).getTime() - new Date(b.revealTime).getTime()
    );

    for (const evt of sorted) {
      if (evt.status === 'completed' || evt.status === 'archived') continue;
      const revealMs = new Date(evt.revealTime).getTime();
      // If reveal is in the future, OR if it revealed within the last 12 hours
      if (revealMs > now || (now - revealMs <= 12 * 3600 * 1000)) {
        this.currentActiveEventId = evt.id;
        return evt;
      }
    }

    // 3. If any future event exists
    const nextFuture = sorted.find(e => new Date(e.revealTime).getTime() > now);
    if (nextFuture) {
      this.currentActiveEventId = nextFuture.id;
      return nextFuture;
    }

    // 4. Return latest event or default seed
    const fallback = sorted[sorted.length - 1] || getInitialSeedEvents()[0];
    this.currentActiveEventId = fallback.id;
    return fallback;
  }

  public async setActiveEvent(id: string): Promise<OdhkanEvent> {
    const event = await this.getEventById(id);
    if (!event) {
      throw new Error(`Event ${id} not found.`);
    }
    this.currentActiveEventId = id;
    if (isPostgresConfigured()) {
      await query(
        `UPDATE event_state SET
           reveal_time = $1,
           stage = $2,
           registration_open = $3,
           groups_locked = $4,
           is_published = $5,
           published_at = $6,
           last_mixed_at = $7
         WHERE id = 1;`,
        [
          event.revealTime,
          event.stage,
          event.registrationOpen,
          event.groupsLocked,
          event.isPublished,
          event.publishedAt,
          event.lastMixedAt,
        ]
      );
    }
    return event;
  }

  public async createEvent(data: {
    name?: string;
    date?: string; // "YYYY-MM-DD" e.g. "2026-09-19"
    time?: string; // "HH:mm" e.g. "15:00"
    revealTime?: string;
    eventDate?: string;
    registrationStart?: string | null;
    registrationEnd?: string | null;
    status?: string;
  }): Promise<OdhkanEvent> {
    let revealTime: string;
    if (data.revealTime && typeof data.revealTime === 'string') {
      const parsed = parseISTDate(data.revealTime);
      revealTime = istToUtcIso(parsed.dateInput, parsed.timeInput);
    } else {
      const rawDate = data.date || data.eventDate || '2026-09-19';
      const rawTime = data.time || '15:00';
      revealTime = istToUtcIso(rawDate, rawTime);
    }

    const ist = parseISTDate(revealTime);
    const now = Date.now();
    const cleanDateStr = ist.dateInput.replace(/-/g, '_');
    const eventId = `evt_${cleanDateStr}_${Math.random().toString(36).substring(2, 6)}`;
    const eventName = data.name?.trim() || `Odhkan - ${ist.dayName}, ${ist.dateFormatted}`;

    let regStart = data.registrationStart;
    if (regStart && typeof regStart === 'string') {
      regStart = regStart.includes('T') ? new Date(regStart).toISOString() : istToUtcIso(regStart, '00:00');
    } else {
      regStart = new Date(now).toISOString();
    }

    let regEnd = data.registrationEnd;
    if (regEnd && typeof regEnd === 'string') {
      regEnd = regEnd.includes('T') ? new Date(regEnd).toISOString() : istToUtcIso(regEnd, '23:59');
    } else {
      // Default to 30 mins before reveal
      const revealMs = new Date(revealTime).getTime();
      regEnd = new Date(revealMs - 30 * 60 * 1000).toISOString();
    }

    if (regStart && regEnd) {
      if (new Date(regEnd).getTime() < new Date(regStart).getTime()) {
        throw new Error('Registration end date cannot be earlier than registration start date.');
      }
    }

    const eventStatus = data.status || 'open';
    const isRegOpen = eventStatus === 'open' || eventStatus === 'upcoming';

    const newEvent: OdhkanEvent = {
      id: eventId,
      name: eventName,
      eventDate: ist.dateInput,
      revealTime,
      registrationStart: regStart,
      registrationEnd: regEnd,
      status: eventStatus as any,
      stage: 'REGISTRATION_OPEN',
      registrationOpen: isRegOpen,
      groupsLocked: false,
      isPublished: false,
      publishedAt: null,
      lastMixedAt: null,
      createdAt: now,
      updatedAt: now,
      eventDay: ist.dayName,
      eventTimeFormatted: ist.timeFormatted,
      eventDisplayTitle: ist.displayTitle,
    };

    if (isPostgresConfigured()) {
      await query(
        `INSERT INTO events (
           id, name, event_date, reveal_time, registration_start, registration_end,
           status, stage, registration_open, groups_locked, is_published,
           published_at, last_mixed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, NULL, $12, $12);`,
        [
          newEvent.id,
          newEvent.name,
          newEvent.eventDate,
          newEvent.revealTime,
          newEvent.registrationStart,
          newEvent.registrationEnd,
          newEvent.status,
          newEvent.stage,
          newEvent.registrationOpen,
          newEvent.groupsLocked,
          newEvent.isPublished,
          now,
        ]
      );
    } else {
      this.inMemoryData.events.push(newEvent);
    }

    return newEvent;
  }

  public async updateEvent(
    id: string,
    data: {
      name?: string;
      date?: string;
      time?: string;
      revealTime?: string;
      eventDate?: string;
      registrationStart?: string | null;
      registrationEnd?: string | null;
      status?: string;
      registrationOpen?: boolean;
    }
  ): Promise<OdhkanEvent> {
    const existing = await this.getEventById(id);
    if (!existing) {
      throw new Error(`Event with ID ${id} not found.`);
    }

    let updatedReveal = existing.revealTime;
    let updatedDate = existing.eventDate;

    // Check if new timing is proposed
    let proposedReveal: string | null = null;
    let proposedDate: string | null = null;

    if (data.revealTime && typeof data.revealTime === 'string') {
      const parsed = parseISTDate(data.revealTime);
      proposedReveal = istToUtcIso(parsed.dateInput, parsed.timeInput);
      proposedDate = parsed.dateInput;
    } else if (data.date && data.time) {
      proposedReveal = istToUtcIso(data.date, data.time);
      proposedDate = parseISTDate(proposedReveal).dateInput;
    } else if (data.date) {
      const prevIst = parseISTDate(existing.revealTime);
      proposedReveal = istToUtcIso(
        data.date,
        `${String(prevIst.hours).padStart(2, '0')}:${String(prevIst.minutes).padStart(2, '0')}`
      );
      proposedDate = parseISTDate(proposedReveal).dateInput;
    }

    // Historical integrity rule: if event is published or groups are locked, reject changing reveal timing
    const isLockedOrPublished = existing.isPublished || existing.groupsLocked || existing.status === 'completed';
    if (proposedReveal && proposedReveal !== existing.revealTime) {
      if (isLockedOrPublished) {
        throw new Error(
          'Event reveal timing and date cannot be modified once groups are locked or results are published.'
        );
      }
      updatedReveal = proposedReveal;
      updatedDate = proposedDate || parseISTDate(updatedReveal).dateInput;
    } else if (proposedDate && proposedDate !== existing.eventDate) {
      if (isLockedOrPublished) {
        throw new Error(
          'Event date cannot be modified once groups are locked or results are published.'
        );
      }
      updatedDate = proposedDate;
    }

    let updatedRegStart = existing.registrationStart;
    if (data.registrationStart !== undefined) {
      if (data.registrationStart && typeof data.registrationStart === 'string') {
        updatedRegStart = data.registrationStart.includes('T')
          ? new Date(data.registrationStart).toISOString()
          : istToUtcIso(data.registrationStart, '00:00');
      } else {
        updatedRegStart = null;
      }
    }

    let updatedRegEnd = existing.registrationEnd;
    if (data.registrationEnd !== undefined) {
      if (data.registrationEnd && typeof data.registrationEnd === 'string') {
        updatedRegEnd = data.registrationEnd.includes('T')
          ? new Date(data.registrationEnd).toISOString()
          : istToUtcIso(data.registrationEnd, '23:59');
      } else {
        updatedRegEnd = null;
      }
    }

    if (updatedRegStart && updatedRegEnd) {
      if (new Date(updatedRegEnd).getTime() < new Date(updatedRegStart).getTime()) {
        throw new Error('Registration end date cannot be earlier than registration start date.');
      }
    }

    const updatedName = data.name !== undefined ? data.name.trim() : existing.name;
    const updatedStatus = (data.status || existing.status) as any;
    const updatedRegOpen =
      data.registrationOpen !== undefined ? data.registrationOpen : existing.registrationOpen;
    const now = Date.now();

    if (isPostgresConfigured()) {
      await query(
        `UPDATE events SET
           name = $1,
           event_date = $2,
           reveal_time = $3,
           registration_start = $4,
           registration_end = $5,
           status = $6,
           registration_open = $7,
           updated_at = $8
         WHERE id = $9;`,
        [
          updatedName,
          updatedDate,
          updatedReveal,
          updatedRegStart,
          updatedRegEnd,
          updatedStatus,
          updatedRegOpen,
          now,
          id,
        ]
      );
      if (this.currentActiveEventId === id) {
        await query(
          `UPDATE event_state SET
             reveal_time = $1,
             registration_open = $2
           WHERE id = 1;`,
          [updatedReveal, updatedRegOpen]
        );
      }
    } else {
      existing.name = updatedName;
      existing.eventDate = updatedDate;
      existing.revealTime = updatedReveal;
      existing.registrationStart = updatedRegStart;
      existing.registrationEnd = updatedRegEnd;
      existing.status = updatedStatus;
      existing.registrationOpen = updatedRegOpen;
      existing.updatedAt = now;
      if (this.currentActiveEventId === id) {
        this.inMemoryData.event.revealTime = updatedReveal;
        this.inMemoryData.event.registrationOpen = updatedRegOpen;
      }
    }

    return (await this.getEventById(id))!;
  }

  public async deleteEvent(id: string): Promise<{ success: boolean; message?: string }> {
    if (isPostgresConfigured()) {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE event_id = $1);`, [id]);
        await client.query(`DELETE FROM groups WHERE event_id = $1;`, [id]);
        await client.query(`DELETE FROM registrations WHERE event_id = $1;`, [id]);
        await client.query(`DELETE FROM events WHERE id = $1;`, [id]);
        await client.query('COMMIT');
        if (this.currentActiveEventId === id) {
          this.currentActiveEventId = '';
        }
        return { success: true };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    this.inMemoryData.events = this.inMemoryData.events.filter(e => e.id !== id);
    this.inMemoryData.groups = this.inMemoryData.groups.filter(g => g.eventId !== id);
    this.inMemoryData.registrations = this.inMemoryData.registrations.filter(r => r.eventId !== id);
    if (this.currentActiveEventId === id) {
      this.currentActiveEventId = '';
    }
    return { success: true };
  }

  public async getEventHistory(id: string) {
    const event = await this.getEventById(id);
    if (!event) return null;

    let participants: Registration[] = [];
    let groups: Group[] = [];

    if (isPostgresConfigured()) {
      const pRes = await query(`SELECT * FROM registrations WHERE event_id = $1 ORDER BY registered_at ASC;`, [id]);
      participants = pRes.rows.map(mapRowToRegistration);

      const gRes = await query(`
        SELECT g.id, g.name, g.created_at, g.locked, g.event_id,
          COALESCE(
            json_agg(gm.registration_id) FILTER (WHERE gm.registration_id IS NOT NULL),
            '[]'
          ) as member_ids
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.event_id = $1
        GROUP BY g.id, g.name, g.created_at, g.locked, g.event_id
        ORDER BY g.name ASC;
      `, [id]);
      groups = gRes.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        locked: Boolean(row.locked),
        memberIds: row.member_ids || [],
        eventId: row.event_id,
      }));
    } else {
      participants = this.inMemoryData.registrations.filter(r => r.eventId === id);
      groups = this.inMemoryData.groups.filter(g => g.eventId === id);
    }

    const formattedGroups = groups.map(g => {
      const members = g.memberIds.map(mId => {
        const reg = participants.find(r => r.id === mId);
        return {
          id: mId,
          name: reg ? reg.name : 'Unknown',
          rollNumber: reg ? reg.rollNumber : 'N/A',
          batch: reg ? reg.batch : 'N/A',
          phoneNumber: reg?.phoneNumber || 'N/A',
          status: reg?.status || 'active',
        };
      });
      return {
        id: g.id,
        name: g.name,
        membersCount: members.length,
        uniqueBatchesCount: new Set(members.map(m => m.batch)).size,
        members,
        locked: g.locked,
        hasWithdrawnMember: members.some(m => m.status === 'withdrawn'),
      };
    });

    return {
      event,
      participantsCount: participants.filter(r => r.status === 'active' || r.status === 'valid').length,
      groupsCount: formattedGroups.length,
      participants,
      groups: formattedGroups,
    };
  }

  // 1. Public Status - Live Counter & Event Details
  public async getPublicStatus(): Promise<{
    totalCount: number;
    eventStatus: string;
    revealTime: string;
    isRevealed: boolean;
    groupsCount: number;
    registrationOpen: boolean;
    eventId: string;
    eventName: string;
    eventDate: string;
    eventDay: string;
    eventTimeFormatted: string;
    eventDisplayTitle: string;
    registrationDeadline?: string;
    nextEvent?: any;
  }> {
    const activeEvent = await this.getActiveEvent();
    const ist = parseISTDate(activeEvent.revealTime);
    const now = Date.now();
    const revealMs = new Date(activeEvent.revealTime).getTime();
    const isOverdue = revealMs <= now;
    const isRevealed = activeEvent.isPublished || (isOverdue && activeEvent.groupsLocked);

    let activeCount = 0;
    let groupsCount = 0;

    if (isPostgresConfigured()) {
      const activeRes = await query(
        `SELECT COUNT(*)::int as count FROM registrations WHERE (event_id = $1 OR event_id IS NULL) AND status IN ('active', 'valid');`,
        [activeEvent.id]
      );
      activeCount = activeRes.rows[0]?.count || 0;

      const groupRes = await query(
        `SELECT COUNT(*)::int as count FROM groups WHERE event_id = $1 OR event_id IS NULL;`,
        [activeEvent.id]
      );
      groupsCount = groupRes.rows[0]?.count || 0;
    } else {
      activeCount = this.inMemoryData.registrations.filter(
        r => (!r.eventId || r.eventId === activeEvent.id) && (r.status === 'active' || r.status === 'valid')
      ).length;
      groupsCount = this.inMemoryData.groups.filter(
        g => !g.eventId || g.eventId === activeEvent.id
      ).length;
    }

    // Check next upcoming event after this one
    const allEvents = await this.getEvents();
    const nextScheduled = allEvents
      .filter(e => e.id !== activeEvent.id && new Date(e.revealTime).getTime() > revealMs)
      .sort((a, b) => new Date(a.revealTime).getTime() - new Date(b.revealTime).getTime())[0];

    return {
      totalCount: activeCount,
      eventStatus: isRevealed ? 'revealed' : activeEvent.groupsLocked ? 'locked' : 'open',
      revealTime: activeEvent.revealTime,
      isRevealed,
      groupsCount,
      registrationOpen: activeEvent.registrationOpen,
      eventId: activeEvent.id,
      eventName: activeEvent.name,
      eventDate: activeEvent.eventDate || ist.dateFormatted,
      eventDay: ist.dayName,
      eventTimeFormatted: ist.timeFormatted,
      eventDisplayTitle: ist.displayTitle,
      registrationDeadline: activeEvent.registrationEnd || undefined,
      nextEvent: nextScheduled
        ? {
            id: nextScheduled.id,
            name: nextScheduled.name,
            eventDate: nextScheduled.eventDate,
            revealTime: nextScheduled.revealTime,
            eventDay: nextScheduled.eventDay || 'Friday',
            eventTimeFormatted: nextScheduled.eventTimeFormatted || '3:00 PM',
            eventDisplayTitle: nextScheduled.eventDisplayTitle || 'Friday · 3:00 PM',
          }
        : null,
    };
  }

  // 2. Public Registration Flow
  public async join(
    name: string,
    rawRoll: string,
    rawPhone: string,
    targetEventId?: string
  ): Promise<{
    success: boolean;
    error?: string;
    subtext?: string;
    participant?: { id: string; name: string; rollNumber: string; status: string };
    totalCount: number;
    eventId?: string;
  }> {
    const trimmedName = (name || '').trim();
    if (!trimmedName || trimmedName.length < 2) {
      const activeCount = await this.getActiveCount();
      return {
        success: false,
        error: 'Please enter your full name.',
        totalCount: activeCount,
      };
    }

    const rollValidation = this.validateRollNumber(rawRoll);
    if (!rollValidation.valid) {
      const activeCount = await this.getActiveCount();
      return {
        success: false,
        error: "That roll number doesn't look right. Check it once and try again.",
        totalCount: activeCount,
      };
    }

    const phoneValidation = this.normalizePhoneNumber(rawPhone);
    if (!phoneValidation.valid) {
      const activeCount = await this.getActiveCount();
      return {
        success: false,
        error: "That phone number doesn't look right. Check it once and try again.",
        totalCount: activeCount,
      };
    }

    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    if (!targetEvent.registrationOpen) {
      const activeCount = await this.getActiveCount();
      return {
        success: false,
        error: `Registrations for ${targetEvent.name} are currently closed.`,
        totalCount: activeCount,
        eventId: targetEvent.id,
      };
    }

    if (isPostgresConfigured()) {
      // Check existing registration in this event
      const existingRes = await query(
        `SELECT * FROM registrations WHERE roll_number = $1 AND (event_id = $2 OR event_id IS NULL) ORDER BY registered_at ASC;`,
        [rollValidation.normalizedRoll, targetEvent.id]
      );

      if (existingRes.rows.length > 0) {
        const existing = mapRowToRegistration(existingRes.rows[0]);

        // If previously withdrawn, allow rejoin
        if (existing.status === 'withdrawn') {
          const now = Date.now();
          await query(
            `UPDATE registrations SET
               status = 'active',
               name = $1,
               phone_number = $2,
               updated_at = $3,
               withdrawn_stage = NULL,
               withdrawn_at = NULL,
               event_id = $4
             WHERE id = $5;`,
            [trimmedName, phoneValidation.normalizedPhone, now, targetEvent.id, existing.id]
          );

          const activeCount = await this.getActiveCount();
          return {
            success: true,
            participant: {
              id: existing.id,
              name: trimmedName,
              rollNumber: existing.rollNumber,
              status: 'active',
            },
            totalCount: activeCount,
            eventId: targetEvent.id,
          };
        }

        // Already active -> log duplicate audit record
        const now = Date.now();
        const dupId = `reg_${now}_dup`;
        await query(
          `INSERT INTO registrations (
             id, name, roll_number, batch, phone_number,
             created_at, updated_at, registered_at, status,
             flag_reason, duplicate_of_roll, group_id, group_assigned, revealed, event_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'duplicate', $9, $10, NULL, false, false, $11);`,
          [
            dupId,
            trimmedName,
            rollValidation.normalizedRoll,
            rollValidation.batch,
            phoneValidation.normalizedPhone,
            now,
            now,
            now,
            `Duplicate registration of roll number ${rollValidation.normalizedRoll}`,
            rollValidation.normalizedRoll,
            targetEvent.id,
          ]
        );

        const activeCount = await this.getActiveCount();
        return {
          success: false,
          error: "You're already in Odhkan.",
          subtext: `You're all set. See you on ${targetEvent.eventDay || 'Friday'} at ${targetEvent.eventTimeFormatted || '3 PM'}.`,
          participant: {
            id: existing.id,
            name: existing.name,
            rollNumber: existing.rollNumber,
            status: existing.status,
          },
          totalCount: activeCount,
          eventId: targetEvent.id,
        };
      }

      // Valid new unique registration
      const now = Date.now();
      const newId = `reg_${now}_${Math.random().toString(36).substring(2, 6)}`;
      await query(
        `INSERT INTO registrations (
           id, name, roll_number, batch, phone_number,
           created_at, updated_at, registered_at, status,
           group_id, group_assigned, revealed, event_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NULL, false, false, $9);`,
        [
          newId,
          trimmedName,
          rollValidation.normalizedRoll,
          rollValidation.batch,
          phoneValidation.normalizedPhone,
          now,
          now,
          now,
          targetEvent.id,
        ]
      );

      const activeCount = await this.getActiveCount();
      return {
        success: true,
        participant: {
          id: newId,
          name: trimmedName,
          rollNumber: rollValidation.normalizedRoll,
          status: 'active',
        },
        totalCount: activeCount,
        eventId: targetEvent.id,
      };
    }

    // In-memory fallback
    const existingIndex = this.inMemoryData.registrations.findIndex(
      r => r.rollNumber === rollValidation.normalizedRoll && (!r.eventId || r.eventId === targetEvent.id)
    );

    if (existingIndex !== -1) {
      const existing = this.inMemoryData.registrations[existingIndex];
      if (existing.status === 'withdrawn') {
        existing.status = 'active';
        existing.name = trimmedName;
        existing.phoneNumber = phoneValidation.normalizedPhone;
        existing.updatedAt = Date.now();
        existing.withdrawnStage = undefined;
        existing.withdrawnAt = null;
        existing.eventId = targetEvent.id;

        return {
          success: true,
          participant: {
            id: existing.id,
            name: existing.name,
            rollNumber: existing.rollNumber,
            status: 'active',
          },
          totalCount: await this.getActiveCount(),
          eventId: targetEvent.id,
        };
      }

      const now = Date.now();
      const duplicateEntry: Registration = {
        id: `reg_${now}_dup`,
        name: trimmedName,
        rollNumber: rollValidation.normalizedRoll,
        batch: rollValidation.batch,
        phoneNumber: phoneValidation.normalizedPhone,
        createdAt: now,
        updatedAt: now,
        registeredAt: now,
        status: 'duplicate',
        flagReason: `Duplicate registration of roll number ${rollValidation.normalizedRoll}`,
        duplicateOfRoll: rollValidation.normalizedRoll,
        groupId: null,
        groupAssigned: false,
        revealed: false,
        eventId: targetEvent.id,
      };
      this.inMemoryData.registrations.push(duplicateEntry);

      return {
        success: false,
        error: "You're already in Odhkan.",
        subtext: `You're all set. See you on ${targetEvent.eventDay || 'Friday'} at ${targetEvent.eventTimeFormatted || '3 PM'}.`,
        participant: {
          id: existing.id,
          name: existing.name,
          rollNumber: existing.rollNumber,
          status: existing.status,
        },
        totalCount: await this.getActiveCount(),
        eventId: targetEvent.id,
      };
    }

    const now = Date.now();
    const newReg: Registration = {
      id: `reg_${now}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      rollNumber: rollValidation.normalizedRoll,
      batch: rollValidation.batch,
      phoneNumber: phoneValidation.normalizedPhone,
      createdAt: now,
      updatedAt: now,
      registeredAt: now,
      status: 'active',
      groupId: null,
      groupAssigned: false,
      revealed: false,
      eventId: targetEvent.id,
    };

    this.inMemoryData.registrations.push(newReg);
    return {
      success: true,
      participant: {
        id: newReg.id,
        name: newReg.name,
        rollNumber: newReg.rollNumber,
        status: newReg.status,
      },
      totalCount: await this.getActiveCount(),
      eventId: targetEvent.id,
    };
  }

  // 3. "CAN'T MAKE IT TODAY" WITHDRAWAL FLOW
  public async withdraw(rawRoll: string, eventId?: string): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    status?: string;
    stage?: string;
    totalCount: number;
  }> {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      const activeCount = await this.getActiveCount();
      return {
        success: false,
        error: "That roll number doesn't look right. Check it once and try again.",
        totalCount: activeCount,
      };
    }

    const targetEvent = eventId
      ? ((await this.getEventById(eventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    if (targetEvent.isPublished) {
      const activeCount = await this.getActiveCount();
      return {
        success: false,
        error: "The list is already out. You can't withdraw now.",
        totalCount: activeCount,
      };
    }

    if (isPostgresConfigured()) {
      const regRes = await query(
        `SELECT * FROM registrations WHERE roll_number = $1 AND (event_id = $2 OR event_id IS NULL) AND status IN ('active', 'valid');`,
        [validation.normalizedRoll, targetEvent.id]
      );

      if (regRes.rows.length === 0) {
        const alreadyRes = await query(
          `SELECT * FROM registrations WHERE roll_number = $1 AND (event_id = $2 OR event_id IS NULL) AND status = 'withdrawn';`,
          [validation.normalizedRoll, targetEvent.id]
        );
        const activeCount = await this.getActiveCount();
        if (alreadyRes.rows.length > 0) {
          return {
            success: false,
            error: 'You have already removed yourself from this Odhkan.',
            totalCount: activeCount,
          };
        }
        return {
          success: false,
          error: `No active registration found for roll number ${validation.normalizedRoll}.`,
          totalCount: activeCount,
        };
      }

      const reg = mapRowToRegistration(regRes.rows[0]);

      const groupCountRes = await query(
        `SELECT COUNT(*)::int as count FROM groups WHERE event_id = $1 OR event_id IS NULL;`,
        [targetEvent.id]
      );
      const groupsCount = groupCountRes.rows[0]?.count || 0;

      let stage: 'before_match' | 'after_match' | 'after_reveal' = 'before_match';
      const now = Date.now();

      if (groupsCount > 0) {
        stage = 'after_match';
        await query(
          `UPDATE registrations SET
             status = 'withdrawn',
             withdrawn_at = $1,
             updated_at = $1,
             withdrawn_stage = 'after_match',
             group_id = NULL,
             group_assigned = false
           WHERE id = $2;`,
          [now, reg.id]
        );
        await query(
          `DELETE FROM group_members
           WHERE registration_id = $1
             AND group_id IN (SELECT id FROM groups WHERE event_id = $2 OR event_id IS NULL);`,
          [reg.id, targetEvent.id]
        );
      } else {
        stage = 'before_match';
        await query(
          `UPDATE registrations SET
             status = 'withdrawn',
             withdrawn_at = $1,
             updated_at = $1,
             withdrawn_stage = 'before_match',
             group_id = NULL,
             group_assigned = false
           WHERE id = $2;`,
          [now, reg.id]
        );
      }

      const activeCount = await this.getActiveCount();
      return {
        success: true,
        message: 'You have been removed from this Odhkan.',
        status: 'withdrawn',
        stage,
        totalCount: activeCount,
      };
    }

    // In-memory fallback
    const reg = this.inMemoryData.registrations.find(
      r => r.rollNumber === validation.normalizedRoll &&
           (!r.eventId || r.eventId === targetEvent.id) &&
           (r.status === 'active' || r.status === 'valid')
    );

    if (!reg) {
      const alreadyWithdrawn = this.inMemoryData.registrations.find(
        r => r.rollNumber === validation.normalizedRoll &&
             (!r.eventId || r.eventId === targetEvent.id) &&
             r.status === 'withdrawn'
      );
      if (alreadyWithdrawn) {
        return {
          success: false,
          error: 'You have already removed yourself from this Odhkan.',
          totalCount: await this.getActiveCount(),
        };
      }
      return {
        success: false,
        error: `No active registration found for roll number ${validation.normalizedRoll}.`,
        totalCount: await this.getActiveCount(),
      };
    }

    const now = Date.now();
    reg.status = 'withdrawn';
    reg.withdrawnAt = now;
    reg.updatedAt = now;

    let stage: 'before_match' | 'after_match' | 'after_reveal' = 'before_match';
    const eventGroups = this.inMemoryData.groups.filter(
      g => !g.eventId || g.eventId === targetEvent.id
    );

    if (eventGroups.length > 0) {
      stage = 'after_match';
      reg.withdrawnStage = 'after_match';
      reg.groupAssigned = false;
      const oldGroupId = reg.groupId;
      reg.groupId = null;
      if (oldGroupId) {
        const grp = this.inMemoryData.groups.find(g => g.id === oldGroupId);
        if (grp) {
          grp.memberIds = grp.memberIds.filter(id => id !== reg.id);
        }
      }
    } else {
      stage = 'before_match';
      reg.withdrawnStage = 'before_match';
      reg.groupId = null;
      reg.groupAssigned = false;
    }

    return {
      success: true,
      message: 'You have been removed from this Odhkan.',
      status: 'withdrawn',
      stage,
      totalCount: await this.getActiveCount(),
    };
  }

  // 4. Check participant status
  public async getParticipantStatus(rawRoll: string, eventId?: string): Promise<{
    registered: boolean;
    participant?: {
      name: string;
      rollNumber: string;
      batch: string;
      status: 'active' | 'withdrawn' | 'duplicate' | 'invalid';
      groupAssigned: boolean;
    };
    isRevealed: boolean;
  }> {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      return { registered: false, isRevealed: false };
    }

    if (isPostgresConfigured()) {
      const eventRes = await query(`SELECT is_published FROM event_state WHERE id = 1;`);
      const isRevealed = Boolean(eventRes.rows[0]?.is_published);

      const regRes = await query(
        `SELECT * FROM registrations WHERE roll_number = $1
         ORDER BY (CASE WHEN status IN ('active', 'valid') THEN 0 ELSE 1 END), registered_at ASC
         LIMIT 1;`,
        [validation.normalizedRoll]
      );

      if (regRes.rows.length === 0) {
        return { registered: false, isRevealed };
      }

      const reg = mapRowToRegistration(regRes.rows[0]);
      return {
        registered: true,
        participant: {
          name: reg.name,
          rollNumber: reg.rollNumber,
          batch: reg.batch,
          status: (reg.status === 'valid' ? 'active' : reg.status) as any,
          groupAssigned: Boolean(reg.groupId),
        },
        isRevealed,
      };
    }

    const reg =
      this.inMemoryData.registrations.find(
        r => r.rollNumber === validation.normalizedRoll && (r.status === 'active' || r.status === 'valid')
      ) || this.inMemoryData.registrations.find(r => r.rollNumber === validation.normalizedRoll);

    if (!reg) {
      return { registered: false, isRevealed: this.inMemoryData.event.isPublished };
    }

    return {
      registered: true,
      participant: {
        name: reg.name,
        rollNumber: reg.rollNumber,
        batch: reg.batch,
        status: (reg.status === 'valid' ? 'active' : reg.status) as any,
        groupAssigned: Boolean(reg.groupId),
      },
      isRevealed: this.inMemoryData.event.isPublished,
    };
  }

  // 5. Public Group Reveal Lookup (ONLY AFTER PUBLISH)
  public async revealGroupForRoll(rawRoll: string, eventId?: string): Promise<{
    success: boolean;
    error?: string;
    subtext?: string;
    participant?: { name: string; batch: string; rollNumber: string; status: string };
    group?: { id: string; members: GroupMemberSummary[]; hasWithdrawnMember: boolean };
  }> {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      return {
        success: false,
        error: "That roll number doesn't look right. Check it once and try again.",
      };
    }

    if (isPostgresConfigured()) {
      const eventRes = await query(`SELECT is_published FROM event_state WHERE id = 1;`);
      const isPublished = Boolean(eventRes.rows[0]?.is_published);

      if (!isPublished) {
        return {
          success: false,
          error: 'Groups will be revealed Friday at 3:00 PM.',
          subtext: 'Three people from across the college. Start with a hello.',
        };
      }

      const regRes = await query(
        `SELECT * FROM registrations WHERE roll_number = $1 ORDER BY registered_at ASC LIMIT 1;`,
        [validation.normalizedRoll]
      );

      if (regRes.rows.length === 0) {
        return {
          success: false,
          error: "We couldn't find your registration. Double check your roll number.",
        };
      }

      const reg = mapRowToRegistration(regRes.rows[0]);
      if (reg.status === 'withdrawn' && reg.withdrawnStage !== 'after_reveal') {
        return {
          success: false,
          error: 'You previously removed yourself from this Odhkan.',
        };
      }

      if (!reg.groupId) {
        return {
          success: false,
          error: 'Your group is being finalized. Please check back shortly.',
        };
      }

      const groupRes = await query(`SELECT * FROM groups WHERE id = $1;`, [reg.groupId]);
      if (groupRes.rows.length === 0) {
        return {
          success: false,
          error: 'Group information is temporarily unavailable. Please retry in a moment.',
        };
      }

      const membersRes = await query(
        `SELECT r.name, r.batch, r.status
         FROM group_members gm
         JOIN registrations r ON gm.registration_id = r.id
         WHERE gm.group_id = $1
         ORDER BY r.name ASC;`,
        [reg.groupId]
      );

      let hasWithdrawnMember = false;
      const memberSummaries: GroupMemberSummary[] = membersRes.rows.map(m => {
        const isWithdrawn = m.status === 'withdrawn';
        if (isWithdrawn) hasWithdrawnMember = true;
        return {
          name: m.name,
          batch: m.batch,
          isWithdrawn,
        };
      });

      return {
        success: true,
        participant: {
          name: reg.name,
          batch: reg.batch,
          rollNumber: reg.rollNumber,
          status: reg.status,
        },
        group: {
          id: reg.groupId,
          members: memberSummaries,
          hasWithdrawnMember,
        },
      };
    }

    // In-memory fallback
    if (!this.inMemoryData.event.isPublished) {
      return {
        success: false,
        error: 'Groups will be revealed Friday at 3:00 PM.',
        subtext: 'Three people from across the college. Start with a hello.',
      };
    }

    const reg = this.inMemoryData.registrations.find(r => r.rollNumber === validation.normalizedRoll);
    if (!reg) {
      return {
        success: false,
        error: "We couldn't find your registration. Double check your roll number.",
      };
    }

    if (reg.status === 'withdrawn' && reg.withdrawnStage !== 'after_reveal') {
      return {
        success: false,
        error: 'You previously removed yourself from this Odhkan.',
      };
    }

    if (!reg.groupId) {
      return {
        success: false,
        error: 'Your group is being finalized. Please check back shortly.',
      };
    }

    const group = this.inMemoryData.groups.find(g => g.id === reg.groupId);
    if (!group) {
      return {
        success: false,
        error: 'Group information is temporarily unavailable. Please retry in a moment.',
      };
    }

    let hasWithdrawnMember = false;
    const memberSummaries: GroupMemberSummary[] = group.memberIds.map(memId => {
      const m = this.inMemoryData.registrations.find(r => r.id === memId);
      const isWithdrawn = m?.status === 'withdrawn';
      if (isWithdrawn) hasWithdrawnMember = true;
      return {
        name: m ? m.name : 'Fellow Student',
        batch: m ? m.batch : 'College',
        isWithdrawn,
      };
    });

    return {
      success: true,
      participant: {
        name: reg.name,
        batch: reg.batch,
        rollNumber: reg.rollNumber,
        status: reg.status,
      },
      group: {
        id: group.id,
        members: memberSummaries,
        hasWithdrawnMember,
      },
    };
  }

  // 6. Controlled Group Contact Details
  public async getGroupContactsForRoll(rawRoll: string, targetEventId?: string): Promise<{
    success: boolean;
    error?: string;
    subtext?: string;
    groupId?: string;
    contacts?: GroupContactSummary[];
  }> {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      return { success: false, error: 'Invalid roll number.' };
    }

    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    if (isPostgresConfigured()) {
      if (!targetEvent.isPublished) {
        return { success: false, error: 'Groups have not been published yet.' };
      }

      const regRes = await query(
        `SELECT group_id FROM registrations WHERE roll_number = $1 AND (event_id = $2 OR event_id IS NULL) LIMIT 1;`,
        [validation.normalizedRoll, targetEvent.id]
      );
      const groupId = regRes.rows[0]?.group_id;
      if (!groupId) {
        return { success: false, error: 'Could not find your group.' };
      }

      const membersRes = await query(
        `SELECT r.name, r.batch, r.phone_number, r.status
         FROM group_members gm
         JOIN registrations r ON gm.registration_id = r.id
         WHERE gm.group_id = $1
         ORDER BY r.name ASC;`,
        [groupId]
      );

      const contacts: GroupContactSummary[] = membersRes.rows.map(m => ({
        name: m.name,
        batch: m.batch,
        phoneNumber: m.phone_number,
        isWithdrawn: m.status === 'withdrawn',
      }));

      return {
        success: true,
        groupId,
        contacts,
      };
    }

    // In-memory fallback
    if (!targetEvent.isPublished) {
      return { success: false, error: 'Groups have not been published yet.' };
    }

    const reg = this.inMemoryData.registrations.find(
      r => r.rollNumber === validation.normalizedRoll && (!r.eventId || r.eventId === targetEvent.id)
    );
    if (!reg || !reg.groupId) {
      return { success: false, error: 'Could not find your group.' };
    }

    const group = this.inMemoryData.groups.find(g => g.id === reg.groupId);
    if (!group) {
      return { success: false, error: 'Group not found.' };
    }

    const contacts: GroupContactSummary[] = group.memberIds.map(memId => {
      const m = this.inMemoryData.registrations.find(r => r.id === memId);
      return {
        name: m ? m.name : 'Fellow Student',
        batch: m ? m.batch : 'College',
        phoneNumber: m?.phoneNumber || '',
        isWithdrawn: m?.status === 'withdrawn',
      };
    });

    return {
      success: true,
      groupId: group.id,
      contacts,
    };
  }

  // 7. Duplicate Check & Review
  public async runDuplicateCheck(targetEventId?: string): Promise<{
    totalRegistrations: number;
    uniqueParticipants: number;
    duplicateCount: number;
    issues: DuplicateIssue[];
    readyToMix: boolean;
  }> {
    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    let allRegistrations: Registration[] = [];

    if (isPostgresConfigured()) {
      const res = await query(
        `SELECT * FROM registrations WHERE event_id = $1 OR event_id IS NULL ORDER BY registered_at ASC;`,
        [targetEvent.id]
      );
      allRegistrations = res.rows.map(mapRowToRegistration);
    } else {
      allRegistrations = this.inMemoryData.registrations.filter(
        r => !r.eventId || r.eventId === targetEvent.id
      );
    }

    const rollMap: Record<string, Registration[]> = {};
    for (const reg of allRegistrations) {
      const roll = reg.rollNumber;
      if (!rollMap[roll]) rollMap[roll] = [];
      rollMap[roll].push(reg);
    }

    const issues: DuplicateIssue[] = [];
    let duplicateRecords = 0;

    for (const roll in rollMap) {
      const entries = rollMap[roll];
      if (entries.length > 1) {
        duplicateRecords += entries.length - 1;
        entries.sort((a, b) => a.registeredAt - b.registeredAt);

        const activeCount = entries.filter(e => e.status === 'active' || e.status === 'valid').length;
        const isResolved = activeCount <= 1;

        let chosenId: string | undefined;
        if (isResolved && activeCount === 1) {
          chosenId = entries.find(e => e.status === 'active' || e.status === 'valid')?.id;
        }

        issues.push({
          rollNumber: roll,
          count: entries.length,
          entries,
          reason: `Roll number ${roll} appears ${entries.length} times in registrations`,
          resolved: isResolved,
          chosenId,
        });
      }
    }

    const unresolvedCount = issues.filter(i => !i.resolved).length;
    const activeParticipants = allRegistrations.filter(
      r => r.status === 'active' || r.status === 'valid'
    ).length;

    return {
      totalRegistrations: allRegistrations.length,
      uniqueParticipants: activeParticipants,
      duplicateCount: duplicateRecords,
      issues,
      readyToMix: unresolvedCount === 0 && activeParticipants >= 3,
    };
  }

  // 8. Resolve Duplicate
  public async resolveDuplicate(
    rollNumber: string,
    choice: 'first' | 'latest' | string,
    targetEventId?: string
  ): Promise<{
    success: boolean;
    rollNumber: string;
    chosenId: string;
  }> {
    const normalizedRoll = this.normalizeRollNumber(rollNumber);
    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    if (isPostgresConfigured()) {
      const res = await query(
        `SELECT * FROM registrations WHERE roll_number = $1 AND (event_id = $2 OR event_id IS NULL) ORDER BY registered_at ASC;`,
        [normalizedRoll, targetEvent.id]
      );
      const matches = res.rows.map(mapRowToRegistration);

      if (matches.length <= 1) {
        return { success: true, rollNumber: normalizedRoll, chosenId: matches[0]?.id || '' };
      }

      let chosen: Registration;
      if (choice === 'first') {
        chosen = matches[0];
      } else if (choice === 'latest') {
        chosen = matches[matches.length - 1];
      } else {
        chosen = matches.find(m => m.id === choice) || matches[matches.length - 1];
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');
        const now = Date.now();
        for (const entry of matches) {
          if (entry.id === chosen.id) {
            await client.query(
              `UPDATE registrations SET status = 'active', flag_reason = $1, updated_at = $2 WHERE id = $3;`,
              [`Resolved as canonical record for ${normalizedRoll}`, now, entry.id]
            );
          } else {
            await client.query(
              `UPDATE registrations SET status = 'duplicate', flag_reason = $1, updated_at = $2 WHERE id = $3;`,
              [`Superseded by entry ${chosen.id} for roll ${normalizedRoll}`, now, entry.id]
            );
          }
        }
        await client.query('COMMIT');
        return { success: true, rollNumber: normalizedRoll, chosenId: chosen.id };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // In-memory fallback
    const matches = this.inMemoryData.registrations
      .filter(r => r.rollNumber === normalizedRoll && (!r.eventId || r.eventId === targetEvent.id))
      .sort((a, b) => a.registeredAt - b.registeredAt);

    if (matches.length <= 1) {
      return { success: true, rollNumber: normalizedRoll, chosenId: matches[0]?.id || '' };
    }

    let chosen: Registration;
    if (choice === 'first') {
      chosen = matches[0];
    } else if (choice === 'latest') {
      chosen = matches[matches.length - 1];
    } else {
      chosen = matches.find(m => m.id === choice) || matches[matches.length - 1];
    }

    for (const entry of matches) {
      if (entry.id === chosen.id) {
        entry.status = 'active';
        entry.flagReason = `Resolved as canonical record for ${normalizedRoll}`;
      } else {
        entry.status = 'duplicate';
        entry.flagReason = `Superseded by entry ${chosen.id} for roll ${normalizedRoll}`;
      }
      entry.updatedAt = Date.now();
    }

    return { success: true, rollNumber: normalizedRoll, chosenId: chosen.id };
  }

  // 9. Mix Match (Group Generation with Recurring Group Avoidance)
  public async mixMatch(targetEventId?: string): Promise<{
    success: boolean;
    error?: string;
    totalParticipants: number;
    groupsCount: number;
    eventId?: string;
  }> {
    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    const dupCheck = await this.runDuplicateCheck(targetEvent.id);
    const unresolved = dupCheck.issues.filter(i => !i.resolved);
    if (unresolved.length > 0) {
      return {
        success: false,
        error: `Cannot mix groups: ${unresolved.length} unresolved duplicate roll numbers exist. Please resolve them first.`,
        totalParticipants: 0,
        groupsCount: 0,
        eventId: targetEvent.id,
      };
    }

    let activeParticipants: Registration[] = [];
    if (isPostgresConfigured()) {
      const res = await query(
        `SELECT * FROM registrations WHERE (event_id = $1 OR event_id IS NULL) AND status IN ('active', 'valid') ORDER BY registered_at ASC;`,
        [targetEvent.id]
      );
      activeParticipants = res.rows.map(mapRowToRegistration);
    } else {
      activeParticipants = this.inMemoryData.registrations.filter(
        r => (!r.eventId || r.eventId === targetEvent.id) && (r.status === 'active' || r.status === 'valid')
      );
    }

    const N = activeParticipants.length;
    if (N < 3) {
      return {
        success: false,
        error: `Need at least 3 active participants to create a group. Currently have ${N}.`,
        totalParticipants: N,
        groupsCount: 0,
        eventId: targetEvent.id,
      };
    }

    // --- RECURRING GROUP LOGIC ---
    // Track historical pair frequencies and exact triplets across prior events
    const pastPairCounts = new Map<string, number>();
    const pastTriplets = new Set<string>();

    if (isPostgresConfigured()) {
      const pastGroupsRes = await query(`
        SELECT g.id, g.event_id,
          COALESCE(
            json_agg(r.roll_number) FILTER (WHERE r.roll_number IS NOT NULL AND r.status != 'withdrawn'),
            '[]'
          ) as rolls
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        JOIN registrations r ON gm.registration_id = r.id
        LEFT JOIN events e ON g.event_id = e.id
        WHERE g.event_id IS NOT NULL 
          AND g.event_id != $1 
          AND (e.is_published = true OR e.status = 'completed' OR e.id IS NULL)
        GROUP BY g.id, g.event_id;
      `, [targetEvent.id]);

      for (const row of pastGroupsRes.rows) {
        const rolls: string[] = Array.isArray(row.rolls) ? [...row.rolls].sort() : [];
        // Triplets
        for (let i = 0; i < rolls.length; i++) {
          for (let j = i + 1; j < rolls.length; j++) {
            for (let k = j + 1; k < rolls.length; k++) {
              pastTriplets.add(`${rolls[i]}_${rolls[j]}_${rolls[k]}`);
            }
          }
        }
        // Pairs
        for (let i = 0; i < rolls.length; i++) {
          for (let j = i + 1; j < rolls.length; j++) {
            const pairKey = `${rolls[i]}_${rolls[j]}`;
            pastPairCounts.set(pairKey, (pastPairCounts.get(pairKey) || 0) + 1);
          }
        }
      }
    } else {
      const pastGroups = this.inMemoryData.groups.filter(g => {
        if (!g.eventId || g.eventId === targetEvent.id) return false;
        const evt = this.inMemoryData.events.find(e => e.id === g.eventId);
        return evt ? (evt.isPublished || evt.status === 'completed') : true;
      });
      for (const g of pastGroups) {
        const rolls = g.memberIds
          .map(mId => {
            const r = this.inMemoryData.registrations.find(reg => reg.id === mId);
            return r && r.status !== 'withdrawn' ? r.rollNumber : null;
          })
          .filter(Boolean) as string[];
        rolls.sort();

        // Triplets
        for (let i = 0; i < rolls.length; i++) {
          for (let j = i + 1; j < rolls.length; j++) {
            for (let k = j + 1; k < rolls.length; k++) {
              pastTriplets.add(`${rolls[i]}_${rolls[j]}_${rolls[k]}`);
            }
          }
        }
        // Pairs
        for (let i = 0; i < rolls.length; i++) {
          for (let j = i + 1; j < rolls.length; j++) {
            const pairKey = `${rolls[i]}_${rolls[j]}`;
            pastPairCounts.set(pairKey, (pastPairCounts.get(pairKey) || 0) + 1);
          }
        }
      }
    }

    const participants = [...activeParticipants];

    // Partition logic: groups of 3 with remainder 1 or 2
    const baseGroups = Math.floor(N / 3);
    const remainder = N % 3;
    let groupSizes: number[] = [];

    if (baseGroups === 0) {
      groupSizes = [N];
    } else if (remainder === 0) {
      groupSizes = Array(baseGroups).fill(3);
    } else if (remainder === 1) {
      groupSizes = Array(baseGroups - 1).fill(3);
      groupSizes.push(4);
    } else if (remainder === 2) {
      groupSizes = Array(baseGroups).fill(3);
      groupSizes.push(2);
    }

    const uniqueBatches = new Set(activeParticipants.map(p => p.batch)).size;

    // Batch diversity + Recurring Group Avoidance optimization scoring
    const calcGroupPenalty = (grp: Registration[]): number => {
      let penalty = 0;

      // 1. Batch diversity penalty
      if (uniqueBatches > 1) {
        const counts: Record<string, number> = {};
        for (const p of grp) {
          counts[p.batch] = (counts[p.batch] || 0) + 1;
        }
        for (const b in counts) {
          const c = counts[b];
          if (c >= 3) {
            penalty += 100;
          } else if (c === 2) {
            penalty += 15;
          }
        }
      }

      const sortedRolls = grp.map(p => p.rollNumber).sort();

      // 2. Exact group repetition penalty (avoid A + B + C repeating)
      for (let i = 0; i < sortedRolls.length; i++) {
        for (let j = i + 1; j < sortedRolls.length; j++) {
          for (let k = j + 1; k < sortedRolls.length; k++) {
            const tripletKey = `${sortedRolls[i]}_${sortedRolls[j]}_${sortedRolls[k]}`;
            if (pastTriplets.has(tripletKey)) {
              penalty += 50000;
            }
          }
        }
      }

      // 3. Repeated pair penalty (Convex penalty to maximize new connections)
      for (let i = 0; i < sortedRolls.length; i++) {
        for (let j = i + 1; j < sortedRolls.length; j++) {
          const pairKey = `${sortedRolls[i]}_${sortedRolls[j]}`;
          const timesMet = pastPairCounts.get(pairKey) || 0;
          if (timesMet === 1) {
            penalty += 1500;
          } else if (timesMet === 2) {
            penalty += 8000;
          } else if (timesMet >= 3) {
            penalty += 25000 * timesMet;
          }
        }
      }

      return penalty;
    };

    const calcTotalPenalty = (groups: Registration[][]): number => {
      return groups.reduce((sum, g) => sum + calcGroupPenalty(g), 0);
    };

    // Multi-start Simulated Annealing with 3-way rotation
    let bestGroups: Registration[][] = [];
    let bestScore = Infinity;

    const numRestarts = 3;
    const maxIters = 6000;

    for (let restart = 0; restart < numRestarts; restart++) {
      // Random shuffle
      const pool = [...activeParticipants];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      // Partition
      let curIdx = 0;
      const curGroups: Registration[][] = [];
      for (const size of groupSizes) {
        curGroups.push(pool.slice(curIdx, curIdx + size));
        curIdx += size;
      }

      const numG = curGroups.length;
      if (numG <= 1) {
        bestGroups = curGroups;
        break;
      }

      let currentScore = calcTotalPenalty(curGroups);
      let temp = 120.0;
      const cooling = 0.9992;

      for (let iter = 0; iter < maxIters; iter++) {
        temp *= cooling;

        // Try 2-opt swap between two distinct groups
        const g1Idx = Math.floor(Math.random() * numG);
        let g2Idx = Math.floor(Math.random() * numG);
        while (g2Idx === g1Idx) {
          g2Idx = Math.floor(Math.random() * numG);
        }

        const g1 = curGroups[g1Idx];
        const g2 = curGroups[g2Idx];
        const m1Idx = Math.floor(Math.random() * g1.length);
        const m2Idx = Math.floor(Math.random() * g2.length);

        const oldSubPen = calcGroupPenalty(g1) + calcGroupPenalty(g2);

        const p1 = g1[m1Idx];
        const p2 = g2[m2Idx];
        g1[m1Idx] = p2;
        g2[m2Idx] = p1;

        const newSubPen = calcGroupPenalty(g1) + calcGroupPenalty(g2);
        const delta = newSubPen - oldSubPen;

        if (delta < 0 || Math.random() < Math.exp(-delta / Math.max(temp, 0.001))) {
          currentScore += delta;
        } else {
          // Revert swap
          g1[m1Idx] = p1;
          g2[m2Idx] = p2;
        }

        // 3-way cyclic rotation every 10 iterations if at least 3 groups exist
        if (numG >= 3 && iter % 10 === 0) {
          const idxs = [0, 1, 2].map(() => Math.floor(Math.random() * numG));
          if (idxs[0] !== idxs[1] && idxs[1] !== idxs[2] && idxs[0] !== idxs[2]) {
            const [ga, gb, gc] = [curGroups[idxs[0]], curGroups[idxs[1]], curGroups[idxs[2]]];
            const [ma, mb, mc] = [
              Math.floor(Math.random() * ga.length),
              Math.floor(Math.random() * gb.length),
              Math.floor(Math.random() * gc.length),
            ];

            const old3 = calcGroupPenalty(ga) + calcGroupPenalty(gb) + calcGroupPenalty(gc);

            const [ta, tb, tc] = [ga[ma], gb[mb], gc[mc]];
            ga[ma] = tc;
            gb[mb] = ta;
            gc[mc] = tb;

            const new3 = calcGroupPenalty(ga) + calcGroupPenalty(gb) + calcGroupPenalty(gc);
            const delta3 = new3 - old3;

            if (delta3 < 0 || Math.random() < Math.exp(-delta3 / Math.max(temp, 0.001))) {
              currentScore += delta3;
            } else {
              ga[ma] = ta;
              gb[mb] = tb;
              gc[mc] = tc;
            }
          }
        }

        if (currentScore === 0) break;
      }

      if (currentScore < bestScore) {
        bestScore = currentScore;
        bestGroups = curGroups.map(g => [...g]);
        if (bestScore === 0) break;
      }
    }

    const finalGroups = bestGroups;

    // Format new groups
    const newGroups: Group[] = [];
    const assignedIdsMap: Record<string, string> = {};
    const now = Date.now();

    finalGroups.forEach((grp, idx) => {
      const padNum = (idx + 1).toString().padStart(2, '0');
      const groupId = `grp_${now}_${padNum}`;
      const memberIds = grp.map(p => p.id);

      newGroups.push({
        id: groupId,
        name: `Group ${padNum}`,
        memberIds,
        createdAt: now,
        locked: false,
        eventId: targetEvent.id,
      });

      grp.forEach(p => {
        assignedIdsMap[p.id] = groupId;
      });
    });

    if (isPostgresConfigured()) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Delete old group associations for this event ONLY
        await client.query(
          `DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE event_id = $1);`,
          [targetEvent.id]
        );
        await client.query(
          `DELETE FROM groups WHERE event_id = $1;`,
          [targetEvent.id]
        );

        // Insert new groups & members
        for (const g of newGroups) {
          await client.query(
            `INSERT INTO groups (id, name, created_at, locked, event_id) VALUES ($1, $2, $3, $4, $5);`,
            [g.id, g.name, g.createdAt, g.locked, targetEvent.id]
          );

          for (const mId of g.memberIds) {
            await client.query(
              `INSERT INTO group_members (group_id, registration_id) VALUES ($1, $2);`,
              [g.id, mId]
            );
            await client.query(
              `UPDATE registrations SET group_id = $1, group_assigned = true, updated_at = $2, event_id = $3 WHERE id = $4;`,
              [g.id, now, targetEvent.id, mId]
            );
          }
        }

        // Clear group assignment on non-active for this event
        await client.query(
          `UPDATE registrations SET group_id = NULL, group_assigned = false WHERE (event_id = $1 OR event_id IS NULL) AND status NOT IN ('active', 'valid');`,
          [targetEvent.id]
        );

        // Update event record
        await query(
          `UPDATE events SET
             stage = 'MIXED',
             groups_locked = false,
             is_published = false,
             last_mixed_at = $1,
             updated_at = $1
           WHERE id = $2;`,
          [now, targetEvent.id]
        );

        if (this.currentActiveEventId === targetEvent.id) {
          await client.query(
            `UPDATE event_state SET
               stage = 'MIXED',
               groups_locked = false,
               is_published = false,
               last_mixed_at = $1
             WHERE id = 1;`,
            [now]
          );
        }

        await client.query('COMMIT');
        return {
          success: true,
          totalParticipants: participants.length,
          groupsCount: newGroups.length,
          eventId: targetEvent.id,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // In-memory fallback
    for (const r of this.inMemoryData.registrations) {
      if ((!r.eventId || r.eventId === targetEvent.id) && (r.status === 'active' || r.status === 'valid')) {
        r.groupId = assignedIdsMap[r.id] || null;
        r.groupAssigned = Boolean(r.groupId);
        r.eventId = targetEvent.id;
      } else if (!r.eventId || r.eventId === targetEvent.id) {
        r.groupId = null;
        r.groupAssigned = false;
      }
      r.updatedAt = now;
    }

    this.inMemoryData.groups = [
      ...this.inMemoryData.groups.filter(g => g.eventId && g.eventId !== targetEvent.id),
      ...newGroups,
    ];
    targetEvent.lastMixedAt = now;
    targetEvent.stage = 'MIXED';
    targetEvent.groupsLocked = false;
    targetEvent.isPublished = false;

    const inMemEvt = this.inMemoryData.events.find(e => e.id === targetEvent.id);
    if (inMemEvt) {
      inMemEvt.lastMixedAt = now;
      inMemEvt.stage = 'MIXED';
      inMemEvt.groupsLocked = false;
      inMemEvt.isPublished = false;
      inMemEvt.updatedAt = now;
    }

    if (this.currentActiveEventId === targetEvent.id) {
      this.inMemoryData.lastMixedAt = now;
      this.inMemoryData.event.stage = 'MIXED';
      this.inMemoryData.event.groupsLocked = false;
      this.inMemoryData.event.isPublished = false;
    }

    return {
      success: true,
      totalParticipants: participants.length,
      groupsCount: newGroups.length,
      eventId: targetEvent.id,
    };
  }

  // 10. Lock Groups
  public async lockGroups(targetEventId?: string): Promise<{ success: boolean; groupsCount: number; eventId?: string }> {
    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    if (isPostgresConfigured()) {
      await query(
        `UPDATE events SET stage = 'GROUPS_LOCKED', groups_locked = true, updated_at = $1 WHERE id = $2;`,
        [Date.now(), targetEvent.id]
      );
      await query(`UPDATE groups SET locked = true WHERE event_id = $1 OR event_id IS NULL;`, [targetEvent.id]);
      if (this.currentActiveEventId === targetEvent.id) {
        await query(`UPDATE event_state SET stage = 'GROUPS_LOCKED', groups_locked = true WHERE id = 1;`);
      }
      const countRes = await query(`SELECT COUNT(*)::int as count FROM groups WHERE event_id = $1 OR event_id IS NULL;`, [targetEvent.id]);
      return { success: true, groupsCount: countRes.rows[0]?.count || 0, eventId: targetEvent.id };
    }

    targetEvent.groupsLocked = true;
    targetEvent.stage = 'GROUPS_LOCKED';
    const inMemEvtLock = this.inMemoryData.events.find(e => e.id === targetEvent.id);
    if (inMemEvtLock) {
      inMemEvtLock.groupsLocked = true;
      inMemEvtLock.stage = 'GROUPS_LOCKED';
      inMemEvtLock.updatedAt = Date.now();
    }

    for (const g of this.inMemoryData.groups) {
      if (!g.eventId || g.eventId === targetEvent.id) {
        g.locked = true;
      }
    }
    if (this.currentActiveEventId === targetEvent.id) {
      this.inMemoryData.event.groupsLocked = true;
      this.inMemoryData.event.stage = 'GROUPS_LOCKED';
    }
    const count = this.inMemoryData.groups.filter(g => !g.eventId || g.eventId === targetEvent.id).length;
    return { success: true, groupsCount: count, eventId: targetEvent.id };
  }

  // 11. Final Integrity Check
  public async runFinalIntegrityCheck(targetEventId?: string): Promise<IntegrityCheckResult> {
    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    const issues: string[] = [];
    let allRegistrations: Registration[] = [];
    let allGroups: Group[] = [];
    let eventStage = targetEvent.stage;
    let groupsLocked = targetEvent.groupsLocked;
    let lastMixedAt: number | null = targetEvent.lastMixedAt;

    if (isPostgresConfigured()) {
      const regRes = await query(
        `SELECT * FROM registrations WHERE event_id = $1 OR event_id IS NULL ORDER BY registered_at ASC;`,
        [targetEvent.id]
      );
      allRegistrations = regRes.rows.map(mapRowToRegistration);

      const groupRes = await query(`
        SELECT g.id, g.name, g.created_at, g.locked, g.event_id,
          COALESCE(
            json_agg(gm.registration_id) FILTER (WHERE gm.registration_id IS NOT NULL),
            '[]'
          ) as member_ids
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.event_id = $1 OR g.event_id IS NULL
        GROUP BY g.id, g.name, g.created_at, g.locked, g.event_id
        ORDER BY g.name ASC;
      `, [targetEvent.id]);
      allGroups = groupRes.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        locked: Boolean(row.locked),
        memberIds: row.member_ids || [],
        eventId: row.event_id,
      }));
    } else {
      allRegistrations = this.inMemoryData.registrations.filter(r => !r.eventId || r.eventId === targetEvent.id);
      allGroups = this.inMemoryData.groups.filter(g => !g.eventId || g.eventId === targetEvent.id);
    }

    const activeRegistrations = allRegistrations.filter(r => r.status === 'active' || r.status === 'valid');
    const withdrawnRegistrations = allRegistrations.filter(r => r.status === 'withdrawn');

    // 1. Withdrawn participants checks
    for (const w of withdrawnRegistrations) {
      if (w.groupId) {
        issues.push(`Withdrawn participant ${w.rollNumber} still has a group assigned.`);
      }
    }
    for (const g of allGroups) {
      for (const mId of g.memberIds) {
        const reg = allRegistrations.find(r => r.id === mId);
        if (reg && reg.status === 'withdrawn') {
          issues.push(`Withdrawn participant ${reg.rollNumber} is present in group ${g.name}.`);
        }
      }
    }

    // 2. Duplicate roll numbers among active participants
    const rollCounts: Record<string, number> = {};
    for (const v of activeRegistrations) {
      rollCounts[v.rollNumber] = (rollCounts[v.rollNumber] || 0) + 1;
    }
    for (const r in rollCounts) {
      if (rollCounts[r] > 1) {
        issues.push(`Duplicate active roll number: ${r} appears ${rollCounts[r]} times.`);
      }
    }

    // 3. Unresolved duplicate entries
    const unresolvedDuplicates = allRegistrations.filter(
      r => r.status === 'duplicate' && !r.flagReason?.includes('Superseded')
    );
    if (unresolvedDuplicates.length > 0) {
      issues.push(`${unresolvedDuplicates.length} unresolved duplicate registration(s) detected. Please resolve them first.`);
    }

    // 4. Unassigned active participants
    const unassigned = activeRegistrations.filter(r => !r.groupId);
    if (unassigned.length > 0) {
      issues.push(`${unassigned.length} active participant(s) are unassigned.`);
    }

    // 5. Any participant in multiple groups
    const memberGroupCounts: Record<string, number> = {};
    for (const g of allGroups) {
      for (const mId of g.memberIds) {
        memberGroupCounts[mId] = (memberGroupCounts[mId] || 0) + 1;
      }
    }
    let multiGroupCount = 0;
    for (const mId in memberGroupCounts) {
      if (memberGroupCounts[mId] > 1) {
        multiGroupCount++;
        issues.push(`Participant ${mId} appears in ${memberGroupCounts[mId]} different groups.`);
      }
    }

    // 6. Group count and member count validation
    if (allGroups.length === 0) {
      issues.push("No groups have been created yet. Run Mix Match first.");
    }
    for (const g of allGroups) {
      if (g.memberIds.length < 2 || g.memberIds.length > 4) {
        issues.push(`${g.name} has invalid member count (${g.memberIds.length} members). Valid groups have 2-4 members.`);
      }
    }

    // 7. Check if groups need remix because someone withdrew after matching
    const withdrawnAfterMatch = allRegistrations.filter(
      r =>
        r.status === 'withdrawn' &&
        r.withdrawnStage === 'after_match' &&
        (lastMixedAt ? (r.withdrawnAt || 0) > lastMixedAt : false)
    );
    if (withdrawnAfterMatch.length > 0) {
      issues.push(`${withdrawnAfterMatch.length} participant(s) withdrew after matching. Groups must be remixed.`);
    }

    // 8. Whether all groups are locked
    if (!groupsLocked) {
      issues.push("Groups are not locked yet. Click 'Lock Groups' before publishing.");
    }
    const unlockedGroups = allGroups.filter(g => !g.locked);
    if (unlockedGroups.length > 0 && groupsLocked) {
      issues.push(`${unlockedGroups.length} group(s) are not locked.`);
    }

    const passed = issues.length === 0;
    if (passed && eventStage === 'GROUPS_LOCKED') {
      if (isPostgresConfigured()) {
        await query(`UPDATE events SET stage = 'READY_TO_PUBLISH' WHERE id = $1;`, [targetEvent.id]);
        if (this.currentActiveEventId === targetEvent.id) {
          await query(`UPDATE event_state SET stage = 'READY_TO_PUBLISH' WHERE id = 1;`);
        }
      } else {
        targetEvent.stage = 'READY_TO_PUBLISH';
        if (this.currentActiveEventId === targetEvent.id) {
          this.inMemoryData.event.stage = 'READY_TO_PUBLISH';
        }
      }
    }

    return {
      passed,
      issues,
      stats: {
        totalRegistrations: allRegistrations.length,
        activeParticipants: activeRegistrations.length,
        withdrawnCount: withdrawnRegistrations.length,
        uniqueParticipants: activeRegistrations.length,
        assignedCount: activeRegistrations.filter(r => r.groupId).length,
        unresolvedDuplicates: unresolvedDuplicates.length,
        unassignedCount: unassigned.length,
        participantsInMultipleGroups: multiGroupCount,
        groupsCount: allGroups.length,
      },
    };
  }

  // 12. Publish Final List
  public async publishFinalList(targetEventId?: string): Promise<{ success: boolean; error?: string; publishedAt: number | null; eventId?: string }> {
    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    const check = await this.runFinalIntegrityCheck(targetEvent.id);
    if (!check.passed) {
      return {
        success: false,
        error: `Cannot publish yet. ${check.issues.length} issues found: ${check.issues.join('; ')}`,
        publishedAt: null,
        eventId: targetEvent.id,
      };
    }

    const now = Date.now();
    if (isPostgresConfigured()) {
      await query(
        `UPDATE events SET
           is_published = true,
           published_at = $1,
           stage = 'PUBLISHED',
           status = 'completed',
           updated_at = $1
         WHERE id = $2;`,
        [now, targetEvent.id]
      );
      if (this.currentActiveEventId === targetEvent.id) {
        await query(
          `UPDATE event_state SET
             is_published = true,
             published_at = $1,
             stage = 'PUBLISHED'
           WHERE id = 1;`,
          [now]
        );
      }
      return { success: true, publishedAt: now, eventId: targetEvent.id };
    }

    targetEvent.isPublished = true;
    targetEvent.publishedAt = now;
    targetEvent.stage = 'PUBLISHED';
    targetEvent.status = 'completed';

    const inMemEvtPub = this.inMemoryData.events.find(e => e.id === targetEvent.id);
    if (inMemEvtPub) {
      inMemEvtPub.isPublished = true;
      inMemEvtPub.publishedAt = now;
      inMemEvtPub.stage = 'PUBLISHED';
      inMemEvtPub.status = 'completed';
      inMemEvtPub.updatedAt = now;
    }

    if (this.currentActiveEventId === targetEvent.id) {
      this.inMemoryData.event.isPublished = true;
      this.inMemoryData.event.publishedAt = now;
      this.inMemoryData.event.stage = 'PUBLISHED';
    }

    return {
      success: true,
      publishedAt: now,
      eventId: targetEvent.id,
    };
  }

  // Admin registration toggle
  public async toggleRegistration(isOpen: boolean, targetEventId?: string): Promise<boolean> {
    const targetEvent = targetEventId
      ? ((await this.getEventById(targetEventId)) || (await this.getActiveEvent()))
      : await this.getActiveEvent();

    if (isPostgresConfigured()) {
      let nextStage = targetEvent.stage || 'REGISTRATION_OPEN';
      if (!isOpen && nextStage === 'REGISTRATION_OPEN') {
        nextStage = 'REGISTRATION_CLOSED';
      } else if (isOpen && nextStage === 'REGISTRATION_CLOSED') {
        nextStage = 'REGISTRATION_OPEN';
      }

      await query(
        `UPDATE events SET registration_open = $1, stage = $2, updated_at = $3 WHERE id = $4;`,
        [isOpen, nextStage, Date.now(), targetEvent.id]
      );

      if (this.currentActiveEventId === targetEvent.id) {
        await query(`UPDATE event_state SET registration_open = $1, stage = $2 WHERE id = 1;`, [
          isOpen,
          nextStage,
        ]);
      }
      return isOpen;
    }

    targetEvent.registrationOpen = isOpen;
    if (!isOpen && targetEvent.stage === 'REGISTRATION_OPEN') {
      targetEvent.stage = 'REGISTRATION_CLOSED';
    } else if (isOpen && targetEvent.stage === 'REGISTRATION_CLOSED') {
      targetEvent.stage = 'REGISTRATION_OPEN';
    }

    if (this.currentActiveEventId === targetEvent.id) {
      this.inMemoryData.event.registrationOpen = isOpen;
      this.inMemoryData.event.stage = targetEvent.stage;
    }

    return targetEvent.registrationOpen;
  }

  // Admin full data
  public async getAdminData(targetEventId?: string) {
    const allEvents = await this.getEvents();
    const activeEvent = await this.getActiveEvent();
    const currentEvent = targetEventId
      ? (allEvents.find(e => e.id === targetEventId) || activeEvent)
      : activeEvent;

    let allRegistrations: Registration[] = [];
    let allGroups: Group[] = [];
    let lastMixedAt: number | null = currentEvent.lastMixedAt;

    if (isPostgresConfigured()) {
      const regRes = await query(
        `SELECT * FROM registrations WHERE event_id = $1 OR event_id IS NULL ORDER BY registered_at ASC;`,
        [currentEvent.id]
      );
      allRegistrations = regRes.rows.map(mapRowToRegistration);

      const groupRes = await query(`
        SELECT g.id, g.name, g.created_at, g.locked, g.event_id,
          COALESCE(
            json_agg(gm.registration_id) FILTER (WHERE gm.registration_id IS NOT NULL),
            '[]'
          ) as member_ids
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.event_id = $1 OR g.event_id IS NULL
        GROUP BY g.id, g.name, g.created_at, g.locked, g.event_id
        ORDER BY g.name ASC;
      `, [currentEvent.id]);
      allGroups = groupRes.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        locked: Boolean(row.locked),
        memberIds: row.member_ids || [],
        eventId: row.event_id,
      }));
    } else {
      allRegistrations = this.inMemoryData.registrations.filter(
        r => !r.eventId || r.eventId === currentEvent.id
      );
      allGroups = this.inMemoryData.groups.filter(
        g => !g.eventId || g.eventId === currentEvent.id
      );
    }

    const totalRegistrations = allRegistrations.length;
    const activeParticipants = allRegistrations.filter(r => r.status === 'active' || r.status === 'valid').length;
    const withdrawnCount = allRegistrations.filter(r => r.status === 'withdrawn').length;
    const duplicateCount = allRegistrations.filter(r => r.status === 'duplicate').length;
    const invalidCount = allRegistrations.filter(r => r.status === 'invalid').length;
    const totalGroups = allGroups.length;

    const withdrawnAfterMatchingCount = allRegistrations.filter(
      r =>
        r.status === 'withdrawn' &&
        r.withdrawnStage === 'after_match' &&
        (lastMixedAt ? (r.withdrawnAt || 0) > lastMixedAt : true)
    ).length;

    const needsRemix = withdrawnAfterMatchingCount > 0 && !currentEvent.isPublished;

    const dupCheck = await this.runDuplicateCheck(currentEvent.id);

    const batchDistribution: Record<string, number> = {};
    for (const r of allRegistrations) {
      if (r.status === 'active' || r.status === 'valid') {
        batchDistribution[r.batch] = (batchDistribution[r.batch] || 0) + 1;
      }
    }

    // Compute global metrics across published events for each roll number
    const globalRegs = await this.getAllRegistrations();
    const globalGroups = await this.getAllGroups();
    const publishedEventIds = new Set(
      allEvents.filter(e => e.isPublished || e.status === 'completed').map(e => e.id)
    );

    const peopleMetMap = new Map<string, Set<string>>();
    for (const g of globalGroups) {
      if (!g.eventId || !publishedEventIds.has(g.eventId)) continue;
      const validRolls: string[] = [];
      for (const mId of g.memberIds) {
        const r = globalRegs.find(reg => reg.id === mId);
        if (r && r.status !== 'withdrawn') {
          validRolls.push(r.rollNumber);
        }
      }
      for (let i = 0; i < validRolls.length; i++) {
        for (let j = i + 1; j < validRolls.length; j++) {
          const r1 = validRolls[i];
          const r2 = validRolls[j];
          if (!peopleMetMap.has(r1)) peopleMetMap.set(r1, new Set());
          if (!peopleMetMap.has(r2)) peopleMetMap.set(r2, new Set());
          peopleMetMap.get(r1)!.add(r2);
          peopleMetMap.get(r2)!.add(r1);
        }
      }
    }

    const eventsJoinedMap = new Map<string, number>();
    for (const r of globalRegs) {
      if (r.eventId && publishedEventIds.has(r.eventId) && (r.status === 'active' || r.status === 'valid') && r.groupId) {
        eventsJoinedMap.set(r.rollNumber, (eventsJoinedMap.get(r.rollNumber) || 0) + 1);
      }
    }

    const formattedGroups = allGroups.map(g => {
      let hasWithdrawnMember = false;
      const members: AdminGroupMember[] = g.memberIds.map(mId => {
        const reg = allRegistrations.find(r => r.id === mId);
        if (reg?.status === 'withdrawn') hasWithdrawnMember = true;
        return {
          id: mId,
          name: reg ? reg.name : 'Unknown',
          rollNumber: reg ? reg.rollNumber : 'N/A',
          batch: reg ? reg.batch : 'N/A',
          phoneNumber: reg?.phoneNumber || 'N/A',
          status: reg?.status || 'active',
        };
      });

      const uniqueBatches = new Set(members.map(m => m.batch)).size;
      return {
        id: g.id,
        name: g.name,
        membersCount: members.length,
        uniqueBatchesCount: uniqueBatches,
        members,
        locked: g.locked,
        hasWithdrawnMember,
      };
    });

    return {
      events: allEvents,
      activeEventId: activeEvent.id,
      selectedEventId: currentEvent.id,
      totalRegistrations,
      activeParticipants,
      withdrawnCount,
      duplicateCount,
      invalidCount,
      uniqueParticipants: activeParticipants,
      totalGroups,
      withdrawnAfterMatchingCount,
      needsRemix,
      event: {
        id: currentEvent.id,
        name: currentEvent.name,
        eventDate: currentEvent.eventDate,
        eventDay: currentEvent.eventDay,
        eventTimeFormatted: currentEvent.eventTimeFormatted,
        eventDisplayTitle: currentEvent.eventDisplayTitle,
        stage: currentEvent.stage,
        revealTime: currentEvent.revealTime,
        registrationStart: currentEvent.registrationStart,
        registrationEnd: currentEvent.registrationEnd,
        registrationOpen: currentEvent.registrationOpen,
        groupsLocked: currentEvent.groupsLocked,
        isPublished: currentEvent.isPublished,
        publishedAt: currentEvent.publishedAt,
        status: currentEvent.status,
      },
      duplicateSummary: {
        duplicateCount: dupCheck.duplicateCount,
        unresolvedCount: dupCheck.issues.filter(i => !i.resolved).length,
        issues: dupCheck.issues,
      },
      batchDistribution,
      registrations: allRegistrations.map(r => ({
        id: r.id,
        name: r.name,
        rollNumber: r.rollNumber,
        batch: r.batch,
        phoneNumber: r.phoneNumber,
        registeredAt: r.registeredAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        status: r.status,
        withdrawnStage: r.withdrawnStage,
        withdrawnAt: r.withdrawnAt,
        flagReason: r.flagReason,
        groupId: r.groupId,
        eventId: r.eventId || currentEvent.id,
        differentPeopleMet: peopleMetMap.get(r.rollNumber)?.size || 0,
        eventsJoined: eventsJoinedMap.get(r.rollNumber) || 0,
      })),
      groups: formattedGroups,
      lastMixedAt,
    };
  }

  // Reset to initial seed state (40 registrations, 38 unique, 2 duplicates)
  public async resetDevData(): Promise<{
    success: boolean;
    totalRegistrations: number;
    activeParticipants: number;
    withdrawnCount: number;
  }> {
    const seeds = getInitialSeedRegistrations();
    const revealTime = getNextFriday3PMIST().toISOString();

    if (isPostgresConfigured()) {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM group_members;');
        await client.query('DELETE FROM groups;');
        await client.query('DELETE FROM registrations;');

        for (const s of seeds) {
          await client.query(
            `INSERT INTO registrations (
               id, name, roll_number, batch, phone_number,
               created_at, updated_at, registered_at, status,
               flag_reason, duplicate_of_roll, group_id, group_assigned, revealed
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, false, false);`,
            [
              s.id,
              s.name,
              s.rollNumber,
              s.batch,
              s.phoneNumber,
              s.createdAt,
              s.updatedAt,
              s.registeredAt,
              s.status,
              s.flagReason || null,
              s.duplicateOfRoll || null,
            ]
          );
        }

        await client.query(
          `UPDATE event_state SET
             stage = 'REGISTRATION_OPEN',
             reveal_time = $1,
             registration_open = true,
             groups_locked = false,
             is_published = false,
             published_at = NULL,
             last_mixed_at = NULL
           WHERE id = 1;`,
          [revealTime]
        );

        await client.query('COMMIT');

        const activeCount = seeds.filter(r => r.status === 'active' || r.status === 'valid').length;
        return {
          success: true,
          totalRegistrations: seeds.length,
          activeParticipants: activeCount,
          withdrawnCount: 0,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    this.inMemoryData = {
      registrations: seeds,
      groups: [],
      events: this.inMemoryData?.events || [],
      activeEventId: this.inMemoryData?.activeEventId || 'evt_2026_09_19',
      event: {
        stage: 'REGISTRATION_OPEN',
        revealTime,
        registrationOpen: true,
        groupsLocked: false,
        isPublished: false,
        publishedAt: null,
      },
      lastMixedAt: null,
    };

    return {
      success: true,
      totalRegistrations: seeds.length,
      activeParticipants: seeds.filter(r => r.status === 'active' || r.status === 'valid').length,
      withdrawnCount: 0,
    };
  }

  // Clear all registrations to test completely empty database / zero states
  public async clearAllData(): Promise<{
    success: boolean;
    totalRegistrations: number;
    activeParticipants: number;
  }> {
    const revealTime = getNextFriday3PMIST().toISOString();

    if (isPostgresConfigured()) {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM group_members;');
        await client.query('DELETE FROM groups;');
        await client.query('DELETE FROM registrations;');

        await client.query(
          `UPDATE event_state SET
             stage = 'REGISTRATION_OPEN',
             reveal_time = $1,
             registration_open = true,
             groups_locked = false,
             is_published = false,
             published_at = NULL,
             last_mixed_at = NULL
           WHERE id = 1;`,
          [revealTime]
        );

        await client.query('COMMIT');
        return {
          success: true,
          totalRegistrations: 0,
          activeParticipants: 0,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    this.inMemoryData = {
      registrations: [],
      groups: [],
      events: [],
      activeEventId: '',
      event: {
        stage: 'REGISTRATION_OPEN',
        revealTime,
        registrationOpen: true,
        groupsLocked: false,
        isPublished: false,
        publishedAt: null,
      },
      lastMixedAt: null,
    };

    return {
      success: true,
      totalRegistrations: 0,
      activeParticipants: 0,
    };
  }

  public async getEventRegistrations(eventId: string): Promise<Registration[]> {
    if (isPostgresConfigured()) {
      const res = await query(
        `SELECT * FROM registrations WHERE event_id = $1 OR event_id IS NULL ORDER BY registered_at ASC;`,
        [eventId]
      );
      return res.rows.map(mapRowToRegistration);
    }
    return this.inMemoryData.registrations.filter(r => !r.eventId || r.eventId === eventId);
  }

  public async getEventGroups(eventId: string): Promise<Group[]> {
    if (isPostgresConfigured()) {
      const res = await query(`
        SELECT g.id, g.name, g.created_at, g.locked, g.event_id,
          COALESCE(
            json_agg(gm.registration_id) FILTER (WHERE gm.registration_id IS NOT NULL),
            '[]'
          ) as member_ids
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.event_id = $1 OR g.event_id IS NULL
        GROUP BY g.id, g.name, g.created_at, g.locked, g.event_id
        ORDER BY g.name ASC;
      `, [eventId]);
      return res.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        locked: Boolean(row.locked),
        memberIds: row.member_ids || [],
        eventId: row.event_id,
      }));
    }
    return this.inMemoryData.groups.filter(g => !g.eventId || g.eventId === eventId);
  }

  // 14. Global Data Access across all events
  public async getAllRegistrations(): Promise<Registration[]> {
    if (isPostgresConfigured()) {
      const res = await query(`SELECT * FROM registrations ORDER BY registered_at ASC;`);
      return res.rows.map(mapRowToRegistration);
    }
    return [...this.inMemoryData.registrations];
  }

  public async getAllGroups(): Promise<Group[]> {
    if (isPostgresConfigured()) {
      const res = await query(`
        SELECT g.id, g.name, g.created_at, g.locked, g.event_id,
          COALESCE(
            json_agg(gm.registration_id) FILTER (WHERE gm.registration_id IS NOT NULL),
            '[]'
          ) as member_ids
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        GROUP BY g.id, g.name, g.created_at, g.locked, g.event_id
        ORDER BY g.created_at ASC;
      `);
      return res.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        locked: Boolean(row.locked),
        memberIds: row.member_ids || [],
        eventId: row.event_id,
      }));
    }
    return [...this.inMemoryData.groups];
  }
}

export const db = new Database();
