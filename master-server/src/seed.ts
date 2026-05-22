/**
 * Seed-данные для дева: создаёт системного юзера + 1 API-key + 6 демо-серверов.
 * Идемпотентен — запускается при каждом старте, не создаёт дубликаты.
 */
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { pool } from './db/pool.ts';
import * as repo from './db/repo.ts';

const SYSTEM_EMAIL = 'system@alfamp.local';
const DEV_KEY_LABEL = 'bootstrap-dev';

const demoSamples: Array<Omit<repo.ServerRegisterInput, 'api_key' | 'is_demo'> & { players: number; verified: boolean }> = [
  { name: 'Official Roleplay', endpoint: '193.42.110.21:30120', slots: 128, tags: ['rp','official'],     region: 'EU', players: 87, verified: true  },
  { name: 'Official Drift',    endpoint: '193.42.110.22:30120', slots: 64,  tags: ['drift','official'],  region: 'EU', players: 23, verified: true  },
  { name: 'Russian Freeroam',  endpoint: '5.180.21.4:30120',    slots: 64,  tags: ['freeroam','ru'],     region: 'RU', players: 41, verified: false },
  { name: 'German RP World',   endpoint: '78.46.99.10:30120',   slots: 100, tags: ['rp','de','german'],  region: 'DE', players: 94, verified: true  },
  { name: 'Cops & Robbers',    endpoint: '45.91.20.7:30120',    slots: 32,  tags: ['pvp','arena'],       region: 'EU', players: 8,  verified: false },
  { name: 'LA Custom Drift',   endpoint: '104.21.30.55:30120',  slots: 32,  tags: ['drift','us','custom'],region: 'US', players: 18, verified: false }
];

export async function seedIfEmpty(): Promise<{ devApiKey: string; created: number }> {
  // 1) Системный юзер
  let user = await repo.getUserByEmail(SYSTEM_EMAIL);
  if (!user) {
    const hash = await argon2.hash(crypto.randomBytes(24).toString('hex'));
    user = await repo.createUser(SYSTEM_EMAIL, hash, 'System');
    console.log(`[seed] created system user ${user.id}`);
  }

  // 2) Dev API-key (фиксированный — приходит из env или дефолт)
  const wantedKey = process.env.DEV_API_KEY || 'alfa_dev_owner_local';
  const keyRow = await repo.validateApiKey(wantedKey);
  if (!keyRow) {
    await repo.createApiKey(user.id, DEV_KEY_LABEL, wantedKey);
    console.log(`[seed] created dev API key`);
  }

  // 3) Demo-серверы (только если они вообще отсутствуют)
  const userServers = await repo.listUserServers(user.id);
  const haveDemos = userServers.filter(s => s.is_demo).length > 0;
  let created = 0;
  if (!haveDemos) {
    for (const sample of demoSamples) {
      const srv = await repo.registerServer({
        api_key: wantedKey,
        name: sample.name,
        endpoint: sample.endpoint,
        slots: sample.slots,
        tags: sample.tags,
        region: sample.region,
        is_demo: true
      });
      // Изначальные значения players/verified
      await pool.query(
        `UPDATE servers SET players = $2, verified = $3, registered_at = NOW() - ($4 || ' seconds')::INTERVAL WHERE id = $1`,
        [srv.id, sample.players, sample.verified, Math.floor(Math.random() * 86400)]
      );
      created++;
    }
    console.log(`[seed] created ${created} demo servers`);
  }

  return { devApiKey: wantedKey, created };
}
