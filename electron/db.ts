import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

let db: Database.Database | null = null

export function getDb() {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'library.db')

  // Ensure db directory exists (though userData usually exists)
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  initSchema(db)

  return db
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      width INTEGER,
      height INTEGER,
      mtime INTEGER,
      thumb_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_path ON images(path);
  `)
}

export function insertImage(path: string, width: number, height: number, mtime: number, thumbPath: string) {
  const database = getDb()
  const stmt = database.prepare(`
    INSERT INTO images (path, width, height, mtime, thumb_path)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      width = excluded.width,
      height = excluded.height,
      mtime = excluded.mtime,
      thumb_path = excluded.thumb_path
  `)
  return stmt.run(path, width, height, mtime, thumbPath)
}

export function getAllImages() {
  const database = getDb()
  return database.prepare('SELECT * FROM images ORDER BY mtime DESC').all()
}

export function getImageCount() {
  const database = getDb()
  const result = database.prepare('SELECT COUNT(*) as count FROM images').get() as { count: number }
  return result.count
}

export function clearLibrary() {
  const database = getDb()
  database.prepare('DELETE FROM images').run()
}
