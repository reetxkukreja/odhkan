import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Pool, types } from 'pg';

dotenv.config();

types.setTypeParser(types.builtins.INT8, (val: string) => parseInt(val, 10));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('\n❌ ERROR: DATABASE_URL environment variable is not defined.');
  console.error('Usage: DATABASE_URL="postgresql://user:pass@host/db" npx tsx scripts/migrate-json-to-postgres.ts\n');
  process.exit(1);
}

const JSON_FILE_PATH = path.join(process.cwd(), 'data', 'odhkan-db.json');

if (!fs.existsSync(JSON_FILE_PATH)) {
  console.error(`\n❌ ERROR: JSON file not found at ${JSON_FILE_PATH}\n`);
  process.exit(1);
}

async function migrate() {
  console.log('\n--- ODHKAN: JSON TO POSTGRESQL MIGRATION TOOL ---');
  console.log(`Reading source file: ${JSON_FILE_PATH}`);
  const rawData = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
  const jsonData = JSON.parse(rawData);

  const registrations = jsonData.registrations || [];
  const groups = jsonData.groups || [];
  const event = jsonData.event || {};
  const lastMixedAt = jsonData.lastMixedAt || null;

  console.log(`Found ${registrations.length} registrations and ${groups.length} groups in JSON.`);

  const isLocal = DATABASE_URL!.includes('localhost') || DATABASE_URL!.includes('127.0.0.1');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    console.log('Connecting to PostgreSQL...');
    await client.query('BEGIN');

    // 1. Ensure Schema
    console.log('Verifying PostgreSQL schema tables...');
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

      CREATE TABLE IF NOT EXISTS groups (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        created_at BIGINT NOT NULL,
        locked BOOLEAN NOT NULL DEFAULT FALSE
      );

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

      CREATE TABLE IF NOT EXISTS group_members (
        group_id VARCHAR(64) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        registration_id VARCHAR(64) NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, registration_id)
      );

      CREATE INDEX IF NOT EXISTS idx_registrations_roll ON registrations(roll_number);
      CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
      CREATE INDEX IF NOT EXISTS idx_registrations_group ON registrations(group_id);
    `);

    // 2. Migrate Groups
    console.log(`Migrating ${groups.length} groups...`);
    for (const g of groups) {
      await client.query(
        `INSERT INTO groups (id, name, created_at, locked)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           created_at = EXCLUDED.created_at,
           locked = EXCLUDED.locked;`,
        [g.id, g.name, g.createdAt || Date.now(), Boolean(g.locked)]
      );
    }

    // 3. Migrate Registrations
    console.log(`Migrating ${registrations.length} registrations...`);
    for (const r of registrations) {
      const status = r.status === 'valid' ? 'active' : (r.status || 'active');
      const createdAt = r.createdAt || r.registeredAt || Date.now();
      const updatedAt = r.updatedAt || r.registeredAt || Date.now();
      const registeredAt = r.registeredAt || createdAt;
      const phone = r.phoneNumber || '+919876543200';

      await client.query(
        `INSERT INTO registrations (
           id, name, roll_number, batch, phone_number,
           created_at, updatedAt, registered_at, status,
           withdrawn_stage, withdrawn_at, flag_reason, duplicate_of_roll,
           group_id, group_assigned, revealed
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           roll_number = EXCLUDED.roll_number,
           batch = EXCLUDED.batch,
           phone_number = EXCLUDED.phone_number,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at,
           registered_at = EXCLUDED.registered_at,
           status = EXCLUDED.status,
           withdrawn_stage = EXCLUDED.withdrawn_stage,
           withdrawn_at = EXCLUDED.withdrawn_at,
           flag_reason = EXCLUDED.flag_reason,
           duplicate_of_roll = EXCLUDED.duplicate_of_roll,
           group_id = EXCLUDED.group_id,
           group_assigned = EXCLUDED.group_assigned,
           revealed = EXCLUDED.revealed;`,
        [
          r.id,
          r.name,
          r.rollNumber,
          r.batch,
          phone,
          createdAt,
          updatedAt,
          registeredAt,
          status,
          r.withdrawnStage || null,
          r.withdrawnAt || null,
          r.flagReason || null,
          r.duplicateOfRoll || null,
          r.groupId || null,
          Boolean(r.groupAssigned || r.groupId),
          Boolean(r.revealed),
        ]
      );
    }

    // 4. Migrate Group Members
    console.log('Populating group_members junction table...');
    for (const g of groups) {
      if (Array.isArray(g.memberIds)) {
        for (const mId of g.memberIds) {
          await client.query(
            `INSERT INTO group_members (group_id, registration_id)
             VALUES ($1, $2)
             ON CONFLICT (group_id, registration_id) DO NOTHING;`,
            [g.id, mId]
          );
        }
      }
    }

    // 5. Migrate Event State
    console.log('Migrating event state...');
    const revealTime = event.revealTime || new Date().toISOString();
    const stage = event.stage || 'REGISTRATION_OPEN';
    const regOpen = event.registrationOpen !== false;
    const grpLocked = Boolean(event.groupsLocked);
    const isPub = Boolean(event.isPublished);
    const pubAt = event.publishedAt || null;

    await client.query(
      `INSERT INTO event_state (
         id, stage, reveal_time, registration_open, groups_locked, is_published, published_at, last_mixed_at
       ) VALUES (1, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         stage = EXCLUDED.stage,
         reveal_time = EXCLUDED.reveal_time,
         registration_open = EXCLUDED.registration_open,
         groups_locked = EXCLUDED.groups_locked,
         is_published = EXCLUDED.is_published,
         published_at = EXCLUDED.published_at,
         last_mixed_at = EXCLUDED.last_mixed_at;`,
      [stage, revealTime, regOpen, grpLocked, isPub, pubAt, lastMixedAt]
    );

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log(`- ${registrations.length} registrations imported.`);
    console.log(`- ${groups.length} groups imported.`);
    console.log(`- Event state set to stage: ${stage}\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
