// Test profile picture upload endpoint
require('dotenv').config();
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testProfileUpload() {
  try {
    console.log('🔍 Testing profile picture upload endpoint...');
    console.log('📍 Server URL: http://localhost:3001/api');
    
    // Test 1: Check if server is running
    console.log('\n✅ Test 1: Server health check');
    const healthResponse = await fetch('http://localhost:3001/health');
    const healthData = await healthResponse.json();
    console.log('   ✓ Server status:', healthData.status);
    
    // Test 2: Check if /api/user/profile-picture endpoint exists
    console.log('\n✅ Test 2: Check endpoint (without auth - should return 401)');
    const noAuthResponse = await fetch('http://localhost:3001/api/user/profile-picture', {
      method: 'POST',
    });
    console.log('   ✓ Status:', noAuthResponse.status, noAuthResponse.statusText);
    console.log('   ✓ Expected 401 (unauthorized) or 400 (bad request)');
    
    // Test 3: Check with valid auth token (you'll need to provide this)
    console.log('\n⚠️ Test 3: Full upload test requires valid auth token');
    console.log('   To test with real auth:');
    console.log('   1. Get auth token from AsyncStorage in app');
    console.log('   2. Create a test image file');
    console.log('   3. Run: node test-profile-upload.js <auth-token> <image-path>');
    
    if (process.argv[2] && process.argv[3]) {
      const token = process.argv[2];
      const imagePath = process.argv[3];
      
      console.log('\n✅ Test 3: Upload with auth token');
      console.log('   Token:', token.substring(0, 20) + '...');
      console.log('   Image:', imagePath);
      
      if (!fs.existsSync(imagePath)) {
        console.error('   ❌ Image file not found:', imagePath);
        return;
      }
      
      const formData = new FormData();
      formData.append('profilePicture', fs.createReadStream(imagePath));
      
      const uploadResponse = await fetch('http://localhost:3001/api/user/profile-picture', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      console.log('   ✓ Upload status:', uploadResponse.status);
      const uploadData = await uploadResponse.json();
      console.log('   ✓ Response:', uploadData);
    }
    
    console.log('\n🎉 Endpoint tests complete!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', {
      message: error.message,
      code: error.code,
    });
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Server is not running! Start it with:');
      console.error('   cd server && npm start');
    }
  }
}

testProfileUpload();
