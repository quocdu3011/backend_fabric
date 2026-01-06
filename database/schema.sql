-- Database Schema for Degree System
-- PostgreSQL version 17
-- Created: 2026-01-06

-- =============================================================================
-- TABLE: users
-- Stores user authentication and profile information
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'student', 'university')),
    student_id VARCHAR(100),
    enrollment_secret VARCHAR(255),
    enrolled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    enrolled_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for faster lookups
    CONSTRAINT unique_student_id UNIQUE (student_id)
);

-- Index for username lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index for student_id lookups
CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id);

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =============================================================================
-- TABLE: identities
-- Stores X.509 certificates and private keys for Fabric network identities
-- =============================================================================
CREATE TABLE IF NOT EXISTS identities (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) DEFAULT 'X.509',
    msp_id VARCHAR(100) NOT NULL,
    ou VARCHAR(100),
    certificate TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    
    -- Foreign key to users table
    CONSTRAINT fk_identity_user FOREIGN KEY (username) 
        REFERENCES users(username) ON DELETE CASCADE
);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_identities_username ON identities(username);

-- Index for msp_id lookups
CREATE INDEX IF NOT EXISTS idx_identities_msp_id ON identities(msp_id);

-- =============================================================================
-- TABLE: correction_requests
-- Stores transcript correction requests
-- =============================================================================
CREATE TABLE IF NOT EXISTS correction_requests (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(100) NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_data JSONB NOT NULL,
    current_data JSONB,
    reason TEXT,
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    
    -- Foreign key to users table
    CONSTRAINT fk_request_user FOREIGN KEY (requested_by) 
        REFERENCES users(username) ON DELETE CASCADE
);

-- Index for student_id lookups
CREATE INDEX IF NOT EXISTS idx_correction_requests_student_id ON correction_requests(student_id);

-- Index for status lookups
CREATE INDEX IF NOT EXISTS idx_correction_requests_status ON correction_requests(status);

-- Index for requested_by lookups
CREATE INDEX IF NOT EXISTS idx_correction_requests_requested_by ON correction_requests(requested_by);

-- Index for requested_at (for sorting by date)
CREATE INDEX IF NOT EXISTS idx_correction_requests_requested_at ON correction_requests(requested_at DESC);

-- =============================================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for identities table
DROP TRIGGER IF EXISTS update_identities_updated_at ON identities;
CREATE TRIGGER update_identities_updated_at 
    BEFORE UPDATE ON identities 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE users IS 'Stores user authentication and profile information';
COMMENT ON TABLE identities IS 'Stores X.509 certificates and private keys for Fabric network';
COMMENT ON TABLE correction_requests IS 'Stores transcript correction requests';

COMMENT ON COLUMN users.username IS 'Unique username for login';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.role IS 'User role: admin, student, or university';
COMMENT ON COLUMN users.student_id IS 'Student ID (same as username for students)';
COMMENT ON COLUMN users.enrollment_secret IS 'Enrollment secret for Fabric CA';
COMMENT ON COLUMN users.enrolled IS 'Whether user is enrolled in Fabric network';

COMMENT ON COLUMN identities.username IS 'Reference to user';
COMMENT ON COLUMN identities.type IS 'Identity type (always X.509 for Fabric)';
COMMENT ON COLUMN identities.msp_id IS 'Membership Service Provider ID (e.g., Org1MSP)';
COMMENT ON COLUMN identities.ou IS 'Organizational Unit (admin, student, client)';
COMMENT ON COLUMN identities.certificate IS 'PEM encoded X.509 certificate';
COMMENT ON COLUMN identities.private_key IS 'PEM encoded private key';

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Note: Initial admin user will be inserted by migration script
-- This ensures proper password hashing using bcrypt
