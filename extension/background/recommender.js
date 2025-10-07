// 推荐算法模块
// 基于用户阅读历史进行内容推荐

import storage from './storage.js';

/**
 * 获取已点击的推荐帖子列表
 * @returns {Promise<Set<string>>} - 已点击的帖子ID集合
 */
async function getClickedRecommendations() {
  try {
    const clickedKey = 'clicked_recommendations';
    const result = await chrome.storage.local.get([clickedKey]);
    const clickedList = result[clickedKey] || [];
    return new Set(clickedList);
  } catch (error) {
    console.error('[recommender] Error getting clicked recommendations:', error);
    return new Set();
  }
}

/**
 * 预过滤帖子数据，减少后续计算量
 * @param {Array} allThreads - 所有帖子
 * @param {Array} readEvents - 阅读事件
 * @param {Array} dislikedThreads - 不感兴趣的帖子
 * @param {string} forum - 论坛过滤
 * @returns {Array} - 预过滤后的帖子列表
 */
async function preFilterThreads(allThreads, readEvents, dislikedThreads, forum) {
  const startTime = performance.now();
  
  // 创建ID集合用于快速查找
  const readThreadIds = new Set(readEvents.map(event => event.threadId));
  const dislikedThreadIds = new Set(dislikedThreads.map(thread => thread.threadId));
  
  // 时间过滤：只考虑最近30天的帖子
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // 获取不感兴趣标签设置
  const settings = await chrome.storage.local.get(['dislikedTags']);
  const dislikedTags = settings.dislikedTags || [];
  
  // 预过滤：时间 + 论坛 + 已读状态 + 不感兴趣 + 标签过滤
  let filtered = allThreads.filter(thread => {
    // 时间过滤
    const publishTime = new Date(thread.publishedAt || thread.createdAt);
    if (publishTime <= thirtyDaysAgo) return false;
    
    // 论坛过滤
    if (forum !== 'all' && thread.forumId !== forum) return false;
    
    // 已读过滤
    if (readThreadIds.has(thread.threadId)) return false;
    
    // 不感兴趣过滤
    if (dislikedThreadIds.has(thread.threadId)) return false;
    
    // 改进的标签过滤：精确匹配和模糊匹配结合
    if (dislikedTags.length > 0 && thread.tags && thread.tags.length > 0) {
      const hasDislikedTag = thread.tags.some(tag => {
        return dislikedTags.some(dislikedTag => {
          const tagLower = tag.toLowerCase().trim();
          const dislikedTagLower = dislikedTag.toLowerCase().trim();
          
          // 精确匹配
          if (tagLower === dislikedTagLower) return true;
          
          // 部分匹配（但更严格）
          if (tagLower.includes(dislikedTagLower) && dislikedTagLower.length >= 3) return true;
          if (dislikedTagLower.includes(tagLower) && tagLower.length >= 3) return true;
          
          return false;
        });
      });
      if (hasDislikedTag) return false;
    }
    
    return true;
  });
  
  // 如果过滤后数据太少，放宽时间限制
  if (filtered.length < 50) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    filtered = allThreads.filter(thread => {
      const publishTime = new Date(thread.publishedAt || thread.createdAt);
      if (publishTime <= thirtyDaysAgo) return false;
      if (forum !== 'all' && thread.forumId !== forum) return false;
      if (readThreadIds.has(thread.threadId)) return false;
      if (dislikedThreadIds.has(thread.threadId)) return false;
      
      // 标签过滤：如果帖子包含不感兴趣标签，则过滤掉
      if (dislikedTags.length > 0 && thread.tags && thread.tags.length > 0) {
        const hasDislikedTag = thread.tags.some(tag => 
          dislikedTags.some(dislikedTag => 
            tag.toLowerCase().includes(dislikedTag.toLowerCase()) ||
            dislikedTag.toLowerCase().includes(tag.toLowerCase())
          )
        );
        if (hasDislikedTag) return false;
      }
      
      return true;
    });
  }
  
  // 限制最大处理数量，避免性能问题
  if (filtered.length > 500) {
    // 按时间排序，优先处理最新的帖子
    filtered = filtered
      .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
      .slice(0, 500);
  }
  
  const endTime = performance.now();
  console.log(`[recommender] Pre-filtering completed in ${(endTime - startTime).toFixed(2)}ms`);
  
  return filtered;
}

/**
 * 清除已点击的推荐帖子列表
 * @returns {Promise<void>}
 */
async function clearClickedRecommendations() {
  try {
    const clickedKey = 'clicked_recommendations';
    await chrome.storage.local.remove([clickedKey]);
    console.log('[recommender] Cleared clicked recommendations');
  } catch (error) {
    console.error('[recommender] Error clearing clicked recommendations:', error);
  }
}

/**
 * 清除所有推荐相关缓存和数据
 * @returns {Promise<void>}
 */
async function clearAllRecommendationData() {
  try {
    console.log('[recommender] Clearing all recommendation data...');
    
    // 清除TF-IDF缓存
    tfidfCache.clear();
    console.log('[recommender] Cleared TF-IDF cache');
    
    // 清除已点击推荐列表
    await clearClickedRecommendations();
    
    // 清除不感兴趣标签设置
    await chrome.storage.local.remove(['dislikedTags']);
    console.log('[recommender] Cleared disliked tags');
    
    // 清除推荐算法设置
    await chrome.storage.local.remove([
      'recommendationCount',
      'recommendationAlgorithm',
      'enableAutoRefresh'
    ]);
    console.log('[recommender] Cleared recommendation settings');
    
    console.log('[recommender] All recommendation data cleared successfully');
  } catch (error) {
    console.error('[recommender] Error clearing recommendation data:', error);
    throw error;
  }
}

