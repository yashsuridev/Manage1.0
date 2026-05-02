/* ================================================================
   Hostel Fees Management System — Backend Server
   Stack: Node.js + Express + MySQL
   Run:   node server.js
   URL:   http://localhost:3000
================================================================ */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const mysql   = require('mysql2/promise');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));          // 10 MB for base64 Aadhar photos
app.use(express.static(path.join(__dirname)));     // Serve HTML files

// ── Database Setup ──────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hostel',
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDB() {
  try {
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL DEFAULT '',
        fatherPhone VARCHAR(50) NOT NULL DEFAULT '',
        aadharNumber VARCHAR(50) NOT NULL DEFAULT '',
        room VARCHAR(50) NOT NULL DEFAULT '',
        totalFees DOUBLE NOT NULL DEFAULT 0,
        paid1 DOUBLE NOT NULL DEFAULT 0,
        paid2 DOUBLE NOT NULL DEFAULT 0,
        paid3 DOUBLE NOT NULL DEFAULT 0,
        installment1 TINYINT(1) NOT NULL DEFAULT 0,
        installment2 TINYINT(1) NOT NULL DEFAULT 0,
        installment3 TINYINT(1) NOT NULL DEFAULT 0,
        aadharPhotoBase64 LONGTEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    connection.release();
    console.log('✅ Database ready — MySQL');
  } catch (err) {
    console.error('❌ Database connection failed: ', err.message);
    console.error('Make sure your MySQL server is running and database is created.');
  }
}

initDB();

// ── Users (Credentials) ─────────────────────────────────────────
// Change these passwords whenever you like
const USERS = {
  'admin@hostel.com':      { password: 'admin123',  display: 'Admin',      role: 'admin'      },
  'accountant@hostel.com': { password: 'acc123',    display: 'Accountant', role: 'accountant' },
  'warden@hostel.com':     { password: 'ward123',   display: 'Warden',     role: 'warden'     },
};

// ── Helper ──────────────────────────────────────────────────────
function toObj(row) {
  if (!row) return null;
  return {
    id:                String(row.id),
    name:              row.name,
    phone:             row.phone              || '',
    fatherPhone:       row.fatherPhone        || '',
    aadharNumber:      row.aadharNumber       || '',
    room:              row.room               || '',
    totalFees:         row.totalFees          || 0,
    paid1:             row.paid1              || 0,
    paid2:             row.paid2              || 0,
    paid3:             row.paid3              || 0,
    installment1:      Boolean(row.installment1),
    installment2:      Boolean(row.installment2),
    installment3:      Boolean(row.installment3),
    aadharPhotoBase64: row.aadharPhotoBase64  || '',
    createdAt:         row.createdAt,
  };
}

// ================================================================
//  AUTH
// ================================================================

// POST /api/login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const user = USERS[email.trim().toLowerCase()];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  return res.json({
    success: true,
    email:   email.trim().toLowerCase(),
    display: user.display,
    role:    user.role,
  });
});

// ================================================================
//  STUDENTS
// ================================================================

// GET /api/students — all students, newest first
app.get('/api/students', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM students ORDER BY createdAt DESC');
    res.json(rows.map(toObj));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/students/:id — single student
app.get('/api/students/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json(toObj(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students — add student
app.post('/api/students', async (req, res) => {
  const { name, phone, fatherPhone, aadharNumber, room, totalFees } = req.body || {};
  if (!name || !phone || !fatherPhone || !aadharNumber || !room || totalFees == null) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const [info] = await pool.execute(
      `INSERT INTO students (name, phone, fatherPhone, aadharNumber, room, totalFees) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, phone, fatherPhone, aadharNumber, room, Number(totalFees)]
    );
    const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [info.insertId]);
    res.status(201).json(toObj(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/students/:id — update fields (payments, photo, etc.)
app.put('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await pool.execute('SELECT * FROM students WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Student not found.' });

    const allowed = [
      'name', 'phone', 'fatherPhone', 'aadharNumber', 'room', 'totalFees',
      'paid1', 'paid2', 'paid3',
      'installment1', 'installment2', 'installment3',
      'aadharPhotoBase64'
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        // Convert booleans to 1/0 for MySQL TINYINT
        if (typeof req.body[key] === 'boolean') {
          updates[key] = req.body[key] ? 1 : 0;
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    const values     = [...Object.values(updates), id];
    
    await pool.execute(`UPDATE students SET ${setClauses} WHERE id = ?`, values);

    const [updated] = await pool.execute('SELECT * FROM students WHERE id = ?', [id]);
    res.json(toObj(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/students/:id — delete student
app.delete('/api/students/:id', async (req, res) => {
  try {
    const [info] = await pool.execute('DELETE FROM students WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🏠  HostelPay Backend is RUNNING!');
  console.log(`    Open: http://localhost:${PORT}/login.html`);
  console.log('');
  console.log('    Default Credentials:');
  console.log('    📧  admin@hostel.com      / admin123');
  console.log('    📧  accountant@hostel.com / acc123');
  console.log('    📧  warden@hostel.com     / ward123');
  console.log('');
  console.log('    Press Ctrl+C to stop.');
});
