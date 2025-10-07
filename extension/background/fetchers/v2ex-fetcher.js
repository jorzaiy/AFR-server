// V2EX 论坛抓取器
import { BaseFetcher } from './base-fetcher.js';
import storage from '../storage.js';

export default class V2exFetcher extends BaseFetcher {
  constructor() {
    super('v2ex.com');
    this.baseUrl = 'https://www.v2ex.com';
    this.latestUrl = `${this.baseUrl}/api/topics/latest.json`;
    this.hotUrl = `${this.baseUrl}/api/topics/hot.json`;
  }

  async performIncrementalFetch(force = false) {
    if (!force && this.isInCooldown()) {
      console.log(`[${this.forumId}-fetcher] Skipping fetch due to cooldown.`);
      return { success: false, reason: 'cooldown', forumId: this.forumId };
    }
    
    this.updateFetchStats();

    try {
      console.log(`[${this.forumId}-fetcher] Starting V2EX fetch...`);
      
      // 暂时跳过V2EX抓取，避免CORS问题
      console.log(`[${this.forumId}-fetcher] V2EX fetch temporarily disabled due to CORS issues`);
      
      return {
        success: true,
        newTopics: 0,
        posts: [],
        forumId: this.forumId,
        message: 'V2EX fetch temporarily disabled'
      };
    } catch (error) {
      console.error(`[${this.forumId}-fetcher] Incremental fetch failed:`, error);
      return { success: false, error: error.message, forumId: this.forumId };
    }
  }

  async fetchViaContentScript(dataType) {
    return new Promise((resolve, reject) => {
      // 查找V2EX标签页
      chrome.tabs.query({ url: 'https://www.v2ex.com/*' }, (tabs) => {
        if (tabs.length === 0) {
          // 如果没有V2EX标签页，创建一个
          chrome.tabs.create({ url: 'https://www.v2ex.com' }, (tab) => {
            this.sendMessageToTab(tab.id, dataType, resolve, reject);
          });
        } else {
          // 使用现有的V2EX标签页
          this.sendMessageToTab(tabs[0].id, dataType, resolve, reject);
        }
      });
    });
  }

