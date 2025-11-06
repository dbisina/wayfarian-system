// Local file storage fallback for when Firebase Storage is not available
const fs = require('fs').promises;
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(path.join(UPLOADS_DIR, 'profile-pictures'), { recursive: true });
    await fs.mkdir(path.join(UPLOADS_DIR, 'group-covers'), { recursive: true });
    await fs.mkdir(path.join(UPLOADS_DIR, 'gallery'), { recursive: true });
  } catch (error) {
    console.error('Failed to create uploads directory:', error);
  }
}

ensureUploadsDir();

/**
 * Upload file to local storage (fallback when Firebase is unavailable)
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name
 * @param {string} contentType - MIME type
 * @param {string} folder - Subfolder (e.g., 'profile-pictures')
 * @returns {Promise<string>} - Public URL to the file
 */
async function uploadToLocalStorage(fileBuffer, fileName, contentType, folder = 'uploads') {
  try {
    const folderPath = path.join(UPLOADS_DIR, folder);
    await fs.mkdir(folderPath, { recursive: true });
    
    const filePath = path.join(folderPath, fileName);
    await fs.writeFile(filePath, fileBuffer);
    
    // Return URL that points to the server's static file endpoint
    const serverUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
    const baseUrl = serverUrl.replace('/api', '');
    return `${baseUrl}/uploads/${folder}/${fileName}`;
  } catch (error) {
    console.error('Failed to upload to local storage:', error);
    throw new Error(`Failed to save file locally: ${error.message}`);
  }
}

/**
 * Delete file from local storage
 * @param {string} filePath - Relative path (e.g., 'profile-pictures/file.jpg')
 */
async function deleteFromLocalStorage(filePath) {
  try {
    const fullPath = path.join(UPLOADS_DIR, filePath);
    await fs.unlink(fullPath);
    console.log('Deleted file from local storage:', filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to delete from local storage:', error);
    }
  }
}

module.exports = {
  uploadToLocalStorage,
  deleteFromLocalStorage,
  UPLOADS_DIR,
};
