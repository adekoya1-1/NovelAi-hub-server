const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    minlength: [100, 'Story must be at least 100 characters long']
  },
  genre: {
    type: String,
    required: [true, 'Genre is required'],
    enum: {
      values: [
        'fantasy',
        'romance',
        'mystery',
        'science-fiction',
        'horror',
        'thriller',
        'historical-fiction',
        'adventure',
        'young-adult',
        'literary-fiction',
        'dystopian',
        'paranormal',
        'contemporary',
        'crime',
        'drama',
        'comedy',
        'action',
        'slice-of-life',
        'supernatural',
        'psychological'
      ],
      message: '{VALUE} is not a supported genre'
    }
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isAIGenerated: {
    type: Boolean,
    default: false
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  wordCount: {
    type: Number,
    required: true,
    min: [1, 'Story must contain at least one word']
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  },
  image: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for story URL
storySchema.virtual('url').get(function() {
  return `/stories/${this._id}`;
});

// Index for text search
storySchema.index({ title: 'text', content: 'text' });

// Pre-save middleware to calculate word count
storySchema.pre('save', function(next) {
  if (this.isModified('content')) {
    this.wordCount = this.content.trim().split(/\s+/).length;
  }
  next();
});

// Static method to get popular stories
storySchema.statics.getPopular = function() {
  return this.find()
    .sort({ 'likes.length': -1 })
    .limit(10)
    .populate('author', 'username');
};

// Method to check if story is liked by user
storySchema.methods.isLikedByUser = function(userId) {
  return this.likes.includes(userId);
};

const Story = mongoose.model('Story', storySchema);

module.exports = Story;
