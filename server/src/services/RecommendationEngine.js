const natural = require('natural');
const { Matrix } = require('ml-matrix');
const kmeans = require('ml-kmeans');
const { euclidean } = require('ml-distance');
const Thread = require('../database/models/Thread');
const ReadingEvent = require('../database/models/ReadingEvent');
const User = require('../database/models/User');
const logger = require('../utils/logger');

class RecommendationEngine {
  constructor() {
    this.tfidf = new natural.TfIdf();
    this.tokenizer = new natural.WordTokenizer();
    this.stopWords = new Set([
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);
    
    // 缓存
    this.userProfiles = new Map();
    this.contentVectors = new Map();
    this.lastUpdate = new Map();
  }

  /**
   * 生成个性化推荐
   * @param {string} userId - 用户ID
   * @param {number} limit - 推荐数量
   * @param {string} algorithm - 推荐算法类型
   * @returns {Array} 推荐结果
   */
  async generateRecommendations(userId, limit = 10, algorithm = 'mixed') {
    try {
      logger.info(`开始为用户 ${userId} 生成推荐，算法: ${algorithm}`);
      
      // 获取用户信息
      const user = await User.findByUserId(userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      // 获取用户阅读历史
      const readingHistory = await ReadingEvent.getUserReadingHistory(userId, 100);
      
      if (readingHistory.length === 0) {
        logger.info(`用户 ${userId} 无阅读历史，返回热门内容`);
        return await this.getPopularContent(limit);
      }

      // 根据算法类型生成推荐
      let recommendations = [];
      
      switch (algorithm) {
        case 'content':
          recommendations = await this.getContentBasedRecommendations(userId, readingHistory, limit);
          break;
        case 'behavior':
          recommendations = await this.getBehaviorBasedRecommendations(userId, readingHistory, limit);
          break;
        case 'popular':
          recommendations = await this.getPopularContent(limit);
          break;
        case 'mixed':
        default:
          recommendations = await this.getMixedRecommendations(userId, readingHistory, limit);
          break;
      }

      // 过滤已读内容
      const readThreadIds = new Set(readingHistory.map(event => event.threadId));
      recommendations = recommendations.filter(rec => !readThreadIds.has(rec.threadId));

      // 应用多样性策略
      recommendations = this.applyDiversityStrategy(recommendations, limit);

      logger.info(`为用户 ${userId} 生成了 ${recommendations.length} 个推荐`);
      return recommendations.slice(0, limit);

    } catch (error) {
      logger.error('生成推荐失败:', error);
      return await this.getPopularContent(limit);
    }
  }

  /**
   * 基于内容的推荐
   */
  async getContentBasedRecommendations(userId, readingHistory, limit) {
    // 构建用户兴趣向量
    const userVector = await this.buildUserInterestVector(readingHistory);
    
    // 获取所有候选内容
    const candidates = await Thread.find({
      publishedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).limit(1000);

    // 计算相似度
    const scoredCandidates = candidates.map(thread => {
      const threadVector = this.buildThreadVector(thread);
      const similarity = this.calculateCosineSimilarity(userVector, threadVector);
      
      return {
        ...thread.toObject(),
        similarity,
        score: similarity
      };
    });

    return scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 基于行为的推荐
   */
  async getBehaviorBasedRecommendations(userId, readingHistory, limit) {
    // 分析用户行为模式
    const behaviorPattern = await this.analyzeUserBehavior(userId);
    
    // 获取候选内容
    const candidates = await Thread.find({
      publishedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).limit(1000);

    // 计算行为匹配度
    const scoredCandidates = candidates.map(thread => {
      const behaviorScore = this.calculateBehaviorMatch(thread, behaviorPattern);
      const freshnessScore = this.calculateFreshnessScore(thread.publishedAt);
      
      return {
        ...thread.toObject(),
        behaviorScore,
        freshnessScore,
        score: behaviorScore * 0.7 + freshnessScore * 0.3
      };
    });

    return scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 混合推荐算法
   */
  async getMixedRecommendations(userId, readingHistory, limit) {
    const [contentRecs, behaviorRecs, popularRecs] = await Promise.all([
      this.getContentBasedRecommendations(userId, readingHistory, Math.ceil(limit * 0.4)),
      this.getBehaviorBasedRecommendations(userId, readingHistory, Math.ceil(limit * 0.4)),
      this.getPopularContent(Math.ceil(limit * 0.2))
    ]);

    // 合并推荐结果
    const allRecommendations = [...contentRecs, ...behaviorRecs, ...popularRecs];
    
    // 去重
    const uniqueRecommendations = this.deduplicateRecommendations(allRecommendations);
    
    // 重新评分
    const rescoredRecommendations = uniqueRecommendations.map(rec => {
      const contentScore = rec.similarity || 0;
      const behaviorScore = rec.behaviorScore || 0;
      const popularityScore = rec.popularityScore || 0;
      
      return {
        ...rec,
        finalScore: contentScore * 0.4 + behaviorScore * 0.4 + popularityScore * 0.2
      };
    });

    return rescoredRecommendations
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);
  }

  /**
   * 获取热门内容
   */
  async getPopularContent(limit) {
    const popularThreads = await ReadingEvent.getPopularContent(7, limit);
    
    if (popularThreads.length === 0) {
      // 如果没有阅读数据，返回最新的帖子
      return await Thread.find()
        .sort({ publishedAt: -1 })
        .limit(limit);
    }

    // 获取完整的帖子信息
    const threadIds = popularThreads.map(p => p._id);
    const threads = await Thread.find({ threadId: { $in: threadIds } });
    
    // 合并数据
    return popularThreads.map(popular => {
      const thread = threads.find(t => t.threadId === popular._id);
      return {
        ...thread.toObject(),
        popularityScore: popular.readCount,
        readCount: popular.readCount,
        totalReadTime: popular.totalReadTime
      };
    });
  }

  /**
   * 构建用户兴趣向量
   */
  async buildUserInterestVector(readingHistory) {
    const texts = readingHistory.map(event => {
      const thread = event.threadId; // 假设已经populate了
      return `${thread.title} ${thread.category} ${(thread.tags || []).join(' ')}`;
    });

    // 使用TF-IDF构建向量
    const allTexts = texts.join(' ');
    const tokens = this.tokenizeText(allTexts);
    
    // 计算词频
    const wordFreq = {};
    tokens.forEach(token => {
      wordFreq[token] = (wordFreq[token] || 0) + 1;
    });

    return wordFreq;
  }

  /**
   * 构建帖子向量
   */
  buildThreadVector(thread) {
    const text = `${thread.title} ${thread.category} ${(thread.tags || []).join(' ')}`;
    const tokens = this.tokenizeText(text);
    
    const wordFreq = {};
    tokens.forEach(token => {
      wordFreq[token] = (wordFreq[token] || 0) + 1;
    });

    return wordFreq;
  }

  /**
   * 计算余弦相似度
   */
  calculateCosineSimilarity(vector1, vector2) {
    const allWords = new Set([...Object.keys(vector1), ...Object.keys(vector2)]);
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (const word of allWords) {
      const v1 = vector1[word] || 0;
      const v2 = vector2[word] || 0;
      
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 分析用户行为模式
   */
  async analyzeUserBehavior(userId) {
    const behaviorData = await ReadingEvent.getUserBehaviorPattern(userId);
    
    if (behaviorData.length === 0) {
      return {
        preferredCategories: [],
        preferredTags: [],
        activeHours: [],
        avgReadTime: 0,
        avgScrollDepth: 0
      };
    }

    const data = behaviorData[0];
    return {
      preferredCategories: data.preferredCategories || [],
      preferredTags: data.preferredTags.flat() || [],
      activeHours: data.activeHours || [],
      avgReadTime: data.avgReadTime || 0,
      avgScrollDepth: data.avgScrollDepth || 0,
      totalReads: data.totalReads || 0
    };
  }

  /**
   * 计算行为匹配度
   */
  calculateBehaviorMatch(thread, behaviorPattern) {
    let score = 0;

    // 版块匹配 (40%)
    if (thread.category && behaviorPattern.preferredCategories.includes(thread.category)) {
      score += 0.4;
    }

    // 标签匹配 (30%)
    if (thread.tags && thread.tags.length > 0) {
      const tagMatches = thread.tags.filter(tag => 
        behaviorPattern.preferredTags.includes(tag)
      ).length;
      score += 0.3 * (tagMatches / thread.tags.length);
    }

    // 时间匹配 (20%)
    const threadHour = new Date(thread.publishedAt).getHours();
    if (behaviorPattern.activeHours.includes(threadHour)) {
      score += 0.2;
    }

    // 阅读深度匹配 (10%)
    if (thread.contentLength) {
      const estimatedDepth = Math.min(100, (thread.contentLength / 1000) * 20);
      const depthMatch = 1 - Math.abs(behaviorPattern.avgScrollDepth - estimatedDepth) / 100;
      score += 0.1 * Math.max(0, depthMatch);
    }

    return Math.min(1, score);
  }

  /**
   * 计算新鲜度分数
   */
  calculateFreshnessScore(publishedAt) {
    const now = new Date();
    const publishTime = new Date(publishedAt);
    const daysDiff = (now - publishTime) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 1) return 1.0;
    if (daysDiff <= 7) return 0.8 + 0.2 * Math.exp(-daysDiff / 3);
    if (daysDiff <= 30) return 0.5 + 0.3 * Math.exp(-(daysDiff - 7) / 10);
    return 0.2 * Math.exp(-(daysDiff - 30) / 30);
  }

  /**
   * 应用多样性策略
   */
  applyDiversityStrategy(recommendations, limit) {
    if (recommendations.length <= limit) return recommendations;

    const result = [];
    const usedCategories = new Set();
    const usedTags = new Set();

    // 优先选择不同版块的内容
    for (const rec of recommendations) {
      if (result.length >= limit) break;
      
      const category = rec.category;
      const tags = rec.tags || [];
      
      // 检查多样性
      const categoryDiversity = !usedCategories.has(category);
      const tagDiversity = tags.some(tag => !usedTags.has(tag));
      
      if (categoryDiversity || tagDiversity || result.length < limit * 0.5) {
        result.push(rec);
        usedCategories.add(category);
        tags.forEach(tag => usedTags.add(tag));
      }
    }

    return result;
  }

  /**
   * 去重推荐结果
   */
  deduplicateRecommendations(recommendations) {
    const seen = new Set();
    return recommendations.filter(rec => {
      if (seen.has(rec.threadId)) return false;
      seen.add(rec.threadId);
      return true;
    });
  }

  /**
   * 文本分词
   */
  tokenizeText(text) {
    return this.tokenizer.tokenize(text.toLowerCase())
      .filter(token => 
        token.length > 1 && 
        !this.stopWords.has(token) && 
        !/^\d+$/.test(token)
      );
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.userProfiles.clear();
    this.contentVectors.clear();
    this.lastUpdate.clear();
    logger.info('推荐引擎缓存已清理');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      userProfiles: this.userProfiles.size,
      contentVectors: this.contentVectors.size,
      lastUpdate: this.lastUpdate.size
    };
  }
}

module.exports = new RecommendationEngine();


