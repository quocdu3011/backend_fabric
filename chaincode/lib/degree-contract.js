'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

/**
 * DegreeContract - Smart Contract for Degree and Transcript Management
 * 
 * This chaincode provides functions for:
 * - Issuing degrees (public data stored in World State)
 * - Updating transcripts (private data using Transient Data mechanism)
 * - Querying degrees and transcripts
 * 
 * SECURITY NOTE:
 * - Degree information is PUBLIC and stored in World State
 * - Transcript/GPA information is PRIVATE and stored in Private Data Collection
 * - Sensitive data (transcript, GPA) MUST be passed via Transient Data, NOT arguments
 */
class DegreeContract extends Contract {

    /**
     * Initialize the ledger
     * Called once when chaincode is first deployed
     * 
     * @param {Context} ctx - Transaction context
     * @returns {string} JSON confirmation message
     */
    async InitLedger(ctx) {
        console.log('============= START : Initialize Ledger ===========');
        console.log('Ledger initialized successfully');
        console.log('============= END : Initialize Ledger ===========');
        
        return JSON.stringify({ 
            message: 'Ledger initialized successfully',
            timestamp: this._getTimestamp(ctx)
        });
    }

    /**
     * Issue a new degree certificate
     * Stores degree information in World State (PUBLIC)
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} degreeId - Unique identifier for the degree
     * @param {string} studentId - Student ID
     * @param {string} degreeType - Type of degree (Bachelor, Master, PhD, etc.)
     * @param {string} studentName - Full name of the student
     * @param {string} university - Name of the issuing university
     * @param {string} major - Major/Field of study
     * @param {string} classification - Classification (Excellent, Good, etc.)
     * @param {string} issueDate - Date of issuance (ISO 8601 format)
     * @param {string} transcriptHash - Hash of the private transcript (optional)
     * @returns {string} JSON string of the created degree
     * @throws {Error} If degree with same ID already exists
     */
    async IssueDegree(ctx, degreeId, studentId, degreeType, studentName, university, major, classification, issueDate, transcriptHash) {
        console.log('============= START : Issue Degree ===========');
        
        // AUTHORIZATION: Only admin can issue degrees
        this._requireAdmin(ctx);
        
        // Check if degree already exists
        const exists = await this.DegreeExists(ctx, degreeId);
        if (exists) {
            throw new Error(`Degree ${degreeId} already exists`);
        }

        // Create degree object
        const degree = {
            degreeId: degreeId,
            studentId: studentId,
            degreeType: degreeType,
            studentName: studentName,
            university: university,
            major: major,
            classification: classification,
            issueDate: issueDate,
            transcriptHash: transcriptHash || '',
            status: 'ACTIVE', // Default status
            timestamp: this._getTimestamp(ctx),
            docType: 'degree'
        };

        // Store in World State (PUBLIC)
        await ctx.stub.putState(degreeId, Buffer.from(JSON.stringify(degree)));
        
        console.log(`Degree ${degreeId} issued successfully for ${studentName}`);
        console.log('============= END : Issue Degree ===========');
        
        return JSON.stringify(degree);
    }

    /**
     * Revoke a degree
     * Updates the status of a degree to 'REVOKED'
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} degreeId - Degree ID to revoke
     * @param {string} reason - Reason for revocation
     * @returns {string} JSON confirmation
     */
    async RevokeDegree(ctx, degreeId, reason) {
        console.log('============= START : Revoke Degree ===========');

        // AUTHORIZATION: Only admin can revoke degrees
        this._requireAdmin(ctx);

        const degreeBytes = await ctx.stub.getState(degreeId);
        if (!degreeBytes || degreeBytes.length === 0) {
            throw new Error(`Degree ${degreeId} does not exist`);
        }

        const degree = JSON.parse(degreeBytes.toString());
        
        // Check if already revoked
        if (degree.status === 'REVOKED') {
            throw new Error(`Degree ${degreeId} is already revoked`);
        }

        // Update status
        degree.status = 'REVOKED';
        degree.revocationReason = reason;
        degree.revokedAt = this._getTimestamp(ctx);
        degree.revokedBy = ctx.clientIdentity.getMSPID();

        await ctx.stub.putState(degreeId, Buffer.from(JSON.stringify(degree)));

        console.log(`Degree ${degreeId} revoked successfully`);
        console.log('============= END : Revoke Degree ===========');

        return JSON.stringify(degree);
    }