// TF-IDF缓存
const tfidfCache = new Map();

/**
 * 改进的文本相似度计算（真正的TF-IDF实现）
 * @param {string} text1 - 文本1
 * @param {string} text2 - 文本2
 * @param {Array} allDocuments - 所有文档集合（用于计算IDF）
 * @returns {number} - 相似度分数 (0-1)
 */
function calculateTFIDFSimilarity(text1, text2, allDocuments = []) {
  if (!text1 || !text2) return 0;
  
  // 创建缓存键（使用文本的前100个字符）
  const cacheKey = `${text1.slice(0, 100)}_${text2.slice(0, 100)}`;
  if (tfidfCache.has(cacheKey)) {
    return tfidfCache.get(cacheKey);
  }
  
  // 改进的分词：支持中英文，过滤停用词
  const words1 = tokenizeText(text1);
  const words2 = tokenizeText(text2);
  
  if (words1.length === 0 || words2.length === 0) {
    tfidfCache.set(cacheKey, 0);
    return 0;
  }
  
  // 计算TF-IDF向量
  const tfidf1 = calculateTFIDFVector(words1, allDocuments);
  const tfidf2 = calculateTFIDFVector(words2, allDocuments);
  
  // 计算余弦相似度
  const similarity = calculateCosineSimilarityFromVectors(tfidf1, tfidf2);
  
  // 缓存结果
  tfidfCache.set(cacheKey, similarity);
  
  // 限制缓存大小，避免内存泄漏
  if (tfidfCache.size > 1000) {
    // 删除最旧的50%缓存项
    const keysToDelete = Array.from(tfidfCache.keys()).slice(0, Math.floor(tfidfCache.size / 2));
    keysToDelete.forEach(key => tfidfCache.delete(key));
  }
  
  return similarity;
}

/**
 * 改进的文本分词
 * @param {string} text - 输入文本
 * @returns {Array} - 分词结果
 */
function tokenizeText(text) {
  // 停用词列表
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
  ]);
  
  // 中英文分词
  const words = text.toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ') // 保留中英文和数字
    .split(/\s+/)
    .filter(word => 
      word.length > 1 && 
      !stopWords.has(word) && 
      !/^\d+$/.test(word) // 过滤纯数字
    );
  
  return words;
}

/**
 * 计算词频
 * @param {Array} words - 词汇列表
 * @returns {Object} - 词频统计
 */
function calculateWordFrequency(words) {
  const freq = {};
  words.forEach(word => {
    freq[word] = (freq[word] || 0) + 1;
  });
  return freq;
}

/**
 * 计算TF-IDF向量
 * @param {Array} words - 词汇列表
 * @param {Array} allDocuments - 所有文档集合
 * @returns {Object} - TF-IDF向量
 */
function calculateTFIDFVector(words, allDocuments) {
  const tfidf = {};
  const wordFreq = calculateWordFrequency(words);
  const totalWords = words.length;
  
  // 计算每个词的TF-IDF值
  for (const word in wordFreq) {
    const tf = wordFreq[word] / totalWords; // 词频
    const idf = calculateIDF(word, allDocuments); // 逆文档频率
    tfidf[word] = tf * idf;
  }
  
  return tfidf;
}

/**
 * 计算逆文档频率（IDF）
 * @param {string} word - 词汇
 * @param {Array} allDocuments - 所有文档集合
 * @returns {number} - IDF值
 */
function calculateIDF(word, allDocuments) {
  if (!allDocuments || allDocuments.length === 0) {
    return 1; // 如果没有文档集合，返回默认值
  }
  
  let documentCount = 0;
  allDocuments.forEach(doc => {
    if (doc && doc.toLowerCase().includes(word.toLowerCase())) {
      documentCount++;
    }
  });
  
  if (documentCount === 0) return 0;
  
  return Math.log(allDocuments.length / documentCount);
}

/**
 * 计算余弦相似度（从TF-IDF向量）
 * @param {Object} tfidf1 - TF-IDF向量1
 * @param {Object} tfidf2 - TF-IDF向量2
 * @returns {number} - 余弦相似度
 */
