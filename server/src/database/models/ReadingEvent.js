const mongoose = require('mongoose');

const readingEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  threadId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  url: {
    type: String,
    required: true
  },
  enterAt: {
    type: Date,
    required: true
  },
  leaveAt: {
    type: Date,
    required: true
  },
  dwellMsEffective: {
    type: Number,
    required: true,
    min: 0
  },
  maxScrollPct: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  completed: {
    type: Number,
    required: true,
    enum: [0, 1],
    default: 0
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  isFocused: {
    type: Boolean,
    default: true
  },
  idle: {
    type: Boolean,
    default: false
  },
  metadata: {
    userAgent: String,
    screenResolution: String,
    timezone: String,
    language: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 复合索引
readingEventSchema.index({ userId: 1, createdAt: -1 });
readingEventSchema.index({ threadId: 1, userId: 1 });
readingEventSchema.index({ sessionId: 1 });
readingEventSchema.index({ completed: 1, createdAt: -1 });
readingEventSchema.index({ createdAt: -1 });

// 虚拟字段
readingEventSchema.virtual('duration').get(function() {
  return this.leaveAt - this.enterAt;
});

readingEventSchema.virtual('isLongRead').get(function() {
  return this.dwellMsEffective > 300000; // 5分钟
});

readingEventSchema.virtual('isDeepRead').get(function() {
  return this.maxScrollPct > 75;
});

// 中间件：保存前更新updatedAt
readingEventSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// 实例方法：计算阅读质量分数
readingEventSchema.methods.getQualityScore = function() {
  const timeScore = Math.min(this.dwellMsEffective / 300000, 1); // 5分钟为满分
  const scrollScore = this.maxScrollPct / 100;
  const completionScore = this.completed;
  
  return (timeScore * 0.4 + scrollScore * 0.4 + completionScore * 0.2);
};

// 静态方法：获取用户阅读历史
readingEventSchema.statics.getUserReadingHistory = function(userId, limit = 100) {
  return this.find({ userId, completed: 1 })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('threadId', 'title category tags publishedAt');
};

// 静态方法：获取用户阅读统计
readingEventSchema.statics.getUserStats = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        totalReadTime: { $sum: '$dwellMsEffective' },
        completedReads: { $sum: '$completed' },
        avgScrollDepth: { $avg: '$maxScrollPct' },
        avgReadTime: { $avg: '$dwellMsEffective' },
        completionRate: {
          $avg: '$completed'
        }
      }
    }
  ]);
};

// 静态方法：获取热门内容
readingEventSchema.statics.getPopularContent = function(days = 7, limit = 20) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        completed: 1
      }
    },
    {
      $group: {
        _id: '$threadId',
        readCount: { $sum: 1 },
        totalReadTime: { $sum: '$dwellMsEffective' },
        avgScrollDepth: { $avg: '$maxScrollPct' },
        lastReadAt: { $max: '$createdAt' }
      }
    },
    {
      $sort: { readCount: -1, totalReadTime: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

// 静态方法：获取用户行为模式
readingEventSchema.statics.getUserBehaviorPattern = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate },
        completed: 1
      }
    },
    {
      $lookup: {
        from: 'threads',
        localField: 'threadId',
        foreignField: 'threadId',
        as: 'thread'
      }
    },
    {
      $unwind: '$thread'
    },
    {
      $group: {
        _id: null,
        preferredCategories: {
          $addToSet: '$thread.category'
        },
        preferredTags: {
          $addToSet: '$thread.tags'
        },
        activeHours: {
          $addToSet: { $hour: '$createdAt' }
        },
        avgReadTime: { $avg: '$dwellMsEffective' },
        avgScrollDepth: { $avg: '$maxScrollPct' },
        totalReads: { $sum: 1 }
      }
    }
  ]);
};

// 静态方法：清理旧数据
readingEventSchema.statics.cleanupOldData = function(days = 90) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.deleteMany({ createdAt: { $lt: cutoffDate } });
};

module.exports = mongoose.model('ReadingEvent', readingEventSchema);


