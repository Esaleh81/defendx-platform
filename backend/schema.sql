-- Table to store public contact/inquiry form submissions
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    subject VARCHAR(200),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store registered defense system operators (for the dashboard)
CREATE TABLE IF NOT EXISTS operators (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'operator', -- 'operator' or 'administrator'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store AI sensor threat detections (RF and Acoustic)
CREATE TABLE IF NOT EXISTS detections (
    id SERIAL PRIMARY KEY,
    sensor_type VARCHAR(20) NOT NULL, -- 'RF' or 'Acoustic'
    frequency_mhz NUMERIC(10, 3),    -- Nullable if Acoustic
    decibels NUMERIC(5, 2),          -- Nullable if RF
    confidence_score NUMERIC(5, 4) NOT NULL, -- e.g., 0.9854 (98.54%)
    threat_level VARCHAR(20) NOT NULL, -- 'Low', 'Medium', 'High', 'Critical'
    status VARCHAR(20) DEFAULT 'unresolved', -- 'unresolved', 'acknowledged', 'resolved'
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);