const Story = require('../models/Story');
const User = require('../models/User');

// @desc    Create new story
// @route   POST /api/stories
// @access  Private
const createStory = async (req, res) => {
  try {
    const { title, content, genre, isAIGenerated } = req.body;

    // Validate required fields
    if (!title || !content || !genre) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and genre are required'
      });
    }

    // Validate content length (model requires 100 chars)
    if (content.length < 100) {
      return res.status(400).json({
        success: false,
        message: 'Content must be at least 100 characters long'
      });
    }

    // Validate title length
    if (title.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Title cannot be more than 100 characters'
      });
    }

    // Validate genre
    const validGenres = ['fantasy', 'romance', 'mystery', 'science-fiction', 'horror'];
    if (!validGenres.includes(genre)) {
      return res.status(400).json({
        success: false,
        message: `${genre} is not a supported genre. Valid genres are: ${validGenres.join(', ')}`
      });
    }

    const story = await Story.create({
      title,
      content,
      genre,
      author: req.user._id,
      isAIGenerated,
      wordCount: content.trim().split(/\s+/).length,
      likes: []
    });

    // Add story to user's stories array
    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { stories: story._id } },
      { new: true }
    );

    const populatedStory = await Story.findById(story._id)
      .populate('author', 'username');

    res.status(201).json({
      success: true,
      data: populatedStory
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all stories with pagination and filters
// @route   GET /api/stories
// @access  Public
const getStories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;

    let query = {};

    // Apply filters if they exist
    if (req.query.genre) {
      query.genre = req.query.genre;
    }
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }
    if (req.query.author) {
      query.author = req.query.author;
    }

    const stories = await Story.find(query)
      .populate('author', 'username')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    const total = await Story.countDocuments(query);

    res.json({
      success: true,
      data: {
        stories,
        page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single story
// @route   GET /api/stories/:id
// @access  Public
const getStoryById = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('author', 'username')
      .populate('comments.user', 'username');

    if (story) {
      res.json({
        success: true,
        data: story
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update story
// @route   PUT /api/stories/:id
// @access  Private
const updateStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Check if user is story author
    if (story.author.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this story'
      });
    }

    // If content is being updated, recalculate word count
    if (req.body.content) {
      req.body.wordCount = req.body.content.trim().split(/\s+/).length;
    }

    const updatedStory = await Story.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    ).populate('author', 'username');

    res.json({
      success: true,
      data: updatedStory
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete story
// @route   DELETE /api/stories/:id
// @access  Private
const deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Check if user is story author
    if (story.author.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to delete this story'
      });
    }

    // Remove story from user's stories array
    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { stories: story._id } }
    );

    await Story.deleteOne({ _id: story._id });

    res.json({
      success: true,
      message: 'Story deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Like/Unlike story
// @route   POST /api/stories/:id/like
// @access  Private
const toggleLikeStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    const isLiked = story.likes.includes(req.user._id);

    if (isLiked) {
      // Unlike
      story.likes = story.likes.filter(
        like => like.toString() !== req.user._id.toString()
      );
    } else {
      // Like
      story.likes.push(req.user._id);
    }

    await story.save();

    res.json({
      success: true,
      data: {
        likes: story.likes.length,
        isLiked: !isLiked
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add comment to story
// @route   POST /api/stories/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { content } = req.body;
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    const comment = {
      user: req.user._id,
      content
    };

    story.comments.push(comment);
    await story.save();

    const populatedStory = await Story.findById(req.params.id)
      .populate('comments.user', 'username');

    res.status(201).json({
      success: true,
      data: populatedStory.comments
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get user's stories with pagination
// @route   GET /api/stories/user/:userId
// @access  Private
const getUserStories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;

    // Ensure user can only get their own stories
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to view these stories'
      });
    }

    const stories = await Story.find({ author: req.params.userId })
      .populate('author', 'username')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    const total = await Story.countDocuments({ author: req.params.userId });

    if (total === 0) {
      return res.json({
        success: true,
        message: 'No stories have been written yet',
        data: {
          stories: [],
          page: 1,
          pages: 0,
          total: 0
        }
      });
    }

    res.json({
      success: true,
      data: {
        stories,
        page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createStory,
  getStories,
  getStoryById,
  updateStory,
  deleteStory,
  toggleLikeStory,
  addComment,
  getUserStories
};
