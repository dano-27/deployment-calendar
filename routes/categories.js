// ============================================================================
// Category routes — CRUD for deployment categories
// ============================================================================

const express = require('express');
const db = require('../db');

const router = express.Router();

// ============================================================================
// GET /api/categories — List all categories, ordered by name
// ============================================================================
router.get('/', (req, res) => {
  try {
    const categories = db.prepare(
      'SELECT id, name, color FROM categories ORDER BY name ASC'
    ).all();

    res.json(categories);
  } catch (err) {
    console.error('GET /api/categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// ============================================================================
// POST /api/categories — Create a new category
// Body: { name, color }
// The id is auto-generated as a slug from the name
// ============================================================================
router.post('/', (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name || !color) {
      return res.status(400).json({ error: 'name and color are required' });
    }

    // Generate slug id: lowercase, spaces → hyphens, strip non-alphanumerics
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    db.prepare(
      'INSERT INTO categories (id, name, color) VALUES (?, ?, ?)'
    ).run(id, name, color);

    const category = db.prepare(
      'SELECT id, name, color FROM categories WHERE id = ?'
    ).get(id);

    res.status(201).json(category);
  } catch (err) {
    // Handle unique constraint violation on name
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A category with that name already exists' });
    }
    console.error('POST /api/categories error:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ============================================================================
// PUT /api/categories/:id — Update an existing category
// Body: { name?, color? }
// ============================================================================
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Verify category exists
    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const { name, color } = req.body;
    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const category = db.prepare(
      'SELECT id, name, color FROM categories WHERE id = ?'
    ).get(id);

    res.json(category);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A category with that name already exists' });
    }
    console.error('PUT /api/categories/:id error:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// ============================================================================
// DELETE /api/categories/:id — Delete a category
// Reassigns any events using this category to 'general'
// The 'general' category itself cannot be deleted
// ============================================================================
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Guard: cannot delete the fallback 'general' category
    if (id === 'general') {
      return res.status(400).json({ error: 'Cannot delete the General category' });
    }

    // Verify category exists
    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Reassign events and delete category in a single transaction
    const deleteTransaction = db.transaction(() => {
      db.prepare(
        "UPDATE events SET category_id = 'general' WHERE category_id = ?"
      ).run(id);

      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    });

    deleteTransaction();
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