  sendMessageToTab(tabId, dataType, resolve, reject) {
    // 等待页面加载完成
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        type: 'v2ex/fetch',
        dataType: dataType
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[${this.forumId}-fetcher] Content script error:`, chrome.runtime.lastError);
          // 如果内容脚本未加载，尝试重新注入
          this.injectContentScript(tabId, dataType, resolve, reject);
          return;
        }
        
        if (response && response.success) {
          console.log(`[${this.forumId}-fetcher] Content script response:`, response.data?.length || 0, 'topics');
          resolve(response.data || []);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    }, 2000); // 等待2秒让页面完全加载
  }

  injectContentScript(tabId, dataType, resolve, reject) {
    console.log(`[${this.forumId}-fetcher] Injecting content script into tab ${tabId}`);
    
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/v2ex-fetcher.js']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error(`[${this.forumId}-fetcher] Script injection failed:`, chrome.runtime.lastError);
        reject(new Error('Failed to inject content script'));
        return;
      }
      
      // 等待脚本注入后再次尝试发送消息
      setTimeout(() => {
        this.sendMessageToTab(tabId, dataType, resolve, reject);
      }, 1000);
    });
  }

  // 保留原有的fetch方法作为备用
  async fetchLatestTopics() {
    try {
      console.log(`[${this.forumId}-fetcher] Fetching latest topics from: ${this.latestUrl}`);
      
      const response = await fetch(this.latestUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit', // V2EX API不需要credentials
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      console.log(`[${this.forumId}-fetcher] Latest topics response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const topics = await response.json();
      console.log(`[${this.forumId}-fetcher] Latest topics fetched: ${topics?.length || 0} topics`);
      return this.parseTopics(topics, 'latest');
    } catch (error) {
      console.error(`[${this.forumId}-fetcher] Error fetching latest topics:`, error);
      throw error;
    }
  }

  async fetchHotTopics() {
    try {
      console.log(`[${this.forumId}-fetcher] Fetching hot topics from: ${this.hotUrl}`);
      
      const response = await fetch(this.hotUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit', // V2EX API不需要credentials
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      console.log(`[${this.forumId}-fetcher] Hot topics response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const topics = await response.json();
      console.log(`[${this.forumId}-fetcher] Hot topics fetched: ${topics?.length || 0} topics`);
      return this.parseTopics(topics, 'hot');
    } catch (error) {
      console.error(`[${this.forumId}-fetcher] Error fetching hot topics:`, error);
      throw error;
    }
  }

  parseTopics(topics, type) {
    if (!Array.isArray(topics)) {
      console.warn(`[${this.forumId}-fetcher] Topics is not an array:`, typeof topics, topics);
      return [];
    }

    console.log(`[${this.forumId}-fetcher] Parsing ${topics.length} topics of type: ${type}`);

    return topics.map((topic, index) => {
      try {
        if (!topic || !topic.id) {
          console.warn(`[${this.forumId}-fetcher] Invalid topic at index ${index}:`, topic);
          return null;
        }

        const parsedTopic = {
          threadId: `v2ex:${topic.id}`,
          forumId: this.forumId,
          url: `${this.baseUrl}/t/${topic.id}`,
          title: topic.title || '无标题',
          category: topic.node?.title || topic.node?.name || '未分类',
          tags: this.extractTags(topic),
          authorId: topic.member?.username || '匿名用户',
          authorName: topic.member?.username || '匿名用户',
          publishedAt: new Date(topic.created * 1000).toISOString(),
          replyCount: topic.replies || 0,
          isNew: true,
          source: type, // 'latest' or 'hot'
          popularityScore: this.calculatePopularityScore(topic),
        };

        console.log(`[${this.forumId}-fetcher] Parsed topic ${index + 1}:`, {
          threadId: parsedTopic.threadId,
          title: parsedTopic.title,
          category: parsedTopic.category,
          author: parsedTopic.authorName
        });

        return parsedTopic;
      } catch (error) {
        console.error(`[${this.forumId}-fetcher] Error parsing topic at index ${index}:`, error, topic);
        return null;
      }
    }).filter(Boolean); // 过滤掉null值
  }

  extractTags(topic) {
    const tags = [];
    
    // 从节点名称提取标签
    if (topic.node?.title) {
      tags.push(topic.node.title);
    }
    
    // 从标题中提取可能的标签
    const title = topic.title || '';
    const commonTags = [
      'Python', 'JavaScript', 'Java', 'C++', 'Go', 'Rust', 'PHP', 'Ruby',
      'Android', 'iOS', 'macOS', 'Linux', 'Windows', 'Chrome', 'Firefox',
      'GitHub', 'GitLab', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
      'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Django', 'Flask',
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch',
      '机器学习', '人工智能', '区块链', '加密货币', '比特币', '以太坊',
      '前端', '后端', '全栈', 'DevOps', '测试', '安全', '性能优化'
    ];
    
    commonTags.forEach(tag => {
      if (title.includes(tag)) {
        tags.push(tag);
      }
    });
    
    return [...new Set(tags)]; // 去重
  }

  calculatePopularityScore(topic) {
    const replyCount = topic.replies || 0;
    const created = topic.created || 0;
    const now = Date.now() / 1000;
    const ageInHours = (now - created) / 3600;
    
    // 基于回复数和时间的简单热度计算
    if (ageInHours < 1) {
      return Math.min(1.0, replyCount * 0.1 + 0.5); // 1小时内，回复数权重高
    } else if (ageInHours < 24) {
      return Math.min(1.0, replyCount * 0.05 + 0.3); // 24小时内，回复数权重中等
    } else {
      return Math.min(1.0, replyCount * 0.02 + 0.1); // 超过24小时，回复数权重低
    }
  }

  mergeAndDeduplicateTopics(latestTopics, hotTopics) {
    const topicMap = new Map();
    
    // 先添加最新帖子
    latestTopics.forEach(topic => {
      topicMap.set(topic.threadId, topic);
    });
    
    // 再添加热门帖子，热门帖子优先级更高
    hotTopics.forEach(topic => {
      if (topicMap.has(topic.threadId)) {
        // 如果已存在，更新为热门版本
        const existing = topicMap.get(topic.threadId);
        topicMap.set(topic.threadId, {
          ...existing,
          ...topic,
          source: 'hot', // 标记为热门
          popularityScore: Math.max(existing.popularityScore || 0, topic.popularityScore || 0)
        });
      } else {
        topicMap.set(topic.threadId, topic);
      }
    });
    
    return Array.from(topicMap.values());
  }

  async markNewTopics(fetchedTopics) {
    const existingThreads = await storage.getAllThreads();
    const existingThreadIds = new Set(existingThreads.map(t => t.threadId));
    const newTopics = fetchedTopics.filter(topic => !existingThreadIds.has(topic.threadId));

    for (const topic of newTopics) {
      await storage.upsertThread(topic);
    }
    
    console.log(`[${this.forumId}-fetcher] Found ${newTopics.length} new topics out of ${fetchedTopics.length} total`);
    return newTopics;
  }
}
