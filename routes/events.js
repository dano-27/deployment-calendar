// ============================================================================
// Event routes — CRUD + Slack webhook endpoint
// ============================================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// ============================================================================
// Helper: fetch a single event with its category info joined
// ============================================================================
function getEventWithCategory(eventId) {
  const event = db.prepare(`
    SELECT
      e.id, e.date, e.title, e.details,
      e.category_id    AS categoryId,
      e.status,
      e.status_date    AS statusDate,
      e.is_backup_stock AS isBackupStock,
      e.created_at     AS createdAt,
      e.updated_at     AS updatedAt,
      c.name           AS categoryName,
      c.color          AS categoryColor
    FROM events e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(eventId);

  if (event) {
    event.items = getEventItems(eventId);
  }
  return event;
}

// ============================================================================
// Helper: get items assigned to an event
// ============================================================================
function getEventItems(eventId) {
  return db.prepare(`
    SELECT ei.item_id AS itemId, i.name AS itemName, ei.quantity
    FROM event_items ei
    JOIN items i ON ei.item_id = i.id
    WHERE ei.event_id = ?
    ORDER BY i.name ASC
  `).all(eventId);
}

// ============================================================================
// Helper: save items for an event (delete-and-reinsert)
// ============================================================================
function saveEventItems(eventId, items) {
  if (!items || !Array.isArray(items)) return;

  db.prepare('DELETE FROM event_items WHERE event_id = ?').run(eventId);

  const insert = db.prepare(
    'INSERT INTO event_items (event_id, item_id, quantity) VALUES (?, ?, ?)'
  );

  for (const item of items) {
    if (item.itemId && item.quantity > 0) {
      insert.run(eventId, item.itemId, item.quantity);
    }
  }
}

// ============================================================================
// Helper: parse various date string formats into YYYY-MM-DD
// Supports: YYYY-MM-DD, MM/DD/YYYY, Month DD YYYY, Month DD, YYYY, etc.
// ============================================================================
function parseDate(dateStr) {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // "Month DD YYYY" or "Month DD, YYYY"
  const months = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };
  const namedMatch = trimmed.match(
    /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i
  );
  if (namedMatch) {
    const monthNum = months[namedMatch[1].toLowerCase()];
    if (monthNum) {
      const day = namedMatch[2].padStart(2, '0');
      return `${namedMatch[3]}-${monthNum}-${day}`;
    }
  }

  // Fallback: let Date.parse try
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) {
    return fallback.toISOString().split('T')[0];
  }

  return null;
}

// ============================================================================
// Helper: generate a random pleasant color hex string
// ============================================================================
function randomPleasantColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 50 + Math.floor(Math.random() * 30); // 50-80%
  const lightness = 40 + Math.floor(Math.random() * 20);  // 40-60%

  // Convert HSL to hex
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };

  return `#${f(0)}${f(8)}${f(4)}`;
}

// ============================================================================
// GET /api/events — List events for a given month/year
// Query params: ?month=7&year=2026  (defaults to current month/year)
// ============================================================================
router.get('/', (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
    const year = parseInt(req.query.year, 10) || now.getFullYear();

    // Build first and last day of month in YYYY-MM-DD format
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    const events = db.prepare(`
      SELECT
        e.id, e.date, e.title, e.details,
        e.category_id    AS categoryId,
        e.status,
        e.status_date    AS statusDate,
        e.is_backup_stock AS isBackupStock,
        e.created_at     AS createdAt,
        e.updated_at     AS updatedAt,
        c.name           AS categoryName,
        c.color          AS categoryColor
      FROM events e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.date BETWEEN ? AND ?
      ORDER BY e.date ASC, e.created_at ASC
    `).all(firstDay, lastDay);

    // Attach items to each event
    for (const ev of events) {
      ev.items = getEventItems(ev.id);
    }

    res.json(events);
  } catch (err) {
    console.error('GET /api/events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ============================================================================
// POST /api/events — Create a new event
// POST /api/events — Create a new event
// Body: { date, title, details?, categoryId?, status?, statusDate?, isBackupStock? }
// ============================================================================
router.post('/', (req, res) => {
  try {
    const { date, title, details, categoryId, status, statusDate, isBackupStock, items } = req.body;

    if (!date || !title) {
      return res.status(400).json({ error: 'date and title are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO events (id, date, title, details, category_id, status, status_date, is_backup_stock, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, date, title, details || '', categoryId || null, status || 'pending', statusDate || null, isBackupStock ? 1 : 0, now, now);

    // Save assigned items
    saveEventItems(id, items);

    const event = getEventWithCategory(id);
    res.status(201).json(event);
  } catch (err) {
    console.error('POST /api/events error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// ============================================================================
// PUT /api/events/:id — Update an existing event
// PUT /api/events/:id — Update an existing event
// Body: { date?, title?, details?, categoryId?, status?, statusDate?, isBackupStock? }
// ============================================================================
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Verify event exists
    const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { date, title, details, categoryId, status, statusDate, isBackupStock, items } = req.body;
    const now = new Date().toISOString();

    // Build dynamic SET clause — only update provided fields
    const fields = [];
    const values = [];

    if (date !== undefined) { fields.push('date = ?'); values.push(date); }
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (details !== undefined) { fields.push('details = ?'); values.push(details); }
    if (categoryId !== undefined) { fields.push('category_id = ?'); values.push(categoryId); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (statusDate !== undefined) { fields.push('status_date = ?'); values.push(statusDate); }
    if (isBackupStock !== undefined) { fields.push('is_backup_stock = ?'); values.push(isBackupStock ? 1 : 0); }

    // Always update the timestamp
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    // Save assigned items if provided
    if (items !== undefined) {
      saveEventItems(id, items);
    }

    const event = getEventWithCategory(id);
    res.json(event);
  } catch (err) {
    console.error('PUT /api/events/:id error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// ============================================================================
// DELETE /api/events/:id — Delete an event
// ============================================================================
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM events WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/events/:id error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ============================================================================
// POST /api/events/webhook — Slack webhook endpoint
// Body: { title, date, details?, category? }
// The `category` field is a NAME — if it doesn't exist, auto-create it
// ============================================================================
router.post('/webhook', (req, res) => {
  try {
    const { title, date, details, category } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: 'title and date are required' });
    }

    // Parse the incoming date (supports multiple formats)
    const parsedDate = parseDate(date);
    if (!parsedDate) {
      return res.status(400).json({ error: `Could not parse date: "${date}"` });
    }

    // Resolve the category — look up by name or auto-create
    let categoryId = null;
    if (category) {
      const existing = db.prepare(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)'
      ).get(category);

      if (existing) {
        categoryId = existing.id;
      } else {
        // Auto-create the category with a slug id and random color
        categoryId = category.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const color = randomPleasantColor();

        db.prepare(
          'INSERT INTO categories (id, name, color) VALUES (?, ?, ?)'
        ).run(categoryId, category, color);

        console.log(`Auto-created category: "${category}" (${categoryId}) with color ${color}`);
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO events (id, date, title, details, category_id, status, status_date, is_backup_stock, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, parsedDate, title, details || '', categoryId, req.body.status || 'pending', req.body.statusDate || null, req.body.isBackupStock ? 1 : 0, now, now);

    const event = getEventWithCategory(id);
    res.status(201).json(event);
  } catch (err) {
    console.error('POST /api/events/webhook error:', err);
    res.status(500).json({ error: 'Failed to create event via webhook' });
  }
});

module.exports = router;
