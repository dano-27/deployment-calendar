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

  CREATE TABLE IF NOT EXISTS items (
    id         TEXT PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS event_items (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (event_id, item_id)
  );
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
if (!columns.includes('source_id')) {
  db.exec(`ALTER TABLE events ADD COLUMN source_id TEXT DEFAULT NULL`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_id ON events(source_id) WHERE source_id IS NOT NULL`);
  console.log('Added source_id column to events');
}

// Rename "Go Fleet" → "GSO Fleet" if it still exists under the old name
const goFleet = db.prepare("SELECT id FROM categories WHERE id = 'go-fleet'").get();
if (goFleet) {
  db.exec(`UPDATE categories SET id = 'gso-fleet', name = 'GSO Fleet' WHERE id = 'go-fleet'`);
  db.exec(`UPDATE events SET category_id = 'gso-fleet' WHERE category_id = 'go-fleet'`);
  console.log('Renamed Go Fleet → GSO Fleet');
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
    { id: 'gso-fleet',  name: 'GSO Fleet',  color: '#27AE60' },
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

// ============================================================================
// Seed default items if the table is empty
// ============================================================================

const itemCount = db.prepare('SELECT COUNT(*) AS count FROM items').get();

if (itemCount.count === 0) {
  const insertItem = db.prepare(
    'INSERT INTO items (id, name) VALUES (?, ?)'
  );

  const defaultItems = [
    { id: 'register', name: 'Register' },
    { id: 'hh',       name: 'HH' },
    { id: 'kds',      name: 'KDS' },
  ];

  const seedItems = db.transaction(() => {
    for (const item of defaultItems) {
      insertItem.run(item.id, item.name);
    }
  });

  seedItems();
  console.log('Seeded default items');
}

module.exports = db;
