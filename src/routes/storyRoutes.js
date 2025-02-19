const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createStory,
  getStories,
  getStoryById,
  updateStory,
  deleteStory,
  toggleLikeStory,
  addComment,
  getUserStories
} = require('../controllers/storyController');

// Public routes
router.get('/', getStories);
router.get('/user/:userId', protect, getUserStories); // Add this before :id route to avoid conflict
router.get('/:id', getStoryById);

// Protected routes
router.post('/', protect, createStory);
router.route('/:id')
  .put(protect, updateStory)
  .delete(protect, deleteStory);

// Story interactions
router.post('/:id/like', protect, toggleLikeStory);
router.post('/:id/comments', protect, addComment);

module.exports = router;
