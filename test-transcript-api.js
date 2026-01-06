/**
 * Test Script - Lấy điểm sinh viên qua Backend API
 * Script này test các API endpoint liên quan đến transcript
 */

const crypto = require('crypto');

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'adminpw';
const STUDENT_ID = 'CT070211';
const STUDENT_PASSWORD = 'Trinhquocdu@3011'; // Thay bằng password thực tế

let adminToken = null;
let studentToken = null;

/**
 * Helper: HTTP Request
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API request failed: ${response.status}`);
    }

    return data;
}

/**
 * Test 1: Admin Login
 */
async function testAdminLogin() {
    console.log('\n🔐 TEST 1: Admin Login');
    console.log('='.repeat(60));
    
    try {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: ADMIN_USERNAME,
                password: ADMIN_PASSWORD,
            }),
        });

        if (result.success && result.token) {
            adminToken = result.token;
            console.log('✓ Admin đăng nhập thành công');
            console.log(`  Token: ${adminToken.substring(0, 20)}...`);
            return true;
        } else {
            console.log('✗ Đăng nhập thất bại');
            return false;
        }
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        return false;
    }
}

/**
 * Test 2: Student Login
 */
async function testStudentLogin() {
    console.log('\n👨‍🎓 TEST 2: Student Login');
    console.log('='.repeat(60));
    
    try {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: STUDENT_ID,
                password: STUDENT_PASSWORD,
            }),
        });

        if (result.success && result.token) {
            studentToken = result.token;
            console.log(`✓ Sinh viên ${STUDENT_ID} đăng nhập thành công`);
            console.log(`  Token: ${studentToken.substring(0, 20)}...`);
            return true;
        } else {
            console.log('✗ Đăng nhập thất bại');
            return false;
        }
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        console.log(`  Có thể sinh viên chưa có tài khoản hoặc password sai`);
        return false;
    }
}

/**
 * Test 3: Admin tạo transcript cho sinh viên
 */
async function testCreateTranscript() {
    console.log('\n📝 TEST 3: Admin tạo Transcript cho sinh viên');
    console.log('='.repeat(60));
    
    if (!adminToken) {
        console.log('⚠️  Bỏ qua - Admin chưa đăng nhập');
        return null;
    }
    
    try {
        const transcriptData = {
            studentId: STUDENT_ID,
            transcript: [
                { courseId: 'CS101', courseName: 'Lập trình căn bản', credits: 3, grade: 'A' },
                { courseId: 'CS102', courseName: 'Cấu trúc dữ liệu', credits: 4, grade: 'B+' },
                { courseId: 'MATH201', courseName: 'Toán rời rạc', credits: 3, grade: 'A' }
            ],
            gpa: '3.67',
            personalInfo: {
                fullName: 'Nguyễn Văn A',
                dateOfBirth: '2000-01-01',
                class: 'K16'
            }
        };

        const result = await apiRequest('/transcripts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
            },
            body: JSON.stringify(transcriptData),
        });

        if (result.success) {
            console.log('✓ Transcript đã được tạo thành công');
            console.log(`  Student ID: ${result.studentId}`);
            console.log(`  Transcript Hash: ${result.transcriptHash}`);
            return result.transcriptHash;
        } else {
            console.log('✗ Tạo transcript thất bại');
            return null;
        }
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        if (error.message.includes('already has a transcript')) {
            console.log('  ℹ️  Transcript đã tồn tại - tiếp tục test với transcript hiện có');
            return 'existing';
        }
        return null;
    }
}

/**
 * Test 4: Student lấy transcript của mình
 */
