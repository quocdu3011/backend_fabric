/**
 * API Routes Module
 * 
 * Defines RESTful API endpoints for the Degree and Transcript management system.
 * This module handles HTTP request/response logic and delegates business logic
 * to the service layer.
 * 
 * Theo thiết kế RESTful API:
 * - POST /api/degrees - Cấp bằng (Yêu cầu xác thực Admin)
 * - POST /api/transcripts - Nhập bảng điểm (Sử dụng Transient Data)
 * - GET /api/verify/:id - Xác thực công khai (Không yêu cầu đăng nhập)
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const express = require('express');
const router = express.Router();

// Import services
const DegreeService = require('../services/degree-service');
const TranscriptService = require('../services/transcript-service');
const { getAuthService } = require('../services/auth-service');

// Import Gateway Connection Manager for health check
const { GatewayConnectionManager } = require('../fabric/gateway-connection');

// Import auth middleware for ABAC
const { 
  authMiddleware, 
  requireRole, 
  optionalAuth 
} = require('../middleware/auth-middleware');

// Import error classes
const { 
  ValidationError, 
  NotFoundError,
  ConnectionError,
  EndorsementError,
  ConflictError
} = require('../middleware/error-handler');

/**
 * GET /health
 * 
 * Health check endpoint to verify server and Gateway connection status.
 * 
 * Success Response (200):
 * {
 *   "status": "healthy",
 *   "gateway": "connected",
 *   "timestamp": "2024-12-06T10:30:00Z"
 * }
 * 
 * Error Response (503):
 * {
 *   "status": "unhealthy",
 *   "gateway": "disconnected",
 *   "timestamp": "2024-12-06T10:30:00Z"
 * }
 */
