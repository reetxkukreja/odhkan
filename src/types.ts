export interface PublicStatus {
  totalCount: number; // Count of ACTIVE participants only
  eventStatus: 'open' | 'locked' | 'revealed';
  revealTime: string;
  isRevealed: boolean;
  groupsCount?: number;
  registrationOpen?: boolean;
}

export interface JoinResponse {
  success: boolean;
  error?: string;
  subtext?: string;
  participant?: {
    id: string;
    name: string;
    rollNumber: string;
    status: string;
  };
  totalCount: number;
}

export interface WithdrawResponse {
  success: boolean;
  error?: string;
  message?: string;
  status?: string;
  totalCount?: number;
}

export interface ParticipantStatusResponse {
  registered: boolean;
  participant?: {
    name: string;
    rollNumber: string;
    batch: string;
    status: 'active' | 'withdrawn' | 'duplicate' | 'invalid';
    groupAssigned: boolean;
  };
  isRevealed: boolean;
}

export interface GroupMemberInfo {
  name: string;
  batch: string;
  isWithdrawn?: boolean;
}

export interface GroupContactInfo {
  name: string;
  batch: string;
  phoneNumber: string;
  isWithdrawn?: boolean;
}

export interface GroupRevealResponse {
  success: boolean;
  error?: string;
  subtext?: string;
  participant?: {
    name: string;
    batch: string;
    rollNumber: string;
    status?: string;
  };
  group?: {
    id: string;
    members: GroupMemberInfo[];
    hasWithdrawnMember?: boolean;
  };
}

export interface GroupContactsResponse {
  success: boolean;
  error?: string;
  subtext?: string;
  groupId?: string;
  contacts?: GroupContactInfo[];
}

export interface RegistrationItem {
  id: string;
  name: string;
  rollNumber: string;
  batch: string;
  phoneNumber?: string;
  registeredAt: number;
  createdAt?: number;
  updatedAt?: number;
  status: 'active' | 'withdrawn' | 'duplicate' | 'invalid' | 'valid' | 'problematic';
  withdrawnStage?: 'before_match' | 'after_match' | 'after_reveal';
  withdrawnAt?: number | null;
  flagReason?: string;
  groupId?: string | null;
  groupAssigned?: boolean;
  revealed?: boolean;
}

export interface DuplicateIssueItem {
  rollNumber: string;
  count: number;
  entries: RegistrationItem[];
  reason: string;
  resolved: boolean;
  chosenId?: string;
}

export interface AdminGroupMember {
  id: string;
  name: string;
  rollNumber: string;
  batch: string;
  phoneNumber?: string;
  status?: string;
}

export interface AdminGroupItem {
  id: string;
  name: string;
  membersCount: number;
  uniqueBatchesCount: number;
  members: AdminGroupMember[];
  locked: boolean;
  hasWithdrawnMember?: boolean;
}

export interface IntegrityCheckStats {
  totalRegistrations: number;
  activeParticipants: number;
  withdrawnCount: number;
  uniqueParticipants: number;
  assignedCount: number;
  unresolvedDuplicates: number;
  unassignedCount: number;
  participantsInMultipleGroups: number;
  groupsCount: number;
}

export interface IntegrityCheckResult {
  passed: boolean;
  issues: string[];
  stats: IntegrityCheckStats;
}

export interface AdminData {
  totalRegistrations: number;
  activeParticipants: number;
  withdrawnCount: number;
  duplicateCount: number;
  invalidCount: number;
  uniqueParticipants: number;
  totalGroups: number;
  withdrawnAfterMatchingCount: number;
  needsRemix: boolean;
  event: {
    stage:
      | 'REGISTRATION_OPEN'
      | 'REGISTRATION_CLOSED'
      | 'DUPLICATE_CHECKED'
      | 'READY_TO_MIX'
      | 'MIXED'
      | 'GROUPS_LOCKED'
      | 'READY_TO_PUBLISH'
      | 'PUBLISHED';
    revealTime: string;
    registrationOpen: boolean;
    groupsLocked: boolean;
    isPublished: boolean;
    publishedAt: number | null;
  };
  duplicateSummary: {
    duplicateCount: number;
    unresolvedCount: number;
    issues: DuplicateIssueItem[];
  };
  batchDistribution: Record<string, number>;
  registrations: RegistrationItem[];
  groups: AdminGroupItem[];
  lastMixedAt: number | null;
}

export interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isZero: boolean;
}