function calculateCosineSimilarityFromVectors(tfidf1, tfidf2) {
  const allWords = new Set([...Object.keys(tfidf1), ...Object.keys(tfidf2)]);
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (const word of allWords) {
    const v1 = tfidf1[word] || 0;
    const v2 = tfidf2[word] || 0;
    
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 计算余弦相似度（兼容旧版本）
 * @param {Object} freq1 - 词频1
 * @param {Object} freq2 - 词频2
 * @param {Array} words1 - 词汇1
 * @param {Array} words2 - 词汇2
 * @returns {number} - 余弦相似度
 */
function calculateCosineSimilarity(freq1, freq2, words1, words2) {
  const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (const word of allWords) {
    const f1 = freq1[word] || 0;
    const f2 = freq2[word] || 0;
    
    dotProduct += f1 * f2;
    norm1 += f1 * f1;
    norm2 += f2 * f2;
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 计算新鲜度衰减分数
 * @param {string} publishedAt - 发布时间
 * @returns {number} - 新鲜度分数 (0-1)
 */
function calculateFreshnessScore(publishedAt) {
  if (!publishedAt) return 0.5; // 默认分数
  
  const now = new Date();
  const publishTime = new Date(publishedAt);
  const daysDiff = (now - publishTime) / (1000 * 60 * 60 * 24);
  
  // 改进的衰减函数：更平滑的衰减曲线
  if (daysDiff <= 1) return 1.0; // 1天内最高分
  if (daysDiff <= 7) return 0.8 + 0.2 * Math.exp(-daysDiff / 3); // 7天内较高分
  if (daysDiff <= 30) return 0.5 + 0.3 * Math.exp(-(daysDiff - 7) / 10); // 30天内中等分
  return 0.2 * Math.exp(-(daysDiff - 30) / 30); // 30天后低分
}

/**
 * 计算作者亲和度分数
 * @param {Array} readEvents - 用户阅读事件
 * @param {string} authorId - 作者ID
 * @returns {number} - 作者亲和度分数 (0-1)
 */
function calculateAuthorAffinity(readEvents, authorId) {
  if (!authorId || !readEvents || readEvents.length === 0) return 0;
  
  // 统计用户阅读该作者帖子的次数
  const authorReadCount = readEvents.filter(event => 
    event.authorId === authorId && event.completed === 1
  ).length;
  
  // 简单的亲和度计算：阅读次数 / 总阅读次数
  const totalReadCount = readEvents.filter(event => event.completed === 1).length;
  if (totalReadCount === 0) return 0;
  
  return Math.min(1, authorReadCount / totalReadCount);
}

/**
 * 获取用户阅读历史文本（改进版本，包含更多内容信息）
 * @param {Array} readEvents - 阅读事件
 * @param {Array} threads - 帖子数据
 * @returns {string} - 合并的阅读历史文本
 */
function getUserReadingHistory(readEvents, threads) {
  const completedEvents = readEvents.filter(event => event.completed === 1);
  const threadMap = new Map(threads.map(thread => [thread.threadId, thread]));
  
  const historyTexts = completedEvents.map(event => {
    const thread = threadMap.get(event.threadId);
    if (!thread) return '';
    
    // 包含更多内容信息，提高相似度计算准确性
    let content = `${thread.title} ${thread.category} ${(thread.tags || []).join(' ')}`;
    
    // 如果有内容摘要，也加入分析
    if (thread.content) {
      // 取内容的前200个字符作为摘要
      const contentSummary = thread.content.replace(/<[^>]*>/g, '').substring(0, 200);
      content += ` ${contentSummary}`;
    }
    
    // 如果有作者信息，也加入分析
    if (thread.authorName) {
      content += ` ${thread.authorName}`;
    }
    
    return content;
  }).filter(Boolean);
  
  return historyTexts.join(' ');
}

/**
 * 生成推荐列表
 * @param {number} limit - 推荐数量限制
 * @param {string} forum - 论坛过滤 ('all', 'linux.do', 'nodeseek.com')
 * @param {boolean} forceRefresh - 是否强制刷新推荐
 * @returns {Array} - 推荐帖子列表
 */
async function generateRecommendations(limit = 10, forum = 'all', forceRefresh = false) {
  try {
    console.log('[recommender] Starting recommendation generation...');
    
    // 性能优化：先获取基础数据，然后进行预过滤
    const [readEvents, allThreads, dislikedThreads] = await Promise.all([
      storage.getAllReadEvents(),
      storage.getAllThreads(),
      storage.getAllDislikedThreads()
    ]);
    
    // 获取不感兴趣标签设置
    const settings = await chrome.storage.local.get(['dislikedTags']);
    const dislikedTags = settings.dislikedTags || [];
    
    // 性能优化：预过滤数据，减少后续计算量
    const preFilteredThreads = await preFilterThreads(allThreads, readEvents, dislikedThreads, forum);
    console.log(`[recommender] Pre-filtered from ${allThreads.length} to ${preFilteredThreads.length} threads`);
    
    console.log('[recommender] Data loaded:', {
      readEventsCount: readEvents.length,
      allThreadsCount: allThreads.length,
      dislikedThreadsCount: dislikedThreads.length,
      preFilteredCount: preFilteredThreads.length
    });
    
    if (readEvents.length === 0 || preFilteredThreads.length === 0) {
      console.log('[recommender] No reading history or threads available');
      return [];
    }
    
    // 获取用户阅读历史文本（使用预过滤的数据）
    const userHistory = getUserReadingHistory(readEvents, preFilteredThreads);
    
    // 准备所有文档集合用于TF-IDF计算
    const allDocuments = preFilteredThreads.map(thread => {
      let content = `${thread.title} ${thread.category} ${(thread.tags || []).join(' ')}`;
      if (thread.content) {
        const contentSummary = thread.content.replace(/<[^>]*>/g, '').substring(0, 200);
        content += ` ${contentSummary}`;
      }
      return content;
    });
    
    // 使用预过滤的数据
    const recentThreads = preFilteredThreads;
    
    // 获取已读帖子、不感兴趣帖子和已点击帖子的ID集合
    const readThreadIds = new Set(readEvents.map(event => event.threadId));
    const dislikedThreadIds = new Set(dislikedThreads.map(thread => thread.threadId));
    const clickedThreadIds = await getClickedRecommendations();
    
    console.log('[recommender] Debug info:', {
      totalReadEvents: readEvents.length,
      readThreadIds: Array.from(readThreadIds),
      totalDislikedThreads: dislikedThreads.length,
      dislikedThreadIds: Array.from(dislikedThreadIds),
      clickedThreadIds: Array.from(clickedThreadIds),
      recentThreadsCount: recentThreads.length,
      completedEvents: readEvents.filter(e => e.completed === 1).length
    });
    
    console.log('[recommender] Clicked threads details:', {
      clickedCount: clickedThreadIds.size,
      clickedList: Array.from(clickedThreadIds),
      recentThreadIds: recentThreads.map(t => t.threadId).slice(0, 5)
    });
    
    // 性能优化：限制处理数量，避免性能问题
    const maxProcessCount = Math.min(recentThreads.length, 200); // 限制最多处理200个帖子
    const threadsToProcess = recentThreads.slice(0, maxProcessCount);
    
    console.log(`[recommender] Processing ${threadsToProcess.length} threads (limited from ${recentThreads.length})`);
    
    const startTime = performance.now();
    
    // 一次性处理所有帖子，确保结果一致性
    const scoredThreads = threadsToProcess
      .filter(thread => {
        const isRead = readThreadIds.has(thread.threadId);
        const isDisliked = dislikedThreadIds.has(thread.threadId);
        const isClicked = clickedThreadIds.has(thread.threadId);
        
        // 主要过滤已读帖子，其他条件更宽松
        if (isRead) return false;
        // 不感兴趣的内容永远不推荐，即使强制刷新也不推荐
        if (isDisliked) return false;
        if (isClicked && !forceRefresh) return false;
        
        // 改进的标签过滤：精确匹配和模糊匹配结合
        if (dislikedTags.length > 0 && thread.tags && thread.tags.length > 0) {
          const hasDislikedTag = thread.tags.some(tag => {
            return dislikedTags.some(dislikedTag => {
              const tagLower = tag.toLowerCase().trim();
              const dislikedTagLower = dislikedTag.toLowerCase().trim();
              
              // 精确匹配
              if (tagLower === dislikedTagLower) return true;
              
              // 部分匹配（但更严格）
              if (tagLower.includes(dislikedTagLower) && dislikedTagLower.length >= 3) return true;
              if (dislikedTagLower.includes(tagLower) && tagLower.length >= 3) return true;
              
              return false;
            });
          });
          if (hasDislikedTag) return false;
        }
        
        return true;
      })
      .map(thread => {
        const threadText = `${thread.title} ${thread.category} ${(thread.tags || []).join(' ')}`;
        
        // 多维度评分系统（使用改进的TF-IDF）
        const contentSimilarity = calculateTFIDFSimilarity(userHistory, threadText, allDocuments);
        const behaviorSimilarity = calculateBehaviorSimilarity(readEvents, thread);
        const freshnessScore = calculateFreshnessScore(thread.publishedAt || thread.createdAt);
        const popularityScore = calculatePopularityScore(thread);
        
        // 偏好标签奖励
        const preferredTagBonus = calculatePreferredTagBonus(thread, settings.preferredTags || []);
        
        // 动态权重调整（优化版本）
        let weights = {
          content: 0.4,      // 内容相似度（提高权重）
          behavior: 0.3,     // 行为相似度（提高权重）
          freshness: 0.15,   // 新鲜度
          popularity: 0.1,   // 热度
          diversity: 0.05    // 多样性奖励
        };
        
        // 根据用户行为数据量调整权重
        const completedEvents = readEvents.filter(e => e.completed === 1);
        if (completedEvents.length < 5) {
          // 新用户：更依赖热度和新鲜度
          weights.popularity = 0.25;
          weights.freshness = 0.25;
          weights.content = 0.3;
          weights.behavior = 0.15;
        } else if (completedEvents.length < 20) {
          // 中等用户：平衡各项指标
          weights.content = 0.35;
          weights.behavior = 0.25;
          weights.freshness = 0.2;
          weights.popularity = 0.15;
        } else {
          // 老用户：更依赖内容和行为相似度
          weights.content = 0.45;
          weights.behavior = 0.35;
          weights.freshness = 0.1;
          weights.popularity = 0.05;
        }
        
        // 多样性奖励：避免推荐过于相似的内容
        const diversityBonus = calculateDiversityBonus(thread, threadsToProcess);
        
        // 不感兴趣内容惩罚：检查是否与不感兴趣的内容相似
        const dislikePenalty = calculateDislikePenalty(thread, dislikedThreads);
        
        // 综合分数
        const finalScore = 
          weights.content * contentSimilarity +
          weights.behavior * behaviorSimilarity +
          weights.freshness * freshnessScore +
          weights.popularity * popularityScore +
          weights.diversity * diversityBonus +
          preferredTagBonus - // 加上偏好标签奖励
          dislikePenalty; // 减去不感兴趣惩罚
        
        return {
          ...thread,
          recommendationScore: finalScore,
          contentSimilarity,
          behaviorSimilarity,
          freshnessScore,
          popularityScore,
          diversityBonus,
          weights
        };
      });
    
    const endTime = performance.now();
    console.log(`[recommender] Scoring completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    // 按分数排序并去重
    let sortedThreads = scoredThreads
      .filter(thread => thread.recommendationScore > 0.01) // 降低分数阈值
      .sort((a, b) => b.recommendationScore - a.recommendationScore);
    
    // 如果过滤后帖子太少，进一步降低阈值
    if (sortedThreads.length < 5) {
      console.log('[recommender] Too few high-score threads, lowering threshold');
      sortedThreads = scoredThreads
        .filter(thread => thread.recommendationScore > 0) // 只过滤负分帖子
        .sort((a, b) => b.recommendationScore - a.recommendationScore);
    }
    
    // 如果强制刷新，添加一些随机性来展示不同的内容
    if (forceRefresh && sortedThreads.length > limit) {
      // 保留前50%的高分帖子，其余随机排序
      const topCount = Math.ceil(sortedThreads.length * 0.5);
      const topThreads = sortedThreads.slice(0, topCount);
      const remainingThreads = sortedThreads.slice(topCount);
      
      // 随机打乱剩余帖子
      for (let i = remainingThreads.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingThreads[i], remainingThreads[j]] = [remainingThreads[j], remainingThreads[i]];
      }
      
      sortedThreads = [...topThreads, ...remainingThreads];
    }
    
    sortedThreads = sortedThreads.slice(0, limit);
    
    console.log(`[recommender] Generated ${sortedThreads.length} recommendations`);
    console.log('[recommender] Final recommendations:', sortedThreads.map(t => ({
      threadId: t.threadId,
      title: t.title,
      score: t.recommendationScore
    })));
    
    // 计算过滤统计信息
    const filterStats = {
      totalThreads: allThreads.length,
      preFiltered: preFilteredThreads.length,
      dislikedFiltered: dislikedThreads.length,
      readFiltered: readEvents.length,
      finalRecommendations: sortedThreads.length
    };
    
    console.log('[recommender] Filter statistics:', filterStats);
    
    // 如果推荐内容太少，添加一些新帖子作为备选
    if (sortedThreads.length < 3) {
      console.log('[recommender] Too few recommendations, adding new threads as fallback');
      const newThreads = recentThreads
        .filter(thread => !readThreadIds.has(thread.threadId))
        .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
        .slice(0, 5);
      
      // 合并推荐和新帖子，去重
      const allRecs = [...sortedThreads, ...newThreads];
      const uniqueRecs = allRecs.filter((thread, index, self) => 
        index === self.findIndex(t => t.threadId === thread.threadId)
      );
      
      console.log(`[recommender] Added ${uniqueRecs.length - sortedThreads.length} fallback recommendations`);
      return uniqueRecs.slice(0, limit);
    }
    
    return sortedThreads;
    
  } catch (error) {
    console.error('[recommender] Failed to generate recommendations:', error);
    return [];
  }
}

/**
 * 获取基于标签的推荐
 * @param {number} limit - 推荐数量限制
 * @param {string} forum - 论坛过滤 ('all', 'linux.do', 'nodeseek.com')
 * @param {boolean} forceRefresh - 是否强制刷新，忽略已点击的帖子
 * @returns {Array} - 推荐帖子列表
 */
async function getTagBasedRecommendations(limit = 5, forum = 'all', forceRefresh = false) {
  try {
    const [readEvents, allThreads, dislikedThreads] = await Promise.all([
      storage.getAllReadEvents(),
      storage.getAllThreads(),
      storage.getAllDislikedThreads()
    ]);
    
    if (readEvents.length === 0) return [];
    
    // 统计用户最常阅读的标签
    const tagCounts = {};
    const completedEvents = readEvents.filter(event => event.completed === 1);
    
    completedEvents.forEach(event => {
      const thread = allThreads.find(t => t.threadId === event.threadId);
      if (thread && thread.tags) {
        thread.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });
    
    // 获取最受欢迎的标签
    const popularTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tag]) => tag);
    
    if (popularTags.length === 0) return [];
    
    // 获取已读帖子、不感兴趣帖子和已点击帖子的ID集合
    const readThreadIds = new Set(readEvents.map(event => event.threadId));
    const dislikedThreadIds = new Set(dislikedThreads.map(thread => thread.threadId));
    const clickedThreadIds = await getClickedRecommendations();
    
    // 获取不感兴趣标签和偏好标签设置
    const settings = await chrome.storage.local.get(['dislikedTags', 'preferredTags']);
    const dislikedTags = settings.dislikedTags || [];
    const preferredTags = settings.preferredTags || [];
    
    console.log('[recommender] Tag-based debug info:', {
      totalReadEvents: readEvents.length,
      readThreadIds: Array.from(readThreadIds),
      clickedThreadIds: Array.from(clickedThreadIds),
      popularTags,
      allThreadsCount: allThreads.length
    });
    
    // 基于标签推荐帖子，主要排除已读帖子
    let tagBasedThreads = allThreads.filter(thread => {
      const hasMatchingTag = thread.tags && thread.tags.some(tag => popularTags.includes(tag));
      const isRead = readThreadIds.has(thread.threadId);
      const isDisliked = dislikedThreadIds.has(thread.threadId);
      const isClicked = clickedThreadIds.has(thread.threadId);
      
      if (!hasMatchingTag) return false;
      
      // 主要过滤已读帖子
      if (isRead) {
        console.log(`[recommender] Tag-based filtering out read thread ${thread.threadId}`);
        return false;
      }
      
      // 不感兴趣的内容永远不推荐，即使强制刷新也不推荐
      if (isDisliked) {
        console.log(`[recommender] Tag-based filtering out disliked thread ${thread.threadId}`);
        return false;
      }
      
      if (isClicked && !forceRefresh) {
        console.log(`[recommender] Tag-based filtering out clicked thread ${thread.threadId}`);
        return false;
      }
      
      // 标签过滤：如果帖子包含不感兴趣标签，则过滤掉
      if (dislikedTags.length > 0 && thread.tags && thread.tags.length > 0) {
        const hasDislikedTag = thread.tags.some(tag => 
          dislikedTags.some(dislikedTag => 
            tag.toLowerCase().includes(dislikedTag.toLowerCase()) ||
            dislikedTag.toLowerCase().includes(tag.toLowerCase())
          )
        );
        if (hasDislikedTag) {
          console.log(`[recommender] Tag-based filtering out disliked tag thread ${thread.threadId}`);
          return false;
        }
      }
      
      return true;
    });
    
    // 根据论坛过滤帖子
    if (forum !== 'all') {
      tagBasedThreads = tagBasedThreads.filter(thread => thread.forumId === forum);
      console.log(`[recommender] Tag-based filtered by forum ${forum}: ${tagBasedThreads.length} threads`);
    } else {
      console.log(`[recommender] Tag-based found ${tagBasedThreads.length} threads from all forums`);
    }
    
    // 按发布时间排序，返回最新的
    let sortedThreads = tagBasedThreads
      .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
    
    // 如果强制刷新，添加一些随机性
    if (forceRefresh && sortedThreads.length > limit) {
      // 保留前50%的最新帖子，其余随机排序
      const topCount = Math.ceil(sortedThreads.length * 0.5);
      const topThreads = sortedThreads.slice(0, topCount);
      const remainingThreads = sortedThreads.slice(topCount);
      
      // 随机打乱剩余帖子
      for (let i = remainingThreads.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingThreads[i], remainingThreads[j]] = [remainingThreads[j], remainingThreads[i]];
      }
      
      sortedThreads = [...topThreads, ...remainingThreads];
    }
    
    return sortedThreads.slice(0, limit);
    
  } catch (error) {
    console.error('[recommender] Failed to get tag-based recommendations:', error);
    return [];
  }
}

/**
 * 获取混合推荐（内容相似度 + 标签推荐）
 * @param {number} limit - 推荐数量限制
 * @param {string} forum - 论坛过滤 ('all', 'linux.do', 'nodeseek.com')
 * @param {boolean} forceRefresh - 是否强制刷新，忽略已点击的帖子
 * @returns {Array} - 推荐帖子列表
 */
async function getMixedRecommendations(limit = 10, forum = 'all', forceRefresh = false) {
  try {
    // 如果强制刷新，先清除已点击的推荐记录
    if (forceRefresh) {
      console.log('[recommender] Force refresh: clearing clicked recommendations');
      await clearClickedRecommendations();
    }
    
    const [contentRecs, tagRecs] = await Promise.all([
      generateRecommendations(Math.ceil(limit * 0.7), forum, forceRefresh),
      getTagBasedRecommendations(Math.ceil(limit * 0.3), forum, forceRefresh)
    ]);
    
    // 合并推荐，去重
    const allRecs = [...contentRecs, ...tagRecs];
    const uniqueRecs = allRecs.filter((thread, index, self) => 
      index === self.findIndex(t => t.threadId === thread.threadId)
    );
    
    console.log(`[recommender] Mixed recommendations for ${forum}: ${uniqueRecs.length} unique threads (forceRefresh: ${forceRefresh})`);
    return uniqueRecs.slice(0, limit);
    
  } catch (error) {
    console.error('[recommender] Failed to get mixed recommendations:', error);
    return [];
  }
}

/**
 * 计算用户行为相似度分数
 * @param {Array} readEvents - 用户阅读事件
 * @param {Object} thread - 目标帖子
 * @returns {number} - 行为相似度分数 (0-1)
 */
function calculateBehaviorSimilarity(readEvents, thread) {
  if (!readEvents || readEvents.length === 0) return 0;
  
  // 分析用户阅读行为模式
  const behaviorPattern = analyzeUserBehavior(readEvents);
  
  // 计算帖子与用户行为模式的匹配度
  let behaviorScore = 0;
  
  // 1. 版块偏好匹配 (35%)
  if (thread.category && behaviorPattern.preferredCategories.includes(thread.category)) {
    behaviorScore += 0.35;
  }
  
  // 2. 标签偏好匹配 (30%)
  if (thread.tags && thread.tags.length > 0) {
    const tagMatchCount = thread.tags.filter(tag => 
      behaviorPattern.preferredTags.includes(tag)
    ).length;
    behaviorScore += 0.3 * (tagMatchCount / thread.tags.length);
  }
  
  // 3. 最近偏好匹配 (20%) - 新增
  if (behaviorPattern.recentPreferences.categories && 
      thread.category && 
      behaviorPattern.recentPreferences.categories.includes(thread.category)) {
    behaviorScore += 0.2;
  }
  
  // 4. 时间偏好匹配 (10%)
  const threadHour = new Date(thread.publishedAt || thread.createdAt).getHours();
  if (behaviorPattern.activeHours.includes(threadHour)) {
    behaviorScore += 0.1;
  }
  
  // 5. 阅读深度偏好匹配 (5%)
  const expectedDepth = behaviorPattern.averageScrollDepth;
  if (thread.contentLength) {
    const estimatedDepth = Math.min(100, (thread.contentLength / 1000) * 20); // 估算滚动深度
    const depthMatch = 1 - Math.abs(expectedDepth - estimatedDepth) / 100;
    behaviorScore += 0.05 * Math.max(0, depthMatch);
  }
  
  return Math.min(1, behaviorScore);
}

/**
 * 分析用户行为模式（改进版本，包含时间衰减）
 * @param {Array} readEvents - 用户阅读事件
 * @returns {Object} - 用户行为模式
 */
function analyzeUserBehavior(readEvents) {
  const pattern = {
    preferredCategories: [],
    preferredTags: [],
    activeHours: [],
    averageScrollDepth: 50,
    averageReadingTime: 0,
    recentPreferences: {} // 最近偏好
  };
  
  if (!readEvents || readEvents.length === 0) return pattern;
  
  const now = new Date();
  const categoryCount = {};
  const tagCount = {};
  const hourCount = {};
  let totalScrollDepth = 0;
  let totalReadingTime = 0;
  let totalWeight = 0;
  
  readEvents.forEach(event => {
    // 计算时间衰减权重（最近的行为权重更高）
    const eventTime = new Date(event.createdAt);
    const daysDiff = (now - eventTime) / (1000 * 60 * 60 * 24);
    const timeWeight = Math.exp(-daysDiff / 30); // 30天半衰期
    
    // 版块统计（带时间衰减）
    if (event.category) {
      categoryCount[event.category] = (categoryCount[event.category] || 0) + timeWeight;
    }
    
    // 标签统计（带时间衰减）
    if (event.tags && event.tags.length > 0) {
      event.tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + timeWeight;
      });
    }
    
    // 时间统计（带时间衰减）
    const hour = eventTime.getHours();
    hourCount[hour] = (hourCount[hour] || 0) + timeWeight;
    
    // 滚动深度统计（带时间衰减）
    if (event.maxScrollPct) {
      totalScrollDepth += event.maxScrollPct * timeWeight;
    }
    
    // 阅读时间统计（带时间衰减）
    if (event.dwellMsEffective) {
      totalReadingTime += event.dwellMsEffective * timeWeight;
    }
    
    totalWeight += timeWeight;
  });
  
  // 提取偏好（按权重排序）
  pattern.preferredCategories = Object.entries(categoryCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([category]) => category);
  
  pattern.preferredTags = Object.entries(tagCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag]) => tag);
  
  pattern.activeHours = Object.entries(hourCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 6)
    .map(([hour]) => parseInt(hour));
  
  // 计算加权平均值
  pattern.averageScrollDepth = totalWeight > 0 ? totalScrollDepth / totalWeight : 50;
  pattern.averageReadingTime = totalWeight > 0 ? totalReadingTime / totalWeight : 0;
  
  // 分析最近偏好（最近7天的行为）
  const recentEvents = readEvents.filter(event => {
    const eventTime = new Date(event.createdAt);
    const daysDiff = (now - eventTime) / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  });
  
  if (recentEvents.length > 0) {
    const recentCategoryCount = {};
    const recentTagCount = {};
    
    recentEvents.forEach(event => {
      if (event.category) {
        recentCategoryCount[event.category] = (recentCategoryCount[event.category] || 0) + 1;
      }
      if (event.tags && event.tags.length > 0) {
        event.tags.forEach(tag => {
          recentTagCount[tag] = (recentTagCount[tag] || 0) + 1;
        });
      }
    });
    
    pattern.recentPreferences = {
      categories: Object.entries(recentCategoryCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([category]) => category),
      tags: Object.entries(recentTagCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([tag]) => tag)
    };
  }
  
  return pattern;
}

/**
 * 计算热度分数
 * @param {Object} thread - 帖子对象
 * @returns {number} - 热度分数 (0-1)
 */
function calculatePopularityScore(thread) {
  let score = 0;
  
  // 基于回复数 (40%)
  if (thread.replyCount) {
    const replyScore = Math.min(1, thread.replyCount / 50); // 50个回复为满分
    score += 0.4 * replyScore;
  }
  
  // 基于点赞数 (30%)
  if (thread.likeCount) {
    const likeScore = Math.min(1, thread.likeCount / 20); // 20个赞为满分
    score += 0.3 * likeScore;
  }
  
  // 基于浏览量 (20%)
  if (thread.viewCount) {
    const viewScore = Math.min(1, thread.viewCount / 200); // 200次浏览为满分
    score += 0.2 * viewScore;
  }
  
  // 基于发布时间 (10%) - 新帖子有基础热度
  const publishTime = new Date(thread.publishedAt || thread.createdAt);
  const hoursSincePublish = (new Date() - publishTime) / (1000 * 60 * 60);
  if (hoursSincePublish <= 24) {
    score += 0.1 * (1 - hoursSincePublish / 24);
  }
  
  return Math.min(1, score);
}

/**
 * 计算多样性奖励分数
 * @param {Object} thread - 当前帖子
 * @param {Array} recentThreads - 最近帖子列表
 * @returns {number} - 多样性奖励分数 (0-1)
 */
function calculateDiversityBonus(thread, recentThreads) {
  // 基于版块多样性
  const categoryDiversity = calculateCategoryDiversity(thread, recentThreads);
  
  // 基于标签多样性
  const tagDiversity = calculateTagDiversity(thread, recentThreads);
  
  // 基于时间多样性
  const timeDiversity = calculateTimeDiversity(thread, recentThreads);
  
  // 综合多样性分数
  return (categoryDiversity + tagDiversity + timeDiversity) / 3;
}

/**
 * 计算版块多样性
 * @param {Object} thread - 当前帖子
 * @param {Array} recentThreads - 最近帖子列表
 * @returns {number} - 版块多样性分数
 */
function calculateCategoryDiversity(thread, recentThreads) {
  if (!thread.category) return 0.5;
  
  // 统计最近帖子的版块分布
  const categoryCount = {};
  recentThreads.forEach(t => {
    if (t.category) {
      categoryCount[t.category] = (categoryCount[t.category] || 0) + 1;
    }
  });
  
  const totalThreads = recentThreads.length;
  const currentCategoryCount = categoryCount[thread.category] || 0;
  
  // 如果当前版块帖子较少，给予多样性奖励
  if (totalThreads === 0) return 0.5;
  
  const categoryRatio = currentCategoryCount / totalThreads;
  return 1 - categoryRatio; // 比例越低，多样性分数越高
}

/**
 * 计算标签多样性
 * @param {Object} thread - 当前帖子
 * @param {Array} recentThreads - 最近帖子列表
 * @returns {number} - 标签多样性分数
 */
function calculateTagDiversity(thread, recentThreads) {
  if (!thread.tags || thread.tags.length === 0) return 0.5;
  
  // 统计最近帖子的标签分布
  const tagCount = {};
  recentThreads.forEach(t => {
    if (t.tags && t.tags.length > 0) {
      t.tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    }
  });
  
  // 计算当前帖子的标签稀有度
  let totalRarity = 0;
  thread.tags.forEach(tag => {
    const tagFrequency = tagCount[tag] || 0;
    const rarity = 1 / (1 + tagFrequency); // 频率越低，稀有度越高
    totalRarity += rarity;
  });
  
  return totalRarity / thread.tags.length;
}

/**
 * 计算时间多样性
 * @param {Object} thread - 当前帖子
 * @param {Array} recentThreads - 最近帖子列表
 * @returns {number} - 时间多样性分数
 */
function calculateTimeDiversity(thread, recentThreads) {
  const threadTime = new Date(thread.publishedAt || thread.createdAt);
  const threadHour = threadTime.getHours();
  
  // 统计最近帖子的时间分布
  const hourCount = {};
  recentThreads.forEach(t => {
    const tTime = new Date(t.publishedAt || t.createdAt);
    const tHour = tTime.getHours();
    hourCount[tHour] = (hourCount[tHour] || 0) + 1;
  });
  
  const totalThreads = recentThreads.length;
  const currentHourCount = hourCount[threadHour] || 0;
  
  if (totalThreads === 0) return 0.5;
  
  const hourRatio = currentHourCount / totalThreads;
  return 1 - hourRatio; // 比例越低，多样性分数越高
}

/**
 * 计算不感兴趣内容惩罚分数
 * @param {Object} thread - 当前帖子
 * @param {Array} dislikedThreads - 不感兴趣的帖子列表
 * @returns {number} - 惩罚分数 (0-1)
 */
function calculateDislikePenalty(thread, dislikedThreads) {
  if (!dislikedThreads || dislikedThreads.length === 0) return 0;

  const threadText = `${thread.title} ${thread.category} ${(thread.tags || []).join(' ')}`;
  let maxSimilarity = 0;

  // 检查与不感兴趣内容的相似度
  dislikedThreads.forEach(dislikedThread => {
    const dislikedText = `${dislikedThread.title || ''} ${dislikedThread.category || ''} ${(dislikedThread.tags || []).join(' ')}`;
    const similarity = calculateTFIDFSimilarity(threadText, dislikedText);
    maxSimilarity = Math.max(maxSimilarity, similarity);
  });

  // 如果相似度很高，给予重惩罚
  if (maxSimilarity > 0.7) {
    return 0.8; // 高惩罚
  } else if (maxSimilarity > 0.5) {
    return 0.5; // 中等惩罚
  } else if (maxSimilarity > 0.3) {
    return 0.2; // 低惩罚
  }

  return 0; // 无惩罚
}

/**
 * 计算偏好标签奖励
 * @param {Object} thread - 帖子对象
 * @param {Array} preferredTags - 偏好标签列表
 * @returns {number} - 偏好标签奖励分数
 */
function calculatePreferredTagBonus(thread, preferredTags) {
  if (!preferredTags || preferredTags.length === 0 || !thread.tags || thread.tags.length === 0) {
    return 0;
  }

  // 计算匹配的偏好标签数量
  const matchedTags = thread.tags.filter(tag => 
    preferredTags.some(preferredTag => 
      tag.toLowerCase().includes(preferredTag.toLowerCase()) ||
      preferredTag.toLowerCase().includes(tag.toLowerCase())
    )
  );

  if (matchedTags.length === 0) {
    return 0;
  }

  // 根据匹配的标签数量给予奖励
  const matchRatio = matchedTags.length / thread.tags.length;
  const preferredRatio = matchedTags.length / preferredTags.length;
  
  // 基础奖励 + 匹配比例奖励
  let bonus = 0.2; // 基础奖励
  bonus += matchRatio * 0.3; // 匹配比例奖励
  bonus += Math.min(preferredRatio * 0.2, 0.2); // 偏好比例奖励
  
  return Math.min(bonus, 0.5); // 最大奖励0.5
}

/**
 * 清理缓存，释放内存
 */
function clearCache() {
  tfidfCache.clear();
  console.log('[recommender] Cache cleared');
}

/**
 * 获取缓存统计信息
 */
function getCacheStats() {
  return {
    tfidfCacheSize: tfidfCache.size,
    memoryUsage: null // 浏览器环境中无法获取内存使用情况
  };
}

export default {
  generateRecommendations,
  getTagBasedRecommendations,
  getMixedRecommendations,
  calculateTFIDFSimilarity,
  calculateFreshnessScore,
  clearCache,
  getCacheStats,
  clearAllRecommendationData
};

