# Hyperledger Fabric Degree Management System - Backend API

[![Node.js](https://img.shields.io/badge/Node.js-18.0%2B-green.svg)](https://nodejs.org/)
[![Hyperledger Fabric](https://img.shields.io/badge/Fabric-2.5%2B%20%7C%203.x-blue.svg)](https://www.hyperledger.org/use/fabric)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue.svg)](https://www.postgresql.org/)

Backend API Server cho hệ thống cấp bằng số và hồ sơ sinh viên sử dụng Hyperledger Fabric blockchain và Neon PostgreSQL cloud database.

## 📋 Mục Lục

- [Kiến Trúc](#-kiến-trúc)
- [Công Nghệ](#-công-nghệ)
- [Yêu Cầu Hệ Thống](#-yêu-cầu-hệ-thống)
- [Cài Đặt](#-cài-đặt)
- [Cấu Hình](#-cấu-hình)
- [Sử Dụng](#-sử-dụng)
- [API Documentation](#-api-documentation)
- [Database](#-database)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🏗️ Kiến Trúc

### System Architecture

```
┌─────────────┐
│   Frontend  │
│  (React.js) │
└──────┬──────┘
       │ HTTPS/REST
       ▼
┌──────────────────────────────────────┐
│       Backend API Server             │
│  ┌────────────┐    ┌──────────────┐ │
│  │  Express   │    │  PostgreSQL  │ │
│  │   Routes   │◄──►│   (Neon)     │ │
│  └─────┬──────┘    └──────────────┘ │
│        │                             │
│  ┌─────▼──────┐                     │
│  │  Fabric    │                     │
│  │  Gateway   │                     │
│  │  (gRPC)    │                     │
│  └─────┬──────┘                     │
└────────┼─────────────────────────────┘
         │ TLS/gRPC
         ▼
┌─────────────────────────────────────┐
│   Hyperledger Fabric Network        │
│  ┌────────┐  ┌────────┐  ┌────────┐│
│  │ Peer 0 │  │ Peer 1 │  │Orderer ││
│  └───┬────┘  └───┬────┘  └───┬────┘│
│      │           │            │     │
│  ┌───▼───────────▼────────────▼───┐│
│  │    DegreeContract Chaincode    ││
│  │  ┌──────────┐  ┌─────────────┐ ││
│  │  │  Public  │  │   Private   │ ││
│  │  │  Ledger  │  │ Data (PDC)  │ ││
│  │  └──────────┘  └─────────────┘ ││
│  └────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Technology Stack

```
Backend API
├── Express.js (Web Framework)
├── Node.js 18+ (Runtime)
├── PostgreSQL 17 (Database - Neon Cloud)
└── Hyperledger Fabric SDK
    ├── @hyperledger/fabric-gateway
    ├── fabric-ca-client
    └── @grpc/grpc-js

Security
├── JWT (Authentication)
├── bcrypt.js (Password Hashing)
├── X.509 Certificates (Fabric Identity)
└── TLS/SSL (Transport Security)

Database
├── pg (PostgreSQL Driver)
└── Neon PostgreSQL (Cloud Database)
```

### Directory Structure

```
BackEnd_BlockChain/
├── src/
│   ├── app.js                      # Main application entry
│   ├── config/
│   │   ├── auth-config.js          # Auth configuration
│   │   ├── database-config.js      # Database config (Neon)
│   │   └── fabric-config.js        # Fabric network config
│   ├── database/
│   │   └── db.js                   # PostgreSQL connection pool
│   ├── fabric/
│   │   └── gateway-connection.js   # Fabric Gateway manager
│   ├── middleware/
│   │   ├── auth-middleware.js      # JWT authentication
│   │   └── error-handler.js        # Global error handler
│   ├── routes/
│   │   ├── api-routes.js           # Degree & transcript routes
│   │   └── auth-routes.js          # Auth routes
│   └── services/
│       ├── auth-service.js         # Authentication logic
│       ├── degree-service.js       # Degree operations
│       ├── transcript-service.js   # Transcript operations
│       ├── user-store.js           # User data (PostgreSQL)
│       └── wallet-manager.js       # Identity management (PostgreSQL)
├── chaincode/
│   ├── lib/
│   │   └── degree-contract.js      # Smart contract
│   ├── collections_config.json     # Private data config
│   ├── index.js
│   └── package.json
├── database/
│   ├── schema.sql                  # PostgreSQL schema
│   ├── migrate.js                  # Migration script
│   ├── test-connection.js          # Test utility
│   ├── README.md                   # Database documentation
│   ├── NEON_SETUP.md              # Neon setup guide
│   └── NEON_MIGRATION_COMPLETE.md # Migration summary
├── Document/                       # Additional documentation
├── tests/                          # Unit & integration tests
├── .env                            # Environment variables
├── package.json
└── README.md
```

## 🔧 Công Nghệ

### Backend

- **Node.js** 18+ - JavaScript runtime
- **Express.js** 4.x - Web framework
- **@hyperledger/fabric-gateway** 1.5+ - Fabric SDK
- **fabric-ca-client** 2.2+ - Fabric CA client
- **jsonwebtoken** - JWT authentication
- **bcryptjs** - Password hashing
- **pg** - PostgreSQL driver
- **cors** - CORS middleware
- **dotenv** - Environment configuration

### Database

- **PostgreSQL** 17 - Relational database
- **Neon** - Serverless PostgreSQL (Cloud)
- Connection pooling
- JSONB support for flexible data

### Blockchain

- **Hyperledger Fabric** 2.5+ / 3.x
- **CouchDB** - State database
- **Fabric CA** - Certificate authority
- **Private Data Collections** - Private data storage

### Security

- **TLS/SSL** - Transport layer security
- **X.509** - Certificate-based authentication
- **JWT** - Stateless authentication
- **bcrypt** - Password hashing (10 rounds)

## 📦 Yêu Cầu Hệ Thống

### Software Requirements

- **Node.js**: v18.0.0 hoặc cao hơn
- **npm**: v8.0.0 hoặc cao hơn
- **PostgreSQL**: v17 (hoặc Neon account)
- **Git**: Latest version

### Hyperledger Fabric Network

- **Fabric**: v2.5.0+ hoặc v3.x (recommended)
- **Fabric CA**: Running and accessible
- **Channel**: Created (default: `mychannel`)
- **Chaincode**: Deployed (name: `degree-cc`)
- **Peer**: With Gateway service enabled

### Neon PostgreSQL

- Account tại [neon.tech](https://neon.tech)
- Database đã tạo
- Connection string

## 🚀 Cài Đặt

### 1. Clone Repository

```bash
git clone <repository-url>
cd BackEnd_BlockChain
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Tạo file `.env` từ template:

```bash
cp .env.example .env
```

Cập nhật thông tin trong `.env`:

```env
# Fabric Network Configuration
PEER_ENDPOINT=localhost:7051
MSP_ID=Org1MSP
CHANNEL_NAME=mychannel
CHAINCODE_NAME=degree-cc

# Certificate Paths (WSL paths)
CERT_PATH=/home/user/fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/cert.pem
KEY_PATH=/home/user/fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/priv_sk
TLS_CERT_PATH=/home/user/fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt

# Server Configuration
PORT=3000
NODE_ENV=development

# Authentication
JWT_SECRET=your_jwt_secret_here_change_in_production

# PostgreSQL Database (Neon Cloud)
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
DB_SSL=true
DB_POOL_MAX=20
DB_POOL_MIN=2
```

### 4. Setup Database

#### Option A: Neon PostgreSQL (Recommended)

```bash
# Test connection
npm run db:test

# Initialize schema
npm run db:schema

# Migrate existing data (if any)
npm run db:migrate
```

#### Option B: Local PostgreSQL

```bash
# Create database
psql -U postgres -c "CREATE DATABASE degree_system;"

# Initialize schema
npm run db:schema
```

📖 **Chi tiết**: [database/NEON_SETUP.md](database/NEON_SETUP.md)

### 5. Setup Fabric Network

Nếu chưa có Fabric network:

```bash
# Using Fabric test-network
cd /path/to/fabric-samples/test-network

# Start network
./network.sh down
./network.sh up createChannel -c mychannel -ca -s couchdb

# Deploy chaincode
./network.sh deployCC \
  -ccn degree-cc \
  -ccp /path/to/BackEnd_BlockChain/chaincode/ \
  -ccl javascript \
  -c mychannel \
  -ccv 1.0 \
  -ccs 1 \
  -cccg /path/to/BackEnd_BlockChain/chaincode/collections_config.json
```

📖 **Chi tiết**: [Document/HUONG_DAN_CAI_DAT_FABRIC.md](Document/HUONG_DAN_CAI_DAT_FABRIC.md)

### 6. Enroll Admin

```bash
# Enroll admin user from Fabric CA
node enroll-admin.js
```

### 7. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

Server sẽ chạy tại: `http://localhost:3000`

## ⚙️ Cấu Hình

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 3000 | No |
| `NODE_ENV` | Environment | development | No |
| `PEER_ENDPOINT` | Fabric peer address | localhost:7051 | Yes |
| `MSP_ID` | Organization MSP ID | Org1MSP | Yes |
| `CHANNEL_NAME` | Fabric channel | mychannel | Yes |
| `CHAINCODE_NAME` | Chaincode name | degree-cc | Yes |
| `CERT_PATH` | Admin certificate path | - | Yes |
| `KEY_PATH` | Admin private key path | - | Yes |
| `TLS_CERT_PATH` | TLS certificate path | - | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `DB_SSL` | Enable SSL for database | true | No |
| `DB_POOL_MAX` | Max database connections | 20 | No |

### Database Configuration

File: `src/config/database-config.js`

```javascript
module.exports = {
  postgres: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    pool: {
      max: 20,
      min: 2,
      idle: 10000
    }
  }
};
```

### Fabric Configuration

File: `src/config/fabric-config.js`

```javascript
module.exports = {
  PEER_ENDPOINT: process.env.PEER_ENDPOINT,
  MSP_ID: process.env.MSP_ID,
  CHANNEL_NAME: process.env.CHANNEL_NAME,
  CHAINCODE_NAME: process.env.CHAINCODE_NAME
};
```

## 📖 Sử Dụng

### Start Development Server

```bash
npm run dev
```

### Test API Health

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-06T13:50:00.000Z",
  "service": "Hyperledger Fabric Backend API",
  "fabric": {
    "connected": true,
    "channel": "mychannel",
    "chaincode": "degree-cc"
  }
}
```

### Test Database Connection

```bash
npm run db:test
```

## 🔌 API Documentation

Base URL: `http://localhost:3000/api`

### Authentication Endpoints

#### POST `/api/auth/register`

Đăng ký user mới.

**Request:**
```json
{
  "username": "CT070211",
  "password": "password123",
  "role": "student"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "username": "CT070211"
}
```

#### POST `/api/auth/enroll`

Enroll user vào Fabric network.

**Request:**
```json
{
  "username": "CT070211",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User enrolled successfully",
  "certificate": "-----BEGIN CERTIFICATE-----\n..."
}
```

#### POST `/api/auth/login`

Đăng nhập và nhận JWT token.

**Request:**
```json
{
  "username": "CT070211",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "CT070211",
    "role": "student"
  }
}
```

### Degree Endpoints

#### POST `/api/degree/issue`

Cấp bằng số mới (requires authentication).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request:**
```json
{
  "degreeId": "DEG001",
  "studentName": "Nguyen Van A",
  "university": "Can Tho University",
  "degreeType": "Bachelor",
  "issueDate": "2026-01-06"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "abc123...",
  "degree": {
    "degreeId": "DEG001",
    "studentName": "Nguyen Van A",
    "university": "Can Tho University",
    "degreeType": "Bachelor",
    "issueDate": "2026-01-06"
  }
}
```

#### GET `/api/degree/verify/:degreeId`

Xác thực và tra cứu bằng cấp (public, no auth required).

**Response:**
```json
{
  "success": true,
  "degree": {
    "degreeId": "DEG001",
    "studentName": "Nguyen Van A",
    "university": "Can Tho University",
    "degreeType": "Bachelor",
    "issueDate": "2026-01-06",
    "issuedBy": "admin",
    "timestamp": "2026-01-06T13:50:00.000Z"
  }
}
```

### Transcript Endpoints

#### POST `/api/transcript/add`

Thêm/cập nhật bảng điểm (requires authentication).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request:**
```json
{
  "studentId": "CT070211",
  "gpa": "3.5",
  "detailedGrades": {
    "Math": "9",
    "Physics": "8",
    "Chemistry": "8.5"
  },
  "personalInfo": {
    "university": "Can Tho University",
    "major": "Computer Science",
    "dateOfBirth": "2000-01-01",
    "gender": "Male"
  }
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "xyz789...",
  "message": "Transcript added successfully"
}
```

#### GET `/api/transcript/:studentId`

Tra cứu bảng điểm (requires authentication & authorization).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "transcript": {
    "studentId": "CT070211",
    "gpa": "3.5",
    "detailedGrades": {
      "Math": "9",
      "Physics": "8",
      "Chemistry": "8.5"
    },
    "personalInfo": {
      "university": "Can Tho University",
      "major": "Computer Science",
      "dateOfBirth": "2000-01-01",
      "gender": "Male"
    }
  }
}
```

📖 **Full API Documentation**: [Document/API_DOCUMENTATION.md](Document/API_DOCUMENTATION.md)

## 💾 Database

### Schema

#### Table: `users`

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    student_id VARCHAR(100),
    enrollment_secret VARCHAR(255),
    enrolled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enrolled_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Table: `identities`

```sql
CREATE TABLE identities (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) DEFAULT 'X.509',
    msp_id VARCHAR(100) NOT NULL,
    ou VARCHAR(100),
    certificate TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);
```

#### Table: `correction_requests`

```sql
CREATE TABLE correction_requests (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(100) NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    requested_data JSONB NOT NULL,
    reason TEXT,
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES users(username) ON DELETE CASCADE
);
```

### Database Operations

```bash
# Test connection
npm run db:test

# Initialize schema
npm run db:schema

# Run migration
npm run db:migrate
```

### Neon Console

Access database dashboard:
- URL: https://console.neon.tech
- Monitor queries, connections, and performance

📖 **Database Guide**: [database/README.md](database/README.md)

## 🧪 Testing

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Test Files

```
tests/
├── api-routes.test.js
├── auth-middleware.test.js
├── auth-routes.test.js
├── auth-service.test.js
├── degree-service.test.js
├── error-handler.test.js
├── gateway-connection.test.js
├── transcript-service.test.js
└── wallet-manager.test.js
```

### Manual Testing

Sử dụng Postman collection:
- Import: `Hyperledger_Fabric_Degree_API.postman_collection.json`
- Environment: `Hyperledger_Fabric_Local.postman_environment.json`

📖 **Testing Guide**: [Document/POSTMAN_TEST_GUIDE.md](Document/POSTMAN_TEST_GUIDE.md)

## 🚢 Deployment

### Production Checklist

- [ ] Update `.env` với production values
- [ ] Set `NODE_ENV=production`
- [ ] Change `JWT_SECRET` to strong secret
- [ ] Configure production database (Neon)
- [ ] Enable SSL/TLS for all connections
- [ ] Setup reverse proxy (nginx)
- [ ] Configure firewall rules
- [ ] Setup monitoring & logging
- [ ] Implement backup strategy
- [ ] Configure CORS for production domains

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]
```

```bash
# Build
docker build -t fabric-backend .

# Run
docker run -p 3000:3000 --env-file .env fabric-backend
```

### Environment Variables (Production)

```env
NODE_ENV=production
PORT=3000

# Use production Fabric network endpoints
PEER_ENDPOINT=peer.production.com:7051

# Use production database
DATABASE_URL=postgresql://user:pass@prod.neon.tech/db?sslmode=require

# Strong secrets
JWT_SECRET=<generate-strong-secret>

# Enable security features
DB_SSL=true
CORS_ORIGIN=https://yourdomain.com
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Database Connection Failed

**Error:** `Failed to connect to PostgreSQL database`

**Solution:**
```bash
# Check DATABASE_URL in .env
# Test connection
npm run db:test

# Verify Neon database is active
# Check firewall/network settings
```

#### 2. Fabric Gateway Connection Error

**Error:** `Failed to connect to Fabric Gateway`

**Solution:**
- Verify Fabric network is running
- Check PEER_ENDPOINT in `.env`
- Verify TLS certificates are valid
- Check certificate paths (WSL vs Windows)

#### 3. JWT Token Invalid

**Error:** `Invalid token`

**Solution:**
- Login again to get new token
- Check JWT_SECRET matches
- Verify token format in Authorization header

#### 4. Chaincode Error

**Error:** `Chaincode function not found`

**Solution:**
- Verify chaincode is deployed: `peer lifecycle chaincode querycommitted`
- Check function name spelling
- Redeploy chaincode if needed

### Debug Mode

Enable detailed logging:

```env
LOG_LEVEL=debug
LOG_QUERIES=true
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Write tests for new features
- Update documentation
- Use meaningful commit messages

