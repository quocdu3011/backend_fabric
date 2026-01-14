/**
 * Setup Admin Script
 * 
 * Tạo tài khoản admin đầu tiên cho hệ thống.
 * Admin sẽ có OU=admin trong certificate để có quyền cấp bằng.
 * 
 * Flow:
 * 1. Enroll CA admin (dùng để đăng ký users)
 * 2. Register admin user với CA (với OU=admin)
 * 3. Enroll admin user để lấy certificate
 * 4. Lưu vào wallet và database
 * 
 * Usage: node setup-admin.js [organization]
 *   organization: 'org1' (default) hoặc 'org2'
 * 
 * Ví dụ:
 *   node setup-admin.js          # Tạo admin cho Org1
 *   node setup-admin.js org2     # Tạo admin cho Org2
 */

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');

// Đọc .env nếu có
require('dotenv').config();

// Create separate database pool for this script (not shared with main app)
let scriptPool = null;

function getScriptPool() {
  if (!scriptPool) {
    const connectionString = process.env.DATABASE_URL;
    
    if (connectionString) {
      scriptPool = new Pool({
        connectionString,
        max: 3,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false }
      });
    } else {
      scriptPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'degree_system',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 3,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      });
    }

    scriptPool.on('error', (err) => {
      console.error('Database pool error:', err.message);
    });
  }
  return scriptPool;
}

async function dbQuery(text, params) {
  const pool = getScriptPool();
  return await pool.query(text, params);
}

async function closeScriptPool() {
  if (scriptPool) {
    await scriptPool.end();
    scriptPool = null;
    console.log('Script database pool closed');
  }
}

// Configuration cho 2 tổ chức
const ORG_CONFIG = {
  org1: {
    caUrl: 'https://localhost:7054',
    caName: 'ca-org1',
    mspId: 'Org1MSP',
    affiliation: 'org1.department1',
    caAdmin: process.env.CA_ADMIN_ORG1 || 'admin',
    caAdminPw: process.env.CA_ADMIN_PW_ORG1 || 'adminpw'
  },
  org2: {
    caUrl: 'https://localhost:8054',
    caName: 'ca-org2',
    mspId: 'Org2MSP',
    affiliation: 'org2.department1',
    caAdmin: process.env.CA_ADMIN_ORG2 || 'admin',
    caAdminPw: process.env.CA_ADMIN_PW_ORG2 || 'adminpw'
  }
};

// Admin credentials
const ADMIN_CONFIG = {
  org1: {
    username: process.env.ADMIN_USERNAME_ORG1 || 'adminorg1',
    password: process.env.ADMIN_PASSWORD_ORG1 || 'adminorg1pw'
  },
  org2: {
    username: process.env.ADMIN_USERNAME_ORG2 || 'adminorg2',
    password: process.env.ADMIN_PASSWORD_ORG2 || 'adminorg2pw'
  }
};

// Paths
const WALLET_PATH = path.join(__dirname, 'wallet');

/**
 * Save user to database
 */
