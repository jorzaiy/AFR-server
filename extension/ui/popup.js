(() => {
  const statsEl = document.getElementById('stats');
  const listEl = document.getElementById('list');
  const fetchStatusEl = document.getElementById('fetch-status');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnFetch = document.getElementById('btn-fetch');
  const forumSelector = document.getElementById('forum-selector');
  const statusMessage = document.getElementById('status-message');
  
  // 主题管理器
  let themeManager;

  // 显示状态消息
  function showStatus(message, type = 'info', duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    
    if (duration > 0) {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, duration);
    }
  }

  function renderList(items) {
    listEl.innerHTML = '';
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.innerHTML = `
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">暂无推荐内容</div>
      `;
      listEl.appendChild(li);
      return;
    }
    
    items.forEach((it, index) => {
      const li = document.createElement('li');
      li.className = 'recommendation-item';
      
      // 创建内容容器
      const contentDiv = document.createElement('div');
      contentDiv.style.display = 'flex';
      contentDiv.style.justifyContent = 'space-between';
      contentDiv.style.alignItems = 'flex-start';
      contentDiv.style.gap = '8px';
      
      // 创建左侧内容区域
      const leftDiv = document.createElement('div');
      leftDiv.style.flex = '1';
      leftDiv.style.minWidth = '0'; // 允许内容收缩
      
      // 创建标题链接
      const a = document.createElement('a');
      a.href = it.url;
      a.textContent = it.title || it.url;
      a.target = '_blank';
      a.style.textDecoration = 'none';
      a.style.color = '#007cff';
      a.style.display = 'block';
      a.style.marginBottom = '4px';
      a.style.wordBreak = 'break-word'; // 长标题换行
      
      // 添加论坛来源标识
      const forumSpan = document.createElement('span');
      forumSpan.style.fontSize = '10px';
      forumSpan.style.color = '#666';
      forumSpan.style.backgroundColor = '#f0f0f0';
      forumSpan.style.padding = '2px 6px';
      forumSpan.style.borderRadius = '3px';
      forumSpan.style.marginLeft = '8px';
      
      if (it.forumId === 'linux.do') {
        forumSpan.textContent = 'Linux.do';
        forumSpan.style.backgroundColor = '#e3f2fd';
        forumSpan.style.color = '#1976d2';
      } else if (it.forumId === 'nodeseek.com') {
        forumSpan.textContent = 'NodeSeek';
        forumSpan.style.backgroundColor = '#f3e5f5';
        forumSpan.style.color = '#7b1fa2';
      } else {
        forumSpan.textContent = it.forumId || '未知';
      }
      
      a.appendChild(forumSpan);
      
      // 添加点击事件，点击后从推荐中移除
      a.addEventListener('click', (e) => {
        console.log('[popup] User clicked recommendation:', it.threadId, it.title);
        handleRecommendationClick(it.threadId, it.title, li);
      });
      
      // 添加版块和标签信息
      if (it.category || (it.tags && it.tags.length > 0)) {
        const meta = document.createElement('div');
        meta.style.fontSize = '12px';
        meta.style.color = '#666';
        meta.style.marginBottom = '6px';
        
        const parts = [];
        if (it.category) parts.push(`版块: ${it.category}`);
        if (it.tags && it.tags.length > 0) parts.push(`标签: ${it.tags.join(', ')}`);
        
        meta.textContent = parts.join(' | ');
        leftDiv.appendChild(a);
        leftDiv.appendChild(meta);
      } else {
        leftDiv.appendChild(a);
      }
      
      // 添加不感兴趣按钮
      const dislikeBtn = document.createElement('button');
      dislikeBtn.textContent = '👎 不感兴趣';
      dislikeBtn.title = '不感兴趣';
      dislikeBtn.className = 'dislike-btn';
      dislikeBtn.dataset.threadId = it.threadId;
      dislikeBtn.dataset.title = it.title;
      
      // 添加点击事件
      dislikeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDislikeClick(it.threadId, it.title, dislikeBtn);
      });
      
      // 组装布局
      contentDiv.appendChild(leftDiv);
      contentDiv.appendChild(dislikeBtn);
      li.appendChild(contentDiv);
      listEl.appendChild(li);
    });
  }

  async function loadStats() {
    try {
      // 获取阅读统计
      const events = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'db/export' }, (resp) => {
          if (resp && resp.ok) {
            resolve(resp.bytes ? JSON.parse(new TextDecoder().decode(new Uint8Array(resp.bytes))).events : []);
          } else {
            resolve([]);
          }
        });
      });
      
      const today = new Date().toDateString();
      const todayEvents = events.filter(e => new Date(e.createdAt).toDateString() === today);
      const completedToday = todayEvents.filter(e => e.completed === 1).length;
      
      statsEl.textContent = `今日阅读: ${todayEvents.length} 篇，完成: ${completedToday} 篇`;
      
      // 获取抓取状态
      const threads = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'db/export' }, (resp) => {
          if (resp && resp.ok) {
            const data = JSON.parse(new TextDecoder().decode(new Uint8Array(resp.bytes)));
            resolve(data.threads || []);
          } else {
            resolve([]);
          }
        });
      });
      
      const newThreads = threads.filter(t => t.isNew);
      fetchStatusEl.textContent = `本地帖子: ${threads.length} 个，新帖子: ${newThreads.length} 个`;
      
      // 显示推荐内容
      loadRecommendations();
      
    } catch (e) {
      statsEl.textContent = '加载统计失败';
      fetchStatusEl.textContent = '';
    }
  }

  function refresh() {
    statsEl.textContent = '刷新中...';
    showStatus('正在刷新推荐...', 'info');
    
    // 获取当前显示的推荐内容
    const currentRecommendations = getCurrentRecommendations();
    
    if (currentRecommendations.length > 0) {
      // 将当前推荐标记为不感兴趣
      markCurrentRecommendationsAsDisliked(currentRecommendations);
    } else {
      // 如果没有当前推荐，直接重新加载
      loadStats();
      loadRecommendations();
    }
  }
  
  // 获取当前显示的推荐内容
  function getCurrentRecommendations() {
    const listItems = listEl.querySelectorAll('li');
    const recommendations = [];
    
    listItems.forEach(li => {
      const link = li.querySelector('a');
      const dislikeBtn = li.querySelector('button[data-thread-id]');
      
      if (link && dislikeBtn) {
        const threadId = dislikeBtn.dataset.threadId;
        const title = dislikeBtn.dataset.title;
        
        if (threadId && title) {
          recommendations.push({ threadId, title });
        }
      }
    });
    
    return recommendations;
  }
  
  // 将当前推荐标记为不感兴趣
  function markCurrentRecommendationsAsDisliked(recommendations) {
    const threadIds = recommendations.map(rec => rec.threadId);
    
    console.log('[popup] Marking current recommendations as disliked:', threadIds);
    
    chrome.runtime.sendMessage({
      type: 'dislike/add-batch',
      threadIds: threadIds
    }, (response) => {
      if (response && response.ok) {
        console.log(`[popup] Successfully marked ${response.added} recommendations as disliked`);
        showStatus(`已标记 ${response.added} 个推荐为不感兴趣`, 'success', 2000);
        
        // 清空当前列表
        listEl.innerHTML = '';
        
        // 重新加载推荐
        loadStats();
        loadRecommendations();
      } else {
        console.error('[popup] Failed to mark recommendations as disliked:', response);
        showStatus('标记失败，但会重新加载推荐', 'error', 2000);
        // 即使失败也重新加载推荐
        loadStats();
        loadRecommendations();
      }
    });
  }

  function triggerFetch() {
    btnFetch.textContent = '抓取中...';
    btnFetch.disabled = true;
    showStatus('正在抓取新内容...', 'info');
    
    chrome.runtime.sendMessage({ 
      type: 'fetch/trigger'
    }, (resp) => {
      btnFetch.textContent = '📥 抓取所有论坛';
      btnFetch.disabled = false;
      
      if (resp && resp.ok && resp.result) {
        const result = resp.result;
        if (result.success) {
          // 显示详细的抓取结果
          let statusText = `抓取完成: ${result.summary.successfulForums}/${result.summary.totalForums} 个论坛成功，共发现 ${result.summary.totalNewTopics} 个新帖子`;
          
          // 添加各论坛的详细结果
          if (result.results && result.results.length > 0) {
            const forumResults = result.results.map(r => {
              const forumName = r.forum === 'linux.do' ? 'Linux.do' : r.forum === 'nodeseek.com' ? 'NodeSeek' : r.forum;
              const status = r.success ? `✅ ${r.newTopics || 0}个` : `❌ 失败`;
              return `${forumName}: ${status}`;
            }).join(', ');
            statusText += `\n详情: ${forumResults}`;
          }
          
          fetchStatusEl.textContent = statusText;
          fetchStatusEl.style.color = 'var(--success-color)';
          fetchStatusEl.style.whiteSpace = 'pre-line'; // 支持换行
          showStatus('抓取完成', 'success', 2000);
          // 刷新显示
          setTimeout(loadStats, 1000);
        } else {
          fetchStatusEl.textContent = `抓取失败: ${result.error || '未知错误'}`;
          fetchStatusEl.style.color = 'var(--danger-color)';
          showStatus('抓取失败', 'error');
        }
      } else {
        fetchStatusEl.textContent = '抓取失败: 后台无响应';
        fetchStatusEl.style.color = 'var(--danger-color)';
        showStatus('抓取失败', 'error');
      }
    });
  }

  // 处理推荐点击
  function handleRecommendationClick(threadId, title, listItem) {
    console.log('[popup] Removing clicked recommendation:', threadId, title);
    
    // 发送消息到后台，标记该帖子为已点击
    chrome.runtime.sendMessage({ 
      type: 'recommend/clicked', 
      threadId: threadId,
      title: title
    }, (response) => {
      if (response && response.ok) {
        console.log('[popup] Successfully marked recommendation as clicked');
      } else {
        console.error('[popup] Failed to mark recommendation as clicked:', response);
      }
    });
    
    // 立即从UI中移除该推荐项
    if (listItem && listItem.parentNode) {
      listItem.parentNode.removeChild(listItem);
        
      // 检查是否还有推荐项
      const remainingItems = listEl.querySelectorAll('li:not(.empty-state)');
      console.log('[popup] Remaining recommendations after click:', remainingItems.length);
      
      // 如果推荐数量少于5个，自动补充
      if (remainingItems.length < 5) {
        console.log('[popup] Auto-refilling recommendations after click to maintain 5 items');
        autoRefillRecommendations();
      } else if (remainingItems.length === 0) {
        const li = document.createElement('li');
        li.textContent = '暂无推荐内容';
        li.style.color = '#666';
        listEl.appendChild(li);
      }
    }
  }

  // 处理不感兴趣按钮点击
  function handleDislikeClick(threadId, title, button) {
    // 更新按钮状态
    button.textContent = '已标记';
    button.disabled = true;
    button.style.backgroundColor = '#e9ecef';
    button.style.color = '#6c757d';
    
    // 发送消息到background
    chrome.runtime.sendMessage({ 
      type: 'dislike/add', 
      threadId: threadId,
      title: title 
    }, (resp) => {
      if (resp && resp.ok) {
        // 成功标记后，从列表中移除该项目
        const listItem = button.closest('li');
        if (listItem) {
          listItem.remove();
            
          // 检查当前推荐数量
          const remainingItems = listEl.querySelectorAll('li:not(.empty-state)');
          console.log('[popup] Remaining recommendations after dislike:', remainingItems.length);
          
          // 如果推荐数量少于5个，自动补充
          if (remainingItems.length < 5) {
            console.log('[popup] Auto-refilling recommendations to maintain 5 items');
            autoRefillRecommendations();
          }
        }
      } else {
        // 失败时恢复按钮状态
        button.textContent = '👎 不感兴趣';
        button.disabled = false;
        button.style.backgroundColor = '#f8f9fa';
        button.style.color = '#6c757d';
        alert('标记失败，请重试');
      }
    });
  }

  // 自动补充推荐内容
  function autoRefillRecommendations() {
    const selectedForum = forumSelector.value;
    const currentCount = listEl.querySelectorAll('li:not(.empty-state)').length;
    const neededCount = 5 - currentCount;
    
    console.log('[popup] Auto-refilling recommendations:', {
      currentCount,
      neededCount,
      selectedForum
    });
    
    if (neededCount <= 0) {
      console.log('[popup] No need to refill, already have enough recommendations');
      return;
    }
    
    // 显示加载状态
    showStatus(`正在补充推荐内容...`, 'info', 2000);
    
    chrome.runtime.sendMessage({ 
      type: 'recommend/mixed', 
      limit: neededCount,
      forum: selectedForum
    }, (resp) => {
      if (resp && resp.ok && resp.recommendations && resp.recommendations.length > 0) {
        console.log('[popup] Auto-refill got new recommendations:', resp.recommendations.length);
        
        // 获取当前推荐列表
        const currentRecommendations = getCurrentRecommendations();
        
        // 过滤掉已存在的推荐
        const existingThreadIds = new Set(currentRecommendations.map(rec => rec.threadId));
        const newRecommendations = resp.recommendations.filter(rec => 
          !existingThreadIds.has(rec.threadId)
        );
        
        if (newRecommendations.length > 0) {
          // 合并当前推荐和新推荐
          const combinedRecommendations = [...currentRecommendations, ...newRecommendations];
          
          // 重新渲染列表
          renderList(combinedRecommendations);
          
          showStatus(`已补充 ${newRecommendations.length} 个新推荐`, 'success', 2000);
          console.log('[popup] Auto-refill completed, total recommendations:', combinedRecommendations.length);
        } else {
          console.log('[popup] No new unique recommendations available for auto-refill');
          showStatus('暂无更多新推荐内容', 'info', 2000);
        }
      } else {
        console.log('[popup] Auto-refill failed or no new recommendations available');
        showStatus('补充推荐失败，请手动刷新', 'error', 2000);
      }
    });
  }

  // 加载推荐内容
  function loadRecommendations() {
    const selectedForum = forumSelector.value;
    console.log('[popup] Loading recommendations for forum:', selectedForum);
    
    // 获取用户设置的推荐数量
    chrome.runtime.sendMessage({ type: 'settings/get' }, (settingsResp) => {
      const recommendationCount = settingsResp?.settings?.recommendationCount || 5;
      
      chrome.runtime.sendMessage({ 
        type: 'recommend/mixed', 
        limit: recommendationCount,
        forum: selectedForum
      }, (resp) => {
        if (resp && resp.ok && resp.recommendations) {
          renderList(resp.recommendations);
        } else {
          // 如果推荐失败，显示新帖子作为备选
          chrome.runtime.sendMessage({ type: 'db/export' }, (exportResp) => {
            if (exportResp && exportResp.ok) {
              const data = JSON.parse(new TextDecoder().decode(new Uint8Array(exportResp.bytes)));
              let newThreads = (data.threads || []).filter(t => t.isNew);
              
              // 根据选择的论坛过滤
              if (selectedForum !== 'all') {
                newThreads = newThreads.filter(t => t.forumId === selectedForum);
              }
              renderList(newThreads.slice(0, recommendationCount));
            } else {
              renderList([]);
            }
          });
        }
      });
    });
  }

  // 初始化主题管理器
  function initThemeManager() {
    themeManager = new ThemeManager();
    
    // 绑定主题切换事件
    document.getElementById('theme-toggle').addEventListener('click', () => {
      themeManager.toggleTheme();
    });
  }
  
  // 绑定事件
  btnRefresh.addEventListener('click', refresh);
  btnFetch.addEventListener('click', triggerFetch);
  
  // 论坛选择器变化时重新加载推荐
  forumSelector.addEventListener('change', () => {
    console.log('[popup] Forum selector changed to:', forumSelector.value);
    loadRecommendations();
  });
  
  // 初始化主题管理器
  initThemeManager();
  
  // 检查是否有新帖子，如果有则自动刷新推荐
  function checkForNewContent(retryCount = 0) {
    console.log(`[popup] Attempting to connect to background script (attempt ${retryCount + 1})`);
    
    // 检查chrome.runtime是否可用（更宽松的检查）
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.error('[popup] Chrome runtime not available');
      statsEl.textContent = '扩展环境不可用，请重新加载扩展。';
      listEl.innerHTML = '<li>请确保在扩展环境中运行。</li>';
      return;
    }
    
    chrome.runtime.sendMessage({ type: 'fetch/stats' }, (resp) => {
      console.log('[popup] Received response:', resp);
      
      if (chrome.runtime.lastError) {
        console.error('[popup] Chrome runtime error:', chrome.runtime.lastError);
        if (chrome.runtime.lastError.message.includes('Receiving end does not exist') && retryCount < 2) {
          console.warn(`[popup] Connection failed. Retrying... (${retryCount + 1})`);
          setTimeout(() => checkForNewContent(retryCount + 1), 1000); // 增加重试间隔
        } else {
          console.error('[popup] Could not establish connection with background script.', chrome.runtime.lastError);
          statsEl.textContent = '无法连接到后台服务，请重新加载扩展。';
          listEl.innerHTML = '<li>请尝试重新打开弹窗或重新加载扩展。</li>';
        }
        return;
      }

      if (resp && resp.ok && resp.stats) {
        const stats = resp.stats;
        const now = Date.now();
        const timeSinceLastFetch = stats.timeSinceLastFetch || 0;
        const timeSinceLastSuccess = stats.timeSinceLastSuccess || 0;
        
        // 如果最近5分钟内有成功的抓取，自动刷新推荐
        if (timeSinceLastSuccess < 5 * 60 * 1000 && timeSinceLastSuccess > 0) {
          console.log('[popup] Recent fetch detected, auto-refreshing recommendations');
          refresh();
        } else {
          // 否则正常加载
          loadStats();
        }
      } else {
        // 如果无法获取抓取统计，正常加载
        loadStats();
      }
    });
  }
  
  // 初始加载
  checkForNewContent();
})();