    /**
     * Query degrees by student ID
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} studentId - Student ID
     * @returns {string} JSON array of degrees
     */
    async QueryDegreesByStudent(ctx, studentId) {
        console.log('============= START : Query Degrees By Student ===========');
        
        const queryString = {
            selector: {
                docType: 'degree',
                studentId: studentId
            }
        };

        const iterator = await ctx.stub.getQueryResult(JSON.stringify(queryString));
        const allResults = [];
        
        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                allResults.push(record);
            } catch (err) {
                console.log('Error parsing record:', err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        
        console.log(`Found ${allResults.length} degrees for student ${studentId}`);
        console.log('============= END : Query Degrees By Student ===========');
        
        return JSON.stringify(allResults);
    }

    /**
     * Query a degree by ID
     * Reads degree information from World State
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} degreeId - Degree ID to query
     * @returns {string} JSON string of the degree data
     * @throws {Error} If degree does not exist
     */
    async QueryDegree(ctx, degreeId) {
        console.log('============= START : Query Degree ===========');
        
        const degreeBytes = await ctx.stub.getState(degreeId);
        
        if (!degreeBytes || degreeBytes.length === 0) {
            throw new Error(`Degree ${degreeId} does not exist`);
        }

        console.log(`Degree ${degreeId} found`);
        console.log('============= END : Query Degree ===========');
        
        return degreeBytes.toString();
    }

    /**
     * Check if a degree exists
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} degreeId - Degree ID to check
     * @returns {boolean} True if degree exists, false otherwise
     */
    async DegreeExists(ctx, degreeId) {
        const degreeBytes = await ctx.stub.getState(degreeId);
        return degreeBytes && degreeBytes.length > 0;
    }

    /**
     * Query all degrees
     * Returns all records with docType === 'degree'
     * 
     * @param {Context} ctx - Transaction context
     * @returns {string} JSON array of all degree records
     */
    async QueryAllDegrees(ctx) {
        console.log('============= START : Query All Degrees ===========');
        
        const allResults = [];
        
        // Get all records using range query
        const iterator = await ctx.stub.getStateByRange('', '');
        
        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                // Filter only degree records
                if (record.docType === 'degree') {
                    allResults.push(record);
                }
            } catch (err) {
                console.log('Error parsing record:', err);
            }
            result = await iterator.next();
        }
        
        await iterator.close();
        
        console.log(`Found ${allResults.length} degrees`);
        console.log('============= END : Query All Degrees ===========');
        
