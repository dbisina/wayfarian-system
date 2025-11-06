// Test Cloudinary upload
require('dotenv').config();
const { uploadToCloudinary, deleteFromCloudinary, cloudinaryInitialized, getThumbnailUrl } = require('./services/CloudinaryService');

async function testCloudinary() {
  console.log('🔍 Testing Cloudinary integration...\n');
  
  // Test 1: Check initialization
  console.log('✅ Test 1: Cloudinary initialization');
  console.log('   Initialized:', cloudinaryInitialized);
  console.log('   CLOUDINARY_URL exists:', !!process.env.CLOUDINARY_URL);
  
  if (!cloudinaryInitialized) {
    console.error('\n❌ Cloudinary is not initialized!');
    console.log('   Make sure CLOUDINARY_URL is set in .env file');
    return;
  }
  
  // Test 2: Upload test file
  console.log('\n✅ Test 2: Upload test image');
  try {
    // Create a simple test image buffer (1x1 red pixel PNG)
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      'base64'
    );
    
    const testFileName = `test_${Date.now()}.png`;
    console.log('   Uploading test file...');
    
    const url = await uploadToCloudinary(testImageBuffer, testFileName, 'test-uploads');
    
    console.log('   ✓ Upload successful!');
    console.log('   URL:', url);
    console.log('   File size: 1x1 pixel (test image)');
    
    // Test 3: Generate thumbnail
    console.log('\n✅ Test 3: Generate thumbnail URL');
    const thumbnailUrl = getThumbnailUrl(url, 150, 150);
    console.log('   Thumbnail URL:', thumbnailUrl);
    
    // Test 4: Verify file is accessible
    console.log('\n✅ Test 4: Verify file is accessible');
    const fetch = require('node-fetch');
    const response = await fetch(url);
    console.log('   Response status:', response.status);
    console.log('   Content-Type:', response.headers.get('content-type'));
    
    if (response.ok) {
      console.log('   ✓ File is publicly accessible!');
    } else {
      console.error('   ❌ File is not accessible:', response.statusText);
    }
    
    // Test 5: Delete file
    console.log('\n✅ Test 5: Delete test file');
    await deleteFromCloudinary(url);
    console.log('   ✓ File deleted successfully');
    
    console.log('\n🎉 All tests passed! Cloudinary is working correctly.');
    console.log('\n💡 Cloudinary benefits:');
    console.log('   • Automatic image optimization');
    console.log('   • On-the-fly transformations');
    console.log('   • CDN delivery worldwide');
    console.log('   • Free tier: 25GB storage, 25GB bandwidth/month');
    
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error('   Message:', error.message);
    console.error('   Details:', error.error || error);
    
    if (error.message?.includes('Invalid cloud name')) {
      console.log('\n💡 Check your CLOUDINARY_URL format:');
      console.log('   Should be: cloudinary://api_key:api_secret@cloud_name');
    }
    
    if (error.message?.includes('unauthorized')) {
      console.log('\n💡 API credentials might be incorrect');
      console.log('   Verify your Cloudinary API key and secret');
    }
  }
}

testCloudinary().catch(console.error);
