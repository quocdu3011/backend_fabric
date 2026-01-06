/**
 * Test Script - Lấy điểm sinh viên theo Transcript Hash
 * Script này test việc lấy transcript từ private data collection và verify hash
 */

const crypto = require('crypto');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

// Network configuration
const channelName = 'mychannel';
const chaincodeName = 'degree-cc';
const walletPath = path.join(__dirname, 'wallet');

// Student ID để test
const STUDENT_ID = 'CT070211';

/**
 * Connect to Fabric Gateway
 */
async function connectToNetwork(username) {
    try {
        // Load wallet
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        // Check identity exists
        const identity = await wallet.get(username);
        if (!identity) {
            throw new Error(`Identity ${username} not found in wallet. Please enroll first.`);
        }
        
        console.log(`✓ Loaded identity: ${username}`);

        // Load connection profile
        const ccpPath = path.resolve(__dirname, 'connection-org1.json');
        let ccp;
        
        if (fs.existsSync(ccpPath)) {
            const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
            ccp = JSON.parse(ccpJSON);
        } else {
            // Fallback: create basic connection profile (no TLS)
            ccp = {
                name: 'test-network-org1',
                version: '1.0.0',
                client: {
                    organization: 'Org1',
                    connection: {
                        timeout: {
                            peer: { endorser: '300' },
                            orderer: '300'
                        }
                    }
                },
                organizations: {
                    Org1: {
                        mspid: 'Org1MSP',
                        peers: ['peer0.org1.example.com'],
                        certificateAuthorities: ['ca.org1.example.com']
                    }
                },
                peers: {
                    'peer0.org1.example.com': {
                        url: 'grpc://localhost:7051',
                        grpcOptions: {
                            'ssl-target-name-override': 'peer0.org1.example.com',
                            'grpc.keepalive_time_ms': 120000,
                            'grpc.http2.min_time_between_pings_ms': 120000,
                            'grpc.keepalive_timeout_ms': 20000,
                            'grpc.http2.max_pings_without_data': 0,
                            'grpc.keepalive_permit_without_calls': 1
                        }
                    }
                },
                certificateAuthorities: {
                    'ca.org1.example.com': {
                        url: 'http://localhost:7054',
                        caName: 'ca-org1'
                    }
                }
            };
        }

        // Connect to gateway
        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: username,
            discovery: { enabled: false, asLocalhost: true } // Disable discovery to avoid TLS issues
        });

        console.log('✓ Connected to gateway');

        // Get network and contract
        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        return { gateway, contract };
    } catch (error) {
        console.error(`Failed to connect to network: ${error.message}`);
        throw error;
    }
}

/**
 * Test 1: Lấy transcript hash từ blockchain
 */
async function testGetTranscriptHash(contract) {
    console.log('\n📋 TEST 1: Lấy Transcript Hash từ blockchain');
    console.log('='.repeat(60));
    
    try {
        const result = await contract.evaluateTransaction('GetTranscriptHash', STUDENT_ID);
        const hash = result.toString();
        
        console.log(`✓ Transcript Hash cho sinh viên ${STUDENT_ID}:`);
        console.log(`  ${hash}`);
        
        return hash;
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        return null;
    }
}

/**
 * Test 2: Lấy transcript data từ private collection
 */
async function testQueryTranscript(contract) {
    console.log('\n📚 TEST 2: Lấy Transcript Data từ Private Collection');
    console.log('='.repeat(60));
    
    try {
        const result = await contract.evaluateTransaction('QueryTranscript', STUDENT_ID);
        const transcript = JSON.parse(result.toString());
        
        console.log(`✓ Transcript cho sinh viên ${STUDENT_ID}:`);
        console.log(JSON.stringify(transcript, null, 2));
        
        return transcript;
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        return null;
    }
}

/**
 * Test 3: Verify transcript hash
 */
async function testVerifyHash(transcript, expectedHash) {
    console.log('\n🔐 TEST 3: Verify Transcript Hash');
    console.log('='.repeat(60));
    
    if (!transcript || !expectedHash) {
        console.log('⚠️  Không thể verify - thiếu dữ liệu');
        return;
    }
    
    try {
        // Calculate hash from transcript data
        const transcriptBuffer = Buffer.from(JSON.stringify(transcript));
        const calculatedHash = crypto.createHash('sha256').update(transcriptBuffer).digest('hex');
        
        console.log(`Expected Hash:   ${expectedHash}`);
        console.log(`Calculated Hash: ${calculatedHash}`);
        
        if (calculatedHash === expectedHash) {
            console.log('✓ Hash verification PASSED - Dữ liệu hợp lệ!');
        } else {
            console.log('✗ Hash verification FAILED - Dữ liệu không khớp!');
        }
    } catch (error) {
        console.error(`✗ Lỗi khi verify: ${error.message}`);
    }
}

/**
 * Test 4: Lấy public metadata
 */
async function testGetPublicMetadata(contract) {
    console.log('\n🌐 TEST 4: Lấy Public Metadata');
    console.log('='.repeat(60));
    
    try {
        const result = await contract.evaluateTransaction('QueryDegree', `transcript-${STUDENT_ID}`);
        const metadata = JSON.parse(result.toString());
        
        console.log('✓ Public Metadata:');
        console.log(JSON.stringify(metadata, null, 2));
        
        return metadata;
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        return null;
    }
}

/**
 * Main test function
 */
async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('  TEST TRANSCRIPT - Lấy điểm sinh viên theo Transcript Hash');
    console.log('='.repeat(60));
    
    let gateway;
    
    try {
        // Kết nối với network (dùng admin identity)
        const username = 'admin';
        console.log(`\n🔗 Connecting as: ${username}`);
        
        const connection = await connectToNetwork(username);
        gateway = connection.gateway;
        const contract = connection.contract;
        
        // Run tests
        const hash = await testGetTranscriptHash(contract);
        const transcript = await testQueryTranscript(contract);
        await testVerifyHash(transcript, hash);
        await testGetPublicMetadata(contract);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Hoàn thành tất cả tests!');
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error(`\n❌ Test failed: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    } finally {
        if (gateway) {
            gateway.disconnect();
            console.log('Disconnected from gateway');
        }
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { main };
