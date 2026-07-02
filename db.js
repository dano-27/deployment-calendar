// ============================================================================
// Database initialization and configuration
// Uses better-sqlite3 for synchronous SQLite operations
// ============================================================================

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Ensure the data directory exists
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Initialize the database connection
const db = new Database(path.join(dataDir, 'calendar.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
// Enforce foreign key constraints
db.pragma('foreign_keys = ON');

// ============================================================================
// Schema creation
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id    TEXT PRIMARY KEY,
    name  TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    date        TEXT NOT NULL,
    title       TEXT NOT NULL,
    details     TEXT DEFAULT '',
    category_id TEXT REFERENCES categories(id),
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
`);

// ============================================================================
// Schema migrations — add new columns if they don't exist yet
// ============================================================================
const columns = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);

if (!columns.includes('status')) {
  db.exec(`ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'pending'`);
  console.log('Added status column to events');
}
if (!columns.includes('status_date')) {
  db.exec(`ALTER TABLE events ADD COLUMN status_date TEXT DEFAULT NULL`);
  console.log('Added status_date column to events');
}
if (!columns.includes('is_backup_stock')) {
  db.exec(`ALTER TABLE events ADD COLUMN is_backup_stock INTEGER DEFAULT 0`);
  console.log('Added is_backup_stock column to events');
}

// ============================================================================
// Seed default categories if the table is empty
// ============================================================================

const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get();

if (categoryCount.count === 0) {
  const insertCategory = db.prepare(
    'INSERT INTO categories (id, name, color) VALUES (?, ?, ?)'
  );

  const defaultCategories = [
    { id: 'live-nation', name: 'Live Nation', color: '#4A90D9' },
    { id: 'go-fleet',    name: 'Go Fleet',    color: '#27AE60' },
    { id: 'general',     name: 'General',     color: '#8E44AD' },
  ];

  const seedAll = db.transaction(() => {
    for (const cat of defaultCategories) {
      insertCategory.run(cat.id, cat.name, cat.color);
    }
  });

  seedAll();
  console.log('Seeded default categories');
}

module.exports = db;
