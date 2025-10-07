// Background Service Worker - 主服务工作者
// 处理来自 content script 的事件，管理 IndexedDB，调度增量抓取

import storage from './storage.js';
import fetcherManager from './fetcher.js';
import recommender from './recommender.js';

// 全局状态
let currentSessionId = null;
let sessionTimeout = null;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30分钟

// 初始化数据库
async function initializeDatabase() {
  try {
    await storage.init();
    console.log('[background] Database initialized successfully');
  } catch (error) {
    console.error('[background] Failed to initialize database:', error);
  }
}

// 生成新的会话ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 获取或创建当前会话
function getCurrentSession() {
  const now = Date.now();
  
  // 如果当前会话超时，创建新会话
  if (!currentSessionId || (sessionTimeout && now > sessionTimeout)) {
    currentSessionId = generateSessionId();
    sessionTimeout = now + SESSION_TIMEOUT_MS;
    
    // 保存新会话到数据库
    storage.saveSession({
      sessionId: currentSessionId,
      startedAt: new Date(now).toISOString(),
      endedAt: null
    });
    
    console.log('[background] Created new session:', currentSessionId);
  }
  
  return currentSessionId;
}

// 处理阅读事件
async function handleReaderEvent(message, sender, sendResponse) {
  try {
    const { type, thread, metrics, at } = message;
    
    if (!thread?.threadId) {
      console.warn('[background] Invalid reader event: missing threadId');
      sendResponse({ ok: false, error: 'Missing threadId' });
      return;
    }
    
    const sessionId = getCurrentSession();
    
    switch (type) {
      case 'reader/open':
        console.log('[background] Reader opened:', thread.threadId);
        try {
          // 保存帖子信息
          let forumId = 'linux.do'; // 默认值
          if (thread.threadId.startsWith('nodeseek:')) {
            forumId = 'nodeseek.com';
          } else if (thread.threadId.startsWith('v2ex:')) {
            forumId = 'v2ex.com';
          }
          console.log('[background] Saving thread info for:', thread.threadId, 'forum:', forumId);
          await storage.upsertThread({
            threadId: thread.threadId,
            forumId: forumId,
            url: thread.url,
            title: thread.title,
            category: thread.category || '',
            tags: thread.tags || [],
            publishedAt: thread.publishedAt || new Date().toISOString(),
            isNew: false
          });
          console.log('[background] Thread info saved successfully');
          sendResponse({ ok: true });
        } catch (error) {
          console.error('[background] Error saving thread info:', error);
          sendResponse({ ok: false, error: error.message });
        }
        break;
        
      case 'reader/heartbeat':
        // 更新阅读事件
        console.log('[background] Heartbeat received:', {
          threadId: thread.threadId,
          activeMsDelta: metrics.activeMsDelta,
          maxScrollPct: metrics.maxScrollPct,
          isVisible: metrics.isVisible,
          isFocused: metrics.isFocused,
          idle: metrics.idle
        });
        await storage.updateReadEvent({
          sessionId,
          threadId: thread.threadId,
          url: thread.url,
          activeMsDelta: metrics.activeMsDelta || 0,
          maxScrollPct: metrics.maxScrollPct || 0,
          isVisible: metrics.isVisible,
          isFocused: metrics.isFocused,
          idle: metrics.idle,
          at
        });
        sendResponse({ ok: true });
        break;
        
      case 'reader/close':
        console.log('[background] Reader closed:', thread.threadId);
        // 最终结算阅读事件
        await storage.finalizeReadEvent({
          sessionId,
          threadId: thread.threadId,
          url: thread.url,
          activeMsDelta: metrics.activeMsDelta || 0,
          maxScrollPct: metrics.maxScrollPct || 0,
          at
        });
        sendResponse({ ok: true });
        break;
        
      default:
        console.warn('[background] Unknown reader event type:', type);
        sendResponse({ ok: false, error: 'Unknown reader event type' });
    }
    
  } catch (error) {
    console.error('[background] Error handling reader event:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 处理数据库操作请求
async function handleDatabaseRequest(message, sender, sendResponse) {
  try {
    const { type, data } = message;
    
    switch (type) {
      case 'db/export':
        const exportData = await storage.exportAllData();
        const jsonString = JSON.stringify(exportData, null, 2);
        const bytes = new TextEncoder().encode(jsonString);
        sendResponse({ ok: true, bytes: Array.from(bytes) });
        break;
        
      case 'db/export-reading':
        const exportReadingData = await storage.exportReadingData();
        const readingJsonString = JSON.stringify(exportReadingData, null, 2);
        const readingBytes = new TextEncoder().encode(readingJsonString);
        sendResponse({ ok: true, bytes: Array.from(readingBytes) });
        break;
        
      case 'db/export-fetch':
        const exportFetchData = await storage.exportFetchData();
        const fetchJsonString = JSON.stringify(exportFetchData, null, 2);
        const fetchBytes = new TextEncoder().encode(fetchJsonString);
        sendResponse({ ok: true, bytes: Array.from(fetchBytes) });
        break;
        
      case 'db/clear':
        await storage.clearAllData();
        sendResponse({ ok: true });
        break;
        
      case 'db/clear-reading':
        const clearReadingResult = await storage.clearReadingData();
        sendResponse({ ok: true, result: clearReadingResult });
        break;
        
      case 'db/clear-fetch':
        const clearFetchResult = await storage.clearFetchData();
        sendResponse({ ok: true, result: clearFetchResult });
        break;
        
      case 'db/import':
        const result = await storage.importData(data);
        sendResponse({ ok: true, result });
        break;
      case 'db/deduplicate':
        const deduplicateResult = await storage.deduplicateReadEvents();
        sendResponse({ ok: true, result: deduplicateResult });
        break;
      
        
      default:
        sendResponse({ ok: false, error: 'Unknown database operation' });
    }
  } catch (error) {
    console.error('[background] Database operation failed:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 处理抓取请求
async function handleFetchRequest(message, sender, sendResponse) {
  try {
    const { type } = message;
    
    if (type === 'fetch/trigger') {
      const results = await fetcherManager.performIncrementalFetch(true);
      const summary = results.reduce((acc, result) => {
        acc.totalNewTopics += result.newTopics || 0;
        if (result.success) acc.successfulForums++;
        return acc;
      }, { totalNewTopics: 0, successfulForums: 0 });

      if (summary.totalNewTopics > 0) {
        console.log(`[background] Fetch complete, found ${summary.totalNewTopics} new topics, refreshing recommendations.`);
        await recommender.getMixedRecommendations(10, 'all');
      }

      sendResponse({
        ok: true,
        result: {
          success: summary.successfulForums > 0,
          newTopics: summary.totalNewTopics,
          results,
          summary: { ...summary, totalForums: results.length },
        },
      });
    } else if (type === 'fetch/stats') {
      const fetcherStats = fetcherManager.getFetchStats();
      
      // 计算总抓取次数和最后抓取时间
      const totalFetchCount = fetcherStats.reduce((sum, stat) => sum + (stat.fetchCount || 0), 0);
      const lastFetchTimes = fetcherStats
        .map(stat => stat.lastFetch)
        .filter(time => time)
        .map(time => new Date(time))
        .sort((a, b) => b - a);
      
      const stats = {
        fetchCount: totalFetchCount,
        lastFetchAt: lastFetchTimes.length > 0 ? lastFetchTimes[0].toISOString() : null,
        fetchers: fetcherStats
      };
      
      sendResponse({ ok: true, stats });
    } else {
      sendResponse({ ok: false, error: 'Unknown fetch operation' });
    }
  } catch (error) {
    console.error('[background] Fetch operation failed:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 处理推荐点击事件
async function handleRecommendationClick(threadId, title) {
  try {
    console.log('[background] Marking recommendation as clicked:', threadId, title);
    
    // 将点击的帖子添加到已点击列表（使用chrome.storage.local）
    const clickedKey = 'clicked_recommendations';
    
    // 获取现有的已点击列表
    const result = await chrome.storage.local.get([clickedKey]);
    const existingClicked = result[clickedKey] || [];
    
    // 检查是否已经存在
    if (!existingClicked.includes(threadId)) {
      existingClicked.push(threadId);
      await chrome.storage.local.set({ [clickedKey]: existingClicked });
      console.log('[background] Added to clicked recommendations:', threadId);
    } else {
      console.log('[background] Already in clicked recommendations:', threadId);
    }
    
  } catch (error) {
    console.error('[background] Error handling recommendation click:', error);
  }
}

// 清除已点击推荐列表
async function clearClickedRecommendations() {
  try {
    console.log('[background] Clearing clicked recommendations list');
    await chrome.storage.local.remove(['clicked_recommendations']);
    console.log('[background] Clicked recommendations list cleared');
  } catch (error) {
    console.error('[background] Error clearing clicked recommendations:', error);
  }
}

// 处理推荐请求
async function handleRecommendationRequest(message, sender, sendResponse) {
  try {
    const { type, limit = 10, forum = 'all', forceRefresh = false } = message;
    
    // 获取用户设置
    const settings = await chrome.storage.local.get([
      'recommendationCount',
      'recommendationAlgorithm',
      'enableAutoRefresh'
    ]);
    
    // 使用用户设置的推荐数量，如果没有设置则使用传入的limit
    const userLimit = settings.recommendationCount || limit;
    const algorithm = settings.recommendationAlgorithm || 'mixed';
    
    let recommendations = [];
    
    switch (type) {
      case 'recommend/content':
        recommendations = await recommender.generateRecommendations(userLimit, forum);
        break;
      case 'recommend/tags':
        recommendations = await recommender.getTagBasedRecommendations(userLimit, forum);
        break;
      case 'recommend/mixed':
        // 根据用户设置的算法类型选择推荐方式
        if (algorithm === 'content') {
          recommendations = await recommender.generateRecommendations(userLimit, forum);
        } else if (algorithm === 'behavior') {
          recommendations = await recommender.getTagBasedRecommendations(userLimit, forum);
        } else if (algorithm === 'popular') {
          // 热门推荐 - 基于分数排序
          const allRecommendations = await recommender.getMixedRecommendations(userLimit * 2, forum, forceRefresh);
          recommendations = allRecommendations
            .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
            .slice(0, userLimit);
        } else {
          // 默认混合推荐
          recommendations = await recommender.getMixedRecommendations(userLimit, forum, forceRefresh);
        }
        break;
      case 'recommend/clicked':
        // 处理推荐点击事件
        const { threadId, title } = message;
        console.log('[background] Recommendation clicked:', threadId, title);
        await handleRecommendationClick(threadId, title);
        sendResponse({ ok: true });
        return;
      case 'recommend/clear-clicked':
        // 清除已点击推荐列表
        await clearClickedRecommendations();
        sendResponse({ ok: true });
        return;
      case 'recommend/clear-all':
        // 清除所有推荐相关数据
        await recommender.clearAllRecommendationData();
        sendResponse({ ok: true, message: 'All recommendation data cleared successfully' });
        return;
      default:
        sendResponse({ ok: false, error: 'Unknown recommendation type' });
        return;
    }
    
    // 获取过滤统计信息
    const stats = await getRecommendationStats();
    
    sendResponse({ ok: true, recommendations, stats });
    
  } catch (error) {
    console.error('[background] Recommendation request failed:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 处理不感兴趣请求
async function handleDislikeRequest(message, sender, sendResponse) {
  try {
    const { type, threadId, title, threadIds } = message;
    
    switch (type) {
      case 'dislike/add':
        await storage.addDislikedThread(threadId);
        console.log(`[background] Added disliked thread: ${threadId} - ${title}`);
        sendResponse({ ok: true });
        break;
        
      case 'dislike/add-batch':
        const result = await storage.addDislikedThreads(threadIds);
        console.log(`[background] Batch added disliked threads: ${result.added} added, ${result.errors.length} errors`);
        sendResponse({ ok: result.success, added: result.added, errors: result.errors });
        break;
        
      case 'dislike/remove':
        await storage.removeDislikedThread(threadId);
        console.log(`[background] Removed disliked thread: ${threadId} - ${title}`);
        sendResponse({ ok: true });
        break;
        
      case 'dislike/list':
        const [dislikedThreads, allThreads] = await Promise.all([
          storage.getAllDislikedThreads(),
          storage.getAllThreads()
        ]);
        
        // 合并帖子信息
        const enrichedDislikedThreads = dislikedThreads.map(disliked => {
          const thread = allThreads.find(t => t.threadId === disliked.threadId);
          return {
            ...disliked,
            title: thread?.title || '未知标题',
            category: thread?.category || '未知分类',
            tags: thread?.tags || [],
            url: thread?.url || ''
          };
        });
        
        sendResponse({ ok: true, dislikedThreads: enrichedDislikedThreads });
        break;
        
      default:
        sendResponse({ ok: false, error: 'Unknown dislike operation' });
    }
    
  } catch (error) {
    console.error('[background] Dislike request failed:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 处理设置请求
async function handleSettingsRequest(message, sender, sendResponse) {
  try {
    if (message.type === 'settings/update') {
      const { settings } = message;
      console.log('[background] Updating settings:', settings);
      
      // 保存设置到存储
      await chrome.storage.local.set(settings);
      
      // 如果更新了自动抓取间隔，重新设置定时器
      if (settings.autoFetchInterval) {
        await updateAutoFetchSchedule(settings.autoFetchInterval);
      }
      
      sendResponse({ ok: true });
    } else if (message.type === 'settings/get') {
      // 获取当前设置
      const settings = await chrome.storage.local.get([
        'recommendationCount',
        'autoFetchInterval', 
        'recommendationAlgorithm',
        'enableAutoRefresh',
        'thresholdSeconds',
        'thresholdScroll'
      ]);
      sendResponse({ ok: true, settings });
    } else {
      sendResponse({ ok: false, error: 'Unknown settings type' });
    }
    
  } catch (error) {
    console.error('[background] Settings request failed:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 更新自动抓取计划
async function updateAutoFetchSchedule(intervalMinutes) {
  try {
    // 清除现有闹钟
    await chrome.alarms.clear('incremental-fetch');
    
    // 设置新的闹钟
    await chrome.alarms.create('incremental-fetch', {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes
    });
    
    console.log(`[background] Auto-fetch schedule updated to ${intervalMinutes} minutes`);
  } catch (error) {
    console.error('[background] Failed to update auto-fetch schedule:', error);
  }
}

// 处理调试请求
async function handleDebugRequest(message, sender, sendResponse) {
  try {
    const { type } = message;
    
    switch (type) {
      case 'debug/check':
        // 简化 debug 检查，避免数据库操作失败
        sendResponse({ 
          ok: true, 
          debug: {
            currentSessionId,
            sessionTimeout,
            timestamp: new Date().toISOString(),
            status: 'ready'
          }
        });
        break;
        
      case 'debug/alarms':
        // 检查定时器状态
        try {
          const alarms = await new Promise((resolve) => {
            chrome.alarms.getAll(resolve);
          });
          
          const fetchAlarm = alarms.find(alarm => alarm.name === 'incremental-fetch');
          const now = Date.now();
          
          sendResponse({
            ok: true,
            alarms: {
              total: alarms.length,
              fetchAlarm: fetchAlarm ? {
                name: fetchAlarm.name,
                scheduledTime: fetchAlarm.scheduledTime,
                periodInMinutes: fetchAlarm.periodInMinutes,
                timeUntilNext: fetchAlarm.scheduledTime - now,
                isOverdue: fetchAlarm.scheduledTime < now
              } : null,
              allAlarms: alarms.map(alarm => ({
                name: alarm.name,
                scheduledTime: alarm.scheduledTime,
                periodInMinutes: alarm.periodInMinutes
              }))
            }
          });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
        
      case 'debug/recreate-alarm':
        // 重新创建定时器
        try {
          await chrome.alarms.clear('incremental-fetch');
          chrome.alarms.create('incremental-fetch', {
            delayInMinutes: 1,
            periodInMinutes: 30
          });
          sendResponse({ ok: true, message: 'Alarm recreated successfully' });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
        
      case 'analysis/preferences':
        // 分析阅读偏好
        try {
          const preferences = await analyzeReadingPreferences();
          sendResponse({ ok: true, preferences });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
        break;
        
      default:
        sendResponse({ ok: false, error: 'Unknown debug type' });
    }
    
  } catch (error) {
    console.error('[background] Debug request failed:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 消息路由
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] Received message:', message.type, message);
  
  // 异步处理，返回 true 表示会异步响应
  (async () => {
    try {
      if (message.type.startsWith('reader/')) {
        await handleReaderEvent(message, sender, sendResponse);
      } else if (message.type.startsWith('db/')) {
        await handleDatabaseRequest(message, sender, sendResponse);
      } else if (message.type.startsWith('fetch/')) {
        await handleFetchRequest(message, sender, sendResponse);
      } else if (message.type.startsWith('recommend/')) {
        await handleRecommendationRequest(message, sender, sendResponse);
      } else if (message.type.startsWith('dislike/')) {
        await handleDislikeRequest(message, sender, sendResponse);
      } else if (message.type.startsWith('debug/') || message.type.startsWith('analysis/')) {
        await handleDebugRequest(message, sender, sendResponse);
      } else if (message.type.startsWith('settings/')) {
        await handleSettingsRequest(message, sender, sendResponse);
      } else if (message.type.startsWith('preference/')) {
        await handlePreferenceRequest(message, sender, sendResponse);
      } else {
        console.warn('[background] Unknown message type:', message.type);
        sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[background] Message handling error:', error);
      try {
        sendResponse({ ok: false, error: error.message });
      } catch (responseError) {
        console.error('[background] Error sending response:', responseError);
      }
    }
  })();
  
  return true; // 保持消息通道开放以进行异步响应
});

// 定时任务：增量抓取
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'incremental-fetch') {
    console.log('[background] 🔄 Running scheduled incremental fetch for all forums...');
    
    try {
      // 自动抓取使用 force = true，跳过冷却时间检查
      const results = await fetcherManager.performIncrementalFetch(true);
      const totalNewTopics = results.reduce((sum, result) => sum + (result.newTopics || 0), 0);
      const successfulForums = results.filter(result => result.success).length;

      console.log(`[background] 📊 Scheduled fetch completed: ${totalNewTopics} new topics from ${successfulForums}/${results.length} forums`);

      if (totalNewTopics > 0) {
        console.log(`[background] 🎉 Found ${totalNewTopics} new topics, updating recommendations...`);
        await recommender.getMixedRecommendations(10, 'all');
        
        // 发送通知
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon-48.png',
          title: '多论坛新内容',
          message: `发现 ${totalNewTopics} 个新帖子，推荐已更新`,
        });
      } else {
        console.log('[background] ℹ️ No new topics found in this fetch cycle');
      }
    } catch (error) {
      console.error('[background] ❌ Error during scheduled fetch:', error);
    }
  } else {
    console.log('[background] Received alarm for:', alarm.name);
  }
});

// 扩展安装/启动时的初始化
chrome.runtime.onStartup.addListener(async () => {
  console.log('[background] Extension startup');
  await initializeDatabase();
  await ensureAlarmExists();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[background] Extension installed/updated:', details.reason);
  await initializeDatabase();
  
  // 创建定时抓取任务
  await ensureAlarmExists();
});

// 通知点击处理
chrome.notifications.onClicked.addListener((notificationId) => {
  // 根据抓取结果动态跳转到相应的论坛
  chrome.tabs.create({ url: 'https://linux.do/latest' });
  chrome.notifications.clear(notificationId);
});

// 确保定时器存在
async function ensureAlarmExists() {
  try {
    const alarms = await new Promise((resolve) => {
      chrome.alarms.getAll(resolve);
    });
    
    const fetchAlarm = alarms.find(alarm => alarm.name === 'incremental-fetch');
    if (!fetchAlarm) {
      console.log('[background] Creating missing incremental-fetch alarm');
      chrome.alarms.create('incremental-fetch', {
        delayInMinutes: 1, // 1分钟后开始第一次抓取
        periodInMinutes: 30 // 每30分钟抓取一次
      });
      console.log('[background] ✅ Incremental-fetch alarm created successfully');
    } else {
      console.log('[background] ✅ Incremental-fetch alarm already exists');
      console.log(`[background] Next scheduled time: ${new Date(fetchAlarm.scheduledTime).toLocaleString()}`);
    }
  } catch (error) {
    console.error('[background] Error ensuring alarm exists:', error);
  }
}

// 定期检查定时器状态（每5分钟检查一次）
async function startAlarmMonitor() {
  setInterval(async () => {
    try {
      const alarms = await new Promise((resolve) => {
        chrome.alarms.getAll(resolve);
      });
      
      const fetchAlarm = alarms.find(alarm => alarm.name === 'incremental-fetch');
      if (!fetchAlarm) {
        console.warn('[background] ⚠️ Incremental-fetch alarm missing, recreating...');
        await ensureAlarmExists();
      } else {
        console.log('[background] ✅ Alarm monitor: incremental-fetch alarm is active');
      }
    } catch (error) {
      console.error('[background] Error in alarm monitor:', error);
    }
  }, 5 * 60 * 1000); // 每5分钟检查一次
}

// 分析阅读偏好（简化版）
async function analyzeReadingPreferences() {
  try {
    console.log('[background] Starting reading preferences analysis...');
    
    // 获取所有阅读事件和不感兴趣内容
    const [events, threads, dislikedThreads] = await Promise.all([
      storage.getAllReadEvents(),
      storage.getAllThreads(),
      storage.getAllDislikedThreads()
    ]);
    
    if (events.length === 0) {
      return {
        preferredContent: [],
        dislikedContent: [],
        summary: {
          totalRead: 0,
          totalDisliked: dislikedThreads.length,
          topCategory: '暂无数据',
          topTags: []
        }
      };
    }
    
    // 分析偏好内容（基于阅读历史）
    const preferredContent = analyzePreferredContent(events, threads);
    
    // 分析不感兴趣内容的模式
    const dislikedAnalysis = analyzeDislikedContent(dislikedThreads, threads);
    
    // 计算摘要信息
    const categoryStats = analyzeCategoryPreferences(events, threads);
    const tagStats = analyzeTagPreferences(events, threads);
    
    const summary = {
      totalRead: events.length,
      totalDisliked: dislikedThreads.length,
      topCategory: categoryStats.length > 0 ? categoryStats[0].name : '暂无数据',
      topTags: tagStats.slice(0, 5).map(tag => tag.name)
    };
    
    console.log('[background] Reading preferences analysis completed');
    
    return {
      preferredContent,
      dislikedAnalysis,
      summary
    };
    
  } catch (error) {
    console.error('[background] Error analyzing reading preferences:', error);
    throw error;
  }
}

// 分析偏好内容
function analyzePreferredContent(events, threads) {
  const threadMap = new Map(threads.map(t => [t.threadId, t]));
  const completedEvents = events.filter(event => event.completed === 1);
  
  // 统计版块和标签偏好
  const categoryCount = {};
  const tagCount = {};
  const tagWeight = {}; // 标签权重（基于阅读时长）
  
  // 过滤无意义的标签
  const meaninglessTags = new Set([
    '只读', '置顶', '精华', '热门', '推荐', '最新', '最新回复',
    '楼主', '沙发', '板凳', '地板', '地下室', '下水道',
    '临时禁言', '禁言', '解封', '封号', '解封号',
    '活跃', '在线', '离线', '隐身', '忙碌',
    'PRO', 'VIP', '会员', '普通用户', '新用户',
    '公告', '通知', '提醒', '系统消息',
    'LINUX-DO-Connect', 'NodeSeek', 'V2EX'
  ]);
  
  completedEvents.forEach(event => {
    const thread = threadMap.get(event.threadId);
    if (thread) {
      // 统计版块
      if (thread.category) {
        categoryCount[thread.category] = (categoryCount[thread.category] || 0) + 1;
      }
      
      // 统计标签（改进版本）
      if (thread.tags && thread.tags.length > 0) {
        thread.tags.forEach(tag => {
          // 清理标签：去除多余空格，转换为小写进行比较
          const cleanTag = tag.trim();
          
          // 跳过空标签和无意义标签
          if (!cleanTag || meaninglessTags.has(cleanTag)) {
            return;
          }
          
          // 跳过过短的标签（可能是噪音）
          if (cleanTag.length < 2) {
            return;
          }
          
          // 跳过纯数字标签
          if (/^\d+$/.test(cleanTag)) {
            return;
          }
          
          // 统计标签出现次数
          tagCount[cleanTag] = (tagCount[cleanTag] || 0) + 1;
          
          // 计算标签权重（基于阅读时长）
          const readingTime = event.dwellMsEffective || 0;
          const weight = Math.min(readingTime / 60000, 10); // 最大权重10，基于分钟数
          tagWeight[cleanTag] = (tagWeight[cleanTag] || 0) + weight;
        });
      }
    }
  });
  
  // 获取最受欢迎的版块
  const topCategories = Object.entries(categoryCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  
  // 获取最受欢迎的标签（基于权重排序）
  const topTags = Object.entries(tagCount)
    .map(([name, count]) => ({
      name,
      count,
      weight: tagWeight[name] || 0,
      score: count + (tagWeight[name] || 0) * 0.1 // 综合分数
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // 显示5个标签
    .map(({ name, count, weight }) => ({ 
      name, 
      count,
      weight: Math.round(weight * 10) / 10 // 保留一位小数
    }));
  
  return {
    categories: topCategories,
    tags: topTags,
    totalCompleted: completedEvents.length
  };
}

// 分析不感兴趣内容模式
function analyzeDislikedContent(dislikedThreads, threads) {
  if (!dislikedThreads || dislikedThreads.length === 0) {
    return {
      totalCount: 0,
      categories: [],
      tags: [],
      recentDisliked: []
    };
  }
  
  const threadMap = new Map(threads.map(t => [t.threadId, t]));
  
  // 统计不感兴趣的版块分布
  const categoryCount = {};
  const tagCount = {};
  const recentDisliked = [];
  
  dislikedThreads.forEach(disliked => {
    const thread = threadMap.get(disliked.threadId);
    if (thread) {
      // 统计版块
      if (thread.category) {
        categoryCount[thread.category] = (categoryCount[thread.category] || 0) + 1;
      }
      
      // 统计标签
      if (thread.tags && thread.tags.length > 0) {
        thread.tags.forEach(tag => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      }
      
      // 收集最近的不感兴趣内容（最多5个）
      if (recentDisliked.length < 5) {
        recentDisliked.push({
          title: thread.title,
          category: thread.category,
          dislikedAt: disliked.createdAt
        });
      }
    }
  });
  
  // 获取最常被标记为不感兴趣的版块
  const topDislikedCategories = Object.entries(categoryCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));
  
  // 获取最常被标记为不感兴趣的标签
  const topDislikedTags = Object.entries(tagCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  
  return {
    totalCount: dislikedThreads.length,
    categories: topDislikedCategories,
    tags: topDislikedTags,
    recentDisliked: recentDisliked.sort((a, b) => new Date(b.dislikedAt) - new Date(a.dislikedAt))
  };
}

// 分析版块偏好
function analyzeCategoryPreferences(events, threads) {
  const categoryCount = {};
  const threadMap = new Map(threads.map(t => [t.threadId, t]));
  
  events.forEach(event => {
    const thread = threadMap.get(event.threadId);
    if (thread && thread.category) {
      categoryCount[thread.category] = (categoryCount[thread.category] || 0) + 1;
    }
  });
  
  return Object.entries(categoryCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// 分析时间偏好
function analyzeTimePreferences(events) {
  const hourCount = new Array(24).fill(0);
  
  events.forEach(event => {
    const hour = new Date(event.createdAt).getHours();
    hourCount[hour]++;
  });
  
  return hourCount.map((count, hour) => ({
    time: `${hour}:00`,
    count,
    percentage: Math.round((count / events.length) * 100)
  })).filter(slot => slot.count > 0);
}

// 分析标签偏好
function analyzeTagPreferences(events, threads) {
  const tagCount = {};
  const threadMap = new Map(threads.map(t => [t.threadId, t]));
  
  events.forEach(event => {
    const thread = threadMap.get(event.threadId);
    if (thread && thread.tags) {
      thread.tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    }
  });
  
  return Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// 分析阅读深度
function analyzeReadingDepth(events) {
  const depthRanges = [
    { label: '0-25%', min: 0, max: 25 },
    { label: '25-50%', min: 25, max: 50 },
    { label: '50-75%', min: 50, max: 75 },
    { label: '75-100%', min: 75, max: 100 }
  ];
  
  return depthRanges.map(range => {
    const count = events.filter(event => 
      event.maxScrollPct >= range.min && event.maxScrollPct < range.max
    ).length;
    
    return {
      label: range.label,
      count,
      percentage: Math.round((count / events.length) * 100)
    };
  });
}

// 计算平均阅读时间
function calculateAverageReadingTime(events) {
  const totalTime = events.reduce((sum, event) => sum + (event.dwellMsEffective || 0), 0);
  return totalTime / events.length;
}

// 计算完成阅读率
function calculateCompletionRate(events) {
  const completedEvents = events.filter(event => event.completed === 1).length;
  return Math.round((completedEvents / events.length) * 100);
}

// 格式化时长
function formatDuration(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 1) return '< 1分钟';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes}分钟`;
}

// 获取推荐统计信息
async function getRecommendationStats() {
  try {
    const [allThreads, readEvents, dislikedThreads] = await Promise.all([
      storage.getAllThreads(),
      storage.getAllReadEvents(),
      storage.getAllDislikedThreads()
    ]);
    
    return {
      totalThreads: allThreads.length,
      readThreads: readEvents.length,
      dislikedThreads: dislikedThreads.length,
      availableForRecommendation: allThreads.length - readEvents.length - dislikedThreads.length
    };
  } catch (error) {
    console.error('[background] Error getting recommendation stats:', error);
    return {
      totalThreads: 0,
      readThreads: 0,
      dislikedThreads: 0,
      availableForRecommendation: 0
    };
  }
}

// 处理偏好请求
async function handlePreferenceRequest(message, sender, sendResponse) {
  try {
    const { type, preferenceType, preferenceName } = message;
    
    switch (type) {
      case 'preference/remove':
        await removePreference(preferenceType, preferenceName);
        sendResponse({ ok: true, message: '偏好已删除' });
        break;
      default:
        sendResponse({ ok: false, error: 'Unknown preference operation' });
    }
  } catch (error) {
    console.error('[background] Preference request failed:', error);
    sendResponse({ ok: false, error: error.message });
  }
}

// 删除偏好
async function removePreference(preferenceType, preferenceName) {
  try {
    console.log(`[background] Removing preference: ${preferenceType} - ${preferenceName}`);
    
    // 获取所有阅读事件和帖子数据
    const [readEvents, threads] = await Promise.all([
      storage.getAllReadEvents(),
      storage.getAllThreads()
    ]);
    
    console.log(`[background] Found ${readEvents.length} read events and ${threads.length} threads`);
    
    let updatedCount = 0;
    
    // 根据偏好类型删除相关数据
    if (preferenceType === 'category') {
      // 删除版块偏好：将相关帖子的category字段清空
      console.log(`[background] Looking for category: "${preferenceName}"`);
      
      for (const thread of threads) {
        console.log(`[background] Thread ${thread.threadId} category: "${thread.category}"`);
        
        if (thread.category === preferenceName) {
          console.log(`[background] Found match! Updating thread ${thread.threadId} category from "${thread.category}" to ""`);
          
          // 直接更新数据库中的帖子记录
          await updateThreadPreference(thread.threadId, 'category', '');
          updatedCount++;
        }
      }
      
    } else if (preferenceType === 'tag') {
      // 删除标签偏好：从相关帖子的tags数组中移除该标签
      console.log(`[background] Looking for tag: "${preferenceName}"`);
      
      for (const thread of threads) {
        if (thread.tags && thread.tags.includes(preferenceName)) {
          console.log(`[background] Found match! Updating thread ${thread.threadId} tags, removing "${preferenceName}"`);
          
          const updatedTags = thread.tags.filter(tag => tag !== preferenceName);
          await updateThreadPreference(thread.threadId, 'tags', updatedTags);
          updatedCount++;
        }
      }
    }
    
    console.log(`[background] Successfully removed ${preferenceType} preference: ${preferenceName}, updated ${updatedCount} threads`);
    
  } catch (error) {
    console.error('[background] Error removing preference:', error);
    throw error;
  }
}

// 更新帖子偏好数据
async function updateThreadPreference(threadId, field, value) {
  try {
    // 先获取现有帖子数据
    const threads = await storage.getAllThreads();
    const existingThread = threads.find(t => t.threadId === threadId);
    
    if (!existingThread) {
      console.warn(`[background] Thread not found: ${threadId}`);
      return; // 如果帖子不存在，也算成功
    }
    
    // 更新指定字段
    const updatedThread = {
      ...existingThread,
      [field]: value,
      updatedAt: new Date().toISOString()
    };
    
    // 使用upsertThread保存更新后的记录
    await storage.upsertThread(updatedThread);
    console.log(`[background] Updated ${field} for thread ${threadId}`);
    
  } catch (error) {
    console.error('[background] Error updating thread preference:', error);
    throw error;
  }
}

// 初始化
(async () => {
  await initializeDatabase();
  await ensureAlarmExists();
  startAlarmMonitor(); // 启动定时器监控
  console.log('[background] Background service worker ready');
})();