        return JSON.stringify(allResults);
    }

    /**
     * Update student transcript using Private Data Collection
     * 
     * CRITICAL SECURITY:
     * - Transcript and GPA data MUST be passed via Transient Data
     * - Transient Data is NOT written to transaction log
     * - Transient Data is NOT sent to Orderer
     * - Only the HASH of private data is stored on public ledger
     * - Actual data is stored in Private Data Collection (SideDB)
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} studentId - Student ID (passed as argument - PUBLIC)
     * @transient {Buffer} transcript - Transcript data (passed via Transient Data - PRIVATE)
     * @transient {Buffer} gpa - GPA value (passed via Transient Data - PRIVATE)
     * @returns {string} JSON confirmation
     * @throws {Error} If transient data is missing or GPA is invalid
     */
    async UpdateTranscript(ctx, studentId) {
        console.log('============= START : Update Transcript ===========');
        
        // AUTHORIZATION: Only admin can update transcripts
        this._requireAdmin(ctx);
        
        // ============================================================
        // CRITICAL: Get sensitive data from Transient Data
        // Transient Data will NOT be written to transaction log at Orderer
        // This ensures transcript and GPA remain private
        // ============================================================
        const transientMap = ctx.stub.getTransient();
        
        // Validate transient data exists
        if (!transientMap.has('transcript') || !transientMap.has('gpa')) {
            throw new Error('Missing required transient data: transcript and gpa');
        }

        // Parse transient data from Buffer
        const transcriptBuffer = transientMap.get('transcript');
        const gpaBuffer = transientMap.get('gpa');

        // Optional personal info
        let personalInfo = {};
        if (transientMap.has('personalInfo')) {
            const personalInfoBuffer = transientMap.get('personalInfo');
            personalInfo = JSON.parse(personalInfoBuffer.toString('utf8'));
        }

        const transcript = JSON.parse(transcriptBuffer.toString('utf8'));
        const gpa = gpaBuffer.toString('utf8');

        // Validate GPA range
        const gpaNumber = parseFloat(gpa);
        if (isNaN(gpaNumber) || gpaNumber < 0 || gpaNumber > 4.0) {
            throw new Error('Invalid GPA value. Must be between 0.0 and 4.0');
        }

        // Get client identity for audit
        const updatedBy = ctx.clientIdentity.getMSPID();
        const updatedAt = this._getTimestamp(ctx);

        // Create transcript object for Private Data Collection
        const transcriptData = {
            studentId: studentId,
            transcript: transcript,
            gpa: gpa,
            personalInfo: personalInfo,
            updatedAt: updatedAt,
            updatedBy: updatedBy
        };

        // ============================================================
        // Store in Private Data Collection (SideDB)
        // This data is ONLY stored on authorized peers
        // Only the HASH is written to public ledger
        // ============================================================
        const transcriptDataBuffer = Buffer.from(JSON.stringify(transcriptData));
        await ctx.stub.putPrivateData(
            'TranscriptCollection',
            studentId,
            transcriptDataBuffer
        );

        // Calculate hash for return
        const transcriptHash = crypto.createHash('sha256').update(transcriptDataBuffer).digest('hex');

        // ============================================================
        // Store PUBLIC metadata in World State
        // This allows tracking when transcript was updated
        // WITHOUT exposing the actual transcript/GPA data
        // ============================================================
        const publicMetadata = {
            studentId: studentId,
            updatedAt: updatedAt,
            updatedBy: updatedBy,
            transcriptHash: transcriptHash, // Store hash in public metadata too
            docType: 'transcript-metadata'
        };

        await ctx.stub.putState(
            `transcript-${studentId}`,
            Buffer.from(JSON.stringify(publicMetadata))
        );

        console.log(`Transcript for student ${studentId} updated successfully`);
        console.log('Private data stored in TranscriptCollection');
        console.log('Public metadata stored in World State');
        console.log(`Transcript Hash: ${transcriptHash}`);
        console.log('============= END : Update Transcript ===========');

        return JSON.stringify({ 
            success: true, 
            studentId: studentId,
            transcriptHash: transcriptHash,
            message: 'Transcript updated successfully'
        });
    }

    /**
     * Get transcript hash from Private Data Collection
     * @param {Context} ctx - Transaction context
     * @param {string} studentId - Student ID
     * @returns {string} Hex string of the hash
     */
    async GetTranscriptHash(ctx, studentId) {
        const hash = await ctx.stub.getPrivateDataHash('TranscriptCollection', studentId);
        if (!hash || hash.length === 0) {
             throw new Error(`Transcript hash for student ${studentId} not found`);
        }
        return Buffer.from(hash).toString('hex');
    }

    /**
     * Query transcript from Private Data Collection
     * Only authorized organizations can access this data
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} studentId - Student ID to query
     * @returns {string} JSON string of transcript data
     * @throws {Error} If transcript not found or unauthorized
     */
    async QueryTranscript(ctx, studentId) {
        console.log('============= START : Query Transcript ===========');
        
        // AUTHORIZATION: Check role-based access
        const clientIdentity = ctx.clientIdentity;
        const ou = clientIdentity.getAttributeValue('ou');
        const clientMSP = clientIdentity.getMSPID();
        
        console.log(`Query from MSP: ${clientMSP}, Role: ${ou}`);
        
        // Admin can view any transcript
        // Student can only view their own transcript
        if (ou === 'student') {
            // Get student's username from certificate
            const username = clientIdentity.getAttributeValue('username');
            if (username !== studentId) {
                throw new Error(
                    `Access denied. Students can only view their own transcript. ` +
                    `Requested: ${studentId}, Caller: ${username}`
                );
            }
        } else if (ou !== 'admin') {
            // Only admin and student roles can query transcripts
            throw new Error(
                `Access denied. Only admin or student can query transcripts. ` +
                `Caller role: ${ou || 'unknown'}`
            );
        }

        // Get private data
        const transcriptBytes = await ctx.stub.getPrivateData(
            'TranscriptCollection',
            studentId
        );

        if (!transcriptBytes || transcriptBytes.length === 0) {
            throw new Error(`Transcript for student ${studentId} not found`);
        }

        console.log(`Transcript for student ${studentId} found`);
        console.log('============= END : Query Transcript ===========');

        return transcriptBytes.toString();
    }

    /**
     * Grant access to private transcript data
     * This is a simplified implementation. In a real scenario, this would involve
     * updating the Private Data Collection policy or sharing an off-chain key.
     * Here we just record the grant on the ledger for auditing.
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} studentId - Student ID
     * @param {string} targetMSP - MSP ID to grant access to
     * @returns {string} JSON confirmation
     */
    async GrantAccess(ctx, studentId, targetMSP) {
        console.log('============= START : Grant Access ===========');
        
        // AUTHORIZATION: Only student can grant access to their own data
        const clientIdentity = ctx.clientIdentity;
        const ou = clientIdentity.getAttributeValue('ou');
        
        if (ou !== 'student') {
            throw new Error(
                `Access denied. Only students can grant access to transcripts. ` +
                `Caller role: ${ou || 'unknown'}`
            );
        }
        
        // Verify caller is granting access to their own transcript
        const username = clientIdentity.getAttributeValue('username');
        if (username !== studentId) {
            throw new Error(
                `Access denied. Students can only grant access to their own transcript. ` +
                `Requested: ${studentId}, Caller: ${username}`
            );
        }
        
        const grantRecord = {
            studentId: studentId,
            targetMSP: targetMSP,
            grantedBy: ctx.clientIdentity.getMSPID(),
            grantedAt: this._getTimestamp(ctx),
            docType: 'access-grant'
        };

        await ctx.stub.putState(
            `grant-${studentId}-${targetMSP}`,
            Buffer.from(JSON.stringify(grantRecord))
        );

        console.log(`Access granted for student ${studentId} to MSP ${targetMSP}`);
        console.log('============= END : Grant Access ===========');

        return JSON.stringify(grantRecord);
    }

    /**
     * Get deterministic timestamp from transaction
     * @param {Context} ctx 
     */
    _getTimestamp(ctx) {
        const timestamp = ctx.stub.getTxTimestamp();
        const milliseconds = (timestamp.seconds.low || timestamp.seconds) * 1000;
        return new Date(milliseconds).toISOString();
    }

    /**
     * Check if the caller has the required role (OU attribute)
     * @param {Context} ctx - Transaction context
     * @param {string} requiredRole - Required role (admin, student, client)
     * @throws {Error} If caller doesn't have the required role
     * @private
     */
    _checkRole(ctx, requiredRole) {
        const clientIdentity = ctx.clientIdentity;
        
        // Get OU (Organizational Unit) attribute from client certificate
        // OU is set during enrollment and indicates user's role
        const ou = clientIdentity.getAttributeValue('ou');
        
        if (!ou || ou !== requiredRole) {
            const mspId = clientIdentity.getMSPID();
            const actualRole = ou || 'unknown';
            throw new Error(
                `Access denied. Required role: ${requiredRole}, actual role: ${actualRole} (MSP: ${mspId})`
            );
        }
        
        console.log(`Access granted: User has required role '${requiredRole}'`);
    }

    /**
     * Check if the caller is an admin
     * @param {Context} ctx - Transaction context
     * @throws {Error} If caller is not an admin
     * @private
     */
    _requireAdmin(ctx) {
        this._checkRole(ctx, 'admin');
    }

    /**
     * Check if the caller is a student
     * @param {Context} ctx - Transaction context
     * @throws {Error} If caller is not a student
     * @private
     */
    _requireStudent(ctx) {
        this._checkRole(ctx, 'student');
    }
}

module.exports = DegreeContract;
