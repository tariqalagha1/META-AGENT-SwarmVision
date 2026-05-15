import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { applySchema } from './schema';
import { ReplayRepository } from './repository';

let _db:   Database.Database   | null = null;
let _repo: ReplayRepository     | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.REPLAY_DB_PATH
      ?? path.join(process.cwd(), 'data', 'replay.db');

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(dbPath);
    applySchema(_db);
  }
  return _db;
}

export function getRepo(): ReplayRepository {
  if (!_repo) _repo = new ReplayRepository(getDb());
  return _repo;
}

export function closeDb(): void {
  _db?.close();
  _db   = null;
  _repo = null;
}
