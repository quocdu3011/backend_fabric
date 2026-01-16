/**
 * Test API script using Node.js
 */
const http = require('http');

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Test 1: Admin Login ===');
  const loginResult = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'adminorg1', password: 'Admin@123' });
  
  console.log('Login result:', JSON.stringify(loginResult, null, 2));
  
  if (!loginResult.accessToken) {
    console.log('Login failed!');
    process.exit(1);
  }
  
  const adminToken = loginResult.accessToken;
  
  console.log('\n=== Test 2: Add Transcript (Admin) ===');
  const transcriptData = {
    studentId: 'CT070211',
    gpa: '3.5',
    detailedGrades: {
      'Lap trinh C': '9',
      'Toan cao cap': '8',
      'Vat ly dai cuong': '8.5'
    },
    personalInfo: {
      university: 'Hoc Vien Ky Thuat Mat Ma',
      major: 'An Toan Thong Tin',
      dateOfBirth: '30-11-2004',
      gender: 'Nam'
    }
  };
  
  const addResult = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/transcripts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, transcriptData);
  
  console.log('Add Transcript result:', JSON.stringify(addResult, null, 2));
  
  // Wait for transaction to commit
  console.log('\nWaiting 3 seconds for transaction to commit...');
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('\n=== Test 3: Admin Query Transcript ===');
  const adminQueryResult = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/transcripts/CT070211',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  
  console.log('Admin Query result:', JSON.stringify(adminQueryResult, null, 2));
  
  console.log('\n=== Test 4: Student Login ===');
  const studentLoginResult = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'CT070211', password: 'Student@123' });
  
  console.log('Student login result:', JSON.stringify(studentLoginResult, null, 2));
  
  if (!studentLoginResult.accessToken) {
    console.log('Student login failed!');
    process.exit(1);
  }
  
  const studentToken = studentLoginResult.accessToken;
  
  console.log('\n=== Test 5: Student Query Own Transcript ===');
  const studentQueryResult = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/my-transcript',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${studentToken}`
    }
  });
  
  console.log('Student Query result:', JSON.stringify(studentQueryResult, null, 2));
  
  console.log('\n=== Tests Complete ===');
}

main().catch(console.error);
