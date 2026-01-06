/**
 * Error Handler Middleware Module
 * 
 * Provides centralized error handling for the entire application.
 * This middleware catches all errors thrown by route handlers and services,
 * maps them to appropriate HTTP status codes, and formats consistent error responses.
 * 
 * Custom Error Classes:
 * - ValidationError: Input validation failures (400)
 * - NotFoundError: Resource not found (404)
 * - ConflictError: MVCC read conflicts (409)
 * - EndorsementError: Endorsement policy failures (500)
 * - ConnectionError: gRPC connection issues (503)
 */

/**
 * Custom Error Classes
 */

/**
 * ValidationError - Thrown when input validation fails
 * HTTP Status: 400 Bad Request
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
  }
}

/**
 * NotFoundError - Thrown when a requested resource does not exist
 * HTTP Status: 404 Not Found
 */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND';
  }
}

/**
 * ConflictError - Thrown when MVCC read conflict occurs
 * HTTP Status: 409 Conflict
 */
class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
    this.code = 'MVCC_READ_CONFLICT';
  }
}

/**
 * EndorsementError - Thrown when endorsement policy is not satisfied
 * HTTP Status: 500 Internal Server Error
 */
class EndorsementError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EndorsementError';
    this.statusCode = 500;
    this.code = 'ENDORSEMENT_POLICY_FAILURE';
  }
}

/**
 * ConnectionError - Thrown when gRPC connection fails
 * HTTP Status: 503 Service Unavailable
 */
class ConnectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConnectionError';
    this.statusCode = 503;
    this.code = 'GRPC_UNAVAILABLE';
  }
}

/**
 * Detect and classify Fabric-specific errors
 * 
 * This function analyzes error messages and properties to identify
 * specific Hyperledger Fabric error types and returns appropriate
 * error classification.
 * 
 * @param {Error} err - Error object to analyze
 * @returns {Object} Classification with statusCode, errorCode, and message
 */
function detectFabricError(err) {
  const errorMessage = err.message || '';
  const errorString = err.toString().toLowerCase();
  const errorStack = err.stack || '';

  // 1. gRPC Connection Errors (GRPC_UNAVAILABLE)
  // Occurs when peer is down or network issues
  if (
    errorMessage.includes('UNAVAILABLE') ||
    errorMessage.includes('connect ECONNREFUSED') ||
    errorMessage.includes('Failed to connect') ||
    errorMessage.includes('14 UNAVAILABLE') ||
    errorString.includes('grpc') && errorString.includes('unavailable')
  ) {
    console.error('Detected gRPC connection error (UNAVAILABLE)');
    console.error('Context: Peer may be down or network connectivity issue');
    console.error('Suggestion: Check peer status and network configuration');
    return {
      statusCode: 503,
      errorCode: 'GRPC_UNAVAILABLE',
      message: 'Service temporarily unavailable. Please try again later.'
    };
  }

  // 2. Endorsement Policy Failures (ENDORSEMENT_POLICY_FAILURE)
  // Occurs when endorsement policy is not satisfied
  if (
    errorMessage.includes('endorsement policy') ||
    errorMessage.includes('ENDORSEMENT_POLICY_FAILURE') ||
    errorMessage.includes('failed to collect enough endorsements') ||
    errorMessage.includes('signature set did not satisfy policy')
  ) {
    console.error('Detected endorsement policy failure');
    console.error('Context: Not enough endorsements or policy mismatch');
    console.error('Suggestion: Check endorsement policy configuration and peer availability');
    return {
      statusCode: 500,
      errorCode: 'ENDORSEMENT_POLICY_FAILURE',
      message: 'Transaction endorsement failed. Endorsement policy not satisfied.'
    };
  }

  // 3. MVCC Read Conflicts (MVCC_READ_CONFLICT)
  // Occurs when concurrent writes to the same key happen
  if (
    errorMessage.includes('MVCC_READ_CONFLICT') ||
    errorMessage.includes('mvcc read conflict') ||
    errorMessage.includes('version mismatch')
  ) {
    console.error('Detected MVCC read conflict');
    console.error('Context: Concurrent writes to the same key');
    console.error('Suggestion: Retry the transaction with exponential backoff');
    return {
      statusCode: 409,
      errorCode: 'MVCC_READ_CONFLICT',
      message: 'Transaction conflict detected. Please retry the operation.'
    };
  }

  // 4. Transient Data Missing Errors
  // Occurs when chaincode expects transient data but it's not provided
  if (
    errorMessage.includes('transient') ||
    errorMessage.includes('TRANSIENT_DATA_MISSING') ||
    errorMessage.includes('expected transient data')
  ) {
    console.error('Detected transient data missing error');
    console.error('Context: Chaincode expects transient data but not provided');
    console.error('Suggestion: Verify putTransient() is called correctly in the service');
    return {
      statusCode: 500,
      errorCode: 'TRANSIENT_DATA_MISSING',
      message: 'Required transient data is missing. Internal server error.'
    };
  }

  // 5. Chaincode Validation Errors
  // Occurs when chaincode validates input and rejects it
  if (
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid input') ||
    errorMessage.includes('chaincode error') ||
    errorMessage.includes('does not exist') && !errorMessage.includes('Degree')
  ) {
    console.error('Detected chaincode validation error');
    console.error('Context: Chaincode rejected the input data');
    console.error('Suggestion: Check input data format and requirements');
    return {
      statusCode: 400,
      errorCode: 'CHAINCODE_VALIDATION_ERROR',
      message: errorMessage || 'Invalid input data rejected by chaincode.'
    };
  }

  // Return null if no specific Fabric error detected
  return null;
}

/**
 * Error Handler Middleware
 * 
 * This middleware function handles all errors in the application.
 * It should be registered as the last middleware in the Express app.
 * 
 * Error Response Format:
 * {
 *   success: false,
 *   error: "Human-readable error message",
 *   code: "ERROR_CODE",
 *   timestamp: "2024-12-06T10:30:00Z"
 * }
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function errorHandler(err, req, res, next) {
  // Default error values
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let errorMessage = 'An unexpected error occurred';

  // Check for custom error classes first
  if (err instanceof ValidationError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof NotFoundError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof ConflictError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof EndorsementError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    errorMessage = err.message;
  } else if (err instanceof ConnectionError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    errorMessage = err.message;
  } else {
    // Try to detect Fabric-specific errors
    const fabricError = detectFabricError(err);
    if (fabricError) {
      statusCode = fabricError.statusCode;
      errorCode = fabricError.errorCode;
      errorMessage = fabricError.message;
    } else if (err.message) {
      // Generic error with message
      errorMessage = err.message;
    }
  }

  // Log error with full stack trace and context for debugging
  console.error('=== Error Handler ===');
  console.error('Timestamp:', new Date().toISOString());
  console.error('Status Code:', statusCode);
  console.error('Error Code:', errorCode);
  console.error('Error Message:', errorMessage);
  console.error('Request Method:', req.method);
  console.error('Request URL:', req.originalUrl);
  console.error('Request Body:', JSON.stringify(req.body, null, 2));
  console.error('Error Name:', err.name);
  console.error('Original Error Message:', err.message);
  console.error('Stack Trace:', err.stack);
  console.error('====================');

  // Format error response
  const errorResponse = {
    success: false,
    error: errorMessage,
    code: errorCode,
    timestamp: new Date().toISOString()
  };

  // Send error response
  return res.status(statusCode).json(errorResponse);
}

module.exports = {
  errorHandler,
  ValidationError,
  NotFoundError,
  ConflictError,
  EndorsementError,
  ConnectionError
};
