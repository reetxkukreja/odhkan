import {
  isPostgresConfigured,
  initPostgresSchema,
  query,
  getClient,
} from './postgres';

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

export interface EventState {
  stage: EventStage;
  revealTime: string; // ISO string for Friday 15:00 IST
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
    };
  });
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
  };
}

class Database {
  private inMemoryData: DatabaseSchema;

  constructor() {
    this.inMemoryData = {
      registrations: getInitialSeedRegistrations(),
      groups: [],
      event: {
        stage: 'REGISTRATION_OPEN',
        revealTime: getNextFriday3PMIST().toISOString(),
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

  // 1. Public Status - Live Counter
  public async getPublicStatus(): Promise<{
    totalCount: number;
    eventStatus: string;
    revealTime: string;
    isRevealed: boolean;
    groupsCount: number;
    registrationOpen: boolean;
  }> {
    if (isPostgresConfigured()) {
      const activeRes = await query(
        `SELECT COUNT(*)::int as count FROM registrations WHERE status IN ('active', 'valid');`
      );
      const activeCount = activeRes.rows[0]?.count || 0;

      const groupRes = await query(`SELECT COUNT(*)::int as count FROM groups;`);
      const groupsCount = groupRes.rows[0]?.count || 0;

      const eventRes = await query(`SELECT * FROM event_state WHERE id = 1;`);
      const eventRow = eventRes.rows[0];
      const revealTime = eventRow?.reveal_time || getNextFriday3PMIST().toISOString();
      const registrationOpen = eventRow ? Boolean(eventRow.registration_open) : true;
      const groupsLocked = eventRow ? Boolean(eventRow.groups_locked) : false;
      const isPublished = eventRow ? Boolean(eventRow.is_published) : false;

      const isOverdue = new Date(revealTime).getTime() <= Date.now();
      const isRevealed = isPublished || (isOverdue && groupsLocked);

      return {
        totalCount: activeCount,
        eventStatus: isRevealed ? 'revealed' : groupsLocked ? 'locked' : 'open',
        revealTime,
        isRevealed,
        groupsCount,
        registrationOpen,
      };
    }

    const activeCount = this.inMemoryData.registrations.filter(
      r => r.status === 'active' || r.status === 'valid'
    ).length;
    const isOverdue = new Date(this.inMemoryData.event.revealTime).getTime() <= Date.now();
    const isRevealed =
      this.inMemoryData.event.isPublished || (isOverdue && this.inMemoryData.event.groupsLocked);

    return {
      totalCount: activeCount,
      eventStatus: isRevealed ? 'revealed' : this.inMemoryData.event.groupsLocked ? 'locked' : 'open',
      revealTime: this.inMemoryData.event.revealTime,
      isRevealed,
      groupsCount: this.inMemoryData.groups.length,
      registrationOpen: this.inMemoryData.event.registrationOpen,
    };
  }

  // 2. Public Registration Flow
  public async join(
    name: string,
    rawRoll: string,
    rawPhone: string
  ): Promise<{
    success: boolean;
    error?: string;
    subtext?: string;
    participant?: { id: string; name: string; rollNumber: string; status: string };
    totalCount: number;
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

    if (isPostgresConfigured()) {
      // Check event registration open
      const eventRes = await query(`SELECT registration_open FROM event_state WHERE id = 1;`);
      const isRegOpen = eventRes.rows[0]?.registration_open !== false;
      if (!isRegOpen) {
        const activeCount = await this.getActiveCount();
        return {
          success: false,
          error: 'Registrations for this Odhkan are currently closed.',
          totalCount: activeCount,
        };
      }

      // Check existing registration
      const existingRes = await query(
        `SELECT * FROM registrations WHERE roll_number = $1 ORDER BY registered_at ASC;`,
        [rollValidation.normalizedRoll]
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
               withdrawn_at = NULL
             WHERE id = $4;`,
            [trimmedName, phoneValidation.normalizedPhone, now, existing.id]
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
          };
        }

        // Already active -> log duplicate audit record
        const now = Date.now();
        const dupId = `reg_${now}_dup`;
        await query(
          `INSERT INTO registrations (
             id, name, roll_number, batch, phone_number,
             created_at, updated_at, registered_at, status,
             flag_reason, duplicate_of_roll, group_id, group_assigned, revealed
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'duplicate', $9, $10, NULL, false, false);`,
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
          ]
        );

        const activeCount = await this.getActiveCount();
        return {
          success: false,
          error: "You're already in Odhkan.",
          subtext: "You're all set. See you Friday at 3.",
          participant: {
            id: existing.id,
            name: existing.name,
            rollNumber: existing.rollNumber,
            status: existing.status,
          },
          totalCount: activeCount,
        };
      }

      // Valid new unique registration
      const now = Date.now();
      const newId = `reg_${now}_${Math.random().toString(36).substring(2, 6)}`;
      await query(
        `INSERT INTO registrations (
           id, name, roll_number, batch, phone_number,
           created_at, updated_at, registered_at, status,
           group_id, group_assigned, revealed
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NULL, false, false);`,
        [
          newId,
          trimmedName,
          rollValidation.normalizedRoll,
          rollValidation.batch,
          phoneValidation.normalizedPhone,
          now,
          now,
          now,
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
      };
    }

    // In-memory fallback
    if (!this.inMemoryData.event.registrationOpen) {
      return {
        success: false,
        error: 'Registrations for this Odhkan are currently closed.',
        totalCount: await this.getActiveCount(),
      };
    }

    const existingIndex = this.inMemoryData.registrations.findIndex(
      r => r.rollNumber === rollValidation.normalizedRoll
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

        return {
          success: true,
          participant: {
            id: existing.id,
            name: existing.name,
            rollNumber: existing.rollNumber,
            status: 'active',
          },
          totalCount: await this.getActiveCount(),
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
      };
      this.inMemoryData.registrations.push(duplicateEntry);

      return {
        success: false,
        error: "You're already in Odhkan.",
        subtext: "You're all set. See you Friday at 3.",
        participant: {
          id: existing.id,
          name: existing.name,
          rollNumber: existing.rollNumber,
          status: existing.status,
        },
        totalCount: await this.getActiveCount(),
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
    };
  }

  // 3. "CAN'T MAKE IT TODAY" WITHDRAWAL FLOW
  public async withdraw(rawRoll: string): Promise<{
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

    if (isPostgresConfigured()) {
      const regRes = await query(
        `SELECT * FROM registrations WHERE roll_number = $1 AND status IN ('active', 'valid');`,
        [validation.normalizedRoll]
      );

      if (regRes.rows.length === 0) {
        const alreadyRes = await query(
          `SELECT * FROM registrations WHERE roll_number = $1 AND status = 'withdrawn';`,
          [validation.normalizedRoll]
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
      const eventRes = await query(`SELECT is_published FROM event_state WHERE id = 1;`);
      const isPublished = Boolean(eventRes.rows[0]?.is_published);

      const groupCountRes = await query(`SELECT COUNT(*)::int as count FROM groups;`);
      const groupsCount = groupCountRes.rows[0]?.count || 0;

      let stage: 'before_match' | 'after_match' | 'after_reveal' = 'before_match';
      const now = Date.now();

      if (isPublished) {
        stage = 'after_reveal';
        await query(
          `UPDATE registrations SET
             status = 'withdrawn',
             withdrawn_at = $1,
             updated_at = $1,
             withdrawn_stage = 'after_reveal'
           WHERE id = $2;`,
          [now, reg.id]
        );
      } else if (groupsCount > 0) {
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
        await query(`DELETE FROM group_members WHERE registration_id = $1;`, [reg.id]);
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
      r => r.rollNumber === validation.normalizedRoll && (r.status === 'active' || r.status === 'valid')
    );

    if (!reg) {
      const alreadyWithdrawn = this.inMemoryData.registrations.find(
        r => r.rollNumber === validation.normalizedRoll && r.status === 'withdrawn'
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
    if (this.inMemoryData.event.isPublished) {
      stage = 'after_reveal';
      reg.withdrawnStage = 'after_reveal';
    } else if (this.inMemoryData.groups.length > 0) {
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
  public async getParticipantStatus(rawRoll: string): Promise<{
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
  public async revealGroupForRoll(rawRoll: string): Promise<{
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
  public async getGroupContactsForRoll(rawRoll: string): Promise<{
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

    if (isPostgresConfigured()) {
      const eventRes = await query(`SELECT is_published FROM event_state WHERE id = 1;`);
      if (!eventRes.rows[0]?.is_published) {
        return { success: false, error: 'Groups have not been published yet.' };
      }

      const regRes = await query(
        `SELECT group_id FROM registrations WHERE roll_number = $1 LIMIT 1;`,
        [validation.normalizedRoll]
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
    if (!this.inMemoryData.event.isPublished) {
      return { success: false, error: 'Groups have not been published yet.' };
    }

    const reg = this.inMemoryData.registrations.find(r => r.rollNumber === validation.normalizedRoll);
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
  public async runDuplicateCheck(): Promise<{
    totalRegistrations: number;
    uniqueParticipants: number;
    duplicateCount: number;
    issues: DuplicateIssue[];
    readyToMix: boolean;
  }> {
    let allRegistrations: Registration[] = [];

    if (isPostgresConfigured()) {
      const res = await query(`SELECT * FROM registrations ORDER BY registered_at ASC;`);
      allRegistrations = res.rows.map(mapRowToRegistration);
    } else {
      allRegistrations = [...this.inMemoryData.registrations];
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
    choice: 'first' | 'latest' | string
  ): Promise<{
    success: boolean;
    rollNumber: string;
    chosenId: string;
  }> {
    const normalizedRoll = this.normalizeRollNumber(rollNumber);

    if (isPostgresConfigured()) {
      const res = await query(
        `SELECT * FROM registrations WHERE roll_number = $1 ORDER BY registered_at ASC;`,
        [normalizedRoll]
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
      .filter(r => r.rollNumber === normalizedRoll)
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

  // 9. Mix Match (Group Generation)
  public async mixMatch(): Promise<{
    success: boolean;
    error?: string;
    totalParticipants: number;
    groupsCount: number;
  }> {
    const dupCheck = await this.runDuplicateCheck();
    const unresolved = dupCheck.issues.filter(i => !i.resolved);
    if (unresolved.length > 0) {
      return {
        success: false,
        error: `Cannot mix groups: ${unresolved.length} unresolved duplicate roll numbers exist. Please resolve them first.`,
        totalParticipants: 0,
        groupsCount: 0,
      };
    }

    let activeParticipants: Registration[] = [];
    if (isPostgresConfigured()) {
      const res = await query(`SELECT * FROM registrations WHERE status IN ('active', 'valid');`);
      activeParticipants = res.rows.map(mapRowToRegistration);
    } else {
      activeParticipants = this.inMemoryData.registrations.filter(
        r => r.status === 'active' || r.status === 'valid'
      );
    }

    const N = activeParticipants.length;
    if (N < 3) {
      return {
        success: false,
        error: `Need at least 3 active participants to create a group. Currently have ${N}.`,
        totalParticipants: N,
        groupsCount: 0,
      };
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

    // Shuffle
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }

    // Partition
    let curIdx = 0;
    const initialGroups: Registration[][] = [];
    for (const size of groupSizes) {
      initialGroups.push(participants.slice(curIdx, curIdx + size));
      curIdx += size;
    }

    // Batch diversity optimization scoring
    const calcGroupPenalty = (grp: Registration[]): number => {
      const counts: Record<string, number> = {};
      for (const p of grp) {
        counts[p.batch] = (counts[p.batch] || 0) + 1;
      }
      let penalty = 0;
      for (const b in counts) {
        const c = counts[b];
        if (c >= 3) {
          penalty += 100;
        } else if (c === 2) {
          penalty += 5;
        }
      }
      return penalty;
    };

    const numGroups = initialGroups.length;
    if (numGroups > 1) {
      for (let iter = 0; iter < 3000; iter++) {
        const g1Idx = Math.floor(Math.random() * numGroups);
        let g2Idx = Math.floor(Math.random() * numGroups);
        while (g2Idx === g1Idx) {
          g2Idx = Math.floor(Math.random() * numGroups);
        }

        const g1 = initialGroups[g1Idx];
        const g2 = initialGroups[g2Idx];
        const m1Idx = Math.floor(Math.random() * g1.length);
        const m2Idx = Math.floor(Math.random() * g2.length);

        const oldPen = calcGroupPenalty(g1) + calcGroupPenalty(g2);

        const t1 = g1[m1Idx];
        const t2 = g2[m2Idx];
        g1[m1Idx] = t2;
        g2[m2Idx] = t1;

        const newPen = calcGroupPenalty(g1) + calcGroupPenalty(g2);
        const delta = newPen - oldPen;

        if (delta < 0 || (delta === 0 && Math.random() < 0.15)) {
          // keep swap
        } else {
          g1[m1Idx] = t1;
          g2[m2Idx] = t2;
        }
      }
    }

    // Format new groups
    const newGroups: Group[] = [];
    const assignedIdsMap: Record<string, string> = {};
    const now = Date.now();

    initialGroups.forEach((grp, idx) => {
      const padNum = (idx + 1).toString().padStart(2, '0');
      const groupId = `grp_${now}_${padNum}`;
      const memberIds = grp.map(p => p.id);

      newGroups.push({
        id: groupId,
        name: `Group ${padNum}`,
        memberIds,
        createdAt: now,
        locked: false,
      });

      grp.forEach(p => {
        assignedIdsMap[p.id] = groupId;
      });
    });

    if (isPostgresConfigured()) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Delete old group associations
        await client.query('DELETE FROM group_members;');
        await client.query('DELETE FROM groups;');

        // Insert new groups & members
        for (const g of newGroups) {
          await client.query(
            `INSERT INTO groups (id, name, created_at, locked) VALUES ($1, $2, $3, $4);`,
            [g.id, g.name, g.createdAt, g.locked]
          );

          for (const mId of g.memberIds) {
            await client.query(
              `INSERT INTO group_members (group_id, registration_id) VALUES ($1, $2);`,
              [g.id, mId]
            );
            await client.query(
              `UPDATE registrations SET group_id = $1, group_assigned = true, updated_at = $2 WHERE id = $3;`,
              [g.id, now, mId]
            );
          }
        }

        // Clear group assignment on non-active
        await client.query(
          `UPDATE registrations SET group_id = NULL, group_assigned = false WHERE status NOT IN ('active', 'valid');`
        );

        // Update event state
        await client.query(
          `UPDATE event_state SET
             stage = 'MIXED',
             groups_locked = false,
             is_published = false,
             last_mixed_at = $1
           WHERE id = 1;`,
          [now]
        );

        await client.query('COMMIT');
        return {
          success: true,
          totalParticipants: participants.length,
          groupsCount: newGroups.length,
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
      if (r.status === 'active' || r.status === 'valid') {
        r.groupId = assignedIdsMap[r.id] || null;
        r.groupAssigned = Boolean(r.groupId);
      } else {
        r.groupId = null;
        r.groupAssigned = false;
      }
      r.updatedAt = now;
    }

    this.inMemoryData.groups = newGroups;
    this.inMemoryData.lastMixedAt = now;
    this.inMemoryData.event.stage = 'MIXED';
    this.inMemoryData.event.groupsLocked = false;
    this.inMemoryData.event.isPublished = false;

    return {
      success: true,
      totalParticipants: participants.length,
      groupsCount: newGroups.length,
    };
  }

  // 10. Lock Groups
  public async lockGroups(): Promise<{ success: boolean; groupsCount: number }> {
    if (isPostgresConfigured()) {
      await query(`UPDATE event_state SET stage = 'GROUPS_LOCKED', groups_locked = true WHERE id = 1;`);
      await query(`UPDATE groups SET locked = true;`);
      const countRes = await query(`SELECT COUNT(*)::int as count FROM groups;`);
      return { success: true, groupsCount: countRes.rows[0]?.count || 0 };
    }

    this.inMemoryData.event.groupsLocked = true;
    this.inMemoryData.event.stage = 'GROUPS_LOCKED';
    for (const g of this.inMemoryData.groups) {
      g.locked = true;
    }
    return { success: true, groupsCount: this.inMemoryData.groups.length };
  }

  // 11. Final Integrity Check
  public async runFinalIntegrityCheck(): Promise<IntegrityCheckResult> {
    const issues: string[] = [];

    let allRegistrations: Registration[] = [];
    let allGroups: Group[] = [];
    let eventState: EventState;
    let lastMixedAt: number | null = null;

    if (isPostgresConfigured()) {
      const regRes = await query(`SELECT * FROM registrations ORDER BY registered_at ASC;`);
      allRegistrations = regRes.rows.map(mapRowToRegistration);

      const groupRes = await query(`
        SELECT g.id, g.name, g.created_at, g.locked,
          COALESCE(
            json_agg(gm.registration_id) FILTER (WHERE gm.registration_id IS NOT NULL),
            '[]'
          ) as member_ids
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        GROUP BY g.id, g.name, g.created_at, g.locked
        ORDER BY g.name ASC;
      `);
      allGroups = groupRes.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        locked: Boolean(row.locked),
        memberIds: row.member_ids || [],
      }));

      const eventRes = await query(`SELECT * FROM event_state WHERE id = 1;`);
      const eventRow = eventRes.rows[0];
      eventState = {
        stage: eventRow?.stage || 'REGISTRATION_OPEN',
        revealTime: eventRow?.reveal_time || getNextFriday3PMIST().toISOString(),
        registrationOpen: Boolean(eventRow?.registration_open),
        groupsLocked: Boolean(eventRow?.groups_locked),
        isPublished: Boolean(eventRow?.is_published),
        publishedAt: eventRow?.published_at ? Number(eventRow.published_at) : null,
      };
      lastMixedAt = eventRow?.last_mixed_at ? Number(eventRow.last_mixed_at) : null;
    } else {
      allRegistrations = this.inMemoryData.registrations;
      allGroups = this.inMemoryData.groups;
      eventState = this.inMemoryData.event;
      lastMixedAt = this.inMemoryData.lastMixedAt;
    }

    const activeRegistrations = allRegistrations.filter(r => r.status === 'active' || r.status === 'valid');
    const withdrawnRegistrations = allRegistrations.filter(r => r.status === 'withdrawn');

    // 1. Duplicate roll numbers among active participants
    const rollCounts: Record<string, number> = {};
    for (const v of activeRegistrations) {
      rollCounts[v.rollNumber] = (rollCounts[v.rollNumber] || 0) + 1;
    }
    for (const r in rollCounts) {
      if (rollCounts[r] > 1) {
        issues.push(`Duplicate active roll number: ${r} appears ${rollCounts[r]} times.`);
      }
    }

    // 2. Unresolved duplicate entries
    const unresolvedDuplicates = allRegistrations.filter(
      r => r.status === 'duplicate' && !r.flagReason?.includes('Superseded')
    );

    // 3. Unassigned participants
    const unassigned = activeRegistrations.filter(r => !r.groupId);
    if (unassigned.length > 0) {
      issues.push(`${unassigned.length} active participant(s) are unassigned.`);
    }

    // 4. Any participant in multiple groups
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

    // 5. Check if any group has fewer than 2 active members
    for (const g of allGroups) {
      if (g.memberIds.length < 2) {
        issues.push(`${g.name} has fewer than 2 members.`);
      }
    }

    // 6. Check if groups need remix because someone withdrew after matching
    const withdrawnAfterMatch = allRegistrations.filter(
      r =>
        r.status === 'withdrawn' &&
        r.withdrawnStage === 'after_match' &&
        (lastMixedAt ? (r.withdrawnAt || 0) > lastMixedAt : false)
    );
    if (withdrawnAfterMatch.length > 0) {
      issues.push(`${withdrawnAfterMatch.length} participant(s) withdrew after matching. Groups must be remixed.`);
    }

    // 7. Whether all groups are locked
    if (!eventState.groupsLocked) {
      issues.push("Groups are not locked yet. Click 'Lock Groups' before publishing.");
    }

    const passed = issues.length === 0;
    if (passed && eventState.stage === 'GROUPS_LOCKED') {
      if (isPostgresConfigured()) {
        await query(`UPDATE event_state SET stage = 'READY_TO_PUBLISH' WHERE id = 1;`);
      } else {
        this.inMemoryData.event.stage = 'READY_TO_PUBLISH';
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
  public async publishFinalList(): Promise<{ success: boolean; error?: string; publishedAt: number | null }> {
    const check = await this.runFinalIntegrityCheck();
    if (!check.passed) {
      return {
        success: false,
        error: `Cannot publish yet. ${check.issues.length} issues found: ${check.issues.join('; ')}`,
        publishedAt: null,
      };
    }

    const now = Date.now();
    if (isPostgresConfigured()) {
      await query(
        `UPDATE event_state SET
           is_published = true,
           published_at = $1,
           stage = 'PUBLISHED'
         WHERE id = 1;`,
        [now]
      );
      return { success: true, publishedAt: now };
    }

    this.inMemoryData.event.isPublished = true;
    this.inMemoryData.event.publishedAt = now;
    this.inMemoryData.event.stage = 'PUBLISHED';

    return {
      success: true,
      publishedAt: now,
    };
  }

  // Admin registration toggle
  public async toggleRegistration(isOpen: boolean): Promise<boolean> {
    if (isPostgresConfigured()) {
      const eventRes = await query(`SELECT stage FROM event_state WHERE id = 1;`);
      let nextStage = eventRes.rows[0]?.stage || 'REGISTRATION_OPEN';

      if (!isOpen && nextStage === 'REGISTRATION_OPEN') {
        nextStage = 'REGISTRATION_CLOSED';
      } else if (isOpen && nextStage === 'REGISTRATION_CLOSED') {
        nextStage = 'REGISTRATION_OPEN';
      }

      await query(`UPDATE event_state SET registration_open = $1, stage = $2 WHERE id = 1;`, [
        isOpen,
        nextStage,
      ]);
      return isOpen;
    }

    this.inMemoryData.event.registrationOpen = isOpen;
    if (!isOpen && this.inMemoryData.event.stage === 'REGISTRATION_OPEN') {
      this.inMemoryData.event.stage = 'REGISTRATION_CLOSED';
    } else if (isOpen && this.inMemoryData.event.stage === 'REGISTRATION_CLOSED') {
      this.inMemoryData.event.stage = 'REGISTRATION_OPEN';
    }
    return this.inMemoryData.event.registrationOpen;
  }

  // Admin full data
  public async getAdminData() {
    let allRegistrations: Registration[] = [];
    let allGroups: Group[] = [];
    let eventState: EventState;
    let lastMixedAt: number | null = null;

    if (isPostgresConfigured()) {
      const regRes = await query(`SELECT * FROM registrations ORDER BY registered_at ASC;`);
      allRegistrations = regRes.rows.map(mapRowToRegistration);

      const groupRes = await query(`
        SELECT g.id, g.name, g.created_at, g.locked,
          COALESCE(
            json_agg(gm.registration_id) FILTER (WHERE gm.registration_id IS NOT NULL),
            '[]'
          ) as member_ids
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        GROUP BY g.id, g.name, g.created_at, g.locked
        ORDER BY g.name ASC;
      `);
      allGroups = groupRes.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
        locked: Boolean(row.locked),
        memberIds: row.member_ids || [],
      }));

      const eventRes = await query(`SELECT * FROM event_state WHERE id = 1;`);
      const eventRow = eventRes.rows[0];
      eventState = {
        stage: eventRow?.stage || 'REGISTRATION_OPEN',
        revealTime: eventRow?.reveal_time || getNextFriday3PMIST().toISOString(),
        registrationOpen: Boolean(eventRow?.registration_open),
        groupsLocked: Boolean(eventRow?.groups_locked),
        isPublished: Boolean(eventRow?.is_published),
        publishedAt: eventRow?.published_at ? Number(eventRow.published_at) : null,
      };
      lastMixedAt = eventRow?.last_mixed_at ? Number(eventRow.last_mixed_at) : null;
    } else {
      allRegistrations = this.inMemoryData.registrations;
      allGroups = this.inMemoryData.groups;
      eventState = this.inMemoryData.event;
      lastMixedAt = this.inMemoryData.lastMixedAt;
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

    const needsRemix = withdrawnAfterMatchingCount > 0 && !eventState.isPublished;

    const dupCheck = await this.runDuplicateCheck();

    const batchDistribution: Record<string, number> = {};
    for (const r of allRegistrations) {
      if (r.status === 'active' || r.status === 'valid') {
        batchDistribution[r.batch] = (batchDistribution[r.batch] || 0) + 1;
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
        stage: eventState.stage,
        revealTime: eventState.revealTime,
        registrationOpen: eventState.registrationOpen,
        groupsLocked: eventState.groupsLocked,
        isPublished: eventState.isPublished,
        publishedAt: eventState.publishedAt,
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
}

export const db = new Database();
