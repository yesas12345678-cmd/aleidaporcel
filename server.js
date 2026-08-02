require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Security configuration: Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "blob:"],
      mediaSrc: ["'self'", "blob:", "https://www.soundhelix.com", "data:"],
      connectSrc: ["'self'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'deny' }
}));

// Cookie parser configuration
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secreto_super_secreto_para_desarrollo_local_12345';

// Auth variables from env (with secure defaults for local dev)
const validDates = (process.env.USER_LOGIN_DATES || '14/05/26,14/05/2026,14-05-26,14-05-2026')
  .split(',')
  .map(d => d.trim());
const userPass = process.env.USER_PASSWORD || '1206';
const adminPass = process.env.ADMIN_PASSWORD || 'Manuel1214$';

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per 15 minutes
  message: { error: 'Demasiadas peticiones desde esta IP, por favor inténtalo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per 15 minutes
  message: { error: 'Demasiados intentos de inicio de sesión. Por favor, inténtalo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const { Client } = require('pg');

// List of potential connection URLs to try (ordered by preference)
const candidateUrls = [
  process.env.DATABASE_URL,
  'postgresql://postgres:nx4uk54uryarhdw0@postgres:5432/postgres',      // Dokploy internal network default
  'postgresql://postgres:nx4uk54uryarhdw0@172.17.0.1:5436/postgres',    // Docker Gateway (host port 5436)
  'postgresql://postgres:nx4uk54uryarhdw0@187.127.233.89:5436/postgres', // External public IP
  'postgresql://postgres:nx4uk54uryarhdw0@localhost:5436/postgres'      // Local fallback
].filter(Boolean);

let pool = null;

async function getPool() {
  if (pool) return pool;

  console.log('Testing PostgreSQL connection candidates...');
  for (const url of candidateUrls) {
    const maskedUrl = url.replace(/:[^:@]+@/, ':****@');
    try {
      console.log(`Testing connection: ${maskedUrl}`);
      const client = new Client({
        connectionString: url,
        connectionTimeoutMillis: 2000
      });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      
      console.log(`Successfully connected using: ${maskedUrl}`);
      pool = new Pool({
        connectionString: url,
        ssl: false,
        connectionTimeoutMillis: 3000
      });
      pool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client:', err);
      });
      return pool;
    } catch (err) {
      console.log(`Failed to connect using: ${maskedUrl}`);
    }
  }
  
  console.error('All PostgreSQL connection candidates failed.');
  return null;
}

// Configure JSON body limits for handling base64 backup imports
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Apply rate limiter to all API endpoints
app.use('/api', apiLimiter);

// Middleware to ensure database is online before handling API requests
app.use('/api', async (req, res, next) => {
  const currentPool = await getPool();
  if (!currentPool) {
    return res.status(503).json({ error: 'Database is offline' });
  }
  next();
});

// Middleware to authenticate user or admin
function authenticateUser(req, res, next) {
  const token = req.cookies.session_token;
  if (!token) {
    return res.status(401).json({ error: 'Inicia sesión para acceder a este recurso' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { role: 'user' or 'admin' }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// Middleware to authenticate admin strictly
function authenticateAdmin(req, res, next) {
  const token = req.cookies.session_token;
  if (!token) {
    res.clearCookie('session_token');
    return res.status(401).json({ error: 'Acceso denegado. Requiere privilegios de administrador' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Requiere rol de administrador' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('session_token');
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// Authentication endpoints
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { date, password } = req.body;
  if (!date || !password) {
    return res.status(400).json({ error: 'Fecha y contraseña requeridas' });
  }
  if (validDates.includes(date) && password === userPass) {
    const token = jwt.sign({ role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    return res.json({ success: true, role: 'user' });
  } else {
    return res.status(401).json({ error: 'Fecha o contraseña de inicio incorrectas' });
  }
});

app.post('/api/auth/admin-login', authLimiter, (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Contraseña requerida' });
  }
  if (password === adminPass) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    return res.json({ success: true, role: 'admin' });
  } else {
    return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });
  }
});

app.get('/api/auth/status', (req, res) => {
  const token = req.cookies.session_token;
  if (!token) {
    return res.json({ isAuthenticated: false, isAdmin: false });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({
      isAuthenticated: true,
      isAdmin: decoded.role === 'admin',
      role: decoded.role
    });
  } catch (err) {
    res.clearCookie('session_token');
    return res.json({ isAuthenticated: false, isAdmin: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session_token');
  res.json({ success: true });
});

// Configure multer for file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB file size limit
});

// Initialize database schema (runs automatically on startup)
async function initDatabase() {
  const currentPool = await getPool();
  if (!currentPool) {
    console.error('Database schema initialization skipped: database is offline.');
    return;
  }

  let client;
  try {
    console.log('Initializing database tables...');
    client = await currentPool.connect();
    
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

app.get('/api/settings/:key', authenticateUser, async (req, res) => {
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

app.post('/api/settings', authenticateAdmin, async (req, res) => {
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
app.get('/api/media', authenticateUser, async (req, res) => {
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

// Get specific media file binary contents with Range Requests support
app.get('/api/media/:id/file', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT data, type FROM media WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].data) {
      return res.status(404).send('File not found');
    }
    
    const row = result.rows[0];
    const dataBuffer = row.data;
    const totalLength = dataBuffer.length;
    
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', row.type);
    
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;
      
      if (start >= totalLength || end >= totalLength) {
        res.setHeader('Content-Range', `bytes */${totalLength}`);
        return res.status(416).send('Requested range not satisfiable');
      }
      
      const chunk = dataBuffer.slice(start, end + 1);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalLength}`,
        'Content-Length': chunk.length,
        'Content-Type': row.type
      });
      res.end(chunk);
    } else {
      res.setHeader('Content-Length', totalLength);
      res.send(dataBuffer);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Save media metadata and binary file via multipart upload
app.post('/api/media', authenticateAdmin, upload.single('file'), async (req, res) => {
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
app.delete('/api/media/:id', authenticateAdmin, async (req, res) => {
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
app.get('/api/memories', authenticateUser, async (req, res) => {
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

// Get specific memory media file binary contents with Range Requests support
app.get('/api/memories/:id/file', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT media_data, media_type FROM memories WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].media_data) {
      return res.status(404).send('File not found');
    }
    
    const row = result.rows[0];
    const dataBuffer = row.media_data;
    const totalLength = dataBuffer.length;
    
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', row.media_type);
    
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;
      
      if (start >= totalLength || end >= totalLength) {
        res.setHeader('Content-Range', `bytes */${totalLength}`);
        return res.status(416).send('Requested range not satisfiable');
      }
      
      const chunk = dataBuffer.slice(start, end + 1);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalLength}`,
        'Content-Length': chunk.length,
        'Content-Type': row.media_type
      });
      res.end(chunk);
    } else {
      res.setHeader('Content-Length', totalLength);
      res.send(dataBuffer);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


// Save memory metadata and optional binary file via multipart upload
app.post('/api/memories', authenticateAdmin, upload.single('file'), async (req, res) => {
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
app.delete('/api/memories/:id', authenticateAdmin, async (req, res) => {
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
app.get('/api/backup', authenticateAdmin, async (req, res) => {
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
app.post('/api/restore', authenticateAdmin, async (req, res) => {
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

// Start server and initialize database schema in background
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  initDatabase();
});
