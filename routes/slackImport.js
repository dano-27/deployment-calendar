// ============================================================================
// Slack List Import Route
// One-time bulk import of all items from a Slack List into the calendar.
// Requires SLACK_BOT_TOKEN env var and lists:read scope on the Slack App.
// ============================================================================

const express = require('express');
const router = express.Router();
const { WebClient } = require('@slack/web-api');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ============================================================================
// Helpers
// ============================================================================

function parseDate(dateStr) {
  if (!dateStr) return null;
  const str = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function randomPleasantColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 55%, 50%)`;
}

function resolveCategory(categoryName) {
  if (!categoryName) return null;
  const existing = db.prepare(
    'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)'
  ).get(categoryName);
  if (existing) return existing.id;

  const id = categoryName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const color = randomPleasantColor();
  db.prepare('INSERT INTO categories (id, name, color) VALUES (?, ?, ?)').run(id, categoryName, color);
  console.log(`[SlackImport] Auto-created category: "${categoryName}" (${id})`);
  return id;
}

/**
 * Extract a field value from a Slack List item's fields array.
 * Tries matching by field key (case-insensitive).
 * Returns the plain text value, or date value if it's a date field.
 */
function extractField(fields, fieldKey) {
  if (!fields || !fieldKey) return null;
  const key = fieldKey.toLowerCase();
  const field = fields.find(f => (f.key || '').toLowerCase() === key);
  if (!field) return null;

  // Date fields have a date[] array with YYYY-MM-DD strings
  if (field.date && field.date.length > 0) {
    return field.date[0];
  }

  // Text fallback (most common for title/notes)
  if (field.text) return field.text;

  // Raw value fallback
  if (field.value !== null && field.value !== undefined) {
    return String(field.value);
  }

  return null;
}

// ============================================================================
// POST /api/slack/import
// Body: {
//   listId: "F12345678",         (required) Slack List ID
//   category: "Live Nation",     (required) category name to assign
//   titleField: "rich_text_notes", (optional) field key for event title, defaults to first text field
//   dateField: "date",           (optional) field key for event date
//   detailsField: "notes",      (optional) field key for event details/notes
// }
// ============================================================================
router.post('/import', async (req, res) => {
  try {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return res.status(400).json({ error: 'SLACK_BOT_TOKEN not configured on the server' });
    }

    const { listId, category, titleField, dateField, detailsField } = req.body;

    if (!listId) {
      return res.status(400).json({ error: 'listId is required (e.g. "F12345678")' });
    }
    if (!category) {
      return res.status(400).json({ error: 'category is required (e.g. "Live Nation")' });
    }

    const slack = new WebClient(token);
    const categoryId = resolveCategory(category);
    const now = new Date().toISOString();

    // Fetch all items from the list (paginated)
    let allItems = [];
    let cursor;

    do {
      const result = await slack.apiCall('slackLists.items.list', {
        list_id: listId,
        limit: 100,
        cursor: cursor || undefined,
      });

      if (!result.ok) {
        return res.status(400).json({ error: `Slack API error: ${result.error}` });
      }

      allItems = allItems.concat(result.items || []);
      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    // Process each item
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const results = [];

    for (const item of allItems) {
      const sourceId = `slack-list-${item.id}`;
      const fields = item.fields || [];

      // Extract title — try specified field, then first text field, then item ID
      let title = null;
      if (titleField) {
        title = extractField(fields, titleField);
      }
      if (!title) {
        // Try common field keys
        title = extractField(fields, 'rich_text_notes')
             || extractField(fields, 'title')
             || extractField(fields, 'name');
      }
      if (!title) {
        // Fall back to first field with text
        const firstText = fields.find(f => f.text);
        title = firstText ? firstText.text : null;
      }
      if (!title) {
        skipped++;
        continue; // Can't create an event without a title
      }

      // Extract date
      let date = null;
      if (dateField) {
        date = extractField(fields, dateField);
      }
      if (!date) {
        // Try common date field keys
        date = extractField(fields, 'date')
            || extractField(fields, 'due_date')
            || extractField(fields, 'start_date');
      }
      if (!date) {
        // Try finding any date field
        const dateFieldObj = fields.find(f => f.date && f.date.length > 0);
        date = dateFieldObj ? dateFieldObj.date[0] : null;
      }

      const parsedDate = parseDate(date);
      if (!parsedDate) {
        skipped++;
        continue; // Can't create an event without a date
      }

      // Extract details
      let details = '';
      if (detailsField) {
        details = extractField(fields, detailsField) || '';
      }

      // Upsert
      const existing = db.prepare('SELECT id FROM events WHERE source_id = ?').get(sourceId);

      if (existing) {
        db.prepare(`
          UPDATE events SET date = ?, title = ?, details = ?, category_id = ?, updated_at = ?
          WHERE id = ?
        `).run(parsedDate, title, details, categoryId, now, existing.id);
        updated++;
        results.push({ id: existing.id, title, date: parsedDate, action: 'updated' });
      } else {
        const eventId = uuidv4();
        db.prepare(`
          INSERT INTO events (id, date, title, details, category_id, status, source_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(eventId, parsedDate, title, details, categoryId, 'pending', sourceId, now, now);
        created++;
        results.push({ id: eventId, title, date: parsedDate, action: 'created' });
      }
    }

    console.log(`[SlackImport] List ${listId}: ${created} created, ${updated} updated, ${skipped} skipped`);

    res.json({
      success: true,
      listId,
      category,
      totalItems: allItems.length,
      created,
      updated,
      skipped,
      events: results,
    });
  } catch (err) {
    console.error('[SlackImport] Error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

module.exports = router;