async function testGetMyTranscript() {
    console.log('\n📚 TEST 4: Sinh viên lấy Transcript của mình');
    console.log('='.repeat(60));
    
    if (!studentToken) {
        console.log('⚠️  Bỏ qua - Sinh viên chưa đăng nhập');
        return null;
    }
    
    try {
        const result = await apiRequest('/my-transcript', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${studentToken}`,
            },
        });

        if (result.success) {
            console.log('✓ Lấy transcript thành công');
            console.log(`  Student ID: ${result.transcript.studentId}`);
            console.log(`  GPA: ${result.transcript.gpa}`);
            console.log(`  Số môn học: ${result.transcript.transcript.length}`);
            console.log(`  Updated At: ${result.transcript.updatedAt}`);
            
            // Hiển thị danh sách môn học
            console.log('\n  📖 Danh sách môn học:');
            result.transcript.transcript.forEach((course, index) => {
                console.log(`     ${index + 1}. ${course.courseName} (${course.courseId}): ${course.grade}`);
            });
            
            return result.transcript;
        } else {
            console.log('✗ Lấy transcript thất bại');
            return null;
        }
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        return null;
    }
}

/**
 * Test 5: Admin lấy transcript của sinh viên
 */
async function testAdminGetTranscript() {
    console.log('\n👨‍💼 TEST 5: Admin lấy Transcript của sinh viên');
    console.log('='.repeat(60));
    
    if (!adminToken) {
        console.log('⚠️  Bỏ qua - Admin chưa đăng nhập');
        return null;
    }
    
    try {
        const result = await apiRequest(`/transcripts/${STUDENT_ID}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
            },
        });

        if (result.success) {
            console.log('✓ Admin lấy transcript thành công');
            console.log(`  Student ID: ${result.transcript.studentId}`);
            console.log(`  GPA: ${result.transcript.gpa}`);
            console.log(`  Số môn học: ${result.transcript.transcript.length}`);
            
            return result.transcript;
        } else {
            console.log('✗ Lấy transcript thất bại');
            return null;
        }
    } catch (error) {
        console.error(`✗ Lỗi: ${error.message}`);
        return null;
    }
}

/**
 * Test 6: Verify Transcript Hash
 */
async function testVerifyTranscriptHash(transcript, expectedHash) {
    console.log('\n🔐 TEST 6: Verify Transcript Hash');
    console.log('='.repeat(60));
    
    if (!transcript || !expectedHash || expectedHash === 'existing') {
        console.log('⚠️  Bỏ qua - Không có dữ liệu để verify');
        return;
    }
    
    try {
        // Calculate hash from transcript data (giống như chaincode)
        const transcriptBuffer = Buffer.from(JSON.stringify(transcript));
        const calculatedHash = crypto.createHash('sha256').update(transcriptBuffer).digest('hex');
        
        console.log(`Expected Hash:   ${expectedHash}`);
        console.log(`Calculated Hash: ${calculatedHash}`);
        
        if (calculatedHash === expectedHash) {
            console.log('✓ Hash verification PASSED - Dữ liệu hợp lệ!');
        } else {
            console.log('✗ Hash verification FAILED - Hash không khớp');
            console.log('  ℹ️  Có thể do cách tính hash khác nhau giữa client và chaincode');
        }
    } catch (error) {
        console.error(`✗ Lỗi khi verify: ${error.message}`);
    }
}

/**
 * Main test function
 */
async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('  TEST TRANSCRIPT - Backend API');
    console.log('  Base URL: ' + API_BASE_URL);
    console.log('  Student ID: ' + STUDENT_ID);
    console.log('='.repeat(60));
    
    try {
        // Test 1: Admin login
        const adminLoginSuccess = await testAdminLogin();
        
        // Test 2: Student login
        const studentLoginSuccess = await testStudentLogin();
        
        // Test 3: Create transcript (if admin logged in)
        let transcriptHash = null;
        if (adminLoginSuccess) {
            transcriptHash = await testCreateTranscript();
        }
        
        // Test 4: Student get own transcript
        let studentTranscript = null;
        if (studentLoginSuccess) {
            studentTranscript = await testGetMyTranscript();
        }
        
        // Test 5: Admin get student transcript
        let adminTranscript = null;
        if (adminLoginSuccess) {
            adminTranscript = await testAdminGetTranscript();
        }
        
        // Test 6: Verify hash
        if (transcriptHash && studentTranscript) {
            await testVerifyTranscriptHash(studentTranscript, transcriptHash);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Hoàn thành tất cả tests!');
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error(`\n❌ Test failed: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
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
