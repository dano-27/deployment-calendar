// ============================================================================
// Slack Sync Service
// Polls a dedicated #deployment-sync channel for structured messages and
// auto-imports them as calendar events using the existing webhook logic.
// ============================================================================

const { WebClient } = require('@slack/web-api');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ============================================================================
// Configuration
// ============================================================================
const POLL_INTERVAL_MS = 30 * 1000;   // Poll every 30 seconds
const SYNC_CHANNEL_NAME = 'deployment-sync';
const MESSAGE_PREFIX = 'DEPLOY_SYNC';

let slackClient = null;
let syncChannelId = null;
let lastTimestamp = null;             // Track the last processed message timestamp
let pollTimer = null;

// ============================================================================
// Helpers (duplicated from routes/events.js to keep this service independent)
// ============================================================================

/**
 * Parse various date formats into YYYY-MM-DD.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const str = dateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // MM/DD/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }

  // Try native Date parsing (handles "July 15, 2026" etc.)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Generate a random pleasant color for auto-created categories.
 */
function randomPleasantColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 55%, 50%)`;
}

/**
 * Get event with category info joined.
 */
function getEventWithCategory(eventId) {
  return db.prepare(`
    SELECT
      e.id, e.date, e.title, e.details,
      e.category_id    AS categoryId,
      e.status,
      e.status_date    AS statusDate,
      e.is_backup_stock AS isBackupStock,
      e.source_id      AS sourceId,
      e.created_at     AS createdAt,
      e.updated_at     AS updatedAt,
      c.name           AS categoryName,
      c.color          AS categoryColor
    FROM events e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(eventId);
}

// ============================================================================
// Parse a DEPLOY_SYNC message into event data
// ============================================================================
function parseSyncMessage(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // First line must be the prefix
  if (lines[0] !== MESSAGE_PREFIX) return null;

  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(':');
    if (colonIdx === -1) continue;
    const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
    const value = lines[i].substring(colonIdx + 1).trim();
    if (key && value) {
      data[key] = value;
    }
  }

  // title and date are required
  if (!data.title || !data.date) return null;

  return data;
}

// ============================================================================
// Import a parsed message as a calendar event (upsert via sourceId)
// ============================================================================
function importEvent(data) {
  const parsedDate = parseDate(data.date);
  if (!parsedDate) {
    console.warn(`[SlackSync] Could not parse date: "${data.date}"`);
    return null;
  }

  // Resolve category
  let categoryId = null;
  if (data.category) {
    const existing = db.prepare(
      'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)'
    ).get(data.category);

    if (existing) {
      categoryId = existing.id;
    } else {
      categoryId = data.category.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const color = randomPleasantColor();
      db.prepare('INSERT INTO categories (id, name, color) VALUES (?, ?, ?)').run(categoryId, data.category, color);
      console.log(`[SlackSync] Auto-created category: "${data.category}" (${categoryId})`);
    }
  }

  const now = new Date().toISOString();
  const sourceId = data.sourceid || null;

  // Check for existing event by sourceId (duplicate detection)
  let existingEvent = null;
  if (sourceId) {
    existingEvent = db.prepare('SELECT id FROM events WHERE source_id = ?').get(sourceId);
  }

  let eventId;

  if (existingEvent) {
    eventId = existingEvent.id;
    db.prepare(`
      UPDATE events SET date = ?, title = ?, details = ?, category_id = ?, updated_at = ?
      WHERE id = ?
    `).run(parsedDate, data.title, data.details || '', categoryId, now, eventId);
    console.log(`[SlackSync] Updated event "${data.title}" (${eventId})`);
  } else {
    eventId = uuidv4();
    db.prepare(`
      INSERT INTO events (id, date, title, details, category_id, status, source_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, parsedDate, data.title, data.details || '', categoryId, 'pending', sourceId, now, now);
    console.log(`[SlackSync] Created event "${data.title}" (${eventId})`);
  }

  return getEventWithCategory(eventId);
}

// ============================================================================
// Find the #deployment-sync channel ID
// ============================================================================
async function findSyncChannel() {
  try {
    let cursor;
    do {
      const result = await slackClient.conversations.list({
        types: 'public_channel',
        limit: 200,
        cursor: cursor,
      });

      const channel = result.channels.find(ch => ch.name === SYNC_CHANNEL_NAME);
      if (channel) return channel.id;

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    console.error(`[SlackSync] Channel #${SYNC_CHANNEL_NAME} not found. Create it and invite the bot.`);
    return null;
  } catch (err) {
    console.error('[SlackSync] Error finding channel:', err.message);
    return null;
  }
}

// ============================================================================
// Poll the channel for new messages
// ============================================================================
async function pollChannel() {
  try {
    const params = {
      channel: syncChannelId,
      limit: 50,
    };

    // Only fetch messages newer than the last one we processed
    if (lastTimestamp) {
      params.oldest = lastTimestamp;
      params.inclusive = false;  // Don't re-process the last message
    }

    const result = await slackClient.conversations.history(params);

    if (!result.messages || result.messages.length === 0) return;

    // Messages come newest-first, reverse to process chronologically
    const messages = result.messages.reverse();

    let imported = 0;
    for (const msg of messages) {
      // Skip bot messages, thread replies, etc.
      if (msg.subtype) continue;

      const data = parseSyncMessage(msg.text);
      if (data) {
        importEvent(data);
        imported++;
      }

      // Track the latest timestamp
      lastTimestamp = msg.ts;
    }

    if (imported > 0) {
      console.log(`[SlackSync] Imported ${imported} event(s) from #${SYNC_CHANNEL_NAME}`);
    }
  } catch (err) {
    if (err.data?.error === 'not_in_channel') {
      console.error(`[SlackSync] Bot is not in #${SYNC_CHANNEL_NAME}. Run: /invite @YourBotName`);
    } else {
      console.error('[SlackSync] Poll error:', err.message);
    }
  }
}

// ============================================================================
// Start the sync service
// ============================================================================
async function startSlackSync() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.log('[SlackSync] No SLACK_BOT_TOKEN set — Slack sync disabled');
    return;
  }

  slackClient = new WebClient(token);

  // Verify token
  try {
    const auth = await slackClient.auth.test();
    console.log(`[SlackSync] Authenticated as ${auth.user} in workspace ${auth.team}`);
  } catch (err) {
    console.error('[SlackSync] Invalid SLACK_BOT_TOKEN:', err.message);
    return;
  }

  // Find the sync channel
  syncChannelId = await findSyncChannel();
  if (!syncChannelId) return;

  console.log(`[SlackSync] Watching #${SYNC_CHANNEL_NAME} (${syncChannelId}) — polling every ${POLL_INTERVAL_MS / 1000}s`);

  // Set lastTimestamp to "now" so we only process NEW messages going forward
  lastTimestamp = String(Date.now() / 1000);

  // Start polling
  pollTimer = setInterval(pollChannel, POLL_INTERVAL_MS);

  // Also do an immediate first poll
  await pollChannel();
}

/**
 * Stop the sync service (for graceful shutdown).
 */
function stopSlackSync() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[SlackSync] Stopped');
  }
}

module.exports = { startSlackSync, stopSlackSync };
