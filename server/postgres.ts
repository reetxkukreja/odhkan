import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';

// Parse PostgreSQL INT8 (BIGINT) as JS number so timestamps (millis) remain numbers
types.setTypeParser(types.builtins.INT8, (val: string) => parseInt(val, 10));

let pool: Pool | null = null;
let isInitialized = false;

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

export function isPostgresConfigured(): boolean {
  const url = getDatabaseUrl();
  return Boolean(url && url.trim().length > 0);
}

export function getPool(): Pool | null {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    return null;
  }

  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
  });

  return pool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const p = getPool();
  if (!p) {
    throw new Error('PostgreSQL pool not initialized. DATABASE_URL is required.');
  }
  return p.query<T>(text, params);
}

export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  if (!p) {
    throw new Error('PostgreSQL pool not initialized. DATABASE_URL is required.');
  }
  return p.connect();
}

export async function initPostgresSchema(defaultRevealTime: string): Promise<boolean> {
  if (!isPostgresConfigured()) {
    return false;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Event State Table (Singleton row id = 1)
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_state (
        id INT PRIMARY KEY DEFAULT 1,
        stage VARCHAR(64) NOT NULL DEFAULT 'REGISTRATION_OPEN',
        reveal_time VARCHAR(64) NOT NULL,
        registration_open BOOLEAN NOT NULL DEFAULT TRUE,
        groups_locked BOOLEAN NOT NULL DEFAULT FALSE,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        published_at BIGINT,
        last_mixed_at BIGINT
      );
    `);

    // 2. Groups Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        created_at BIGINT NOT NULL,
        locked BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    // 3. Registrations Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        roll_number VARCHAR(64) NOT NULL,
        batch VARCHAR(32) NOT NULL,
        phone_number VARCHAR(32) NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        registered_at BIGINT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        withdrawn_stage VARCHAR(32),
        withdrawn_at BIGINT,
        flag_reason TEXT,
        duplicate_of_roll VARCHAR(64),
        group_id VARCHAR(64) REFERENCES groups(id) ON DELETE SET NULL,
        group_assigned BOOLEAN NOT NULL DEFAULT FALSE,
        revealed BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    // 4. Group Members Junction Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id VARCHAR(64) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        registration_id VARCHAR(64) NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, registration_id)
      );
    `);

    // 5. Indexes for fast querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_registrations_roll ON registrations(roll_number);
      CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
      CREATE INDEX IF NOT EXISTS idx_registrations_group ON registrations(group_id);
    `);

    // 6. Ensure default singleton event_state row exists
    await client.query(
      `
      INSERT INTO event_state (
        id, stage, reveal_time, registration_open, groups_locked, is_published, published_at, last_mixed_at
      ) VALUES (1, 'REGISTRATION_OPEN', $1, true, false, false, NULL, NULL)
      ON CONFLICT (id) DO NOTHING;
    `,
      [defaultRevealTime]
    );

    await client.query('COMMIT');
    isInitialized = true;
    console.log('[PostgreSQL] Database schema verified and initialized successfully.');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PostgreSQL] Error initializing database schema:', err);
    throw err;
  } finally {
    client.release();
  }
}
