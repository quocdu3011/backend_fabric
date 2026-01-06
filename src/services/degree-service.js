/**
 * Degree Service Module
 * 
 * Handles business logic for degree issuance and querying.
 * This service interacts with the Hyperledger Fabric chaincode
 * to issue degrees (public data) and query degree information.
 */

const { GatewayConnectionManager } = require('../fabric/gateway-connection');
const config = require('../config/fabric-config');
const { 
  ValidationError, 
  NotFoundError, 
  ConnectionError, 
  EndorsementError,
  ConflictError
} = require('../middleware/error-handler');

/**
 * Validate degree data input
 * @param {Object} degreeData - Degree data to validate
 * @param {string} degreeData.degreeId - Unique degree identifier (e.g., VN.KMA.2025.001)
 * @param {string} degreeData.studentId - Student ID
 * @param {string} degreeData.degreeType - Type of degree (Ky Su, Cu Nhan, Thac Si, Tien Si)
 * @param {string} degreeData.studentName - Student full name
 * @param {string} degreeData.universityName - Issuing university name
 * @param {string} degreeData.major - Major/field of study
 * @param {string} degreeData.classification - Classification (Xuat sac, Gioi, Kha, Trung binh)
 * @param {string} degreeData.issueDate - Date of issuance (ISO 8601 format)
 * @param {string} [degreeData.transcriptHash] - Hash reference to private transcript data
 * @throws {ValidationError} If validation fails
 */
function validateDegreeData(degreeData) {
  const { degreeId, studentId, degreeType, studentName, universityName, major, classification, issueDate } = degreeData;

  // Check required fields
  if (!degreeId || typeof degreeId !== 'string' || degreeId.trim() === '') {
    throw new ValidationError('degreeId is required and must be a non-empty string');
  }

  if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
    throw new ValidationError('studentId is required and must be a non-empty string');
  }

  if (!degreeType || typeof degreeType !== 'string' || degreeType.trim() === '') {
    throw new ValidationError('degreeType is required and must be a non-empty string');
  }

  if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') {
    throw new ValidationError('studentName is required and must be a non-empty string');
  }

  if (!universityName || typeof universityName !== 'string' || universityName.trim() === '') {
    throw new ValidationError('universityName is required and must be a non-empty string');
  }

  if (!major || typeof major !== 'string' || major.trim() === '') {
    throw new ValidationError('major is required and must be a non-empty string');
  }

  if (!classification || typeof classification !== 'string' || classification.trim() === '') {
    throw new ValidationError('classification is required and must be a non-empty string');
  }

  if (!issueDate || typeof issueDate !== 'string' || issueDate.trim() === '') {
    throw new ValidationError('issueDate is required and must be a non-empty string');
  }

  // Validate date format (basic ISO 8601 check)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(issueDate)) {
    throw new ValidationError('issueDate must be in ISO 8601 format (YYYY-MM-DD)');
  }

  // Validate degree type
  const validDegreeTypes = ['Ky Su', 'Cu Nhan', 'Thac Si', 'Tien Si', 'Cao Dang', 'Bachelor', 'Master', 'PhD', 'Doctorate', 'Associate', 'Diploma'];
  if (!validDegreeTypes.includes(degreeType)) {
    console.warn(`Warning: degreeType "${degreeType}" is not in the standard list`);
  }

  // Validate classification
  const validClassifications = ['Xuat sac', 'Gioi', 'Kha', 'Trung binh', 'Excellent', 'Good', 'Fair', 'Average'];
  if (!validClassifications.includes(classification)) {
    console.warn(`Warning: classification "${classification}" is not in the standard list`);
  }
}

/**
 * Issue a new degree
 * 
 * This function creates a transaction proposal to issue a degree with public data.
 * All degree information is stored on the public ledger (World State).
 * 
 * Data Model (theo thiết kế):
 * KEY: DEGREE_{DegreeID}
 * VALUE: {
 *   docType: "Degree",
 *   degreeId, degreeType, studentName, universityName,
 *   major, classification, issueDate, issuerMSP, status, transcriptHash
 * }
 * 
 * @param {Object} degreeData - Degree data
 * @param {string} degreeData.degreeId - Unique degree identifier (e.g., VN.KMA.2025.001)
 * @param {string} degreeData.studentId - Student ID
 * @param {string} degreeData.degreeType - Type of degree (Ky Su, Cu Nhan, etc.)
 * @param {string} degreeData.studentName - Student full name
 * @param {string} degreeData.universityName - Issuing university name
 * @param {string} degreeData.major - Major/field of study
 * @param {string} degreeData.classification - Classification (Xuat sac, Gioi, etc.)
 * @param {string} degreeData.issueDate - Date of issuance
 * @param {string} [degreeData.transcriptHash] - Hash reference to private transcript data
 * @param {string} [username] - Username for dynamic identity (optional, uses default if not provided)
 * @returns {Promise<Object>} Transaction result with transactionId and degree data
 * @throws {ValidationError} If input validation fails
 * @throws {Error} If transaction fails
 * @requirement 6.1, 6.2, 6.3
 */
