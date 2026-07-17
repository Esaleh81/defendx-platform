const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runSetup() {
  try {
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Deploying database schema onto Render...');
    await pool.query(sql);
    console.log('Database tables successfully created on Render!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to run db schema setup:', err);
    process.exit(1);
  }
}

runSetup();