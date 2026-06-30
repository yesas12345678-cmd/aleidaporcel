require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Connect to PostgreSQL database
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:nx4uk54uryarhdw0@187.127.233.89:5436/postgres';
const pool = new Pool({
  connectionString,
  ssl: false // Disable SSL verification since certificate might be self-signed/invalid
});

// Configure JSON body limits for handling base64 backup imports
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Configure multer for file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB file size limit
});

// Initialize database schema (runs automatically on startup)
async function initDatabase() {
  let client;
  try {
    console.log('Initializing database tables...');
    client = await pool.connect();
    
    // Create settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create media table
    await client.query(`
      CREATE TABLE IF NOT EXISTS media (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(255) NOT NULL,
        section VARCHAR(255) NOT NULL,
        associated_audio_id VARCHAR(255),
        created_at BIGINT NOT NULL,
        data BYTEA
      )
    `);

    // Create memories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        date VARCHAR(255) NOT NULL,
        text TEXT NOT NULL,
        media_name VARCHAR(255),
        media_type VARCHAR(255),
        media_data BYTEA,
        created_at BIGINT NOT NULL
      )
    `);

    console.log('Database tables verified/created successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    if (client) client.release();
  }
}

// ==========================================
// API Endpoints: Settings
// ==========================================

app.get('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ key, value: result.rows[0].value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, value]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// API Endpoints: Media
// ==========================================

// Get all media metadata (excluding binary data)
app.get('/api/media', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, type, section, associated_audio_id as "associatedAudioId", created_at as "createdAt" FROM media ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific media file binary contents
app.get('/api/media/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT data, type FROM media WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].data) {
      return res.status(404).send('File not found');
    }
    
    const row = result.rows[0];
    res.setHeader('Content-Type', row.type);
    res.send(row.data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Save media metadata and binary file via multipart upload
app.post('/api/media', upload.single('file'), async (req, res) => {
  try {
    const { id, name, type, section, associatedAudioId } = req.body;
    const file = req.file;

    if (!id || !name || !type || !section) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const fileBuffer = file ? file.buffer : null;
    const createdAt = Date.now();

    await pool.query(
      'INSERT INTO media (id, name, type, section, associated_audio_id, created_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET name=$2, type=$3, section=$4, associated_audio_id=$5, data=$7',
      [id, name, type, section, associatedAudioId || null, createdAt, fileBuffer]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete media
app.delete('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Also delete any associated media if needed, but standard logic deletes directly
    await pool.query('DELETE FROM media WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// API Endpoints: Memories
// ==========================================

// Get all memories metadata (excluding binary data)
app.get('/api/memories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, date, text, media_name as "mediaName", media_type as "mediaType", created_at as "createdAt" FROM memories ORDER BY date ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific memory media file binary contents
app.get('/api/memories/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT media_data, media_type FROM memories WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].media_data) {
      return res.status(404).send('File not found');
    }
    
    const row = result.rows[0];
    res.setHeader('Content-Type', row.media_type);
    res.send(row.media_data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Save memory metadata and optional binary file via multipart upload
app.post('/api/memories', upload.single('file'), async (req, res) => {
  try {
    const { id, title, date, text } = req.body;
    const file = req.file;

    if (!id || !title || !date || !text) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const fileBuffer = file ? file.buffer : null;
    const mediaName = file ? file.originalname : null;
    const mediaType = file ? file.mimetype : null;
    const createdAt = Date.now();

    await pool.query(
      'INSERT INTO memories (id, title, date, text, media_name, media_type, media_data, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET title=$2, date=$3, text=$4, media_name=$5, media_type=$6, media_data=$7',
      [id, title, date, text, mediaName, mediaType, fileBuffer, createdAt]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete memory
app.delete('/api/memories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM memories WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// Backup & Restore
// ==========================================

// Export full backup
app.get('/api/backup', async (req, res) => {
  try {
    // Fetch settings
    const settingsRes = await pool.query('SELECT key, value FROM settings');
    const settingsMap = {};
    settingsRes.rows.forEach(row => {
      settingsMap[row.key] = row.value;
    });

    // Fetch media with base64 data
    const mediaRes = await pool.query('SELECT id, name, type, section, associated_audio_id, created_at, data FROM media');
    const mediaList = mediaRes.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      section: row.section,
      associatedAudioId: row.associated_audio_id,
      createdAt: Number(row.created_at),
      base64Blob: row.data ? row.data.toString('base64') : null
    }));

    // Fetch memories with base64 data
    const memoriesRes = await pool.query('SELECT id, title, date, text, media_name, media_type, created_at, media_data FROM memories');
    const memoriesList = memoriesRes.rows.map(row => ({
      id: row.id,
      title: row.title,
      date: row.date,
      text: row.text,
      mediaName: row.media_name,
      mediaType: row.media_type,
      createdAt: Number(row.created_at),
      base64Blob: row.media_data ? row.media_data.toString('base64') : null
    }));

    res.json({
      settings: settingsMap,
      media: mediaList,
      memories: memoriesList
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during backup export' });
  }
});

// Restore backup
app.post('/api/restore', async (req, res) => {
  const client = await pool.connect();
  try {
    const { settings, media, memories } = req.body;
    if (!settings || !media || !memories) {
      return res.status(400).json({ error: 'Invalid backup structure' });
    }

    await client.query('BEGIN');

    // Clear tables
    await client.query('DELETE FROM settings');
    await client.query('DELETE FROM media');
    await client.query('DELETE FROM memories');

    // Restore settings
    for (const [key, value] of Object.entries(settings)) {
      await client.query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, value]);
    }

    // Restore media
    for (const m of media) {
      const buffer = m.base64Blob ? Buffer.from(m.base64Blob, 'base64') : null;
      await client.query(
        'INSERT INTO media (id, name, type, section, associated_audio_id, created_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [m.id, m.name, m.type, m.section, m.associatedAudioId || null, m.createdAt, buffer]
      );
    }

    // Restore memories
    for (const mem of memories) {
      const buffer = mem.base64Blob ? Buffer.from(mem.base64Blob, 'base64') : null;
      await client.query(
        'INSERT INTO memories (id, title, date, text, media_name, media_type, media_data, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [mem.id, mem.title, mem.date, mem.text, mem.mediaName || null, mem.mediaType || null, buffer, mem.createdAt]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error during backup restore' });
  } finally {
    client.release();
  }
});

// ==========================================
// Static File Serving
// ==========================================

app.use(express.static(path.join(__dirname)));

// Fallback all routes to index.html (hash routing is used in frontend anyway)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize database schema and start server
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
});
