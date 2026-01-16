/**
 * Transcript Service Module
 * 
 * Handles business logic for secure transcript updates using Transient Data mechanism.
 * 
 * SECURITY CRITICAL: This service implements Transient Data to ensure sensitive
 * student transcript information (grades, GPA) is NEVER written to the public
 * transaction log at the Orderer. Instead, sensitive data is:
 * 1. Sent directly to endorsing peers via Transient Data mechanism
 * 2. Stored in Private Data Collections on authorized peers only
 * 3. Only a hash of the private data is recorded on the public ledger
 * 
 * Transient Data Security Mechanism:
 * - Transient data exists only in memory during transaction endorsement
 * - It is NOT included in the transaction proposal that goes to the orderer
 * - It is NOT written to the blockchain ledger
 * - Only endorsing peers receive and process the transient data
 * - The chaincode stores transient data in Private Data Collections
 * 
 * This ensures compliance with privacy regulations and protects sensitive
 * student academic records from public exposure.
 */

const { GatewayConnectionManager } = require('../fabric/gateway-connection');
const config = require('../config/fabric-config');
const {
  ValidationError,
  ConnectionError,
  EndorsementError,
  ConflictError
} = require('../middleware/error-handler');

/**
 * Validate transcript data input
 * 
 * Theo thiết kế, dữ liệu bảng điểm (Private Data) có cấu trúc:
 * KEY: TRANSCRIPT_{StudentID}
 * VALUE: {
 *   studentId, gpa, detailedGrades: { mon1, mon2, ... },
 *   personalInfo: { dateOfBirth, gender, nationality, contactInfo, citizenId }
 * }
 * 
 * @param {Object} transcriptData - Transcript data to validate
 * @param {string} transcriptData.studentId - Unique student identifier (e.g., CT070211)
 * @param {string} transcriptData.gpa - Grade Point Average
 * @param {Object} transcriptData.detailedGrades - Detailed grades object { mon1: "8", mon2: "9", ... }
 * @param {Object} [transcriptData.personalInfo] - Personal information (optional)
 * @throws {ValidationError} If validation fails
 */
function validateTranscriptData(transcriptData) {
  const { studentId, gpa, detailedGrades, personalInfo } = transcriptData;

  // Validate studentId
  if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
    throw new ValidationError('studentId is required and must be a non-empty string');
  }

  // Validate GPA
  if (!gpa || typeof gpa !== 'string') {
    throw new ValidationError('gpa is required and must be a string');
  }

  // Validate GPA format (should be a number between 0.0 and 4.0 typically)
  const gpaNumber = parseFloat(gpa);
  if (isNaN(gpaNumber) || gpaNumber < 0 || gpaNumber > 4.0) {
    throw new ValidationError('gpa must be a valid number between 0.0 and 4.0');
  }

  // Validate detailedGrades
  if (!detailedGrades || typeof detailedGrades !== 'object' || Array.isArray(detailedGrades)) {
    throw new ValidationError('detailedGrades is required and must be an object');
  }

  // Validate each grade in detailedGrades
  for (const [subject, grade] of Object.entries(detailedGrades)) {
    if (typeof grade !== 'string' && typeof grade !== 'number') {
      throw new ValidationError(`Grade for subject "${subject}" must be a string or number`);
    }
  }

  // Validate personalInfo (REQUIRED now)
  if (!personalInfo || typeof personalInfo !== 'object' || Array.isArray(personalInfo)) {
    throw new ValidationError('personalInfo is required and must be an object');
  }

  // Validate required personalInfo fields
  const { dateOfBirth, gender, nationality, contactInfo, citizenId, university, major } = personalInfo;

  if (!university || typeof university !== 'string') {
    throw new ValidationError('personalInfo.university is required and must be a string');
  }
  if (!major || typeof major !== 'string') {
    throw new ValidationError('personalInfo.major is required and must be a string');
  }
  if (!dateOfBirth || typeof dateOfBirth !== 'string') {
    throw new ValidationError('personalInfo.dateOfBirth is required and must be a string');
  }
  if (!gender || typeof gender !== 'string') {
    throw new ValidationError('personalInfo.gender is required and must be a string');
  }

  // Validate optional personalInfo fields
  if (nationality && typeof nationality !== 'string') {
    throw new ValidationError('personalInfo.nationality must be a string');
  }
  if (contactInfo && typeof contactInfo !== 'string') {
    throw new ValidationError('personalInfo.contactInfo must be a string');
  }
  if (citizenId && typeof citizenId !== 'string') {
    throw new ValidationError('personalInfo.citizenId must be a string');
  }
}



