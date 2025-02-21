const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = async (file64) => {
  try {
    const result = await cloudinary.uploader.upload(file64.content, {
      folder: file64.folder || 'novel-ai-hub/profile-pictures',
      resource_type: 'auto',
      format: file64.extension,
      transformation: [
        { quality: 'auto:best' },
        { fetch_format: 'auto' }
      ]
    });

    return {
      url: result.secure_url,
      public_id: result.public_id
    };
  } catch (error) {
    throw new Error('Error uploading to Cloudinary: ' + error.message);
  }
};

const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) return;
    const folder = publicId.startsWith('novel-ai-hub/story-images/') ? 'novel-ai-hub/story-images' : 'novel-ai-hub/profile-pictures';
    await cloudinary.uploader.destroy(`${folder}/${publicId}`);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary
};