async function saveUserToDatabase(username, passwordHash, role, mspId, enrolled) {
  const checkQuery = 'SELECT id FROM users WHERE username = $1';
  const result = await dbQuery(checkQuery, [username]);
  
  if (result.rows.length > 0) {
    // Update existing user
    const updateQuery = `
      UPDATE users 
      SET password_hash = $1, role = $2, enrolled = $3, enrolled_at = $4, updated_at = NOW()
      WHERE username = $5
      RETURNING id
    `;
    await dbQuery(updateQuery, [passwordHash, role, enrolled, new Date().toISOString(), username]);
    console.log(`   ✓ Updated user '${username}' in database`);
  } else {
    // Insert new user
    const insertQuery = `
      INSERT INTO users (username, password_hash, role, enrolled, enrolled_at, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;
    await dbQuery(insertQuery, [username, passwordHash, role, enrolled, new Date().toISOString()]);
    console.log(`   ✓ Inserted user '${username}' into database`);
  }
}

/**
 * Save identity to database
 */
async function saveIdentityToDatabase(username, mspId, ou, certificate, privateKey) {
  const checkQuery = 'SELECT id FROM identities WHERE username = $1';
  const result = await dbQuery(checkQuery, [username]);
  
  if (result.rows.length > 0) {
    // Update existing identity
    const updateQuery = `
      UPDATE identities 
      SET msp_id = $1, ou = $2, certificate = $3, private_key = $4, updated_at = NOW(), version = version + 1
      WHERE username = $5
      RETURNING id
    `;
    await dbQuery(updateQuery, [mspId, ou, certificate, privateKey, username]);
    console.log(`   ✓ Updated identity for '${username}' in database`);
  } else {
    // Insert new identity
    const insertQuery = `
      INSERT INTO identities (username, type, msp_id, ou, certificate, private_key, created_at)
      VALUES ($1, 'X.509', $2, $3, $4, $5, NOW())
      RETURNING id
    `;
    await dbQuery(insertQuery, [username, mspId, ou, certificate, privateKey]);
    console.log(`   ✓ Inserted identity for '${username}' into database`);
  }
}

/**
 * Enroll CA Admin (bootstrap identity)
 */
async function enrollCAAdmin(ca, orgConfig, wallet) {
  const caAdminName = `caadmin-${orgConfig.mspId.toLowerCase()}`;
  
  // Kiểm tra xem đã có CA admin trong wallet chưa
  const existingIdentity = await wallet.get(caAdminName);
  if (existingIdentity) {
    console.log(`✓ CA Admin identity '${caAdminName}' already exists in wallet`);
    return existingIdentity;
  }

  console.log(`Enrolling CA admin for ${orgConfig.mspId}...`);
  
  const enrollment = await ca.enroll({
    enrollmentID: orgConfig.caAdmin,
    enrollmentSecret: orgConfig.caAdminPw
  });

  const identity = {
    credentials: {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes()
    },
    mspId: orgConfig.mspId,
    type: 'X.509'
  };

  await wallet.put(caAdminName, identity);
  console.log(`✓ CA Admin enrolled and stored as '${caAdminName}'`);
  
  return identity;
}

/**
 * Register and Enroll Admin User
 */
async function setupAdminUser(ca, orgConfig, adminConfig, wallet) {
  const { username, password } = adminConfig;
  
  // Kiểm tra xem admin đã tồn tại chưa trong database
  const checkQuery = 'SELECT id, enrolled FROM users WHERE username = $1';
  const existingUser = await dbQuery(checkQuery, [username]);
  
  const existingIdentity = await wallet.get(username);
  if (existingIdentity && existingUser.rows.length > 0 && existingUser.rows[0].enrolled) {
    console.log(`✓ Admin '${username}' already exists`);
    return { success: true, message: 'Admin already exists' };
  }

  console.log(`\n=== Setting up Admin: ${username} for ${orgConfig.mspId} ===`);

  // Get CA Admin identity
  const caAdminName = `caadmin-${orgConfig.mspId.toLowerCase()}`;
  const caAdminIdentity = await wallet.get(caAdminName);
  
  if (!caAdminIdentity) {
    throw new Error(`CA Admin identity '${caAdminName}' not found. Please enroll CA admin first.`);
  }

  // Create admin user context
  const provider = wallet.getProviderRegistry().getProvider(caAdminIdentity.type);
  const caAdminUser = await provider.getUserContext(caAdminIdentity, caAdminName);

  // Step 1: Register admin với CA
  console.log(`1. Registering ${username} with Fabric CA...`);
  
  let enrollmentSecret;
  try {
    enrollmentSecret = await ca.register({
      enrollmentID: username,
      enrollmentSecret: password, // Dùng password làm enrollment secret
      role: 'admin', // Type = admin
      affiliation: orgConfig.affiliation,
      maxEnrollments: -1, // Unlimited enrollments
      attrs: [
        { name: 'hf.Registrar.Roles', value: 'client,admin', ecert: true },
        { name: 'hf.Registrar.Attributes', value: '*', ecert: true },
        { name: 'hf.Revoker', value: 'true', ecert: true },
        { name: 'hf.GenCRL', value: 'true', ecert: true },
        { name: 'admin', value: 'true', ecert: true },
        { name: 'role', value: 'admin', ecert: true }
      ]
    }, caAdminUser);
    
    console.log(`   ✓ Registered with secret: ${enrollmentSecret.substring(0, 8)}...`);
  } catch (error) {
    if (error.message.includes('is already registered')) {
      console.log(`   ⚠ Already registered, using provided password`);
      enrollmentSecret = password;
    } else {
      throw error;
    }
  }

  // Step 2: Enroll admin để lấy certificate với OU=admin
  console.log(`2. Enrolling ${username} to get X.509 certificate with OU=admin...`);
  
  const enrollment = await ca.enroll({
    enrollmentID: username,
    enrollmentSecret: enrollmentSecret,
    attr_reqs: [
      { name: 'role', optional: false },
      { name: 'admin', optional: false }
    ]
  });

  console.log(`   ✓ Enrolled successfully`);

  // Step 3: Lưu identity vào wallet
  console.log(`3. Storing identity in wallet...`);
  
  const identity = {
    credentials: {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes()
    },
    mspId: orgConfig.mspId,
    type: 'X.509'
  };

  await wallet.put(username, identity);
  console.log(`   ✓ Identity stored in wallet`);

  // Step 4: Lưu user record vào database
  console.log(`4. Saving user record to database...`);
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Save user to database
  await saveUserToDatabase(username, passwordHash, 'admin', orgConfig.mspId, true);
  
  // Save identity to database
  await saveIdentityToDatabase(
    username,
    orgConfig.mspId,
    'admin',
    enrollment.certificate,
    enrollment.key.toBytes()
  );

  // Print certificate info
  console.log(`\n=== Admin Certificate Info ===`);
  console.log(`Username: ${username}`);
  console.log(`MSP ID: ${orgConfig.mspId}`);
  console.log(`Role: admin`);
  
  // Extract OU from certificate
  const certLines = enrollment.certificate.split('\n');
  for (const line of certLines) {
    if (line.includes('Subject:') || line.includes('OU=')) {
      console.log(`Certificate: ${line.trim()}`);
    }
  }

  return {
    success: true,
    username,
    mspId: orgConfig.mspId,
    message: `Admin '${username}' created successfully`
  };
}

/**
 * Main function
 */
async function main() {
  const org = process.argv[2] || 'org1';
  
  if (!['org1', 'org2'].includes(org)) {
    console.error('Invalid organization. Use: org1 or org2');
    process.exit(1);
  }

  const orgConfig = ORG_CONFIG[org];
  const adminConfig = ADMIN_CONFIG[org];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SETUP ADMIN FOR ${orgConfig.mspId}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nCA URL: ${orgConfig.caUrl}`);
  console.log(`Admin Username: ${adminConfig.username}`);
  console.log(`MSP ID: ${orgConfig.mspId}\n`);

  try {
    // Check database connection
    console.log('Connecting to database...');
    try {
      const result = await dbQuery('SELECT NOW() as now');
      console.log('Database connection successful:', result.rows[0].now);
    } catch (dbError) {
      throw new Error(`Cannot connect to database: ${dbError.message}`);
    }

    // Initialize CA client
    const ca = new FabricCAServices(
      orgConfig.caUrl,
      { trustedRoots: [], verify: false },
      orgConfig.caName
    );

    // Initialize wallet
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

    // Step 1: Enroll CA admin
    await enrollCAAdmin(ca, orgConfig, wallet);

    // Step 2: Setup admin user
    const result = await setupAdminUser(ca, orgConfig, adminConfig, wallet);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  SETUP COMPLETE`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n✓ Admin account created successfully!`);
    console.log(`\nCredentials:`);
    console.log(`  Username: ${adminConfig.username}`);
    console.log(`  Password: ${adminConfig.password}`);
    console.log(`  Organization: ${orgConfig.mspId}`);
    console.log(`\nYou can now login with these credentials on the web.`);
    console.log(`\nNote: Admin can register new students via POST /api/auth/register`);

    // Close script's database connection (separate pool, not shared with main app)
    await closeScriptPool();

  } catch (error) {
    console.error(`\n✗ Setup failed: ${error.message}`);
    console.error(error);
    await closeScriptPool();
    process.exit(1);
  }
}

main();
