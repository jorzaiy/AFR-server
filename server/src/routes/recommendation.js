const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const RecommendationEngine = require('../services/RecommendationEngine');
const User = require('../database/models/User');
const ReadingEvent = require('../database/models/ReadingEvent');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// 验证中间件
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: '请求参数错误',
      details: errors.array()
    });
  }
  next();
};

/**
 * 获取个性化推荐
 * GET /api/recommendations/:userId
 */
router.get('/:userId', [
  param('userId').isString().notEmpty().withMessage('用户ID不能为空'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('推荐数量必须在1-50之间'),
  query('algorithm').optional().isIn(['content', 'behavior', 'mixed', 'popular']).withMessage('算法类型无效'),
  query('forum').optional().isString().withMessage('论坛参数无效')
], validateRequest, async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      limit = 10, 
      algorithm = 'mixed', 
      forum = 'all' 
    } = req.query;

    logger.info(`获取用户 ${userId} 的推荐，参数:`, { limit, algorithm, forum });

    // 验证用户存在
    const user = await User.findByUserId(userId);
    if (!user) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }

    // 更新用户活跃时间
    await user.updateLastActive();

    // 生成推荐
    const recommendations = await RecommendationEngine.generateRecommendations(
      userId, 
      parseInt(limit), 
      algorithm
    );

    // 应用论坛过滤
    let filteredRecommendations = recommendations;
    if (forum !== 'all') {
      filteredRecommendations = recommendations.filter(rec => rec.forumId === forum);
    }

    // 获取推荐统计信息
    const stats = await getRecommendationStats(userId);

    res.json({
      success: true,
      data: {
        recommendations: filteredRecommendations,
        stats,
        algorithm,
        forum,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取推荐失败:', error);
    res.status(500).json({
      error: '获取推荐失败',
      message: error.message
    });
  }
});

/**
 * 标记推荐为已点击
 * POST /api/recommendations/:userId/click
 */
router.post('/:userId/click', [
  param('userId').isString().notEmpty().withMessage('用户ID不能为空'),
  body('threadId').isString().notEmpty().withMessage('帖子ID不能为空'),
  body('title').optional().isString().withMessage('标题格式无效')
], validateRequest, async (req, res) => {
  try {
    const { userId } = req.params;
    const { threadId, title } = req.body;

    logger.info(`用户 ${userId} 点击了推荐: ${threadId} - ${title}`);

    // 记录点击事件（可以用于改进推荐算法）
    // 这里可以添加点击统计逻辑

    res.json({
      success: true,
      message: '点击记录成功'
    });

  } catch (error) {
    logger.error('记录推荐点击失败:', error);
    res.status(500).json({
      error: '记录点击失败',
      message: error.message
    });
  }
});

/**
 * 标记推荐为不感兴趣
 * POST /api/recommendations/:userId/dislike
 */
router.post('/:userId/dislike', [
  param('userId').isString().notEmpty().withMessage('用户ID不能为空'),
  body('threadId').isString().notEmpty().withMessage('帖子ID不能为空'),
  body('reason').optional().isString().withMessage('原因格式无效')
], validateRequest, async (req, res) => {
  try {
    const { userId } = req.params;
    const { threadId, reason } = req.body;

    logger.info(`用户 ${userId} 标记不感兴趣: ${threadId}, 原因: ${reason}`);

    // 这里可以添加不感兴趣记录逻辑
    // 用于改进推荐算法，避免推荐类似内容

    res.json({
      success: true,
      message: '不感兴趣记录成功'
    });

  } catch (error) {
    logger.error('记录不感兴趣失败:', error);
    res.status(500).json({
      error: '记录失败',
      message: error.message
    });
  }
});

/**
 * 获取推荐统计信息
 * GET /api/recommendations/:userId/stats
 */
router.get('/:userId/stats', [
  param('userId').isString().notEmpty().withMessage('用户ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await getRecommendationStats(userId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('获取推荐统计失败:', error);
    res.status(500).json({
      error: '获取统计失败',
      message: error.message
    });
  }
});

/**
 * 清除推荐缓存
 * DELETE /api/recommendations/cache
 */
router.delete('/cache', auth, async (req, res) => {
  try {
    RecommendationEngine.clearCache();

    res.json({
      success: true,
      message: '推荐缓存已清除'
    });

  } catch (error) {
    logger.error('清除推荐缓存失败:', error);
    res.status(500).json({
      error: '清除缓存失败',
      message: error.message
    });
  }
});

/**
 * 获取推荐引擎状态
 * GET /api/recommendations/status
 */
router.get('/status', auth, async (req, res) => {
  try {
    const cacheStats = RecommendationEngine.getCacheStats();

    res.json({
      success: true,
      data: {
        cacheStats,
        engineStatus: 'running',
        lastUpdate: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取推荐引擎状态失败:', error);
    res.status(500).json({
      error: '获取状态失败',
      message: error.message
    });
  }
});

/**
 * 获取推荐统计信息
 */
async function getRecommendationStats(userId) {
  try {
    const [userStats, totalThreads, userProfile] = await Promise.all([
      ReadingEvent.getUserStats(userId, 30),
      Thread.countDocuments(),
      User.findByUserId(userId)
    ]);

    const stats = userStats[0] || {
      totalEvents: 0,
      totalReadTime: 0,
      completedReads: 0,
      avgScrollDepth: 0,
      avgReadTime: 0,
      completionRate: 0
    };

    return {
      user: {
        totalReads: stats.totalEvents,
        totalReadTime: stats.totalReadTime,
        completedReads: stats.completedReads,
        completionRate: stats.completionRate,
        avgReadTime: stats.avgReadTime,
        avgScrollDepth: stats.avgScrollDepth
      },
      system: {
        totalThreads,
        availableForRecommendation: totalThreads - stats.totalEvents
      },
      profile: userProfile ? {
        isNewUser: userProfile.isNewUser,
        preferences: userProfile.preferences
      } : null
    };

  } catch (error) {
    logger.error('获取推荐统计失败:', error);
    return {
      user: {},
      system: {},
      profile: null
    };
  }
}

module.exports = router;