/**
 * Add/Update student transcript using Transient Data mechanism
 * 
 * Theo thiết kế: AddPrivateTranscript(ctx)
 * - Sử dụng API ctx.stub.getTransient() để lấy dữ liệu bảng điểm từ trường Transient
 * - Thực hiện ctx.stub.putPrivateData('TranscriptCollection', key, data) để lưu vào kho dữ liệu riêng tư
 * 
 * CRITICAL SECURITY IMPLEMENTATION:
 * This function demonstrates the correct way to send sensitive data to Hyperledger Fabric
 * using Transient Data. The sensitive data will NOT be written to the public transaction log.
 * 
 * Key Implementation Details:
 * 1. Use contract.submit() with transientData option (Fabric Gateway SDK v1.5.0)
 * 2. Add ONLY public data (studentId) via arguments array
 * 3. Convert sensitive data to Buffer format and pass via transientData
 * 4. Attach sensitive data via proposal.putTransient()
 * 5. The transient data is sent directly to endorsing peers
 * 6. Chaincode stores transient data in Private Data Collections (TranscriptCollection)
 * 7. Only a hash is recorded on the public ledger
 * 
 * @param {Object} transcriptData - Transcript data
 * @param {string} transcriptData.studentId - Unique student identifier (PUBLIC - in args)
 * @param {string} transcriptData.gpa - Grade Point Average (PRIVATE - in transient)
 * @param {Object} transcriptData.detailedGrades - Detailed grades (PRIVATE - in transient)
 * @param {Object} [transcriptData.personalInfo] - Personal info (PRIVATE - in transient)
 * @param {string} [username] - Username for dynamic identity (optional, uses default if not provided)
 * @returns {Promise<Object>} Transaction result with transactionId
 * @throws {ValidationError} If input validation fails
 * @throws {Error} If transaction fails
 * @requirement 6.1, 6.2, 6.3
 */
async function addPrivateTranscript(transcriptData, username = null) {
  try {
    // Validate input data
    validateTranscriptData(transcriptData);

    const { studentId, gpa, detailedGrades, personalInfo } = transcriptData;

    console.log(`Adding private transcript for student ${studentId}...`);
    if (username) {
      console.log(`Using identity for user: ${username}`);
    }

    // Get Gateway Connection Manager instance
    const gatewayManager = await GatewayConnectionManager.getInstance();

    // Get contract instance with user identity (dynamic identity switching)
    // If username is provided, use user's identity from wallet
    // Otherwise, fall back to default admin identity
    const contract = await gatewayManager.getContractWithUserIdentity(
      config.CHANNEL_NAME,
      config.CHAINCODE_NAME,
      username
    );

    console.log('Preparing transaction with transient data...');

    // CRITICAL: Prepare Transient Data Map
    // Sensitive data is sent via Transient Data, not via args
    // Chaincode expects keys: 'transcript', 'gpa', and optionally 'personalInfo'

    const transientData = {
      transcript: Buffer.from(JSON.stringify(detailedGrades)),
      gpa: Buffer.from(String(gpa)),
    };

    if (personalInfo) {
      transientData.personalInfo = Buffer.from(JSON.stringify(personalInfo));
    }

    console.log('Submitting transaction with transient data...');

    // Submit transaction with transient data using Proposal flow (Fabric Gateway SDK v1.x)
    // This allows us to get the Transaction ID and handle Transient Data correctly

    // 1. Create Proposal
    // NOTE: Don't specify endorsingOrganizations to let Gateway discover all required endorsers
    // based on endorsement policy. The endorsement policy requires 2 orgs to endorse.
    const proposal = contract.newProposal('UpdateTranscript', {
      arguments: [studentId],
      transientData: transientData
      // Removed endorsingOrganizations to let Gateway auto-discover endorsers
    });

    // 2. Get Transaction ID
    const transactionId = proposal.getTransactionId();
    console.log(`Generated Transaction ID: ${transactionId}`);

    // 3. Endorse Proposal
    const transaction = await proposal.endorse();
    
    // Get chaincode result from endorsement (BEFORE submit)
    const endorseResult = transaction.getResult();
    
    // Parse the chaincode result
    let resultData = {};
    if (endorseResult && endorseResult.length > 0) {
      // Convert Uint8Array to string properly
      const rawResult = Buffer.from(endorseResult).toString('utf8');
      
      try {
        resultData = JSON.parse(rawResult);
      } catch (e) {
        resultData = { raw: rawResult };
      }
    } else {
      console.warn('⚠️  Chaincode returned empty result from endorsement');
    }

    // 4. Submit Transaction (commit to ledger)
    await transaction.submit();

    console.log(`Transcript for student ${studentId} added successfully.`)

    // Return transaction result
    return {
      success: true,
      transactionId: transactionId, // Return the actual Transaction ID
      transcriptHash: resultData.transcriptHash, // Return the transcript hash
      studentId: studentId,
      message: 'Transcript added to Private Data Collection successfully'
    };

  } catch (error) {
    console.error('Error updating transcript:', error.message);
    console.error('Error stack:', error.stack);

    // Re-throw ValidationError as-is
    if (error instanceof ValidationError) {
      throw error;
    }

    // Check for specific Fabric errors and throw appropriate custom errors
    const errorMessage = error.message || '';

    // gRPC connection errors
    if (
      errorMessage.includes('UNAVAILABLE') ||
      errorMessage.includes('connect ECONNREFUSED') ||
      errorMessage.includes('Failed to connect')
    ) {
      console.error('gRPC connection error detected in updateTranscript');
      throw new ConnectionError('Failed to connect to Fabric network. Service unavailable.');
    }

    // Endorsement policy failures
    if (
      errorMessage.includes('endorsement policy') ||
      errorMessage.includes('failed to collect enough endorsements')
    ) {
      console.error('Endorsement policy failure detected in updateTranscript');
      throw new EndorsementError('Transaction endorsement failed. Endorsement policy not satisfied.');
    }

    // MVCC read conflicts
    if (
      errorMessage.includes('MVCC_READ_CONFLICT') ||
      errorMessage.includes('mvcc read conflict')
    ) {
      console.error('MVCC read conflict detected in updateTranscript');
      throw new ConflictError('Transaction conflict detected. Please retry the operation.');
    }

    // Transient data missing errors
    if (
      errorMessage.includes('transient') ||
      errorMessage.includes('expected transient data')
    ) {
      console.error('Transient data missing error detected in updateTranscript');
      throw new Error('Required transient data is missing. Internal server error.');
    }

    // Wrap other errors
    throw new Error(`Failed to update transcript: ${error.message}`);
  }
}

