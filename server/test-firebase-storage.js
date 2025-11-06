// Test Firebase Storage upload
require('dotenv').config();
const { uploadToStorage, firebaseInitialized, adminStorage } = require('./services/Firebase');

async function testFirebaseStorage() {
  console.log('🔍 Testing Firebase Storage...\n');
  
  // Test 1: Check initialization
  console.log('✅ Test 1: Firebase initialization');
  console.log('   Initialized:', firebaseInitialized);
  console.log('   Storage available:', !!adminStorage);
  
  if (!firebaseInitialized || !adminStorage) {
    console.error('\n❌ Firebase is not initialized!');
    console.log('   Check these environment variables:');
    console.log('   - FIREBASE_PROJECT_ID:', !!process.env.FIREBASE_PROJECT_ID);
    console.log('   - FIREBASE_CLIENT_EMAIL:', !!process.env.FIREBASE_CLIENT_EMAIL);
    console.log('   - FIREBASE_PRIVATE_KEY:', !!process.env.FIREBASE_PRIVATE_KEY);
    console.log('   - FIREBASE_STORAGE_BUCKET:', process.env.FIREBASE_STORAGE_BUCKET);
    return;
  }
  
  // Test 2: Check bucket configuration
  console.log('\n✅ Test 2: Storage bucket configuration');
  try {
    const bucket = adminStorage.bucket();
    console.log('   Bucket name:', bucket.name);
    console.log('   Expected:', process.env.FIREBASE_STORAGE_BUCKET);
    console.log('   Match:', bucket.name === process.env.FIREBASE_STORAGE_BUCKET);
  } catch (error) {
    console.error('   ❌ Error accessing bucket:', error.message);
  }
  
  // Test 3: Try to upload a test file
  console.log('\n✅ Test 3: Upload test file');
  try {
    const testBuffer = Buffer.from('This is a test file', 'utf-8');
    const testFileName = `test_${Date.now()}.txt`;
    
    console.log('   Uploading test file...');
    const url = await uploadToStorage(testBuffer, testFileName, 'text/plain', 'test-uploads');
    
    console.log('   ✓ Upload successful!');
    console.log('   URL:', url);
    
    // Test 4: Verify file is accessible
    console.log('\n✅ Test 4: Verify file is accessible');
    const fetch = require('node-fetch');
    const response = await fetch(url);
    console.log('   Response status:', response.status);
    
    if (response.ok) {
      const content = await response.text();
      console.log('   Content:', content);
      console.log('   ✓ File is publicly accessible!');
    } else {
      console.error('   ❌ File is not accessible:', response.statusText);
    }
    
    console.log('\n🎉 All tests passed! Firebase Storage is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Upload test failed:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    
    if (error.message?.includes('permission')) {
      console.log('\n💡 This might be a Firebase Storage rules issue:');
      console.log('   1. Go to Firebase Console > Storage');
      console.log('   2. Click on "Rules" tab');
      console.log('   3. Ensure write permissions are enabled');
      console.log('\n   Example rules:');
      console.log('   service firebase.storage {');
      console.log('     match /b/{bucket}/o {');
      console.log('       match /{allPaths=**} {');
      console.log('         allow read, write: if true;  // For testing');
      console.log('       }');
      console.log('     }');
      console.log('   }');
    }
    
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      console.log('\n💡 Bucket might not exist:');
      console.log('   1. Go to Firebase Console > Storage');
      console.log('   2. Click "Get started" to create storage bucket');
      console.log('   3. Verify bucket name matches:', process.env.FIREBASE_STORAGE_BUCKET);
    }
  }
}

testFirebaseStorage().catch(console.error);