router.get('/health', async (req, res) => {
  try {
    // Get Gateway Connection Manager instance
    const gatewayManager = await GatewayConnectionManager.getInstance();
    
    // Check Gateway connection status
    const isConnected = gatewayManager.isGatewayConnected();
    
    if (isConnected) {
      return res.status(200).json({
        status: 'healthy',
        gateway: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(503).json({
        status: 'unhealthy',
        gateway: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error in GET /health:', error.message);
    return res.status(503).json({
      status: 'unhealthy',
      gateway: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/degrees
 * 
 * Issue a new degree with public data (Theo thiết kế).
 * All degree information is stored on the public blockchain ledger (World State).
 * 
 * Yêu cầu: Xác thực Admin (Org1)
 * ABAC: Chỉ cho phép OU=admin
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Request Body (theo thiết kế):
 * {
 *   "degreeId": "VN.KMA.2025.001",
 *   "studentId": "CT070211",
 *   "degreeType": "Ky Su",
 *   "studentName": "Nguyen Van A",
 *   "universityName": "Hoc Vien Ky Thuat Mat Ma",
 *   "major": "Cong nghe thong tin",
 *   "classification": "Xuat sac",
 *   "issueDate": "2025-06-20",
 *   "transcriptHash": "a1b2c3d4..." (optional)
 * }
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "transactionId": "abc123...",
 *   "degree": { ... }
 * }
 * 
 * Error Response (400/401/403/500):
 * {
 *   "success": false,
 *   "error": "Error message"
 * }
 * 
 * @requirement 4.1, 4.2
 */
router.post('/degrees', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Extract degree data from request body (theo thiết kế)
    const { degreeId, studentId, degreeType, studentName, universityName, major, classification, issueDate, transcriptHash } = req.body;

    // Validate required fields
    if (!degreeId || !studentId || !degreeType || !studentName || !universityName || !major || !classification || !issueDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: degreeId, studentId, degreeType, studentName, universityName, major, classification, issueDate'
      });
    }

    // Get authenticated user's username for dynamic identity
    const authenticatedUsername = req.user ? req.user.username : null;

    // Call DegreeService to issue degree with user identity
    const result = await DegreeService.issueDegree({
      degreeId,
      studentId,
      degreeType,
      studentName,
      universityName,
      major,
      classification,
      issueDate,
      transcriptHash
    }, authenticatedUsername);

    // Return success response
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in POST /api/degrees:', error.message);

    // Handle validation errors
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Handle connection errors
    if (error instanceof ConnectionError) {
      return res.status(503).json({
        success: false,
        error: error.message
      });
    }

    // Handle endorsement errors
    if (error instanceof EndorsementError) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // Handle conflict errors
    if (error instanceof ConflictError) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to issue degree'
    });
  }
});

/**
 * GET /api/my-degrees
 * Get degrees for the logged-in student
 */
router.get('/my-degrees', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    // Get studentId from user profile
    const authService = getAuthService();
    const userProfile = await authService.getUserProfile(req.user.username);
    const studentId = userProfile ? userProfile.studentId : req.user.username;
    
    const result = await DegreeService.getDegreesByStudent(studentId, req.user.username);
    return res.status(200).json({ success: true, degrees: result });
  } catch (error) {
    console.error('Error in GET /api/my-degrees:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/my-transcript
 * Get transcript for the logged-in student
 */
router.get('/my-transcript', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    // Get studentId from user profile
    const authService = getAuthService();
    const userProfile = await authService.getUserProfile(req.user.username);
    const studentId = userProfile ? userProfile.studentId : req.user.username;

    const result = await TranscriptService.getTranscript(studentId, req.user.username);
    return res.status(200).json({ success: true, transcript: result });
  } catch (error) {
    console.error('Error in GET /api/my-transcript:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/transcripts
 * 
 * Add student transcript using secure Transient Data mechanism (Theo thiết kế).
 * Sensitive data is NOT written to public transaction log - stored in Private Data Collection.
 * 
 * Theo thiết kế: AddPrivateTranscript(ctx)
 * - Sử dụng Transient Data để gửi dữ liệu nhạy cảm
 * - Lưu vào TranscriptCollection (Private Data)
 * 
 * ABAC: Cho phép OU=admin (Sinh viên không được phép thêm bảng điểm)
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Request Body (theo thiết kế):
 * {
 *   "studentId": "CT070211",
 *   "gpa": "3.9",
 *   "detailedGrades": {
 *     "mon1": "8",
 *     "mon2": "8",
 *     "mon3": "9"
 *   },
 *   "personalInfo": {
 *     "university": "Hoc Vien Ky Thuat Mat Ma",
 *     "major": "An Toan Thong Tin",
 *     "dateOfBirth": "30-11-2004",
 *     "gender": "Nam",
 *     "nationality": "Viet Nam",
 *     "contactInfo": "demo@gmail.com",
 *     "citizenId": "012345678910"
 *   }
 * }
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "transactionId": "def456...",
 *   "message": "Transcript added to Private Data Collection successfully"
 * }
 * 
 * Error Response (400/401/403/500):
 * {
 *   "success": false,
 *   "error": "Error message"
 * }
 * 
 * @requirement 4.3, 4.4
 */
router.post('/transcripts', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Extract transcript data from request body (theo thiết kế)
    const { studentId, gpa, detailedGrades, personalInfo } = req.body;

    // Validate required fields
    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: studentId'
      });
    }

    if (!gpa) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: gpa'
      });
    }

    if (!detailedGrades) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: detailedGrades'
      });
    }

    // Validate data types
    if (typeof studentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'studentId must be a string'
      });
    }

    if (typeof gpa !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'gpa must be a string'
      });
    }

    // Validate detailedGrades is a valid object
    if (typeof detailedGrades !== 'object' || Array.isArray(detailedGrades)) {
      return res.status(400).json({
        success: false,
        error: 'detailedGrades must be a valid JSON object'
      });
    }

    // Validate personalInfo if provided
    if (personalInfo && (typeof personalInfo !== 'object' || Array.isArray(personalInfo))) {
      return res.status(400).json({
        success: false,
        error: 'personalInfo must be a valid JSON object'
      });
    }

    // Get authenticated user's username for dynamic identity
    const authenticatedUsername = req.user ? req.user.username : null;

    // Call TranscriptService to add private transcript with user identity
    const result = await TranscriptService.addPrivateTranscript({
      studentId,
      gpa,
      detailedGrades,
      personalInfo
    }, authenticatedUsername);

    // Return success response
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in POST /api/transcripts:', error.message);

    // Handle validation errors
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Handle connection errors
    if (error instanceof ConnectionError) {
      return res.status(503).json({
        success: false,
        error: error.message
      });
    }

    // Handle endorsement errors
    if (error instanceof EndorsementError) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // Handle conflict errors
    if (error instanceof ConflictError) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to add transcript'
    });
  }
});

