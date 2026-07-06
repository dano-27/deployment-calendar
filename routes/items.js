// ============================================================================
// Items routes — CRUD for preset equipment items
// ============================================================================

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/items — list all preset items
router.get('/', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM items ORDER BY name').all();
    res.json(items);
  } catch (err) {
    console.error('Error fetching items:', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST /api/items — create a new preset item
router.post('/', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const trimmed = name.trim();
    const id = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check if already exists
    const existing = db.prepare('SELECT id FROM items WHERE id = ? OR name = ?').get(id, trimmed);
    if (existing) {
      return res.status(400).json({ error: 'An item with that name already exists' });
    }

    db.prepare('INSERT INTO items (id, name) VALUES (?, ?)').run(id, trimmed);

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    res.status(201).json(item);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// DELETE /api/items/:id — delete a preset item
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // ON DELETE CASCADE handles event_items cleanup
    db.prepare('DELETE FROM items WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
