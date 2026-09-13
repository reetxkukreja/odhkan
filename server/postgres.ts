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

    // 1. Events Table (Recurring events)
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        event_date VARCHAR(64) NOT NULL,
        reveal_time VARCHAR(64) NOT NULL,
        registration_start VARCHAR(64),
        registration_end VARCHAR(64),
        status VARCHAR(64) NOT NULL DEFAULT 'open',
        stage VARCHAR(64) NOT NULL DEFAULT 'REGISTRATION_OPEN',
        registration_open BOOLEAN NOT NULL DEFAULT TRUE,
        groups_locked BOOLEAN NOT NULL DEFAULT FALSE,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        published_at BIGINT,
        last_mixed_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);

    // 1b. Legacy Singleton Event State Table (Retained for backward compatibility)
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
        locked BOOLEAN NOT NULL DEFAULT FALSE,
        event_id VARCHAR(64) DEFAULT 'evt_current'
      );
    `);
    await client.query(`
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS event_id VARCHAR(64) DEFAULT 'evt_current';
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
        revealed BOOLEAN NOT NULL DEFAULT FALSE,
        event_id VARCHAR(64) DEFAULT 'evt_current'
      );
    `);
    await client.query(`
      ALTER TABLE registrations ADD COLUMN IF NOT EXISTS event_id VARCHAR(64) DEFAULT 'evt_current';
    `);

    // 4. Group Members Junction Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id VARCHAR(64) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        registration_id VARCHAR(64) NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, registration_id)
      );
    `);

    // 4b. Email Logs Table (for ₹0 Free automated reminder & reveal tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id VARCHAR(64) PRIMARY KEY,
        event_id VARCHAR(64) NOT NULL,
        participant_id VARCHAR(64),
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255) NOT NULL,
        email_type VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        subject VARCHAR(255),
        preview_text TEXT,
        sent_at BIGINT,
        created_at BIGINT NOT NULL
      );
    `);
    await client.query(`
      ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS provider VARCHAR(64) DEFAULT 'simulation';
      ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);
    `);

    // 5. Indexes for fast querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_registrations_roll ON registrations(roll_number);
      CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
      CREATE INDEX IF NOT EXISTS idx_registrations_group ON registrations(group_id);
      CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
      CREATE INDEX IF NOT EXISTS idx_groups_event ON groups(event_id);
      CREATE INDEX IF NOT EXISTS idx_events_reveal_time ON events(reveal_time);
      CREATE INDEX IF NOT EXISTS idx_email_logs_event ON email_logs(event_id);
      CREATE INDEX IF NOT EXISTS idx_email_logs_participant ON email_logs(participant_id);
      CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
    `);

    // 6. Ensure default singleton event_state row exists (for backward compatibility)
    await client.query(
      `
      INSERT INTO event_state (
        id, stage, reveal_time, registration_open, groups_locked, is_published, published_at, last_mixed_at
      ) VALUES (1, 'REGISTRATION_OPEN', $1, true, false, false, NULL, NULL)
      ON CONFLICT (id) DO NOTHING;
    `,
      [defaultRevealTime]
    );

    // 7. Seed initial Odhkan events if table is empty
    await client.query(`
      INSERT INTO events (
        id, name, event_date, reveal_time, registration_start, registration_end,
        status, stage, registration_open, groups_locked, is_published,
        published_at, last_mixed_at, created_at, updated_at
      ) VALUES 
      (
        'evt_2026_09_19',
        'Odhkan #1 - Friday Meet',
        '2026-09-19',
        '2026-09-19T09:30:00.000Z',
        '2026-09-10T00:00:00.000Z',
        '2026-09-19T09:00:00.000Z',
        'open',
        'REGISTRATION_OPEN',
        true,
        false,
        false,
        NULL,
        NULL,
        1726000000000,
        1726000000000
      ),
      (
        'evt_2026_09_26',
        'Odhkan #2 - Friday Meet',
        '2026-09-26',
        '2026-09-26T09:30:00.000Z',
        '2026-09-19T10:00:00.000Z',
        '2026-09-26T09:00:00.000Z',
        'upcoming',
        'REGISTRATION_OPEN',
        true,
        false,
        false,
        NULL,
        NULL,
        1726000000000,
        1726000000000
      ),
      (
        'evt_2026_09_05',
        'Odhkan #0 - Inaugural Meet',
        '2026-09-05',
        '2026-09-05T09:30:00.000Z',
        '2026-08-30T00:00:00.000Z',
        '2026-09-05T09:00:00.000Z',
        'completed',
        'PUBLISHED',
        false,
        true,
        true,
        1725531000000,
        1725531000000,
        1725000000000,
        1725531000000
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Backfill any existing registrations/groups without an event_id or with placeholder
    await client.query(`
      UPDATE registrations SET event_id = 'evt_2026_09_19' WHERE event_id IS NULL OR event_id = 'evt_current';
      UPDATE groups SET event_id = 'evt_2026_09_19' WHERE event_id IS NULL OR event_id = 'evt_current';
    `);

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
