const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  preferences: {
    recommendationCount: {
      type: Number,
      default: 10,
      min: 1,
      max: 50
    },
    algorithm: {
      type: String,
      enum: ['content', 'behavior', 'mixed', 'popular'],
      default: 'mixed'
    },
    autoRefresh: {
      type: Boolean,
      default: true
    },
    thresholdSeconds: {
      type: Number,
      default: 20,
      min: 5,
      max: 300
    },
    thresholdScroll: {
      type: Number,
      default: 50,
      min: 10,
      max: 100
    }
  },
  profile: {
    totalReadTime: {
      type: Number,
      default: 0
    },
    totalReadCount: {
      type: Number,
      default: 0
    },
    averageReadTime: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
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

// 索引
userSchema.index({ userId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ 'profile.lastActiveAt': -1 });
userSchema.index({ createdAt: -1 });

// 虚拟字段
userSchema.virtual('isNewUser').get(function() {
  const daysSinceCreation = (Date.now() - this.createdAt) / (1000 * 60 * 60 * 24);
  return daysSinceCreation < 7;
});

// 中间件：保存前更新updatedAt
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// 中间件：密码加密
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 实例方法：验证密码
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 实例方法：更新活跃时间
userSchema.methods.updateLastActive = function() {
  this.profile.lastActiveAt = new Date();
  return this.save();
};

// 实例方法：更新阅读统计
userSchema.methods.updateReadingStats = function(readTime, completed = false) {
  this.profile.totalReadTime += readTime;
  this.profile.totalReadCount += 1;
  this.profile.averageReadTime = this.profile.totalReadTime / this.profile.totalReadCount;
  
  if (completed) {
    // 更新完成率（简化计算）
    const completionRate = (this.profile.totalReadCount * 0.8) / this.profile.totalReadCount;
    this.profile.completionRate = Math.min(completionRate, 1);
  }
  
  return this.save();
};

// 静态方法：根据用户ID查找
userSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId, isActive: true });
};

// 静态方法：获取活跃用户
userSchema.statics.getActiveUsers = function(days = 7) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.find({
    'profile.lastActiveAt': { $gte: cutoffDate },
    isActive: true
  });
};

// 静态方法：获取用户统计
userSchema.statics.getUserStats = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        newUsers: {
          $sum: {
            $cond: [
              { $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              1,
              0
            ]
          }
        },
        activeUsers: {
          $sum: {
            $cond: [
              { $gte: ['$profile.lastActiveAt', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
              1,
              0
            ]
          }
        },
        avgReadTime: { $avg: '$profile.averageReadTime' },
        avgCompletionRate: { $avg: '$profile.completionRate' }
      }
    }
  ]);
};

module.exports = mongoose.model('User', userSchema);


