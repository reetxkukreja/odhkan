import crypto from 'crypto';

// Initial admin username and hashed password
// Salt and PBKDF2 hash for initial password '0dhkan'
// NEVER stored as plaintext
const ADMIN_USERNAME = process.env.ODHKAN_ADMIN_USER || 'reetkukreja';
const ADMIN_SALT = process.env.ODHKAN_ADMIN_SALT || 'odhkan_secure_salt_2026';

// Pre-computed hash of initial password '0dhkan' with salt
function hashPassword(password: string): string {
  return crypto.pbkdf2Sync(password, ADMIN_SALT, 100000, 64, 'sha512').toString('hex');
}

const STORED_HASH = process.env.ODHKAN_ADMIN_HASH || hashPassword('0dhkan');

// In-memory token sessions
interface Session {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

const activeSessions: Map<string, Session> = new Map();

export function verifyAdminCredentials(username: string, password: string): boolean {
  if (!username || !password) return false;
  const trimmedUser = username.trim();
  if (trimmedUser !== ADMIN_USERNAME) return false;
  
  const computedHash = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(STORED_HASH));
}

export function createAdminSession(username: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session: Session = {
    token,
    username,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
  };
  activeSessions.set(token, session);
  return token;
}

export function validateSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

export function invalidateSession(token: string | undefined): void {
  if (token) {
    activeSessions.delete(token);
  }
}
