// 阅读行为追踪器 - Content Script
// 监听页面行为，发送阅读事件到 background script

(function() {
  'use strict';
  
  console.log('[reader-tracker] Content script loaded');
  
  // 状态管理
  let isActive = false;
  let isVisible = true;
  let isFocused = true;
  let lastActivityTime = Date.now();
  let lastScrollTime = Date.now();
  let maxScrollPercent = 0;
  let activeTimeStart = null;
  let accumulatedActiveTime = 0;
  let heartbeatInterval = null;
  let currentThread = null;
  let extensionContextValid = true;
  let isShuttingDown = false;
  
  // 配置
  const IDLE_THRESHOLD_MS = 60 * 1000; // 60秒无交互视为空闲
  const HEARTBEAT_INTERVAL_MS = 10 * 1000; // 10秒心跳间隔，平衡性能和实时性
  const SCROLL_DEBOUNCE_MS = 100; // 滚动防抖
  
  // 初始化
  function init() {
    if (!isSupportedForumPage()) {
      console.log('[reader-tracker] Not a supported forum page, skipping initialization');
      return;
    }
    
    // 如果已经在追踪状态，不要重复初始化
    if (isActive) {
      console.log('[reader-tracker] Already active, skipping re-initialization');
      return;
    }
    
    console.log('[reader-tracker] Initializing on supported forum page');
    
    // 启动扩展上下文监控（只在第一次初始化时）
    if (!contextMonitorInterval) {
      startExtensionContextMonitoring();
    }
    
    // 检测当前页面类型
    if (isThreadPage()) {
      console.log('[reader-tracker] Detected thread page, starting tracking');
      startTracking();
    } else {
      console.log('[reader-tracker] Not a thread page, waiting for navigation');
      // 监听页面变化（SPA导航）
      observePageChanges();
    }
  }
  
  // 检查是否是支持的论坛页面
  function isSupportedForumPage() {
    return window.location.hostname === 'linux.do' || 
           window.location.hostname === 'www.nodeseek.com' ||
           window.location.hostname === 'www.v2ex.com';
  }
  
  // 启动扩展上下文监控 - 改进版本
  let contextMonitorInterval = null;
  let lastContextCheck = 0;
  let contextFailureCount = 0;
  let lastSuccessfulConnection = 0;
  let lastConnectionAttempt = 0;
  let retryDelay = 5000; // 初始重试延迟5秒
  let maxRetryDelay = 60000; // 最大重试延迟60秒
  
  function startExtensionContextMonitoring() {
    // 如果已经有监控器在运行，先清除
    if (contextMonitorInterval) {
      clearInterval(contextMonitorInterval);
    }
    
    // 动态调整检查间隔：失败次数越多，检查间隔越长
    const getCheckInterval = () => {
      if (contextFailureCount === 0) return 15000; // 正常状态15秒
      if (contextFailureCount <= 3) return 30000;  // 轻微失败30秒
      if (contextFailureCount <= 10) return 60000; // 多次失败60秒
      return 120000; // 严重失败2分钟
    };
    
    const checkContext = () => {
      try {
        const now = Date.now();
        
        // 避免过于频繁的检查
        if (now - lastContextCheck < 5000) {
          return;
        }
        lastContextCheck = now;
        
        // 检查扩展上下文是否可用
        if (!chrome.runtime || !chrome.runtime.id) {
          if (extensionContextValid) {
            contextFailureCount++;
            console.warn(`[reader-tracker] Extension context invalidated (attempt ${contextFailureCount}), will retry connection.`);
            extensionContextValid = false;
            
            // 动态调整重试延迟
            retryDelay = Math.min(retryDelay * 1.5, maxRetryDelay);
          }
        } else {
          // 如果扩展上下文恢复
          if (!extensionContextValid) {
            // 避免过于频繁的重连尝试
            if (now - lastConnectionAttempt < retryDelay) {
              return;
            }
            
            console.log('[reader-tracker] Extension context restored, testing connection...');
            lastConnectionAttempt = now;
            
            testConnection((connected) => {
              if (connected) {
                console.log('[reader-tracker] Connection test successful, resuming tracking');
                extensionContextValid = true;
                contextFailureCount = 0; // 重置失败计数
                retryDelay = 5000; // 重置重试延迟
                lastSuccessfulConnection = now;
                
                // 如果当前不在追踪状态，强制开始追踪
                if (!isActive && !isShuttingDown) {
                  setTimeout(() => {
                    if (!isActive && !isShuttingDown) {
                      console.log('[reader-tracker] Force starting tracking after context restoration');
                      forceStartTracking();
                    }
                  }, 1000);
                }
              } else {
                console.log('[reader-tracker] Connection test failed, will retry in', retryDelay, 'ms');
              }
            });
          }
        }
      } catch (e) {
        if (extensionContextValid) {
          console.warn('[reader-tracker] Extension context check failed, marking as invalid.', e);
          extensionContextValid = false;
          contextFailureCount++;
        }
      }
    };
    
    // 立即执行一次检查
    checkContext();
    
    // 设置定期检查
    contextMonitorInterval = setInterval(checkContext, getCheckInterval());
  }
  
  // 检查是否是帖子页面
  function isThreadPage() {
    const path = window.location.pathname;
    const hostname = window.location.hostname;
    
    if (hostname === 'linux.do') {
      return path.includes('/t/') && path.split('/').length >= 4;
    } else if (hostname === 'www.nodeseek.com') {
      return path.includes('/post-') && path.includes('-1');
    } else if (hostname === 'www.v2ex.com') {
      // V2EX URL格式: /t/123456
      return path.match(/^\/t\/\d+$/);
    }
    
    return false;
  }
  
  // 测试与background script的连接 - 改进版本
  function testConnection(callback) {
    if (!chrome.runtime || !chrome.runtime.id) {
      console.log('[reader-tracker] No chrome.runtime available');
      callback(false);
      return;
    }
    
    try {
      // 设置超时，避免长时间等待
      const timeout = setTimeout(() => {
        console.log('[reader-tracker] Connection test timeout');
        callback(false);
      }, 5000); // 5秒超时
      
      chrome.runtime.sendMessage({ 
        type: 'debug/check',
        timestamp: Date.now()
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          // 只在失败次数较少时显示详细错误信息
          if (contextFailureCount <= 3) {
            console.log('[reader-tracker] Connection test failed:', chrome.runtime.lastError.message);
          }
          callback(false);
        } else if (response && response.ok) {
          // 只在成功重连时显示成功信息
          if (contextFailureCount > 0) {
            console.log('[reader-tracker] Connection test successful');
          }
          callback(true);
        } else {
          if (contextFailureCount <= 3) {
            console.log('[reader-tracker] Connection test failed: invalid response');
          }
          callback(false);
        }
      });
    } catch (error) {
      if (contextFailureCount <= 3) {
        console.log('[reader-tracker] Connection test error:', error);
      }
      callback(false);
    }
  }

  // 开始追踪 - 改进版本
  function startTracking() {
    if (isActive || isShuttingDown) return;
    
    // 避免过于频繁的连接尝试
    const now = Date.now();
    if (now - lastConnectionAttempt < retryDelay) {
      return;
    }
    lastConnectionAttempt = now;
    
    // 先测试连接
    testConnection((connected) => {
      if (!connected) {
        // 只在失败次数较少时显示警告
        if (contextFailureCount <= 3) {
          console.warn('[reader-tracker] Background script not available, will retry later');
        }
        extensionContextValid = false;
        contextFailureCount++;
        
        // 动态调整重试延迟
        retryDelay = Math.min(retryDelay * 1.2, maxRetryDelay);
        return;
      }
      
      console.log('[reader-tracker] Background script available, starting tracking');
      extensionContextValid = true;
      contextFailureCount = 0; // 重置失败计数
      retryDelay = 5000; // 重置重试延迟
      isActive = true;
      currentThread = extractThreadInfo();
      
      if (!currentThread) {
        console.warn('[reader-tracker] Could not extract thread info');
        isActive = false;
        return;
      }
      
      console.log('[reader-tracker] Starting tracking for thread:', currentThread.threadId);
      
      // 发送开始事件
      sendReaderEvent('reader/open', currentThread, getCurrentMetrics());
      
      // 开始心跳
      startHeartbeat();
      
      // 绑定事件监听器
      bindEventListeners();
      
      // 重置状态
      resetTrackingState();
    });
  }
  
  // 强制开始追踪（用于重连后）
  function forceStartTracking() {
    if (isActive || isShuttingDown) return;
    
    console.log('[reader-tracker] Force starting tracking after reconnection');
    extensionContextValid = true;
    isActive = true;
    currentThread = extractThreadInfo();
    
    if (!currentThread) {
      console.warn('[reader-tracker] Could not extract thread info');
      isActive = false;
      return;
    }
    
    console.log('[reader-tracker] Starting tracking for thread:', currentThread.threadId);
    
    // 发送开始事件
    sendReaderEvent('reader/open', currentThread, getCurrentMetrics());
    
    // 开始心跳
    startHeartbeat();
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 重置状态
    resetTrackingState();
  }
  
  // 停止追踪
  function stopTracking(skipEvent = false) {
    if (!isActive || isShuttingDown) return;
    
    console.log('[reader-tracker] Stopping tracking');
    
    // 立即停止心跳，防止继续触发
    stopHeartbeat();
    
    // 发送结束事件（除非跳过）
    if (!skipEvent && currentThread && extensionContextValid && !isShuttingDown) {
      sendReaderEvent('reader/close', currentThread, getCurrentMetrics());
    }
    
    // 清理
    unbindEventListeners();
    
    isActive = false;
    currentThread = null;
  }
  
  // 完全关闭追踪器
  function shutdown() {
    if (isShuttingDown) return;
    
    console.log('[reader-tracker] Shutting down tracker');
    isShuttingDown = true;
    extensionContextValid = false;
    
    // 停止所有活动
    stopTracking(true);
    
    // 清理所有定时器
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    
    if (contextMonitorInterval) {
      clearInterval(contextMonitorInterval);
      contextMonitorInterval = null;
    }
  }
  
  // 提取帖子信息
  function extractThreadInfo() {
    try {
      const url = window.location.href;
      const hostname = window.location.hostname;
      const pathParts = window.location.pathname.split('/');
      
      // 从URL提取threadId
      let threadId = null;
      
      if (hostname === 'linux.do') {
        // Linux.do URL 格式: /t/topic/123456 或 /t/some-slug/12345 或 /t/12345
        if (pathParts[1] === 't' && pathParts.length >= 3) {
          // 尝试从URL中提取数字ID
          const urlMatch = window.location.pathname.match(/\/t\/(?:[^\/]+\/)?(\d+)/);
          if (urlMatch) {
            threadId = `linuxdo:${urlMatch[1]}`;
          } else {
            // 备用方案：使用最后一个数字部分
            const potentialId = pathParts[pathParts.length - 1];
            if (/^\d+$/.test(potentialId)) {
              threadId = `linuxdo:${potentialId}`;
            }
          }
        }
      } else if (hostname === 'www.nodeseek.com') {
        // NodeSeek URL 格式: /post-123456-1
        const postMatch = window.location.pathname.match(/\/post-(\d+)-1/);
        if (postMatch) {
          threadId = `nodeseek:${postMatch[1]}`;
        }
      } else if (hostname === 'www.v2ex.com') {
        // V2EX URL 格式: /t/123456
        const v2exMatch = window.location.pathname.match(/\/t\/(\d+)/);
        if (v2exMatch) {
          threadId = `v2ex:${v2exMatch[1]}`;
        }
      }
      
      if (!threadId) {
        console.warn('[reader-tracker] Could not extract threadId from URL:', url);
        return null;
      }
      
      // 提取标题
      let title = '';
      if (hostname === 'linux.do') {
        const titleEl = document.querySelector('h1, .topic-title, .post-title, [data-topic-title]');
        if (titleEl) {
          title = titleEl.textContent.trim();
        } else {
          title = document.title.replace(/ - Linux.do$/, '').trim();
        }
      } else if (hostname === 'www.nodeseek.com') {
        const titleEl = document.querySelector('h1, .post-title, .topic-title');
        if (titleEl) {
          title = titleEl.textContent.trim();
        } else {
          title = document.title.replace(/ - NodeSeek$/, '').trim();
        }
      } else if (hostname === 'www.v2ex.com') {
        const titleEl = document.querySelector('h1, .topic-title, .header h1');
        if (titleEl) {
          title = titleEl.textContent.trim();
        } else {
          title = document.title.replace(/ - V2EX$/, '').trim();
        }
      }
      
      // 提取分类
      let category = '';
      if (hostname === 'linux.do') {
        const categoryEl = document.querySelector('.category-name, .breadcrumb a, .topic-category');
        if (categoryEl) {
          category = categoryEl.textContent.trim();
        }
      } else if (hostname === 'www.nodeseek.com') {
        // NodeSeek 的分类信息可能需要从其他地方提取
        const categoryEl = document.querySelector('.category, .breadcrumb a');
        if (categoryEl) {
          category = categoryEl.textContent.trim();
        }
      } else if (hostname === 'www.v2ex.com') {
        // V2EX 的节点信息
        const nodeEl = document.querySelector('.header .gray, .node');
        if (nodeEl) {
          category = nodeEl.textContent.trim();
        }
      }
      
      // 提取标签（改进版本）
      let tags = [];
      
      // 无意义标签过滤
      const meaninglessTags = new Set([
        '只读', '置顶', '精华', '热门', '推荐', '最新', '最新回复',
        '楼主', '沙发', '板凳', '地板', '地下室', '下水道',
        '临时禁言', '禁言', '解封', '封号', '解封号',
        '活跃', '在线', '离线', '隐身', '忙碌',
        'PRO', 'VIP', '会员', '普通用户', '新用户',
        '公告', '通知', '提醒', '系统消息'
      ]);
      
      if (hostname === 'linux.do') {
        // Linux.do 标签选择器（更全面）
        const tagSelectors = [
          '.tag', '.topic-tag', '[data-tag]', 
          '.badge', '.label', '.chip',
          '.thread-tag', '.post-tag', '.content-tag'
        ];
        
        tagSelectors.forEach(selector => {
          const tagEls = document.querySelectorAll(selector);
          tagEls.forEach(el => {
            const tag = el.textContent.trim();
            if (tag && !tags.includes(tag) && !meaninglessTags.has(tag) && tag.length >= 2) {
              tags.push(tag);
            }
          });
        });
        
      } else if (hostname === 'www.nodeseek.com') {
        // NodeSeek 标签选择器（更全面）
        const tagSelectors = [
          '.tag', '.badge', '.nsk-badge',
          '.label', '.chip', '.thread-tag',
          '.post-tag', '.content-tag'
        ];
        
        tagSelectors.forEach(selector => {
          const tagEls = document.querySelectorAll(selector);
          tagEls.forEach(el => {
            const tag = el.textContent.trim();
            if (tag && !tags.includes(tag) && !meaninglessTags.has(tag) && tag.length >= 2) {
              tags.push(tag);
            }
          });
        });
        
      } else if (hostname === 'www.v2ex.com') {
        // V2EX 标签选择器（更全面）
        const tagSelectors = [
          '.tag', '.badge', '.topic-tag',
          '.label', '.chip', '.thread-tag',
          '.post-tag', '.content-tag'
        ];
        
        tagSelectors.forEach(selector => {
          const tagEls = document.querySelectorAll(selector);
          tagEls.forEach(el => {
            const tag = el.textContent.trim();
            if (tag && !tags.includes(tag) && !meaninglessTags.has(tag) && tag.length >= 2) {
              tags.push(tag);
            }
          });
        });
        
        // 从标题中提取可能的标签
        const title = document.title || '';
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
          if (title.includes(tag) && !tags.includes(tag)) {
            tags.push(tag);
          }
        });
      }
      
      return {
        threadId,
        url,
        title,
        category,
        tags
      };
      
    } catch (error) {
      console.error('[reader-tracker] Error extracting thread info:', error);
      return null;
    }
  }
  
  // 获取当前指标
  function getCurrentMetrics() {
    const now = Date.now();
    const isIdle = (now - lastActivityTime) > IDLE_THRESHOLD_MS;
    
    // 计算本次心跳的活跃时间增量
    let activeMsDelta = 0;
    if (activeTimeStart && !isIdle && isVisible) {
      // 只要页面可见且非空闲，就计算时间（不要求焦点）
      activeMsDelta = now - activeTimeStart;
    }
    
    return {
      activeMsDelta: activeMsDelta,
      maxScrollPct: maxScrollPercent,
      isVisible,
      isFocused,
      idle: isIdle
    };
  }
  
  // 重置追踪状态
  function resetTrackingState() {
    lastActivityTime = Date.now();
    lastScrollTime = Date.now();
    maxScrollPercent = 0;
    activeTimeStart = Date.now();
    accumulatedActiveTime = 0;
  }
  
  // 开始心跳
  function startHeartbeat() {
    if (heartbeatInterval || isShuttingDown) return;
    
    console.log('[reader-tracker] Starting heartbeat with interval:', HEARTBEAT_INTERVAL_MS + 'ms');
    
    heartbeatInterval = setInterval(() => {
      console.log('[reader-tracker] Heartbeat tick - isActive:', isActive, 'extensionContextValid:', extensionContextValid);
      
      // 如果正在关闭，立即停止心跳
      if (isShuttingDown) {
        console.log('[reader-tracker] Shutting down, stopping heartbeat');
        stopHeartbeat();
        return;
      }
      
      // 如果扩展上下文失效，尝试重连
      if (!extensionContextValid) {
        console.log('[reader-tracker] Context invalid, testing connection...');
        testConnection((connected) => {
          if (connected) {
            console.log('[reader-tracker] Connection restored, resuming tracking');
            extensionContextValid = true;
          }
        });
        return;
      }
      
      if (isActive && currentThread && extensionContextValid && !isShuttingDown) {
        console.log('[reader-tracker] Sending heartbeat for thread:', currentThread.threadId);
        updateActiveTime();
        sendReaderEvent('reader/heartbeat', currentThread, getCurrentMetrics());
        // 重置活跃时间起点，为下次心跳做准备
        activeTimeStart = Date.now();
      } else {
        console.log('[reader-tracker] Skipping heartbeat - isActive:', isActive, 'currentThread:', !!currentThread, 'extensionContextValid:', extensionContextValid, 'isShuttingDown:', isShuttingDown);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
  
  // 停止心跳
  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }
  
  // 更新活跃时间
  function updateActiveTime() {
    if (!isActive || !isVisible || isShuttingDown) {
      activeTimeStart = null;
      return;
    }
    
    const now = Date.now();
    const isIdle = (now - lastActivityTime) > IDLE_THRESHOLD_MS;
    
    // 只有在非空闲状态下才更新活跃时间起点（不要求焦点）
    if (!isIdle) {
      if (!activeTimeStart) {
        activeTimeStart = now;
      }
    } else {
      activeTimeStart = null;
    }
  }
  
  // 更新滚动百分比
  function updateScrollPercent() {
    if (isShuttingDown) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
    
    if (percent > maxScrollPercent) {
      maxScrollPercent = percent;
    }
  }
  
  // 记录活动
  function recordActivity() {
    if (isShuttingDown) return;
    
    lastActivityTime = Date.now();
    updateActiveTime();
  }
  
  // 发送阅读事件
  // 发送阅读事件（优化重试机制，避免重复消息）
  const pendingMessages = new Set(); // 跟踪待发送的消息
  
  function sendReaderEvent(type, thread, metrics, retryCount = 0) {
    if (isShuttingDown) return;

    // 检查扩展上下文是否可用
    if (!chrome.runtime || !chrome.runtime.id) {
      console.log('[reader-tracker] Extension context temporarily unavailable, pausing tracker.');
      shutdown(); // 上下文丢失，立即停止所有活动
      return;
    }

    // 创建消息唯一标识，避免重复发送
    const messageKey = `${type}_${thread.threadId}_${Date.now()}`;
    if (pendingMessages.has(messageKey)) {
      console.log('[reader-tracker] Message already pending, skipping:', type, thread.threadId);
      return;
    }
    
    pendingMessages.add(messageKey);

    const message = { type, thread, metrics, at: new Date().toISOString() };
    console.log(`[reader-tracker] Sending event (attempt ${retryCount + 1}):`, type, thread.threadId, {
      activeMsDelta: metrics.activeMsDelta,
      maxScrollPct: metrics.maxScrollPct,
      isVisible: metrics.isVisible,
      isFocused: metrics.isFocused
    });

    try {
      chrome.runtime.sendMessage(message, (response) => {
        pendingMessages.delete(messageKey); // 移除待发送标记
        
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || '';
          console.warn(`[reader-tracker] Attempt ${retryCount + 1} failed:`, errorMsg);

          // 处理连接错误
          if (errorMsg.includes('Receiving end does not exist') || errorMsg.includes('Could not establish connection')) {
            if (retryCount < 2) {
              console.log('[reader-tracker] Background script not ready, retrying in 2 seconds...');
              setTimeout(() => sendReaderEvent(type, thread, metrics, retryCount + 1), 2000);
            } else {
              console.warn('[reader-tracker] Max retries reached, marking context as invalid');
              extensionContextValid = false;
              // 不立即停止追踪，让监控器处理重连
            }
          } else if (errorMsg.includes('Extension context invalidated')) {
            console.warn('[reader-tracker] Extension context invalidated, will retry on next page');
            extensionContextValid = false;
            // 不立即停止追踪，让监控器处理
          } else {
            console.error('[reader-tracker] Unknown error:', errorMsg);
            extensionContextValid = false;
          }
        } else {
          console.log('[reader-tracker] ✅ Message sent successfully:', type, response);
          extensionContextValid = true; // 成功发送后，重置状态
        }
      });
    } catch (error) {
      pendingMessages.delete(messageKey); // 移除待发送标记
      console.error('[reader-tracker] Critical error sending message:', error);
      extensionContextValid = false;
      // 不立即停止追踪，让监控器处理
    }
  }
  
  // 绑定事件监听器
  function bindEventListeners() {
    if (isShuttingDown) return;
    
    // 可见性变化
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 窗口焦点变化
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    // 滚动事件（防抖）
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      if (isShuttingDown) return;
      
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        updateScrollPercent();
        recordActivity();
      }, SCROLL_DEBOUNCE_MS);
    });
    
    // 用户交互事件
    const interactionEvents = ['click', 'keydown', 'mousemove', 'touchstart'];
    interactionEvents.forEach(eventType => {
      document.addEventListener(eventType, () => {
        if (!isShuttingDown) {
          recordActivity();
        }
      }, { passive: true });
    });
    
    // 页面卸载
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // 页面隐藏
    window.addEventListener('pagehide', handlePageHide);
  }
  
  // 解绑事件监听器
  function unbindEventListeners() {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handlePageHide);
    
    const interactionEvents = ['click', 'keydown', 'mousemove', 'touchstart'];
    interactionEvents.forEach(eventType => {
      document.removeEventListener(eventType, recordActivity);
    });
  }
  
  // 事件处理器
  function handleVisibilityChange() {
    if (isShuttingDown) return;
    
    isVisible = !document.hidden;
    console.log('[reader-tracker] Visibility changed:', isVisible);
    
    if (isVisible) {
      recordActivity();
    } else {
      updateActiveTime();
    }
  }
  
  function handleFocus() {
    if (isShuttingDown) return;
    
    isFocused = true;
    console.log('[reader-tracker] Window focused');
    recordActivity();
  }
  
  function handleBlur() {
    if (isShuttingDown) return;
    
    isFocused = false;
    console.log('[reader-tracker] Window blurred');
    updateActiveTime();
  }
  
  function handleBeforeUnload() {
    if (isShuttingDown) return;
    
    console.log('[reader-tracker] Page unloading');
    // 仅当追踪器处于活动状态且扩展上下文有效时，才尝试发送关闭事件
    if (isActive && currentThread && extensionContextValid && chrome.runtime && chrome.runtime.id) {
      updateActiveTime();
      sendReaderEvent('reader/close', currentThread, getCurrentMetrics());
    } else {
      console.log('[reader-tracker] Page unloading, but context is invalid or tracker is inactive. Skipping close event.');
    }
  }
  
  function handlePageHide() {
    if (isShuttingDown) return;
    
    console.log('[reader-tracker] Page hidden');
    stopTracking();
  }
  
  // 监听页面变化（用于SPA导航，优化版本）
  function observePageChanges() {
    if (isShuttingDown) return;
    
    let currentUrl = window.location.href;
    let urlChangeTimeout = null;
    
    // 等待DOM加载完成
    const waitForBody = () => {
      if (document.body) {
        startPageObserver();
      } else {
        setTimeout(waitForBody, 100);
      }
    };
    
    const startPageObserver = () => {
      // 使用防抖的URL变化监听
      const observer = new MutationObserver(() => {
        if (isShuttingDown) return;
        
        // 防抖处理，避免频繁触发
        if (urlChangeTimeout) {
          clearTimeout(urlChangeTimeout);
        }
        
        urlChangeTimeout = setTimeout(() => {
          if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            console.log('[reader-tracker] URL changed to:', currentUrl);
            
            // 停止当前追踪
            if (isActive) {
              stopTracking();
            }
            
            // 检查新页面是否需要追踪
            if (isThreadPage()) {
              console.log('[reader-tracker] New thread page detected, starting tracking');
              startTracking();
            }
          }
        }, 500); // 500ms防抖
      });
      
      try {
        // 只监听body的直接子元素变化，减少触发频率
        observer.observe(document.body, {
          childList: true,
          subtree: false // 不监听深层变化
        });
        console.log('[reader-tracker] Page observer started');
      } catch (error) {
        console.error('[reader-tracker] Failed to start page observer:', error);
      }
    };
    
    waitForBody();
  }
  
  // 启动
  init();
  
})();