async function issueDegree(degreeData, username = null) {
  try {
    // Validate input data
    validateDegreeData(degreeData);

    const { degreeId, studentId, degreeType, studentName, universityName, major, classification, issueDate, transcriptHash } = degreeData;

    console.log(`Issuing degree ${degreeId} for student ${studentName} (${studentId})...`);
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

    console.log('Submitting transaction to chaincode...');

    // Create proposal to get transaction ID before submitting
    const proposal = contract.newProposal('IssueDegree', {
      arguments: [
        degreeId,
        studentId,
        degreeType,
        studentName,
        universityName,
        major,
        classification,
        issueDate,
        transcriptHash || ''
      ]
    });

    const transactionId = proposal.getTransactionId();
    console.log(`Generated Transaction ID: ${transactionId}`);

    // Endorse proposal
    const transaction = await proposal.endorse();

    // Submit transaction
    const result = await transaction.submit();

    console.log(`Degree ${degreeId} issued successfully.`);

    // Parse result if needed
    let resultData = {};
    if (result && result.length > 0) {
      try {
        resultData = JSON.parse(result.toString());
      } catch (e) {
        // Result might not be JSON
        resultData = { raw: result.toString() };
      }
    }

    // Return transaction result
    return {
      success: true,
      transactionId: transactionId,
      degree: {
        degreeId,
        studentId,
        degreeType,
        studentName,
        universityName,
        major,
        classification,
        issueDate,
        transcriptHash: transcriptHash || '',
        status: 'ACTIVE'
      }
    };

  } catch (error) {
    console.error('Error issuing degree:', error.message);
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
      console.error('gRPC connection error detected in issueDegree');
      throw new ConnectionError('Failed to connect to Fabric network. Service unavailable.');
    }

    // Endorsement policy failures
    if (
      errorMessage.includes('endorsement policy') ||
      errorMessage.includes('failed to collect enough endorsements')
    ) {
      console.error('Endorsement policy failure detected in issueDegree');
      throw new EndorsementError('Transaction endorsement failed. Endorsement policy not satisfied.');
    }

    // MVCC read conflicts
    if (
      errorMessage.includes('MVCC_READ_CONFLICT') ||
      errorMessage.includes('mvcc read conflict')
    ) {
      console.error('MVCC read conflict detected in issueDegree');
      throw new ConflictError('Transaction conflict detected. Please retry the operation.');
    }

    // Wrap other errors
    throw new Error(`Failed to issue degree: ${error.message}`);
  }
}

/**
 * Verify/Query degree information by degree ID
 * 
 * This function performs a read-only query to retrieve and verify degree information
 * from the blockchain ledger. It uses evaluateTransaction for efficient
 * read operations without creating a new transaction.
 * 
 * Theo thiết kế: VerifyDegree(ctx, degreeId)
 * - Truy vấn World State để lấy thông tin văn bằng
 * - Trả về trạng thái hiện tại (ACTIVE/REVOKED) và thông tin xác thực
 * 
 * @param {string} degreeId - Unique degree identifier
 * @param {string} [username] - Username for dynamic identity (optional, uses default if not provided)
 * @returns {Promise<Object>} Degree data with verification status
 * @throws {ValidationError} If degreeId is invalid
 * @throws {NotFoundError} If degree does not exist
 * @throws {Error} If query fails
 * @requirement 6.1, 6.2
 */