/**
 * Get transcript for a student
 * 
 * @param {string} studentId - Student ID
 * @param {string} [username] - Username for dynamic identity
 * @returns {Promise<Object>} Transcript data
 */
async function getTranscript(studentId, username = null) {
  try {
    if (!studentId) throw new ValidationError('studentId is required');

    const gatewayManager = await GatewayConnectionManager.getInstance();
    const contract = await gatewayManager.getContractWithUserIdentity(
      config.CHANNEL_NAME,
      config.CHAINCODE_NAME,
      username
    );

    const resultBytes = await contract.evaluateTransaction('QueryTranscript', studentId);
    const resultString = Buffer.from(resultBytes).toString('utf8');

    return JSON.parse(resultString);

  } catch (error) {
    console.error('Error getting transcript:', error.message);
    if (error instanceof ValidationError) throw error;
    throw new Error(`Failed to get transcript: ${error.message}`);
  }
}

/**
 * Grant access to transcript
 * 
 * @param {string} studentId - Student ID
 * @param {string} targetMSP - Target MSP ID
 * @param {string} [username] - Username for dynamic identity
 * @returns {Promise<Object>} Result
 */
async function grantAccess(studentId, targetMSP, username = null) {
  try {
    if (!studentId) throw new ValidationError('studentId is required');
    if (!targetMSP) throw new ValidationError('targetMSP is required');

    const gatewayManager = await GatewayConnectionManager.getInstance();
    const contract = await gatewayManager.getContractWithUserIdentity(
      config.CHANNEL_NAME,
      config.CHAINCODE_NAME,
      username
    );

    const proposal = contract.newProposal('GrantAccess', {
      arguments: [studentId, targetMSP]
    });

    const transaction = await proposal.endorse();
    await transaction.submit();

    return {
      success: true,
      message: `Access granted to ${targetMSP}`
    };

  } catch (error) {
    console.error('Error granting access:', error.message);
    if (error instanceof ValidationError) throw error;
    throw new Error(`Failed to grant access: ${error.message}`);
  }
}

/**
 * Submit a correction request for a transcript
 * @param {string} studentId - Student ID
 * @param {string} requestDetails - Details of the correction request
 * @param {string} username - Username of the requester
 * @returns {Promise<Object>} Result
 */
async function submitCorrectionRequest(studentId, requestDetails, username) {
  try {
    if (!requestDetails) {
      throw new ValidationError('Request details are required');
    }

    const db = require('../database/db');

    await db.query(
      `INSERT INTO correction_requests (student_id, request_type, status, requested_data, reason, requested_by)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        studentId,
        requestDetails.type || 'transcript_correction',
        'pending',
        JSON.stringify(requestDetails),
        requestDetails.reason || null,
        username
      ]
    );

    return {
      success: true,
      message: 'Correction request submitted successfully'
    };
  } catch (error) {
    console.error('Error submitting correction request:', error.message);
    throw error;
  }
}

module.exports = {
  addPrivateTranscript,
  getTranscript,
  grantAccess,
  submitCorrectionRequest,
  validateTranscriptData
};
