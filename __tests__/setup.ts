import fs from 'fs';
import path from 'path';

// Load .env file manually for tests only if it exists
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2]
        .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
        .replace(/\\n/g, '\n');       // Handle escaped newlines
      process.env[key] = value;
    }
  }
}