async function verifyDegree(degreeId, username = null) {
  try {
    // Validate degreeId
    if (!degreeId || typeof degreeId !== 'string' || degreeId.trim() === '') {
      throw new ValidationError('degreeId is required and must be a non-empty string');
    }

    console.log(`Verifying degree ${degreeId}...`);
    if (username) {
      console.log(`Using identity for user: ${username}`);
    }

    // Get Gateway Connection Manager instance
    const gatewayManager = await GatewayConnectionManager.getInstance();

    // Get contract instance with user identity (dynamic identity switching)
    // For public verification, username may be null (uses default identity)
    const contract = await gatewayManager.getContractWithUserIdentity(
      config.CHANNEL_NAME,
      config.CHAINCODE_NAME,
      username
    );

    // Call evaluateTransaction for read-only query (VerifyDegree theo thiết kế)
    // This does not create a transaction on the ledger
    // Note: Using QueryDegree as VerifyDegree is not implemented in chaincode v1.3
    const resultBytes = await contract.evaluateTransaction('QueryDegree', degreeId);

    // Parse result from Buffer to JSON
    const resultString = Buffer.from(resultBytes).toString('utf8');
    console.log(`[DEBUG] Raw chaincode response for ${degreeId}: [${resultString}]`);
    
    // Handle empty result (degree not found)
    if (!resultString || resultString.trim() === '') {
      throw new NotFoundError(`Degree with ID ${degreeId} not found`);
    }

    let degreeData;
    try {
      degreeData = JSON.parse(resultString);
    } catch (parseError) {
      console.warn(`[WARN] JSON parse failed: ${parseError.message}. Attempting to recover...`);
      // Try to find the first '{' and parse from there (handling potential prefixes like status codes)
      const jsonStartIndex = resultString.indexOf('{');
      if (jsonStartIndex !== -1) {
         try {
            const cleanedString = resultString.substring(jsonStartIndex);
            console.log(`[DEBUG] Cleaned response: [${cleanedString}]`);
            degreeData = JSON.parse(cleanedString);
         } catch (retryError) {
            throw new Error(`Failed to parse degree data: ${parseError.message}. Raw: ${resultString}`);
         }
      } else {
         throw new Error(`Failed to parse degree data: ${parseError.message}. Raw: ${resultString}`);
      }
    }

    console.log(`Degree ${degreeId} verified successfully`);

    // Return verification result with status
    // If status is missing from chaincode (v1.3), assume ACTIVE if it exists
    const status = degreeData.status || 'ACTIVE';

    return {
      success: true,
      verified: status === 'ACTIVE',
      degree: {
        ...degreeData,
        status: status
      }
    };

  } catch (error) {
    console.error('Error verifying degree:', error.message);
    console.error('Error stack:', error.stack);

    // Re-throw ValidationError and NotFoundError as-is
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }

    // Check for specific Fabric errors
    const errorMessage = error.message || '';

    // gRPC connection errors
    if (
      errorMessage.includes('UNAVAILABLE') ||
      errorMessage.includes('connect ECONNREFUSED') ||
      errorMessage.includes('Failed to connect')
    ) {
      console.error('gRPC connection error detected in verifyDegree');
      throw new ConnectionError('Failed to connect to Fabric network. Service unavailable.');
    }

    // Check if error message indicates degree not found
    if (errorMessage.includes('does not exist')) {
      throw new NotFoundError(`Degree with ID ${degreeId} not found`);
    }

    // Wrap other errors
    throw new Error(`Failed to verify degree: ${error.message}`);
  }
}

/**
 * Get degrees by student ID
 * 
 * @param {string} studentId - Student ID
 * @param {string} [username] - Username for dynamic identity
 * @returns {Promise<Array>} List of degrees
 */
async function getDegreesByStudent(studentId, username = null) {
  try {
    if (!studentId) throw new ValidationError('studentId is required');

    const gatewayManager = await GatewayConnectionManager.getInstance();
    const contract = await gatewayManager.getContractWithUserIdentity(
      config.CHANNEL_NAME,
      config.CHAINCODE_NAME,
      username
    );

    const resultBytes = await contract.evaluateTransaction('QueryDegreesByStudent', studentId);
    const resultString = Buffer.from(resultBytes).toString('utf8');
    
    return JSON.parse(resultString);

  } catch (error) {
    console.error('Error getting degrees by student:', error.message);
    if (error instanceof ValidationError) throw error;
    throw new Error(`Failed to get degrees: ${error.message}`);
  }
}

/**
 * Revoke a degree
 * 
 * @param {string} degreeId - Degree ID to revoke
 * @param {string} reason - Reason for revocation
 * @param {string} [username] - Username for dynamic identity
 * @returns {Promise<Object>} Transaction result
 */
async function revokeDegree(degreeId, reason, username = null) {
  try {
    if (!degreeId || typeof degreeId !== 'string' || degreeId.trim() === '') {
      throw new ValidationError('degreeId is required');
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw new ValidationError('reason is required');
    }

    console.log(`Revoking degree ${degreeId}...`);
    
    const gatewayManager = await GatewayConnectionManager.getInstance();
    const contract = await gatewayManager.getContractWithUserIdentity(
      config.CHANNEL_NAME,
      config.CHAINCODE_NAME,
      username
    );

    const proposal = contract.newProposal('RevokeDegree', {
      arguments: [degreeId, reason]
    });

    const transactionId = proposal.getTransactionId();
    const transaction = await proposal.endorse();
    await transaction.submit();

    console.log(`Degree ${degreeId} revoked successfully.`);

    return {
      success: true,
      transactionId: transactionId,
      message: 'Degree revoked successfully'
    };

  } catch (error) {
    console.error('Error revoking degree:', error.message);
    if (error instanceof ValidationError) throw error;
    
    const errorMessage = error.message || '';
    if (errorMessage.includes('UNAVAILABLE')) throw new ConnectionError('Service unavailable.');
    if (errorMessage.includes('endorsement policy')) throw new EndorsementError('Endorsement failed.');
    if (errorMessage.includes('MVCC_READ_CONFLICT')) throw new ConflictError('Conflict detected.');
    
    throw new Error(`Failed to revoke degree: ${error.message}`);
  }
}

module.exports = {
  issueDegree,
  verifyDegree,
  revokeDegree,
  getDegreesByStudent,
  validateDegreeData
};
