// 增强版弹窗逻辑
(() => {
  // DOM 元素
  const elements = {
    stats: {
      todayReads: document.getElementById('today-reads'),
      totalThreads: document.getElementById('total-threads')
    },
    statusMessage: document.getElementById('status-message'),
    forumSelector: document.getElementById('forum-selector'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnFetch: document.getElementById('btn-fetch'),
    loading: document.getElementById('loading'),
    emptyState: document.getElementById('empty-state'),
    recommendationList: document.getElementById('recommendation-list'),
    lastUpdate: document.getElementById('last-update'),
    openSettings: document.getElementById('open-settings')
  };
  
  // 主题管理器
  let themeManager;
  
  // 状态管理
  let currentRecommendations = [];
  let isLoading = false;
  
  // 初始化
  function init() {
    // 初始化主题管理器
    themeManager = new ThemeManager();
    
    // 绑定事件
    bindEvents();
    
    // 加载初始数据
    loadStats();
    loadRecommendations();
    
    // 更新最后更新时间
    updateLastUpdateTime();
  }
  
  // 绑定事件
  function bindEvents() {
    // 主题切换
    document.getElementById('theme-toggle').addEventListener('click', () => {
      themeManager.toggleTheme();
    });
    
    // 论坛选择
    elements.forumSelector.addEventListener('change', () => {
      loadRecommendations();
    });
    
    // 刷新推荐
    elements.btnRefresh.addEventListener('click', () => {
      refreshRecommendations();
    });
    
    // 触发抓取
    elements.btnFetch.addEventListener('click', () => {
      triggerFetch();
    });
    
    // 打开设置
    elements.openSettings.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    
    // 键盘快捷键
    document.addEventListener('keydown', handleKeyboard);
  }
  
  // 键盘事件处理
  function handleKeyboard(e) {
    if (e.ctrlKey && e.shiftKey) {
      switch (e.key) {
        case 'R':
          e.preventDefault();
          refreshRecommendations();
          break;
        case 'F':
          e.preventDefault();
          triggerFetch();
          break;
        case 'O':
          e.preventDefault();
          chrome.runtime.openOptionsPage();
          break;
      }
    }
  }
  
  // 显示状态消息
  function showStatus(message, type = 'info', duration = 3000) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message ${type}`;
    elements.statusMessage.style.display = 'block';
    
    if (duration > 0) {
      setTimeout(() => {
        elements.statusMessage.style.display = 'none';
      }, duration);
    }
  }
  
  // 显示加载状态
  function showLoading(show = true) {
    elements.loading.style.display = show ? 'block' : 'none';
    elements.btnRefresh.disabled = show;
    elements.btnFetch.disabled = show;
    isLoading = show;
  }
  
  // 加载统计信息
  async function loadStats() {
    try {
      const response = await sendMessage({ type: 'db/export' });
      if (response && response.ok) {
        const data = JSON.parse(new TextDecoder().decode(new Uint8Array(response.bytes)));
        const events = data.events || [];
        const threads = data.threads || [];
        
        // 计算今日阅读
        const today = new Date().toDateString();
        const todayEvents = events.filter(e => new Date(e.createdAt).toDateString() === today);
        const completedToday = todayEvents.filter(e => e.completed === 1).length;
        
        elements.stats.todayReads.textContent = completedToday;
        elements.stats.totalThreads.textContent = threads.length;
      }
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  }
  
  // 加载推荐内容
  async function loadRecommendations() {
    if (isLoading) return;
    
    showLoading(true);
    elements.emptyState.style.display = 'none';
    
    const startTime = performance.now();
    
    try {
      const selectedForum = elements.forumSelector.value;
      
      // 获取用户设置的推荐数量
      const settings = await sendMessage({ type: 'settings/get' });
      const recommendationCount = settings?.settings?.recommendationCount || 10;
      
      const response = await sendMessage({
        type: 'recommend/mixed',
        limit: recommendationCount,
        forum: selectedForum
      });
      
      const endTime = performance.now();
      const loadTime = (endTime - startTime).toFixed(0);
      
      if (response && response.ok && response.recommendations) {
        currentRecommendations = response.recommendations;
        renderRecommendations(response.recommendations);
        
        // 显示过滤统计信息
        let statusMessage = `加载了 ${response.recommendations.length} 个推荐 (${loadTime}ms)`;
        if (response.stats) {
          const { dislikedThreads, readThreads, availableForRecommendation } = response.stats;
          if (dislikedThreads > 0) {
            statusMessage += ` | 已过滤 ${dislikedThreads} 个不感兴趣内容`;
          }
          if (readThreads > 0) {
            statusMessage += ` | 已过滤 ${readThreads} 个已读内容`;
          }
        }
        
        showStatus(statusMessage, 'success', 4000);
      } else {
        showEmptyState();
        showStatus('暂无推荐内容', 'info');
      }
    } catch (error) {
      console.error('加载推荐失败:', error);
      showStatus('加载推荐失败', 'error');
      showEmptyState();
    } finally {
      showLoading(false);
    }
  }
  
  // 刷新推荐
  async function refreshRecommendations() {
    if (isLoading) return;
    
    showLoading(true);
    showStatus('正在刷新推荐...', 'info');
    
    try {
      // 获取当前推荐并标记为不感兴趣
      if (currentRecommendations.length > 0) {
        const threadIds = currentRecommendations.map(rec => rec.threadId);
        await sendMessage({
          type: 'dislike/add-batch',
          threadIds: threadIds
        });
        showStatus(`已标记 ${threadIds.length} 个推荐为不感兴趣`, 'success', 2000);
      }
      
      // 重新加载推荐
      await loadRecommendations();
    } catch (error) {
      console.error('刷新推荐失败:', error);
      showStatus('刷新推荐失败', 'error');
    }
  }
  
  // 触发抓取
  async function triggerFetch() {
    if (isLoading) return;
    
    showLoading(true);
    showStatus('正在抓取新内容...', 'info');
    
    try {
      const response = await sendMessage({ type: 'fetch/trigger' });
      if (response && response.ok) {
        showStatus('抓取完成', 'success', 2000);
        // 重新加载统计和推荐
        loadStats();
        setTimeout(loadRecommendations, 1000);
      } else {
        showStatus('抓取失败', 'error');
      }
    } catch (error) {
      console.error('抓取失败:', error);
      showStatus('抓取失败', 'error');
    } finally {
      showLoading(false);
    }
  }
  
  // 渲染推荐列表
  function renderRecommendations(recommendations) {
    elements.recommendationList.innerHTML = '';
    
    if (recommendations.length === 0) {
      showEmptyState();
      return;
    }
    
    recommendations.forEach((rec, index) => {
      const li = createRecommendationItem(rec, index);
      elements.recommendationList.appendChild(li);
    });
  }
  
  // 创建推荐项
  function createRecommendationItem(rec, index) {
    const li = document.createElement('li');
    li.className = 'recommendation-item';
    
    // 标题
    const title = document.createElement('a');
    title.href = rec.url;
    title.target = '_blank';
    title.className = 'recommendation-title';
    title.textContent = rec.title;
    title.addEventListener('click', () => handleRecommendationClick(rec, li));
    
    // 元信息
    const meta = document.createElement('div');
    meta.className = 'recommendation-meta';
    
    // 论坛标识
    const forumBadge = document.createElement('span');
    let badgeClass = 'default';
    let badgeText = rec.forumId;
    
    if (rec.forumId === 'linux.do') {
      badgeClass = 'linux-do';
      badgeText = 'Linux.do';
    } else if (rec.forumId === 'nodeseek.com') {
      badgeClass = 'nodeseek';
      badgeText = 'NodeSeek';
    } else if (rec.forumId === 'v2ex.com') {
      badgeClass = 'v2ex';
      badgeText = 'V2EX';
    }
    
    forumBadge.className = `forum-badge ${badgeClass}`;
    forumBadge.textContent = badgeText;
    
    // 推荐分数
    const score = document.createElement('span');
    score.style.fontSize = '11px';
    score.style.color = 'var(--text-muted)';
    score.textContent = `推荐度: ${(rec.recommendationScore * 100).toFixed(0)}%`;
    
    meta.appendChild(forumBadge);
    meta.appendChild(score);
    
    // 标签信息和管理
    if (rec.tags && rec.tags.length > 0) {
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'recommendation-tags-container';
      
      const tagsLabel = document.createElement('span');
      tagsLabel.className = 'tags-label';
      tagsLabel.textContent = '标签: ';
      
      const tagsList = document.createElement('div');
      tagsList.className = 'tags-list';
      
      rec.tags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag-item';
        tagElement.textContent = tag;
        tagElement.title = '点击管理标签偏好';
        tagElement.addEventListener('click', (e) => {
          e.stopPropagation();
          handleTagClick(tag, tagElement);
        });
        tagsList.appendChild(tagElement);
        
        // 检查标签状态并更新样式
        chrome.storage.local.get(['dislikedTags', 'preferredTags'], (result) => {
          const dislikedTags = result.dislikedTags || [];
          const preferredTags = result.preferredTags || [];
          
          if (dislikedTags.includes(tag)) {
            updateTagElement(tagElement, tag, 'disliked');
          } else if (preferredTags.includes(tag)) {
            updateTagElement(tagElement, tag, 'preferred');
          }
        });
      });
      
      tagsContainer.appendChild(tagsLabel);
      tagsContainer.appendChild(tagsList);
      li.appendChild(tagsContainer);
    }
    
    // 操作按钮
    const actions = document.createElement('div');
    actions.className = 'recommendation-actions';
    
    const dislikeBtn = document.createElement('button');
    dislikeBtn.className = 'dislike-btn';
    dislikeBtn.textContent = '👎 不感兴趣';
    dislikeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDislikeClick(rec, dislikeBtn, li);
    });
    
    actions.appendChild(dislikeBtn);
    
    // 组装
    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(actions);
    
    return li;
  }
  
  // 处理标签点击
  function handleTagClick(tag, tagElement) {
    console.log('用户点击标签:', tag);
    
    // 检查标签当前状态
    chrome.storage.local.get(['dislikedTags', 'preferredTags'], (result) => {
      const dislikedTags = result.dislikedTags || [];
      const preferredTags = result.preferredTags || [];
      
      // 如果标签在不感兴趣列表中
      if (dislikedTags.includes(tag)) {
        showStatus(`标签 "${tag}" 已在不感兴趣列表中`, 'warning', 3000);
        return;
      }
      
      // 如果标签在偏好列表中
      if (preferredTags.includes(tag)) {
        // 从偏好列表中移除
        const updatedPreferredTags = preferredTags.filter(t => t !== tag);
        chrome.storage.local.set({ preferredTags: updatedPreferredTags }, () => {
          showStatus(`已从偏好标签中移除 "${tag}"`, 'info', 3000);
          updateTagElement(tagElement, tag, 'normal');
        });
        return;
      }
      
      // 显示选择对话框
      const action = confirm(`选择标签 "${tag}" 的操作：\n\n确定 = 添加到偏好标签（优先推荐）\n取消 = 添加到不感兴趣标签（不再推荐）`);
      
      if (action) {
        // 添加到偏好标签
        preferredTags.push(tag);
        chrome.storage.local.set({ preferredTags }, () => {
          showStatus(`已添加标签 "${tag}" 到偏好列表`, 'success', 3000);
          updateTagElement(tagElement, tag, 'preferred');
          setTimeout(() => loadRecommendations(), 1000);
        });
      } else {
        // 添加到不感兴趣标签
        dislikedTags.push(tag);
        chrome.storage.local.set({ dislikedTags }, () => {
          showStatus(`已添加标签 "${tag}" 到不感兴趣列表`, 'success', 3000);
          updateTagElement(tagElement, tag, 'disliked');
          setTimeout(() => loadRecommendations(), 1000);
        });
      }
    });
  }
  
  // 更新标签元素样式
  function updateTagElement(tagElement, tag, type) {
    tagElement.className = 'tag-item';
    
    switch (type) {
      case 'preferred':
        tagElement.classList.add('preferred-tag');
        tagElement.textContent = `${tag} ❤️`;
        tagElement.title = '偏好标签 - 点击移除';
        break;
      case 'disliked':
        tagElement.classList.add('disliked-tag');
        tagElement.textContent = `${tag} ✗`;
        tagElement.title = '不感兴趣标签 - 点击移除';
        break;
      case 'normal':
      default:
        tagElement.textContent = tag;
        tagElement.title = '点击管理标签偏好';
        break;
    }
  }

  // 处理推荐点击
  function handleRecommendationClick(rec, listItem) {
    console.log('用户点击推荐:', rec.threadId, rec.title);
    
    // 发送点击事件
    sendMessage({
      type: 'recommend/clicked',
      threadId: rec.threadId,
      title: rec.title
    });
    
    // 立即移除
    if (listItem.parentNode) {
      listItem.parentNode.removeChild(listItem);
    }
    
    // 检查是否还有推荐
    if (elements.recommendationList.children.length === 0) {
      showEmptyState();
    }
  }
  
  // 处理不感兴趣点击
  async function handleDislikeClick(rec, button, listItem) {
    button.textContent = '已标记';
    button.disabled = true;
    button.style.backgroundColor = 'var(--danger-color)';
    button.style.color = 'white';
    
    try {
      const response = await sendMessage({
        type: 'dislike/add',
        threadId: rec.threadId,
        title: rec.title
      });
      
      if (response && response.ok) {
        showStatus('已标记为不感兴趣', 'success', 2000);
        
        // 立即移除
        if (listItem.parentNode) {
          listItem.parentNode.removeChild(listItem);
        }
        
        if (elements.recommendationList.children.length === 0) {
          showEmptyState();
        }
      } else {
        throw new Error('标记失败');
      }
    } catch (error) {
      console.error('标记不感兴趣失败:', error);
      showStatus('标记失败，请重试', 'error');
      
      // 恢复按钮状态
      button.textContent = '👎 不感兴趣';
      button.disabled = false;
      button.style.backgroundColor = 'var(--bg-tertiary)';
      button.style.color = 'var(--text-secondary)';
    }
  }
  
  // 显示空状态
  function showEmptyState() {
    elements.emptyState.style.display = 'block';
    elements.recommendationList.innerHTML = '';
  }
  
  // 更新最后更新时间
  function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    elements.lastUpdate.textContent = `最后更新: ${timeString}`;
  }
  
  // 发送消息到后台
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }
  
  // 页面加载完成后初始化
  document.addEventListener('DOMContentLoaded', init);
  
  // 暴露全局函数供HTML调用
  window.loadRecommendations = loadRecommendations;
})();

