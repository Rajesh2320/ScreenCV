#!/usr/bin/env node
// test-api.js
// Quick test to verify admin routes are working

const http = require('http');

const API_BASE = 'http://localhost:3000';
const ADMIN_EMAIL = 'joraba73@gmail.com';
const ADMIN_PASSWORD = 'Adm1n$2325$cynraj';

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            raw: data,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            raw: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n========================================');
  console.log('ScreenCV Admin API Test Suite');
  console.log('========================================\n');

  try {
    // TEST 1: Public endpoint (no auth)
    console.log('TEST 1: GET /api/admin/tool-status (public)');
    console.log('-----');
    const test1 = await makeRequest('GET', '/api/admin/tool-status');
    console.log(`Status: ${test1.status}`);
    console.log(`Response:`, test1.body || test1.raw);
    console.log(`Result: ${test1.status === 200 ? '✅ PASS' : '❌ FAIL'}\n`);

    // TEST 2: Login endpoint
    console.log('TEST 2: POST /api/admin/login');
    console.log('-----');
    const test2 = await makeRequest('POST', '/api/admin/login', {}, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    console.log(`Status: ${test2.status}`);
    console.log(`Response:`, test2.body || test2.raw);
    const loginSuccess = test2.status === 200 && test2.body?.success;
    console.log(`Result: ${loginSuccess ? '✅ PASS' : '❌ FAIL'}\n`);

    // TEST 3: Protected endpoint (requires auth)
    console.log('TEST 3: GET /api/admin/analytics/stats (protected)');
    console.log('-----');
    const test3 = await makeRequest('GET', '/api/admin/analytics/stats', {
      'x-admin-email': ADMIN_EMAIL,
    });
    console.log(`Status: ${test3.status}`);
    console.log(`Response:`, test3.body || test3.raw);
    const statsSuccess = test3.status === 200 && test3.body?.success;
    console.log(`Result: ${statsSuccess ? '✅ PASS' : '❌ FAIL'}\n`);

    // TEST 4: Public daily analytics (no auth)
    console.log('TEST 4: GET /api/admin/analytics/daily');
    console.log('-----');
    const test4 = await makeRequest('GET', '/api/admin/analytics/daily', {
      'x-admin-email': ADMIN_EMAIL,
    });
    console.log(`Status: ${test4.status}`);
    console.log(`Response:`, test4.body || test4.raw);
    console.log(`Result: ${test4.status >= 200 && test4.status < 400 ? '✅ PASS' : '❌ FAIL'}\n`);

    // SUMMARY
    console.log('========================================');
    console.log('Summary');
    console.log('========================================');
    console.log(`✅ Public endpoint: ${test1.status === 200 ? 'Working' : 'NOT working'}`);
    console.log(`✅ Login endpoint: ${loginSuccess ? 'Working' : 'NOT working'}`);
    console.log(`✅ Protected endpoint: ${statsSuccess ? 'Working' : 'NOT working'}`);
    console.log(`✅ Daily analytics: ${test4.status >= 200 && test4.status < 400 ? 'Working' : 'NOT working'}`);
    console.log('========================================\n');

    if (loginSuccess && statsSuccess) {
      console.log('🎉 All tests passed! Dashboard should work now.\n');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed. Check the responses above.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Connection error:', error.message);
    console.error('\nIs the server running? Start it with: npm start\n');
    process.exit(1);
  }
}

runTests();