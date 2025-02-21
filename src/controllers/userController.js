const User = require('../models/User');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const { formatBufferTo64 } = require('../middleware/upload');

// Constants for validation
const USERNAME_MAX_LENGTH = 20;
const PASSWORD_MAX_LENGTH = 128;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Validation helpers
const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    return 'Username is required';
  }
  username = username.trim();
  if (username.length < 3) {
    return 'Username must be at least 3 characters long';
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be less than ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return 'Username can only contain letters, numbers, underscores, and hyphens';
  }
  return null;
};

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return 'Email is required';
  }
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return 'Please enter a valid email address';
  }
  return null;
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 6) {
    return 'Password must be at least 6 characters long';
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be less than ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
};

const validateImage = (file) => {
  if (!file) return null;
  
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return 'Please upload a valid image file (JPEG, PNG, or GIF)';
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return 'Image size should be less than 5MB';
  }
  return null;
};

// @desc    Register new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({
        success: false,
        message: usernameError
      });
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({
        success: false,
        message: emailError
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError
      });
    }

    // Check if user exists
    const userExists = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.trim() }
      ]
    });

    if (userExists) {
      if (userExists.email === email.toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: 'Email is already registered'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Create user
    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase(),
      password
    });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({
        success: false,
        message: emailError
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    // Check password
    if (user && (await user.matchPassword(password))) {
      res.json({
        success: true,
        data: {
          _id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture,
          token: generateToken(user._id)
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('stories');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
};

// @desc    Upload profile picture
// @route   POST /api/users/profile/picture
// @access  Private
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image file'
      });
    }

    const imageError = validateImage(req.file);
    if (imageError) {
      return res.status(400).json({
        success: false,
        message: imageError
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get the old profile picture public_id if it exists
    const oldPublicId = user.profilePicture ? 
      user.profilePicture.split('/').slice(-1)[0].split('.')[0] : null;

    // Convert buffer to data URI
    const file64 = {
      content: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
      extension: path.extname(req.file.originalname).toLowerCase()
    };
    
    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(file64);

    // Delete old profile picture from Cloudinary if it exists
    if (oldPublicId && !oldPublicId.includes('default-avatar')) {
      await deleteFromCloudinary(oldPublicId);
    }

    // Update user's profile picture URL
    user.profilePicture = uploadResult.url;
    await user.save();

    res.json({
      success: true,
      data: {
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading profile picture'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate username if provided
    if (req.body.username) {
      const usernameError = validateUsername(req.body.username);
      if (usernameError) {
        return res.status(400).json({
          success: false,
          message: usernameError
        });
      }

      if (req.body.username !== user.username) {
        const usernameExists = await User.findOne({ username: req.body.username.trim() });
        if (usernameExists) {
          return res.status(400).json({
            success: false,
            message: 'Username is already taken'
          });
        }
      }
    }

    // Validate email if provided
    if (req.body.email) {
      const emailError = validateEmail(req.body.email);
      if (emailError) {
        return res.status(400).json({
          success: false,
          message: emailError
        });
      }

      if (req.body.email.toLowerCase() !== user.email) {
        const emailExists = await User.findOne({ email: req.body.email.toLowerCase() });
        if (emailExists) {
          return res.status(400).json({
            success: false,
            message: 'Email is already registered'
          });
        }
      }
    }

    // Validate password change
    if (req.body.newPassword) {
      if (!req.body.currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to change password'
        });
      }

      const passwordError = validatePassword(req.body.newPassword);
      if (passwordError) {
        return res.status(400).json({
          success: false,
          message: passwordError
        });
      }

      const isMatch = await user.matchPassword(req.body.currentPassword);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      user.password = req.body.newPassword;
    }

    // Update user fields
    if (req.body.username) user.username = req.body.username.trim();
    if (req.body.email) user.email = req.body.email.toLowerCase();

    const updatedUser = await user.save();

    res.json({
      success: true,
      data: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        profilePicture: updatedUser.profilePicture,
        token: generateToken(updatedUser._id)
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
};

// @desc    Delete user account
// @route   DELETE /api/users/profile
// @access  Private
const deleteUserAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete user's profile picture from Cloudinary if it exists
    const profilePicPublicId = user.profilePicture ? 
      user.profilePicture.split('/').slice(-1)[0].split('.')[0] : null;
    
    if (profilePicPublicId && !profilePicPublicId.includes('default-avatar')) {
      await deleteFromCloudinary(profilePicPublicId);
    }

    await User.deleteOne({ _id: user._id });
    res.json({
      success: true,
      message: 'User account deleted successfully'
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting account'
    });
  }
};

// @desc    Request password reset
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({
        success: false,
        message: emailError
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No user found with this email'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    // For now, we'll just return the token in the response
    // In production, you would send this via email
    res.json({
      success: true,
      message: 'Password reset link sent to email',
      data: {
        resetToken
      }
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while processing password reset request'
    });
  }
};

// @desc    Reset password
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is required'
      });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting password'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  uploadProfilePicture,
  forgotPassword,
  resetPassword
};
