import fs from 'fs';
import path from 'path';

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

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'odhkan-db.json');

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
// Includes valid normalized Indian mobile numbers and active status
export function getInitialSeedRegistrations(): Registration[] {
  const baseTime = Date.now() - 36 * 3600 * 1000;

  const rawSeeds = [
    // 1. Reet Kukreja (Original)
    { name: 'Reet Kukreja', roll: '24BD1234', batch: '24BD', offsetMins: 10, phone: '+919876543201' },
    // 2. Reet K (Duplicate with same roll number 24BD1234)
    { name: 'Reet K', roll: '24BD1234', batch: '24BD', offsetMins: 15, isDup: true, reason: 'Duplicate roll number 24BD1234', phone: '+919876543201' },
    
    // 3. Aarav Shah (Original)
    { name: 'Aarav Shah', roll: '23BD5678', batch: '23BD', offsetMins: 20, phone: '+919876543202' },
    // 4. Aarav Shah (Duplicate registration)
    { name: 'Aarav Shah', roll: '23BD5678', batch: '23BD', offsetMins: 25, isDup: true, reason: 'Duplicate roll number 23BD5678', phone: '+919876543202' },

    // Remaining 36 unique students across 22BD, 23BD, 24BD, 25BD
    { name: 'Ananya Sharma', roll: '24BD003', batch: '24BD', offsetMins: 30, phone: '+919876543203' },
    { name: 'Kabir Mehta', roll: '24BD004', batch: '24BD', offsetMins: 35, phone: '+919876543204' },
    { name: 'Diya Singhania', roll: '24BD005', batch: '24BD', offsetMins: 40, phone: '+919876543205' },
    { name: 'Devansh Roy', roll: '24BD006', batch: '24BD', offsetMins: 45, phone: '+919876543206' },
    { name: 'Isha Nair', roll: '24BD007', batch: '24BD', offsetMins: 50, phone: '+919876543207' },
    { name: 'Reyansh Gupta', roll: '24BD008', batch: '24BD', offsetMins: 55, phone: '+919876543208' },
    { name: 'Tara Deshmukh', roll: '24BD009', batch: '24BD', offsetMins: 60, phone: '+919876543209' },
    { name: 'Yash Vardhan', roll: '24BD010', batch: '24BD', offsetMins: 65, phone: '+919876543210' },
    { name: 'Meera Chawla', roll: '24BD011', batch: '24BD', offsetMins: 70, phone: '+919876543211' },

    // 23BD
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

    // 22BD
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

    // 25BD
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

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed.registrations && Array.isArray(parsed.registrations)) {
          // Normalize older schema fields to current standard
          parsed.registrations.forEach((r: any, idx: number) => {
            if (r.status === 'valid') r.status = 'active';
            if (!r.phoneNumber) r.phoneNumber = `+91987654${(3200 + idx).toString().slice(-4)}`;
            if (!r.createdAt) r.createdAt = r.registeredAt || Date.now();
            if (!r.updatedAt) r.updatedAt = r.registeredAt || Date.now();
            if (r.groupAssigned === undefined) r.groupAssigned = Boolean(r.groupId);
            if (r.revealed === undefined) r.revealed = false;
          });
          return parsed;
        }
      }
    } catch (err) {
      console.error('Error loading DB file:', err);
    }

    const initialRegistrations = getInitialSeedRegistrations();
    const initial: DatabaseSchema = {
      registrations: initialRegistrations,
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
    this.saveData(initial);
    return initial;
  }

  private saveData(dataToSave?: DatabaseSchema): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave || this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save DB file:', err);
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

    // Standard college batch extract (e.g. 24BDXXXX -> 24BD)
    const match = normalized.match(/^(\d{2}[A-Z]{2,3})/);
    if (match) {
      return {
        valid: true,
        normalizedRoll: normalized,
        batch: match[1],
      };
    }

    // Generic fallback for any valid student roll
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
  // Accepts 9876543210, +919876543210, +91 98765 43210, 09876543210, 919876543210
  // Normalizes to consistent: +919876543210
  public normalizePhoneNumber(rawPhone: string): { valid: boolean; normalizedPhone: string } {
    if (!rawPhone || typeof rawPhone !== 'string') {
      return { valid: false, normalizedPhone: '' };
    }

    // Strip spaces, dashes, parentheses, dots
    const cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, '');

    // Indian mobile numbers have 10 digits starting with 6, 7, 8, or 9
    // Optional prefix: +91, 91, or 0
    const match = cleaned.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
    if (match && match[1]) {
      return { valid: true, normalizedPhone: `+91${match[1]}` };
    }

    return { valid: false, normalizedPhone: '' };
  }

  // Active participant count (status === 'active' or legacy 'valid')
  // Requirement 6 & 24: ONLY active participants are counted!
  public getActiveCount(): number {
    return this.data.registrations.filter(r => r.status === 'active' || r.status === 'valid').length;
  }

  // 1. Public Status - Live Counter
  // Shows strictly active participants and reveal countdown
  public getPublicStatus() {
    const activeCount = this.getActiveCount();
    const isOverdue = new Date(this.data.event.revealTime).getTime() <= Date.now();
    const isRevealed = this.data.event.isPublished || (isOverdue && this.data.event.groupsLocked);

    return {
      totalCount: activeCount,
      eventStatus: isRevealed ? 'revealed' : (this.data.event.groupsLocked ? 'locked' : 'open'),
      revealTime: this.data.event.revealTime,
      isRevealed,
      groupsCount: this.data.groups.length,
      registrationOpen: this.data.event.registrationOpen,
    };
  }

  // 2. Public Registration Flow
  public join(name: string, rawRoll: string, rawPhone: string): {
    success: boolean;
    error?: string;
    subtext?: string;
    participant?: { id: string; name: string; rollNumber: string; status: string };
    totalCount: number;
  } {
    if (!this.data.event.registrationOpen) {
      return {
        success: false,
        error: "Registrations for this Odhkan are currently closed.",
        totalCount: this.getActiveCount(),
      };
    }

    const trimmedName = (name || '').trim();
    if (!trimmedName || trimmedName.length < 2) {
      return {
        success: false,
        error: "Please enter your full name.",
        totalCount: this.getActiveCount(),
      };
    }

    const rollValidation = this.validateRollNumber(rawRoll);
    if (!rollValidation.valid) {
      return {
        success: false,
        error: "That roll number doesn't look right. Check it once and try again.",
        totalCount: this.getActiveCount(),
      };
    }

    const phoneValidation = this.normalizePhoneNumber(rawPhone);
    if (!phoneValidation.valid) {
      return {
        success: false,
        error: "That phone number doesn't look right. Check it once and try again.",
        totalCount: this.getActiveCount(),
      };
    }

    // Check if roll number already exists
    const existingIndex = this.data.registrations.findIndex(
      r => r.rollNumber === rollValidation.normalizedRoll
    );

    if (existingIndex !== -1) {
      const existing = this.data.registrations[existingIndex];

      // If they were previously withdrawn, allow them to rejoin!
      if (existing.status === 'withdrawn') {
        existing.status = 'active';
        existing.name = trimmedName;
        existing.phoneNumber = phoneValidation.normalizedPhone;
        existing.updatedAt = Date.now();
        existing.withdrawnStage = undefined;
        existing.withdrawnAt = null;
        this.saveData();

        return {
          success: true,
          participant: {
            id: existing.id,
            name: existing.name,
            rollNumber: existing.rollNumber,
            status: 'active',
          },
          totalCount: this.getActiveCount(),
        };
      }

      // If already active, record duplicate entry for audit without crashing
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
      this.data.registrations.push(duplicateEntry);
      this.saveData();

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
        totalCount: this.getActiveCount(),
      };
    }

    // Valid unique registration
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

    this.data.registrations.push(newReg);
    this.saveData();

    return {
      success: true,
      participant: {
        id: newReg.id,
        name: newReg.name,
        rollNumber: newReg.rollNumber,
        status: newReg.status,
      },
      totalCount: this.getActiveCount(),
    };
  }

  // 3. "CAN'T MAKE IT TODAY" WITHDRAWAL FLOW
  // Marks participant as 'withdrawn' and removes them from active matching pool.
  // Does NOT permanently delete raw registration — keeps full audit trail for organizers!
  public withdraw(rawRoll: string): {
    success: boolean;
    error?: string;
    message?: string;
    status?: string;
    stage?: string;
    totalCount: number;
  } {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      return {
        success: false,
        error: "That roll number doesn't look right. Check it once and try again.",
        totalCount: this.getActiveCount(),
      };
    }

    // Find active registration
    const reg = this.data.registrations.find(
      r => r.rollNumber === validation.normalizedRoll && (r.status === 'active' || r.status === 'valid')
    );

    if (!reg) {
      const alreadyWithdrawn = this.data.registrations.find(
        r => r.rollNumber === validation.normalizedRoll && r.status === 'withdrawn'
      );
      if (alreadyWithdrawn) {
        return {
          success: false,
          error: "You have already removed yourself from this Odhkan.",
          totalCount: this.getActiveCount(),
        };
      }
      return {
        success: false,
        error: `No active registration found for roll number ${validation.normalizedRoll}.`,
        totalCount: this.getActiveCount(),
      };
    }

    const now = Date.now();
    reg.status = 'withdrawn';
    reg.withdrawnAt = now;
    reg.updatedAt = now;

    let stage: 'before_match' | 'after_match' | 'after_reveal' = 'before_match';

    if (this.data.event.isPublished) {
      // Stage 9: Withdrawal after final list published
      // "Do not automatically regenerate the entire event. Their group should remain unchanged.
      // Instead, mark them as: withdrawn after reveal. The other members still see group."
      stage = 'after_reveal';
      reg.withdrawnStage = 'after_reveal';
    } else if (this.data.groups.length > 0) {
      // Stage 8: Withdrawal after groups generated but before final list is published
      // "The admin dashboard should clearly show: 1 participant withdrew after matching.
      // Prompt: Groups need to be remixed. Then allow: Mix Again."
      stage = 'after_match';
      reg.withdrawnStage = 'after_match';
      reg.groupAssigned = false;
      const oldGroupId = reg.groupId;
      reg.groupId = null;

      if (oldGroupId) {
        const grp = this.data.groups.find(g => g.id === oldGroupId);
        if (grp) {
          grp.memberIds = grp.memberIds.filter(id => id !== reg.id);
        }
      }
    } else {
      // Stage 7: Withdrawal before grouping
      stage = 'before_match';
      reg.withdrawnStage = 'before_match';
      reg.groupId = null;
      reg.groupAssigned = false;
    }

    this.saveData();

    return {
      success: true,
      message: "You have been removed from this Odhkan.",
      status: 'withdrawn',
      stage,
      totalCount: this.getActiveCount(),
    };
  }

  // 4. Check registration status for a participant
  public getParticipantStatus(rawRoll: string): {
    registered: boolean;
    participant?: {
      name: string;
      rollNumber: string;
      batch: string;
      status: 'active' | 'withdrawn' | 'duplicate' | 'invalid';
      groupAssigned: boolean;
    };
    isRevealed: boolean;
  } {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      return { registered: false, isRevealed: this.data.event.isPublished };
    }

    const reg = this.data.registrations.find(
      r => r.rollNumber === validation.normalizedRoll && (r.status === 'active' || r.status === 'valid')
    ) || this.data.registrations.find(
      r => r.rollNumber === validation.normalizedRoll
    );

    if (!reg) {
      return { registered: false, isRevealed: this.data.event.isPublished };
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
      isRevealed: this.data.event.isPublished,
    };
  }

  // 5. Public Group Reveal Lookup (ONLY AFTER PUBLISH)
  // Strict Privacy: Never exposes phone numbers in default response!
  public revealGroupForRoll(rawRoll: string): {
    success: boolean;
    error?: string;
    subtext?: string;
    participant?: { name: string; batch: string; rollNumber: string; status: string };
    group?: { id: string; members: GroupMemberSummary[]; hasWithdrawnMember: boolean };
  } {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      return {
        success: false,
        error: "That roll number doesn't look right. Check it once and try again.",
      };
    }

    if (!this.data.event.isPublished) {
      return {
        success: false,
        error: "Groups will be revealed Friday at 3:00 PM.",
        subtext: "Three people from across the college. Start with a hello.",
      };
    }

    const reg = this.data.registrations.find(
      r => r.rollNumber === validation.normalizedRoll
    );

    if (!reg) {
      return {
        success: false,
        error: "We couldn't find your registration. Double check your roll number.",
      };
    }

    if (reg.status === 'withdrawn' && reg.withdrawnStage !== 'after_reveal') {
      return {
        success: false,
        error: "You previously removed yourself from this Odhkan.",
      };
    }

    if (!reg.groupId) {
      return {
        success: false,
        error: "Your group is being finalized. Please check back shortly.",
      };
    }

    const group = this.data.groups.find(g => g.id === reg.groupId);
    if (!group) {
      return {
        success: false,
        error: "Group information is temporarily unavailable. Please retry in a moment.",
      };
    }

    let hasWithdrawnMember = false;

    // Return members - Name and Batch only! NEVER PHONE NUMBERS OR ROLL NUMBERS HERE.
    const memberSummaries: GroupMemberSummary[] = group.memberIds.map(memId => {
      const m = this.data.registrations.find(r => r.id === memId);
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

  // 6. CONTROLLED GROUP CONTACT DETAILS (Section 18)
  // "Phone numbers should NOT automatically be visible to everyone.
  // Instead, give each participant a controlled option: Can't find them? -> Contact your group.
  // Only after the participant intentionally chooses this should the contact information be revealed."
  public getGroupContactsForRoll(rawRoll: string): {
    success: boolean;
    error?: string;
    subtext?: string;
    groupId?: string;
    contacts?: GroupContactSummary[];
  } {
    const validation = this.validateRollNumber(rawRoll);
    if (!validation.valid) {
      return { success: false, error: "Invalid roll number." };
    }

    if (!this.data.event.isPublished) {
      return { success: false, error: "Groups have not been published yet." };
    }

    const reg = this.data.registrations.find(
      r => r.rollNumber === validation.normalizedRoll
    );

    if (!reg || !reg.groupId) {
      return { success: false, error: "Could not find your group." };
    }

    const group = this.data.groups.find(g => g.id === reg.groupId);
    if (!group) {
      return { success: false, error: "Group not found." };
    }

    // Format contacts for group members
    const contacts: GroupContactSummary[] = group.memberIds.map(memId => {
      const m = this.data.registrations.find(r => r.id === memId);
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

  // 7. DUPLICATE CHECK & REVIEW
  public runDuplicateCheck(): {
    totalRegistrations: number;
    uniqueParticipants: number;
    duplicateCount: number;
    issues: DuplicateIssue[];
    readyToMix: boolean;
  } {
    const rollMap: Record<string, Registration[]> = {};

    for (const reg of this.data.registrations) {
      const roll = reg.rollNumber;
      if (!rollMap[roll]) {
        rollMap[roll] = [];
      }
      rollMap[roll].push(reg);
    }

    const issues: DuplicateIssue[] = [];
    let duplicateRecords = 0;

    for (const roll in rollMap) {
      const entries = rollMap[roll];
      if (entries.length > 1) {
        duplicateRecords += (entries.length - 1);
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
    const activeParticipants = this.getActiveCount();

    return {
      totalRegistrations: this.data.registrations.length,
      uniqueParticipants: activeParticipants,
      duplicateCount: duplicateRecords,
      issues,
      readyToMix: unresolvedCount === 0 && activeParticipants >= 3,
    };
  }

  // 8. RESOLVE DUPLICATE
  public resolveDuplicate(rollNumber: string, choice: 'first' | 'latest' | string): {
    success: boolean;
    rollNumber: string;
    chosenId: string;
  } {
    const normalizedRoll = this.normalizeRollNumber(rollNumber);
    const matches = this.data.registrations
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

    this.saveData();
    return { success: true, rollNumber: normalizedRoll, chosenId: chosen.id };
  }

  // 9. MIX MATCH (GROUP GENERATION)
  // Requirement: ONLY ACTIVE participants are included.
  // Withdrawn, duplicates, and invalid participants are strictly excluded.
  public mixMatch(): {
    success: boolean;
    error?: string;
    totalParticipants: number;
    groupsCount: number;
  } {
    // 1. Check for unresolved duplicates
    const dupCheck = this.runDuplicateCheck();
    const unresolved = dupCheck.issues.filter(i => !i.resolved);
    if (unresolved.length > 0) {
      return {
        success: false,
        error: `Cannot mix groups: ${unresolved.length} unresolved duplicate roll numbers exist. Please resolve them first.`,
        totalParticipants: 0,
        groupsCount: 0,
      };
    }

    // 2. Filter ONLY active participants
    const activeParticipants = this.data.registrations.filter(
      r => r.status === 'active' || r.status === 'valid'
    );

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

    // Random shuffle
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }

    // Initial partition
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

        // Test swap
        const t1 = g1[m1Idx];
        const t2 = g2[m2Idx];
        g1[m1Idx] = t2;
        g2[m2Idx] = t1;

        const newPen = calcGroupPenalty(g1) + calcGroupPenalty(g2);
        const delta = newPen - oldPen;

        if (delta < 0 || (delta === 0 && Math.random() < 0.15)) {
          // keep
        } else {
          g1[m1Idx] = t1;
          g2[m2Idx] = t2;
        }
      }
    }

    // Format new groups
    const newGroups: Group[] = [];
    const assignedIdsMap: Record<string, string> = {};

    initialGroups.forEach((grp, idx) => {
      const padNum = (idx + 1).toString().padStart(2, '0');
      const groupId = `grp_${Date.now()}_${padNum}`;
      const memberIds = grp.map(p => p.id);

      newGroups.push({
        id: groupId,
        name: `Group ${padNum}`,
        memberIds,
        createdAt: Date.now(),
        locked: false,
      });

      grp.forEach(p => {
        assignedIdsMap[p.id] = groupId;
      });
    });

    // Update registrations
    for (const r of this.data.registrations) {
      if (r.status === 'active' || r.status === 'valid') {
        r.groupId = assignedIdsMap[r.id] || null;
        r.groupAssigned = Boolean(r.groupId);
      } else {
        r.groupId = null;
        r.groupAssigned = false;
      }
      r.updatedAt = Date.now();
    }

    this.data.groups = newGroups;
    this.data.lastMixedAt = Date.now();
    this.data.event.stage = 'MIXED';
    this.data.event.groupsLocked = false;
    this.data.event.isPublished = false;
    this.saveData();

    return {
      success: true,
      totalParticipants: participants.length,
      groupsCount: newGroups.length,
    };
  }

  // 10. LOCK GROUPS
  public lockGroups(): { success: boolean; groupsCount: number } {
    this.data.event.groupsLocked = true;
    this.data.event.stage = 'GROUPS_LOCKED';
    for (const g of this.data.groups) {
      g.locked = true;
    }
    this.saveData();
    return { success: true, groupsCount: this.data.groups.length };
  }

  // 11. FINAL INTEGRITY CHECK
  public runFinalIntegrityCheck(): IntegrityCheckResult {
    const issues: string[] = [];
    const activeRegistrations = this.data.registrations.filter(r => r.status === 'active' || r.status === 'valid');
    const withdrawnRegistrations = this.data.registrations.filter(r => r.status === 'withdrawn');
    const duplicateRegistrations = this.data.registrations.filter(r => r.status === 'duplicate');

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
    const unresolvedDuplicates = this.data.registrations.filter(
      r => r.status === 'duplicate' && !r.flagReason?.includes('Superseded')
    );

    // 3. Unassigned participants
    const unassigned = activeRegistrations.filter(r => !r.groupId);
    if (unassigned.length > 0) {
      issues.push(`${unassigned.length} active participant(s) are unassigned.`);
    }

    // 4. Any participant in multiple groups
    const memberGroupCounts: Record<string, number> = {};
    for (const g of this.data.groups) {
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
    for (const g of this.data.groups) {
      if (g.memberIds.length < 2) {
        issues.push(`${g.name} has fewer than 2 members.`);
      }
    }

    // 6. Check if groups need remix because someone withdrew after matching
    const withdrawnAfterMatch = this.data.registrations.filter(
      r => r.status === 'withdrawn' && r.withdrawnStage === 'after_match' && (this.data.lastMixedAt ? (r.withdrawnAt || 0) > this.data.lastMixedAt : false)
    );
    if (withdrawnAfterMatch.length > 0) {
      issues.push(`${withdrawnAfterMatch.length} participant(s) withdrew after matching. Groups must be remixed.`);
    }

    // 7. Whether all groups are locked
    if (!this.data.event.groupsLocked) {
      issues.push("Groups are not locked yet. Click 'Lock Groups' before publishing.");
    }

    const passed = issues.length === 0;
    if (passed && this.data.event.stage === 'GROUPS_LOCKED') {
      this.data.event.stage = 'READY_TO_PUBLISH';
      this.saveData();
    }

    return {
      passed,
      issues,
      stats: {
        totalRegistrations: this.data.registrations.length,
        activeParticipants: activeRegistrations.length,
        withdrawnCount: withdrawnRegistrations.length,
        uniqueParticipants: activeRegistrations.length,
        assignedCount: activeRegistrations.filter(r => r.groupId).length,
        unresolvedDuplicates: unresolvedDuplicates.length,
        unassignedCount: unassigned.length,
        participantsInMultipleGroups: multiGroupCount,
        groupsCount: this.data.groups.length,
      },
    };
  }

  // 12. PUBLISH FINAL LIST
  public publishFinalList(): { success: boolean; error?: string; publishedAt: number | null } {
    const check = this.runFinalIntegrityCheck();
    if (!check.passed) {
      return {
        success: false,
        error: `Cannot publish yet. ${check.issues.length} issues found: ${check.issues.join('; ')}`,
        publishedAt: null,
      };
    }

    this.data.event.isPublished = true;
    this.data.event.publishedAt = Date.now();
    this.data.event.stage = 'PUBLISHED';
    this.saveData();

    return {
      success: true,
      publishedAt: this.data.event.publishedAt,
    };
  }

  // Admin registration toggle
  public toggleRegistration(isOpen: boolean): boolean {
    this.data.event.registrationOpen = isOpen;
    if (!isOpen && this.data.event.stage === 'REGISTRATION_OPEN') {
      this.data.event.stage = 'REGISTRATION_CLOSED';
    } else if (isOpen && this.data.event.stage === 'REGISTRATION_CLOSED') {
      this.data.event.stage = 'REGISTRATION_OPEN';
    }
    this.saveData();
    return this.data.event.registrationOpen;
  }

  // Admin full data
  public getAdminData() {
    const totalRegistrations = this.data.registrations.length;
    const activeParticipants = this.getActiveCount();
    const withdrawnCount = this.data.registrations.filter(r => r.status === 'withdrawn').length;
    const duplicateCount = this.data.registrations.filter(r => r.status === 'duplicate').length;
    const invalidCount = this.data.registrations.filter(r => r.status === 'invalid').length;
    const totalGroups = this.data.groups.length;

    // Check if anyone withdrew after matching
    const withdrawnAfterMatchingCount = this.data.registrations.filter(
      r => r.status === 'withdrawn' && r.withdrawnStage === 'after_match' && (this.data.lastMixedAt ? (r.withdrawnAt || 0) > this.data.lastMixedAt : true)
    ).length;

    const needsRemix = withdrawnAfterMatchingCount > 0 && !this.data.event.isPublished;

    const dupCheck = this.runDuplicateCheck();

    // Internal batch breakdown of active participants
    const batchDistribution: Record<string, number> = {};
    for (const r of this.data.registrations) {
      if (r.status === 'active' || r.status === 'valid') {
        batchDistribution[r.batch] = (batchDistribution[r.batch] || 0) + 1;
      }
    }

    // Format groups with full member details
    const formattedGroups = this.data.groups.map(g => {
      let hasWithdrawnMember = false;
      const members: AdminGroupMember[] = g.memberIds.map(mId => {
        const reg = this.data.registrations.find(r => r.id === mId);
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
        stage: this.data.event.stage,
        revealTime: this.data.event.revealTime,
        registrationOpen: this.data.event.registrationOpen,
        groupsLocked: this.data.event.groupsLocked,
        isPublished: this.data.event.isPublished,
        publishedAt: this.data.event.publishedAt,
      },
      duplicateSummary: {
        duplicateCount: dupCheck.duplicateCount,
        unresolvedCount: dupCheck.issues.filter(i => !i.resolved).length,
        issues: dupCheck.issues,
      },
      batchDistribution,
      registrations: this.data.registrations.map(r => ({
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
      lastMixedAt: this.data.lastMixedAt,
    };
  }

  // Reset to initial seed state (40 registrations, 38 unique, 2 duplicates)
  public resetDevData(): {
    success: boolean;
    totalRegistrations: number;
    activeParticipants: number;
    withdrawnCount: number;
  } {
    this.data = {
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
    this.saveData();
    return {
      success: true,
      totalRegistrations: this.data.registrations.length,
      activeParticipants: this.getActiveCount(),
      withdrawnCount: 0,
    };
  }

  // Clear all registrations to test completely empty database / zero states
  public clearAllData(): { success: boolean; totalRegistrations: number; activeParticipants: number } {
    this.data = {
      registrations: [],
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
    this.saveData();
    return {
      success: true,
      totalRegistrations: 0,
      activeParticipants: 0,
    };
  }
}

export const db = new Database();