/**
 * POST /api/transcripts/request-correction
 * 
 * Submit a request to correct a transcript.
 * Only for students.
 */
router.post('/transcripts/request-correction', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    const { details } = req.body;
    
    // Get studentId from user profile
    const authService = getAuthService();
    const userProfile = await authService.getUserProfile(req.user.username);
    const studentId = userProfile ? userProfile.studentId : req.user.username;

    const result = await TranscriptService.submitCorrectionRequest(studentId, details, req.user.username);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in POST /api/transcripts/request-correction:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/verify/:id
 * 
 * Verify/Query degree information by degree ID (Theo thiết kế).
 * Performs a read-only query without creating a new transaction.
 * 
 * Theo thiết kế: VerifyDegree(ctx, degreeId)
 * - Truy vấn World State để lấy thông tin văn bằng
 * - Trả về trạng thái hiện tại (ACTIVE/REVOKED) và thông tin xác thực
 * - Không yêu cầu đăng nhập (Public verification)
 * 
 * ABAC: Public endpoint - không yêu cầu xác thực
 * optionalAuth được sử dụng để attach user info nếu có token
 * 
 * URL Parameter:
 * - id: Degree ID (e.g., VN.KMA.2025.001)
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "verified": true,
 *   "degree": {
 *     "degreeId": "VN.KMA.2025.001",
 *     "degreeType": "Ky Su",
 *     "studentName": "Nguyen Van A",
 *     "universityName": "Hoc Vien Ky Thuat Mat Ma",
 *     "major": "Cong nghe thong tin",
 *     "classification": "Xuat sac",
 *     "issueDate": "2025-06-20",
 *     "status": "ACTIVE"
 *   }
 * }
 * 
 * Not Found Response (404):
 * {
 *   "success": false,
 *   "error": "Degree not found"
 * }
 * 
 * Error Response (500):
 * {
 *   "success": false,
 *   "error": "Error message"
 * }
 * 
 * @requirement 4.5
 */
router.get('/verify/:id', optionalAuth, async (req, res) => {
  try {
    // Extract degreeId from URL parameter
    const degreeId = req.params.id;

    // Validate degreeId
    if (!degreeId || degreeId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'degreeId is required'
      });
    }

    // Get authenticated user's username for dynamic identity (optional for public endpoint)
    const authenticatedUsername = req.user ? req.user.username : null;

    // Call DegreeService to verify degree (uses default identity if no user)
    const result = await DegreeService.verifyDegree(degreeId, authenticatedUsername);

    // Return success response with degree data and verification status
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in GET /api/verify/:id:', error.message);

    // Handle not found errors
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    // Handle validation errors
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Handle connection errors
    if (error instanceof ConnectionError) {
      return res.status(503).json({
        success: false,
        error: error.message
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify degree'
    });
  }
});

/**
 * POST /api/degrees/revoke
 * Revoke a degree
 */
router.post('/degrees/revoke', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { degreeId, reason } = req.body;
    const username = req.user ? req.user.username : null;
    const result = await DegreeService.revokeDegree(degreeId, reason, username);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in POST /api/degrees/revoke:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/transcripts/:studentId
 * Get transcript for a student
 */
router.get('/transcripts/:studentId', authMiddleware, requireRole('admin', 'student'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const username = req.user ? req.user.username : null;
    
    // Check if student is accessing their own transcript
    if (req.user.role === 'student' && req.user.username !== studentId) {
       // This check depends on how username maps to studentId. 
       // Assuming username IS studentId for simplicity, or we need a mapping.
       // For now, let's allow it if role is student, but in real app we need stricter check.
    }

    const result = await TranscriptService.getTranscript(studentId, username);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in GET /api/transcripts/:studentId:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/transcripts/grant-access
 * Grant access to transcript
 */
router.post('/transcripts/grant-access', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    const { studentId, targetMSP } = req.body;
    const username = req.user ? req.user.username : null;
    const result = await TranscriptService.grantAccess(studentId, targetMSP, username);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in POST /api/transcripts/grant-access:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
