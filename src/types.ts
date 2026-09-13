export interface NextEventSummary {
  id: string;
  name: string;
  eventDate: string;
  revealTime: string;
  eventDay: string;
  eventTimeFormatted: string;
  eventDisplayTitle: string;
}

export interface PublicStatus {
  totalCount: number; // Count of ACTIVE participants only
  eventStatus: 'open' | 'locked' | 'revealed';
  revealTime: string;
  isRevealed: boolean;
  groupsCount?: number;
  registrationOpen?: boolean;
  // Dynamic event details
  eventId?: string;
  eventName?: string;
  eventDate?: string; // e.g. "19 September 2026"
  eventDay?: string; // e.g. "Friday"
  eventTimeFormatted?: string; // e.g. "3:00 PM"
  eventDisplayTitle?: string; // e.g. "Friday · 3:00 PM"
  registrationDeadline?: string;
  nextEvent?: NextEventSummary | null;
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

export interface OdhkanEventItem {
  id: string;
  name: string;
  eventDate: string; // e.g. "19 September 2026" or YYYY-MM-DD
  revealTime: string; // ISO string e.g. "2026-09-19T09:30:00.000Z"
  registrationStart?: string | null;
  registrationEnd?: string | null;
  status: 'upcoming' | 'open' | 'closed' | 'mixed' | 'revealed' | 'completed' | 'archived';
  stage:
    | 'REGISTRATION_OPEN'
    | 'REGISTRATION_CLOSED'
    | 'DUPLICATE_CHECKED'
    | 'READY_TO_MIX'
    | 'MIXED'
    | 'GROUPS_LOCKED'
    | 'READY_TO_PUBLISH'
    | 'PUBLISHED';
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

export interface EventHistoryItem {
  event: OdhkanEventItem;
  participants: RegistrationItem[];
  groups: AdminGroupItem[];
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
    id?: string;
    name?: string;
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
    eventDate?: string;
    eventDay?: string;
    eventTimeFormatted?: string;
    eventDisplayTitle?: string;
    registrationOpen: boolean;
    registrationEnd?: string | null;
    groupsLocked: boolean;
    isPublished: boolean;
    publishedAt: number | null;
  };
  events?: OdhkanEventItem[];
  activeEventId?: string;
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

export interface EmailLogItem {
  id: string;
  eventId: string;
  eventName?: string;
  participantId?: string;
  recipientEmail: string;
  recipientName: string;
  emailType: 'reminder' | 'reveal' | 'test';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'simulated';
  provider?: 'smtp' | 'resend' | 'simulation';
  messageId?: string | null;
  errorMessage?: string | null;
  subject?: string;
  previewText?: string;
  sentAt?: number | null;
  createdAt: number;
}

export interface EmailProviderStatus {
  configured: boolean;
  provider: 'smtp' | 'resend' | 'simulation';
  fromAddress: string;
  host?: string;
  details: string;
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

export interface EventWithdrawalAnalyticsItem {
  eventId: string;
  eventName: string;
  eventDate: string;
  totalRegistrations: number;
  totalWithdrawals: number;
  withdrawalRate: number;
  firstWithdrawalIST: string | null;
  latestWithdrawalIST: string | null;
}

export interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isZero: boolean;
}
