import Database from 'better-sqlite3';
import path from 'path';
import { applySchema } from './schema';

const DB_PATH = process.env.REPLAY_DB_PATH
  ?? path.join(__dirname, '..', '..', 'data', 'replay.db');

function migrate(): void {
  const db = new Database(DB_PATH);
  try {
    applySchema(db);
    console.log(`[migrate] Schema applied — ${DB_PATH}`);
  } finally {
    db.close();
  }
}

migrate();
