const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000; // Render expects default to port 5000 or env port
const JWT_SECRET = process.env.JWT_SECRET || 'defendx_secret_key';

// Initialize PostgreSQL connection pool for Web Contact Form & Health Checks
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for secure Render connections
});

// ==========================================
// DATABASE AUTO-INITIALIZATION SETUP
// ==========================================
const initializeDatabase = async () => {
  try {
    console.log("Checking database schema...");
    
    // Create the contacts table if it's missing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) DEFAULT 'General Inquiry',
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Ensure the created_at column is there in case table existed earlier without it
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    console.log("Database tables initialized successfully!");
  } catch (err) {
    console.error("Failed to run database startup migrations:", err);
  }
};

// Execute database initialization immediately on server start
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory for incident photos if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Serve uploaded assets statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set up disk storage for mobile app uploaded incident photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: storage });

// In-memory data stores for testing mobile workflows (reset on restart unless migrated to SQL)
const incidents = [];
const rfSignals = [];
const acousticSignals = [];
const classifications = [];

// Helper middleware to mock JWT validation
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

/* ==========================================
   ROUTE 1: SYSTEM MONITORING & HEALTH CHECKS
   ========================================== */

// Root confirmation endpoint
app.get('/', (req, res) => {
  res.json({ message: "DefendX Multi-Client API Gateway is running successfully!" });
});

// Production health check verification route
app.get('/api/health', async (req, res) => {
  try {
    // Ping database to ensure connectivity
    await pool.query('SELECT 1');
    res.status(200).json({
      status: "OK",
      message: "Backend connected to database successfully!",
      timestamp: new Date()
    });
  } catch (err) {
    console.error("Database connection failure in health check:", err);
    res.status(500).json({
      status: "ERROR",
      message: "Backend server online but database unreachable.",
      error: err.message
    });
  }
});

/* ==========================================
   ROUTE 2: WEB LANDING PAGE - CONTACT FORM (PostgreSQL & Nodemailer integration)
   ========================================== */

// Configure Nodemailer transporter using dynamic environment credentials
// Configure Nodemailer transporter with secure connection settings
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use true for port 465 (SSL)
  auth: {
    user: process.env.NOTIFICATION_EMAIL_USER, // Your sending email
    pass: process.env.NOTIFICATION_EMAIL_PASS  // Your 16-character App Password
  }
});

// const transporter = nodemailer.createTransport({
//   service: 'gmail', // Keep Gmail or adjust if using a custom SMTP provider
//   auth: {
//     user: process.env.NOTIFICATION_EMAIL_USER, // Your sending email (from Render Env Variables)
//     pass: process.env.NOTIFICATION_EMAIL_PASS  // Your email App Password (from Render Env Variables)
//   }
// });

app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message fields are required.' });
  }

  try {
    // 1. Write the submission details to your PostgreSQL database on Render
    const queryText = `
      INSERT INTO contacts (name, email, subject, message, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *;
    `;
    const values = [name, email, subject || 'General Web Inquiry', message];
    const result = await pool.query(queryText, values);
    
    // 2. Dispatch instant email notification to your inbox
    const mailOptions = {
      from: `"DefendX Contact Center" <${process.env.NOTIFICATION_EMAIL_USER}>`,
      to: process.env.NOTIFICATION_EMAIL_TO, // Your target inbox address (from Render Env Variables)
      subject: `🚨 Web Alert: ${subject || 'General Web Inquiry'}`,
      text: `A visitor submitted a message on the DefendX website!\n\n` +
            `• Sender Name: ${name}\n` +
            `• Sender Email: ${email}\n\n` +
            `• Message Details:\n"${message}"\n\n` +
            `This submission has been logged securely in database 'defendx-db'.`
    };

    // Send email asynchronously in the background so it doesn't block frontend execution
    transporter.sendMail(mailOptions, (mailErr, info) => {
      if (mailErr) {
        console.error('Nodemailer background dispatch failed:', mailErr);
      } else {
        console.log('Instant email notification sent successfully:', info.response);
      }
    });
    
    // 3. Return success response to the client
    res.status(201).json({
      success: true,
      message: 'Contact form received successfully!',
      lead: result.rows[0]
    });
  } catch (err) {
    console.error('Database write failed on contact submission:', err);
    res.status(500).json({ error: 'Internal server error. Database insertion failed.' });
  }
});

/* ==========================================
   ROUTE 3: MOBILE APP CLIENT endpoints (JWT Authenticated)
   ========================================== */

// 1. User Authentication (JWT)
app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Basic mock authentication
  if (email && password) {
    const user = { id: 1, email, name: 'Operator One', role: 'admin' };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '7d' });
    
    return res.status(200).json({
      token,
      refresh_token: refreshToken,
      user
    });
  }
  res.status(400).json({ error: 'Email and password required' });
});

// 2. Submit RF Signal
app.post('/api/v1/signals', authenticateJWT, (req, res) => {
  const signal = { id: rfSignals.length + 1, ...req.body, status: 'processed' };
  rfSignals.push(signal);
  
  res.status(201).json({
    signal_id: signal.id,
    status: 'recorded',
    timestamp: Date.now()
  });
});

// 3. Submit Acoustic Features
app.post('/api/v1/signals/acoustic', authenticateJWT, (req, res) => {
  const features = { id: acousticSignals.length + 1, ...req.body };
  acousticSignals.push(features);
  
  res.status(201).json({
    feature_id: features.id,
    status: 'recorded'
  });
});

// 4. Submit Fused Classification
app.post('/api/v1/classifications/fused', authenticateJWT, (req, res) => {
  const classification = { id: classifications.length + 1, ...req.body };
  classifications.push(classification);
  
  res.status(201).json({
    classification_id: classification.id,
    alert_level: classification.fused_confidence > 0.75 ? 'high' : 'normal',
    status: 'classification_recorded'
  });
});

// 5. Create Incident (supports optional photo upload via Multipart)
app.post('/api/v1/incidents', authenticateJWT, upload.single('photo'), (req, res) => {
  const incidentData = req.body.incident ? JSON.parse(req.body.incident) : req.body;
  
  const newIncident = {
    id: incidents.length + 1,
    ...incidentData,
    photoPath: req.file ? req.file.path : null,
    status: 'submitted',
    timestamp: incidentData.timestamp || Date.now()
  };
  
  incidents.push(newIncident);
  
  res.status(201).json({
    incidentId: newIncident.id,
    status: 'submitted'
  });
});

// 6. Retrieve Incident Details
app.get('/api/v1/incidents/:id', authenticateJWT, (req, res) => {
  const incident = incidents.find(i => i.id === parseInt(req.params.id));
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  res.status(200).json(incident);
});

// 7. Update Incident Status
app.put('/api/v1/incidents/:id', authenticateJWT, (req, res) => {
  const incident = incidents.find(i => i.id === parseInt(req.params.id));
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  
  incident.status = req.body.status || incident.status;
  res.status(200).json(incident);
});

// 8. Fetch Pending Background Sync Changes
app.get('/api/v1/sync/pending', authenticateJWT, (req, res) => {
  res.status(200).json({
    pendingIncidents: incidents.filter(i => i.status === 'draft'),
    pendingSignals: rfSignals.filter(s => s.status === 'pending')
  });
});

// Start Unified Gateway Server
app.listen(PORT, () => {
  console.log(`DefendX Multi-Client API Gateway running at http://localhost:${PORT}`);
});