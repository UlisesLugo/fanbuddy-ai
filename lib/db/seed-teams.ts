import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env file manually
const envPath = join(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
});

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { teams } from './schema';

const TEAMS = [
  { id: 4, name: 'Borussia Dortmund' },
  { id: 5, name: 'Bayern Munich' },
  { id: 57, name: 'Arsenal' },
  { id: 58, name: 'Aston Villa' },
  { id: 61, name: 'Chelsea' },
  { id: 64, name: 'Liverpool' },
  { id: 65, name: 'Manchester City' },
  { id: 66, name: 'Manchester United' },
  { id: 67, name: 'Newcastle United' },
  { id: 73, name: 'Tottenham Hotspur' },
  { id: 78, name: 'Atletico Madrid' },
  { id: 81, name: 'Barcelona' },
  { id: 86, name: 'Real Madrid' },
  { id: 98, name: 'AC Milan' },
  { id: 100, name: 'AS Roma' },
  { id: 108, name: 'Inter Milan' },
  { id: 109, name: 'Juventus' },
  { id: 113, name: 'Napoli' },
  { id: 264, name: 'Celtic' },
  { id: 294, name: 'Benfica' },
  { id: 498, name: 'Sporting CP' },
  { id: 503, name: 'Porto' },
  { id: 524, name: 'Paris Saint-Germain' },
  { id: 678, name: 'Ajax' },
  { id: 1107, name: 'Rangers' },
];

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);
  await db.insert(teams).values(TEAMS).onConflictDoNothing();
  console.log(`Seeded ${TEAMS.length} teams.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
