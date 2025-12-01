import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

function loadLocalEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    console.warn('Failed to load .env.local for seed-currencies:', err);
  }
}

export async function seedCurrencies() {
  let pool: Pool | null = null;

  try {
    loadLocalEnv();

    const host = process.env.PG_HOST;
    const database = process.env.PG_DATABASE;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;

    if (!host || !database || !user || typeof password !== 'string') {
      throw new Error('Database env vars PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD must all be set as strings');
    }

    pool = new Pool({
      host,
      database,
      user,
      password,
      port: parseInt(process.env.PG_PORT || '5432', 10),
    });

    console.log('Fetching currencies from exchange-api...');

    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json');
    if (!res.ok) {
      throw new Error(`Failed to fetch currencies: ${res.status} ${res.statusText}`);
    }

    const data: Record<string, unknown> = await res.json();

    let inserted = 0;

    for (const [code, nameRaw] of Object.entries(data)) {
      if (typeof nameRaw !== 'string') {
        // Skip non-string values (just in case the API adds metadata fields)
        continue;
      }

      const upperCode = code.toUpperCase();
      const name = nameRaw.trim();

      if (!upperCode || !name) continue;

      await pool.query(
        `INSERT INTO currencies (code, name)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name,
               updated_at = now()`,
        [upperCode, name],
      );

      inserted += 1;
    }

    console.log(`Seeded/updated ${inserted} currencies.`);
  } catch (error) {
    console.error('Error seeding currencies:', error);
    throw error;
  } finally {
    if (pool) await pool.end();
  }
}

if (require.main === module) {
  seedCurrencies().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
