// Test script for group cover photo upload with Cloudinary
// Run this to verify Cloudinary integration works for group covers

const sharp = require('sharp');
const { uploadToStorage, deleteFromStorage } = require('./services/Firebase');
const { cloudinaryInitialized } = require('./services/CloudinaryService');

async function testGroupCoverUpload() {
  console.log('🧪 Testing Group Cover Upload with Cloudinary\n');

  try {
    // Check Cloudinary status
    console.log('1️⃣ Checking Cloudinary status...');
    if (cloudinaryInitialized) {
      console.log('   ✅ Cloudinary is initialized and ready');
    } else {
      console.log('   ⚠️  Cloudinary not initialized, will fallback to Firebase or local storage');
    }

    // Create a test cover image (1200x600)
    console.log('\n2️⃣ Creating test cover image (1200x600)...');
    const testImage = await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 3,
        background: { r: 73, g: 85, b: 104 }, // #4A5568
      },
    })
      .png()
      .toBuffer();
    console.log(`   ✅ Test image created: ${testImage.length} bytes`);

    // Optimize like the controller does
    console.log('\n3️⃣ Optimizing image...');
    const optimized = await sharp(testImage)
      .resize(1200, 600, { fit: 'cover' })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer();
    console.log(`   ✅ Image optimized: ${optimized.length} bytes`);

    // Upload to storage
    console.log('\n4️⃣ Uploading to storage...');
    const filename = `cover_test_${Date.now()}.jpg`;
    const imageUrl = await uploadToStorage(optimized, filename, 'image/jpeg', 'group-covers');
    console.log(`   ✅ Upload successful!`);
    console.log(`   📍 URL: ${imageUrl}`);

    // Check if it's a Cloudinary URL
    if (imageUrl.includes('cloudinary.com')) {
      console.log(`   ✅ Using Cloudinary storage`);
    } else if (imageUrl.includes('firebasestorage')) {
      console.log(`   ℹ️  Using Firebase storage`);
    } else {
      console.log(`   ℹ️  Using local storage`);
    }

    // Test deletion
    console.log('\n5️⃣ Testing deletion...');
    await deleteFromStorage(imageUrl);
    console.log('   ✅ Deletion successful');

    console.log('\n✅ ALL GROUP COVER TESTS PASSED!\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
testGroupCoverUpload();
