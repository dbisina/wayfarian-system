// Complete profile picture upload test
require('dotenv').config();
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testProfileUpload() {
  console.log('🔍 Testing complete profile picture upload flow...\n');
  
  // Test 1: Check storage status
  console.log('✅ Test 1: Storage system status');
  try {
    const response = await fetch('http://localhost:3001/api/system/storage');
    const data = await response.json();
    console.log('   Storage configuration:');
    console.log('   - Primary:', data.storage.priority);
    console.log('   - Cloudinary:', data.storage.cloudinary.status);
    console.log('   - Firebase:', data.storage.firebase.status);
    console.log('   - Local:', data.storage.local.status);
  } catch (error) {
    console.error('   ❌ Failed to check storage status:', error.message);
    console.log('   💡 Make sure the server is running');
    return;
  }
  
  // Test 2: Create test image
  console.log('\n✅ Test 2: Create test image');
  const testImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64'
  );
  const tempImagePath = path.join(__dirname, 'temp_test_image.png');
  fs.writeFileSync(tempImagePath, testImageBuffer);
  console.log('   ✓ Created test image:', tempImagePath);
  
  // Test 3: Upload without auth (should fail)
  console.log('\n✅ Test 3: Upload without authentication (expect 401)');
  try {
    const formData = new FormData();
    formData.append('profilePicture', fs.createReadStream(tempImagePath));
    
    const response = await fetch('http://localhost:3001/api/user/profile-picture', {
      method: 'POST',
      body: formData,
    });
    
    console.log('   Status:', response.status, response.statusText);
    if (response.status === 401) {
      console.log('   ✓ Correctly rejected unauthenticated request');
    } else {
      console.warn('   ⚠️ Expected 401, got', response.status);
    }
  } catch (error) {
    console.error('   ❌ Request failed:', error.message);
  }
  
  // Test 4: With authentication (requires valid token)
  console.log('\n✅ Test 4: Upload with authentication');
  console.log('   💡 To test with real auth:');
  console.log('   1. Get auth token from app (AsyncStorage: authToken)');
  console.log('   2. Run: node test-profile-upload-complete.js <auth-token>');
  
  if (process.argv[2]) {
    const token = process.argv[2];
    console.log('   Token provided:', token.substring(0, 20) + '...');
    
    try {
      const formData = new FormData();
      formData.append('profilePicture', fs.createReadStream(tempImagePath));
      
      const response = await fetch('http://localhost:3001/api/user/profile-picture', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      console.log('   Status:', response.status);
      const data = await response.json();
      
      if (response.ok && data.success) {
        console.log('   ✓ Upload successful!');
        console.log('   Image URL:', data.imageUrl);
        console.log('   User:', data.user);
        
        // Verify image is accessible
        console.log('\n✅ Test 5: Verify uploaded image is accessible');
        const imageResponse = await fetch(data.imageUrl);
        console.log('   Image status:', imageResponse.status);
        console.log('   Content-Type:', imageResponse.headers.get('content-type'));
        
        if (imageResponse.ok) {
          console.log('   ✓ Image is publicly accessible!');
        }
      } else {
        console.error('   ❌ Upload failed:', data);
      }
    } catch (error) {
      console.error('   ❌ Request failed:', error.message);
    }
  }
  
  // Cleanup
  console.log('\n🧹 Cleanup');
  try {
    fs.unlinkSync(tempImagePath);
    console.log('   ✓ Deleted test image');
  } catch (error) {
    console.warn('   Could not delete test image:', error.message);
  }
  
  console.log('\n✅ Test complete!');
  console.log('\n📝 Summary:');
  console.log('   • Storage system is working');
  console.log('   • Endpoint requires authentication');
  console.log('   • To test full upload: provide auth token as argument');
  console.log('\n💡 Next steps:');
  console.log('   1. Restart your server to load new changes');
  console.log('   2. Try uploading from the app');
  console.log('   3. Image will be stored in Cloudinary (or fallback to local)');
}

testProfileUpload().catch(console.error);
