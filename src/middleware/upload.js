const multer = require('multer');
const path = require('path');

// Function to convert buffer to base64
const formatBufferTo64 = (file) => {
  const b64 = Buffer.from(file.buffer).toString('base64');
  return {
    content: `data:${file.mimetype};base64,${b64}`,
    extension: path.extname(file.originalname).toLowerCase()
  };
};

// Ensure uploads directory exists
const fs = require('fs');
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

// Configure storage to use memory storage for Cloudinary
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`Allowed file types are: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }

  cb(null, true);
};

// Error handling middleware
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File is too large. Maximum size is 5MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Cleanup old files
const cleanup = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Error cleaning up file:', error);
    }
  }
};

module.exports = {
  upload,
  handleUploadError,
  cleanup,
  formatBufferTo64
};
