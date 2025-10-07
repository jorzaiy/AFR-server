(() => {
  // 标签页切换功能
  function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        
        // 移除所有活动状态
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // 激活当前标签页
        btn.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
      });
    });
  }

  // 初始化标签页
  initTabs();

  // DOM 元素
  const elSec = document.getElementById('threshold-seconds');
  const elScroll = document.getElementById('threshold-scroll');
  const elSaved = document.getElementById('saved');
  const btnSave = document.getElementById('btn-save');
  const btnExport = document.getElementById('btn-export');
  const btnExportReading = document.getElementById('btn-export-reading');
  const btnExportFetch = document.getElementById('btn-export-fetch');
  const btnImport = document.getElementById('btn-import');
  const btnImportReading = document.getElementById('btn-import-reading');
  const btnImportFetch = document.getElementById('btn-import-fetch');
  const fileImport = document.getElementById('file-import');
  const btnClear = document.getElementById('btn-clear');
  const btnClearReading = document.getElementById('btn-clear-reading');
  const btnClearFetch = document.getElementById('btn-clear-fetch');
  const btnFetch = document.getElementById('btn-fetch');
  const btnRefreshStats = document.getElementById('btn-refresh-stats');
  const clearStatus = document.getElementById('clear-status');
  const fetchStatus = document.getElementById('fetch-status');
  
  // 主题管理器
  let themeManager;
  
  // 导入类型跟踪
  let importType = 'all'; // 'all', 'reading', 'fetch'
  
  // 统计元素
  const totalEvents = document.getElementById('total-events');
  const totalThreads = document.getElementById('total-threads');
  const newThreads = document.getElementById('new-threads');
  const completedToday = document.getElementById('completed-today');
  const fetchCount = document.getElementById('fetch-count');
  const lastFetch = document.getElementById('last-fetch');

  // 加载设置
  function loadSettings() {
    chrome.storage.local.get(['thresholdSeconds', 'thresholdScroll'], (res) => {
      if (typeof res.thresholdSeconds === 'number') elSec.value = String(res.thresholdSeconds);
      else elSec.value = '2'; // 默认2秒
      if (typeof res.thresholdScroll === 'number') elScroll.value = String(res.thresholdScroll);
      else elScroll.value = '50'; // 默认50%滚动
    });
  }

  // 保存设置
  function saveSettings() {
    const thresholdSeconds = Number(elSec.value || 2); // 默认2秒
    const thresholdScroll = Number(elScroll.value || 50);
    chrome.storage.local.set({ thresholdSeconds, thresholdScroll }, () => {
      elSaved.style.display = 'block';
      setTimeout(() => { elSaved.style.display = 'none'; }, 1200);
    });
  }

  // 加载统计信息
  function loadStats() {
    // 加载数据库统计
    chrome.runtime.sendMessage({ type: 'db/export' }, (resp) => {
      try {
        if (resp && resp.ok && resp.bytes) {
          const data = JSON.parse(new TextDecoder().decode(new Uint8Array(resp.bytes)));
          
          const events = data.events || [];
          const threads = data.threads || [];
          const newThreadsList = threads.filter(t => t.isNew);
          
          const today = new Date().toDateString();
          const todayEvents = events.filter(e => new Date(e.createdAt).toDateString() === today);
          const completedTodayCount = todayEvents.filter(e => e.completed === 1).length;
          
          totalEvents.textContent = events.length;
          totalThreads.textContent = threads.length;
          newThreads.textContent = newThreadsList.length;
          completedToday.textContent = completedTodayCount;
        } else {
          totalEvents.textContent = '0';
          totalThreads.textContent = '0';
          newThreads.textContent = '0';
          completedToday.textContent = '0';
        }
      } catch (e) {
        console.error('Failed to load stats:', e);
        totalEvents.textContent = '-';
        totalThreads.textContent = '-';
        newThreads.textContent = '-';
        completedToday.textContent = '-';
      }
    });
    
    // 加载抓取统计
    chrome.runtime.sendMessage({ type: 'fetch/stats' }, (resp) => {
      try {
        if (resp && resp.ok && resp.stats) {
          const stats = resp.stats;
          fetchCount.textContent = stats.fetchCount || 0;
          
          if (stats.lastFetchAt) {
            const lastFetchTime = new Date(stats.lastFetchAt);
            const now = new Date();
            const diffMs = now - lastFetchTime;
            const diffMins = Math.floor(diffMs / (1000 * 60));
            
            if (diffMins < 1) {
              lastFetch.textContent = '刚刚';
            } else if (diffMins < 60) {
              lastFetch.textContent = `${diffMins}分钟前`;
            } else {
              const diffHours = Math.floor(diffMins / 60);
              lastFetch.textContent = `${diffHours}小时前`;
            }
          } else {
            lastFetch.textContent = '从未';
          }
        } else {
          fetchCount.textContent = '-';
          lastFetch.textContent = '-';
        }
      } catch (e) {
        console.error('Failed to load fetch stats:', e);
        fetchCount.textContent = '-';
        lastFetch.textContent = '-';
      }
    });
  }

  // 显示状态消息
  function showStatus(element, message, type = 'success') {
    element.textContent = message;
    element.className = `status ${type}`;
    element.style.display = 'block';
    setTimeout(() => { element.style.display = 'none'; }, 3000);
  }
  
  // 显示导入进度
  function showImportProgress(message) {
    const progressEl = document.getElementById('import-progress');
    progressEl.textContent = message;
    progressEl.className = 'status info';
    progressEl.style.display = 'block';
    
    // 隐藏结果
    const resultEl = document.getElementById('import-result');
    resultEl.style.display = 'none';
  }
  
  // 显示导入结果
  function showImportResult(message, type) {
    const progressEl = document.getElementById('import-progress');
    progressEl.style.display = 'none';
    
    const resultEl = document.getElementById('import-result');
    resultEl.textContent = message;
    resultEl.className = `status ${type}`;
    resultEl.style.display = 'block';
    
    // 8秒后自动隐藏
    setTimeout(() => { 
      resultEl.style.display = 'none'; 
    }, 8000);
  }

  // 导出全部数据
  btnExport.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'db/export' }, (resp) => {
      try {
        if (!resp || !resp.ok) {
          showStatus(clearStatus, '导出失败：' + (resp && resp.error ? resp.error : '后台无响应'), 'error');
          return;
        }
        const bytes = resp.bytes ? Uint8Array.from(resp.bytes) : null;
        if (!bytes || bytes.length === 0) {
          showStatus(clearStatus, '数据库为空或尚未创建，请先在帖子页停留几秒再试。', 'error');
          return;
        }
        const blob = new Blob([bytes], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linuxdo-all-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showStatus(clearStatus, '全部数据导出成功！', 'success');
      } catch (e) {
        showStatus(clearStatus, '导出异常：' + String(e), 'error');
      }
    });
  });

  // 导出阅读数据
  btnExportReading.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'db/export-reading' }, (resp) => {
      try {
        if (!resp || !resp.ok) {
          showStatus(clearStatus, '导出失败：' + (resp && resp.error ? resp.error : '后台无响应'), 'error');
          return;
        }
        const bytes = resp.bytes ? Uint8Array.from(resp.bytes) : null;
        if (!bytes || bytes.length === 0) {
          showStatus(clearStatus, '阅读数据为空，请先在帖子页停留几秒再试。', 'error');
          return;
        }
        const blob = new Blob([bytes], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linuxdo-reading-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showStatus(clearStatus, '阅读数据导出成功！', 'success');
      } catch (e) {
        showStatus(clearStatus, '导出异常：' + String(e), 'error');
      }
    });
  });

  // 导出抓取数据
  btnExportFetch.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'db/export-fetch' }, (resp) => {
      try {
        if (!resp || !resp.ok) {
          showStatus(clearStatus, '导出失败：' + (resp && resp.error ? resp.error : '后台无响应'), 'error');
          return;
        }
        const bytes = resp.bytes ? Uint8Array.from(resp.bytes) : null;
        if (!bytes || bytes.length === 0) {
          showStatus(clearStatus, '抓取数据为空，请先手动抓取一些帖子。', 'error');
          return;
        }
        const blob = new Blob([bytes], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linuxdo-fetch-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showStatus(clearStatus, '抓取数据导出成功！', 'success');
      } catch (e) {
        showStatus(clearStatus, '导出异常：' + String(e), 'error');
      }
    });
  });

  // 导入全部数据
  btnImport.addEventListener('click', () => {
    importType = 'all';
    fileImport.click();
  });

  // 导入阅读数据
  btnImportReading.addEventListener('click', () => {
    importType = 'reading';
    fileImport.click();
  });

  // 导入抓取数据
  btnImportFetch.addEventListener('click', () => {
    importType = 'fetch';
    fileImport.click();
  });
  
  fileImport.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // 更宽松的文件类型检查
    if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
      showStatus(clearStatus, '请选择JSON格式的文件（.json扩展名或application/json类型）', 'error');
      fileImport.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        // 根据导入类型过滤数据
        let filteredData = importData;
        if (importType === 'reading') {
          // 只导入阅读相关数据
          filteredData = {
            events: importData.events || [],
            sessions: importData.sessions || [],
            dislikedThreads: importData.dislikedThreads || []
          };
          if (!filteredData.events.length && !filteredData.dislikedThreads.length) {
            showStatus(clearStatus, '无效的阅读数据格式：缺少阅读记录或偏好数据', 'error');
            fileImport.value = '';
            return;
          }
        } else if (importType === 'fetch') {
          // 只导入抓取数据
          filteredData = {
            threads: importData.threads || []
          };
          if (!filteredData.threads.length) {
            showStatus(clearStatus, '无效的抓取数据格式：缺少帖子数据', 'error');
            fileImport.value = '';
            return;
          }
        } else {
          // 导入全部数据，验证格式
          if (!importData.events && !importData.dislikedThreads && !importData.threads) {
            showStatus(clearStatus, '无效的数据格式：缺少任何有效数据', 'error');
            fileImport.value = '';
            return;
          }
        }
        
        // 显示导入进度
        const importTypeText = importType === 'reading' ? '阅读数据' : importType === 'fetch' ? '抓取数据' : '全部数据';
        showImportProgress(`正在导入${importTypeText}...`);
        
        // 发送导入请求
        chrome.runtime.sendMessage({ 
          type: 'db/import', 
          data: filteredData,
          importType: importType
        }, (resp) => {
          if (resp && resp.ok && resp.result) {
            const result = resp.result;
            if (result.success) {
              let message = `导入完成！\n`;
              message += `✅ 成功导入：${result.importedCount} 条记录\n`;
              if (result.skippedCount > 0) {
                message += `⏭️ 跳过重复：${result.skippedCount} 条记录\n`;
              }
              if (result.errors && result.errors.length > 0) {
                message += `⚠️ 错误：${result.errors.length} 条记录\n`;
              }
              showImportResult(message, 'success');
              loadStats(); // 刷新统计
            } else {
              showImportResult(`导入失败：${result.error}`, 'error');
            }
          } else {
            showImportResult('导入失败：无法连接到扩展', 'error');
          }
          fileImport.value = '';
        });
        
      } catch (error) {
        showStatus(clearStatus, `文件解析失败：${error.message}`, 'error');
        fileImport.value = '';
      }
    };
    
    reader.onerror = () => {
      showStatus(clearStatus, '文件读取失败', 'error');
      fileImport.value = '';
    };
    
    reader.readAsText(file);
  });

  // 清空阅读数据
  btnClearReading.addEventListener('click', () => {
    if (confirm('确定要清空阅读数据吗？\n\n这将删除所有阅读记录和偏好设置，但保留帖子数据。')) {
      chrome.runtime.sendMessage({ type: 'db/clear-reading' }, (resp) => {
        if (resp && resp.ok) {
          showStatus(clearStatus, '阅读数据已清空', 'success');
          loadStats(); // 刷新统计
        } else {
          showStatus(clearStatus, '清空失败：' + (resp && resp.error ? resp.error : '未知错误'), 'error');
        }
      });
    }
  });

  // 清空抓取数据
  btnClearFetch.addEventListener('click', () => {
    if (confirm('确定要清空抓取数据吗？\n\n这将删除所有帖子数据，但保留阅读记录。')) {
      chrome.runtime.sendMessage({ type: 'db/clear-fetch' }, (resp) => {
        if (resp && resp.ok) {
          showStatus(clearStatus, '抓取数据已清空', 'success');
          loadStats(); // 刷新统计
        } else {
          showStatus(clearStatus, '清空失败：' + (resp && resp.error ? resp.error : '未知错误'), 'error');
        }
      });
    }
  });

  // 清空所有数据
  btnClear.addEventListener('click', () => {
    if (confirm('确定要清空所有数据吗？此操作不可撤销！\n\n这将删除所有数据，包括阅读记录、帖子数据和会话信息。')) {
      chrome.runtime.sendMessage({ type: 'db/clear' }, (resp) => {
        if (resp && resp.ok) {
          showStatus(clearStatus, '数据已清空', 'success');
          loadStats(); // 刷新统计
        } else {
          showStatus(clearStatus, '清空失败：' + (resp && resp.error ? resp.error : '未知错误'), 'error');
        }
      });
    }
  });

  // 手动抓取
  btnFetch.addEventListener('click', () => {
    btnFetch.textContent = '抓取中...';
    btnFetch.disabled = true;
    
    chrome.runtime.sendMessage({ type: 'fetch/trigger' }, (resp) => {
      btnFetch.textContent = '🚀 立即抓取新内容';
      btnFetch.disabled = false;
      
      if (resp && resp.ok && resp.result) {
        const result = resp.result;
        if (result.success) {
          showStatus(fetchStatus, `抓取完成：发现 ${result.newTopics} 个新帖子`, 'success');
          loadStats(); // 刷新统计
        } else {
          showStatus(fetchStatus, `抓取失败：${result.reason}`, 'error');
        }
      } else {
        showStatus(fetchStatus, '抓取失败：后台无响应', 'error');
      }
    });
  });

  // 刷新统计
  btnRefreshStats.addEventListener('click', () => {
    loadStats();
  });

  // 初始化主题管理器
  function initThemeManager() {
    themeManager = new ThemeManager();
    
    // 绑定主题切换事件
    document.getElementById('theme-toggle').addEventListener('click', () => {
      themeManager.toggleTheme();
    });
  }

  // 保存设置
  btnSave.addEventListener('click', saveSettings);

  // 偏好分析相关元素
  const btnRefreshAnalysis = document.getElementById('btn-refresh-analysis');
  const totalCompleted = document.getElementById('total-completed');
  const preferredCategoriesCount = document.getElementById('preferred-categories-count');
  const preferredTagsCount = document.getElementById('preferred-tags-count');
  const preferredContent = document.getElementById('preferred-content');
  const dislikedTagsManagement = document.getElementById('disliked-tags-management');

  // 刷新偏好分析
  btnRefreshAnalysis.addEventListener('click', () => {
    loadPreferenceAnalysis();
  });

  // 加载偏好分析
  function loadPreferenceAnalysis() {
    btnRefreshAnalysis.textContent = '分析中...';
    btnRefreshAnalysis.disabled = true;
    
    chrome.runtime.sendMessage({ type: 'analysis/preferences' }, (resp) => {
      btnRefreshAnalysis.textContent = '🔄 刷新分析';
      btnRefreshAnalysis.disabled = false;
      
      if (resp && resp.ok && resp.preferences) {
        const { preferredContent: preferred, dislikedAnalysis: disliked, summary } = resp.preferences;
        
        // 更新概览统计
        if (totalCompleted) totalCompleted.textContent = summary.totalCompleted || '-';
        if (preferredCategoriesCount) preferredCategoriesCount.textContent = summary.preferredCategoriesCount || '-';
        if (preferredTagsCount) preferredTagsCount.textContent = summary.preferredTagsCount || '-';
        
        // 渲染偏好内容
        renderPreferredContent(preferred);
        
        // 加载不感兴趣标签管理
        loadDislikedTagsManagement();
      } else {
        console.error('偏好分析失败:', resp?.error);
        showStatus(clearStatus, '偏好分析失败：' + (resp?.error || '未知错误'), 'error');
      }
    });
  }

  // 渲染偏好内容为词云
  function renderPreferredContent(preferred) {
    if (!preferred || (!preferred.categories.length && !preferred.tags.length)) {
      preferredContent.innerHTML = '<div class="word-cloud-empty">暂无偏好数据</div>';
      return;
    }
    
    let html = '<div class="word-cloud">';
    
    // 渲染版块偏好为词云
    if (preferred.categories.length > 0) {
      preferred.categories.forEach(category => {
        const size = Math.min(Math.max(category.count, 1), 5);
        html += `
          <span class="word-cloud-item category size-${size}" 
                data-type="category" 
                data-name="${category.name}"
                title="版块: ${category.name} (${category.count}次)">
            ${category.name}
          </span>
        `;
      });
    }
    
    // 渲染标签偏好为词云
    if (preferred.tags.length > 0) {
      preferred.tags.forEach(tag => {
        const size = Math.min(Math.max(tag.count, 1), 5);
        const weightText = tag.weight ? ` (权重: ${tag.weight})` : '';
        html += `
          <span class="word-cloud-item tag size-${size}" 
                data-type="tag" 
                data-name="${tag.name}"
                title="标签: ${tag.name} (${tag.count}次${weightText})">
            ${tag.name}
          </span>
        `;
      });
    }
    
    html += '</div>';
    preferredContent.innerHTML = html;
    
    // 绑定词云点击事件（用于删除）
    bindWordCloudEvents();
  }

  // 绑定词云点击事件
  function bindWordCloudEvents() {
    const wordCloudItems = document.querySelectorAll('.word-cloud-item');
    console.log('[options] Found word cloud items:', wordCloudItems.length);
    
    wordCloudItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const type = item.getAttribute('data-type');
        const name = item.getAttribute('data-name');
        
        if (confirm(`确定要删除偏好 "${name}" 吗？`)) {
          removePreference(type, name);
        }
      });
    });
  }

  // 绑定偏好删除事件
  function bindPreferenceDeleteEvents() {
    const deleteButtons = document.querySelectorAll('.btn-remove-preference');
    console.log('[options] Found delete buttons:', deleteButtons.length);
    
    deleteButtons.forEach((button, index) => {
      console.log(`[options] Binding button ${index}:`, button.dataset.type, button.dataset.name);
      
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const type = button.dataset.type;
        const name = button.dataset.name;
        
        console.log('[options] Delete button clicked:', type, name);
        
        if (confirm(`确定要删除"${name}"的${type === 'category' ? '版块' : '标签'}偏好吗？\n\n此操作将从您的偏好记录中移除该${type === 'category' ? '版块' : '标签'}，但不会影响您的阅读历史。`)) {
          console.log('[options] User confirmed deletion');
          removePreference(type, name);
        } else {
          console.log('[options] User cancelled deletion');
        }
      });
    });
  }

  // 删除偏好
  function removePreference(type, name) {
    console.log('[options] removePreference called:', type, name);
    
    try {
      // 发送删除偏好的消息到后台
      chrome.runtime.sendMessage({
        type: 'preference/remove',
        preferenceType: type,
        preferenceName: name
      }, (response) => {
        console.log('[options] Received response:', response);
        
        if (chrome.runtime.lastError) {
          console.error('[options] Chrome runtime error:', chrome.runtime.lastError);
          showStatus(clearStatus, `❌ 删除失败: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }
        
        if (response && response.ok) {
          // 删除成功，重新加载偏好分析
          console.log('[options] Deletion successful');
          showStatus(clearStatus, `✅ 已删除${type === 'category' ? '版块' : '标签'}偏好: ${name}`, 'success');
          setTimeout(() => {
            loadPreferenceAnalysis();
          }, 1000);
        } else {
          console.error('[options] Deletion failed:', response);
          showStatus(clearStatus, `❌ 删除失败: ${response?.error || '未知错误'}`, 'error');
        }
      });
    } catch (error) {
      console.error('[options] Remove preference error:', error);
      showStatus(clearStatus, `❌ 删除失败: ${error.message}`, 'error');
    }
  }

  // 渲染不感兴趣内容分析
  function renderDislikedAnalysis(disliked) {
    if (!disliked || disliked.totalCount === 0) {
      dislikedAnalysis.innerHTML = '<div class="empty-state">暂无不感兴趣内容</div>';
      return;
    }
    
    let html = '';
    
    // 显示统计信息
    html += `<div style="margin-bottom: 15px; padding: 10px; background: var(--bg-primary); border-radius: 6px; border: 1px solid var(--border-color);">
      <strong>📊 统计信息：</strong> 共标记 ${disliked.totalCount} 个内容为不感兴趣
    </div>`;
    
    // 显示版块分析
    if (disliked.categories.length > 0) {
      html += '<h4 style="margin: 0 0 10px 0; color: var(--text-primary);">📚 不感兴趣的版块</h4>';
      disliked.categories.forEach(category => {
        html += `
          <div class="preference-item">
            <div>
              <div class="item-title">${category.name}</div>
              <div class="item-meta">版块</div>
            </div>
            <div class="item-count">${category.count}</div>
          </div>
        `;
      });
    }
    
    // 显示标签分析
    if (disliked.tags.length > 0) {
      html += '<h4 style="margin: 20px 0 10px 0; color: var(--text-primary);">🏷️ 不感兴趣的标签</h4>';
      disliked.tags.forEach(tag => {
        html += `
          <div class="preference-item">
            <div>
              <div class="item-title">${tag.name}</div>
              <div class="item-meta">标签</div>
            </div>
            <div class="item-count">${tag.count}</div>
          </div>
        `;
      });
    }
    
    // 显示最近标记的内容（最多3个）
    if (disliked.recentDisliked.length > 0) {
      html += '<h4 style="margin: 20px 0 10px 0; color: var(--text-primary);">🕒 最近标记的内容</h4>';
      disliked.recentDisliked.slice(0, 3).forEach(item => {
        const date = new Date(item.dislikedAt).toLocaleDateString();
        html += `
          <div class="preference-item">
            <div>
              <div class="item-title">${item.title}</div>
              <div class="item-meta">${item.category} • ${date}</div>
            </div>
            <div class="item-count">已标记</div>
          </div>
        `;
      });
    }
    
    dislikedAnalysis.innerHTML = html;
  }

  // 加载不感兴趣标签管理
  function loadDislikedTagsManagement() {
    // 获取当前设置的不感兴趣标签
    chrome.storage.local.get(['dislikedTags'], (result) => {
      const dislikedTags = result.dislikedTags || [];
      renderDislikedTagsManagement(dislikedTags);
    });
  }

  // 渲染不感兴趣标签管理
  function renderDislikedTagsManagement(dislikedTags) {
    let html = '';
    
    // 显示统计信息
    html += `
      <div class="tag-stats">
        <div class="stats-info">🏷️ 已设置 ${dislikedTags.length} 个不感兴趣标签</div>
        <button class="btn-clear-tags" id="btn-clear-tags">🗑️ 清空标签</button>
      </div>
    `;
    
    // 添加标签输入区域
    html += `
      <div class="tag-input-section">
        <h4>添加不感兴趣标签</h4>
        <div class="tag-input-container">
          <input type="text" id="tag-input" class="tag-input" placeholder="输入标签名称，按回车添加" />
          <button id="btn-add-tag">添加</button>
        </div>
        <div class="tag-help">
          设置不感兴趣标签后，包含这些标签的内容将不会被推荐。支持中文和英文标签。
        </div>
      </div>
    `;
    
    // 显示当前标签列表
    if (dislikedTags.length > 0) {
      html += '<div class="tag-list">';
      dislikedTags.forEach(tag => {
        html += `
          <div class="tag-item">
            <span class="tag-name">${tag}</span>
            <button class="tag-remove" data-tag="${tag}" title="移除标签">×</button>
          </div>
        `;
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state">暂无不感兴趣标签</div>';
    }
    
    dislikedTagsManagement.innerHTML = html;
    
    // 绑定事件
    const tagInput = document.getElementById('tag-input');
    const btnAddTag = document.getElementById('btn-add-tag');
    const btnClearTags = document.getElementById('btn-clear-tags');
    
    if (tagInput) {
      tagInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addDislikedTag();
        }
      });
    }
    
    if (btnAddTag) {
      btnAddTag.addEventListener('click', addDislikedTag);
    }
    
    if (btnClearTags) {
      btnClearTags.addEventListener('click', clearAllDislikedTags);
    }
    
    // 绑定标签移除事件
    const removeButtons = document.querySelectorAll('.tag-remove');
    removeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const tagName = e.target.getAttribute('data-tag');
        if (tagName) {
          removeDislikedTag(tagName);
        }
      });
    });
  }

  // 添加不感兴趣标签
  function addDislikedTag() {
    const tagInput = document.getElementById('tag-input');
    if (!tagInput) return;
    
    const tagName = tagInput.value.trim();
    if (!tagName) {
      showStatus(clearStatus, '请输入标签名称', 'error');
      return;
    }
    
    // 获取当前标签列表
    chrome.storage.local.get(['dislikedTags'], (result) => {
      const dislikedTags = result.dislikedTags || [];
      
      // 检查是否已存在
      if (dislikedTags.includes(tagName)) {
        showStatus(clearStatus, '该标签已存在', 'error');
        return;
      }
      
      // 添加新标签
      dislikedTags.push(tagName);
      chrome.storage.local.set({ dislikedTags }, () => {
        tagInput.value = '';
        showStatus(clearStatus, `已添加不感兴趣标签: ${tagName}`, 'success');
        loadDislikedTagsManagement(); // 重新加载界面
      });
    });
  };

  // 移除不感兴趣标签
  function removeDislikedTag(tagName) {
    chrome.storage.local.get(['dislikedTags'], (result) => {
      const dislikedTags = result.dislikedTags || [];
      const updatedTags = dislikedTags.filter(tag => tag !== tagName);
      
      chrome.storage.local.set({ dislikedTags: updatedTags }, () => {
        showStatus(clearStatus, `已移除不感兴趣标签: ${tagName}`, 'success');
        loadDislikedTagsManagement(); // 重新加载界面
      });
    });
  };

  // 清空所有不感兴趣标签
  function clearAllDislikedTags() {
    if (!confirm('确定要清空所有不感兴趣标签吗？此操作不可撤销。')) {
      return;
    }
    
    chrome.storage.local.set({ dislikedTags: [] }, () => {
      showStatus(clearStatus, '已清空所有不感兴趣标签', 'success');
      loadDislikedTagsManagement(); // 重新加载界面
    });
  };

  // 推荐系统调试功能
  function initRecommendationDebug() {
    const debugStatus = document.getElementById('debug-status');
    const debugOutput = document.getElementById('debug-output');
    
    // 诊断推荐问题
    document.getElementById('btn-debug-recommendations')?.addEventListener('click', async () => {
      try {
        showStatus(debugStatus, '正在诊断推荐系统...', 'info');
        debugOutput.style.display = 'block';
        debugOutput.innerHTML = '正在收集推荐系统信息...\n';
        
        // 获取各种数据
        const [readEvents, allThreads, dislikedThreads, settings] = await Promise.all([
          chrome.runtime.sendMessage({ type: 'storage/get-read-events' }),
          chrome.runtime.sendMessage({ type: 'storage/get-all-threads' }),
          chrome.runtime.sendMessage({ type: 'storage/get-disliked-threads' }),
          chrome.storage.local.get(['dislikedTags', 'recommendationCount', 'recommendationAlgorithm'])
        ]);
        
        let output = '=== 推荐系统诊断报告 ===\n\n';
        
        // 基础数据统计
        output += `📊 基础数据统计:\n`;
        output += `- 阅读事件: ${readEvents?.length || 0} 个\n`;
        output += `- 帖子总数: ${allThreads?.length || 0} 个\n`;
        output += `- 不感兴趣帖子: ${dislikedThreads?.length || 0} 个\n`;
        output += `- 屏蔽标签: ${settings.dislikedTags?.length || 0} 个\n\n`;
        
        // 阅读行为分析
        if (readEvents && readEvents.length > 0) {
          const completedEvents = readEvents.filter(e => e.completed === 1);
          const completionRate = (completedEvents.length / readEvents.length * 100).toFixed(1);
          output += `📈 阅读行为分析:\n`;
          output += `- 完成阅读率: ${completionRate}%\n`;
          output += `- 完成阅读数: ${completedEvents.length} 个\n`;
          output += `- 总阅读数: ${readEvents.length} 个\n\n`;
        }
        
        // 标签分析
        if (allThreads && allThreads.length > 0) {
          const allTags = allThreads.flatMap(t => t.tags || []).filter(Boolean);
          const tagCounts = {};
          allTags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
          const topTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
          
          output += `🏷️ 标签分析:\n`;
          output += `- 总标签数: ${Object.keys(tagCounts).length} 个\n`;
          output += `- 热门标签: ${topTags.map(([tag, count]) => `${tag}(${count})`).join(', ')}\n\n`;
        }
        
        // 推荐设置
        output += `⚙️ 推荐设置:\n`;
        output += `- 推荐数量: ${settings.recommendationCount || 10}\n`;
        output += `- 推荐算法: ${settings.recommendationAlgorithm || 'mixed'}\n`;
        output += `- 屏蔽标签: ${settings.dislikedTags?.join(', ') || '无'}\n\n`;
        
        // 潜在问题检测
        output += `🔍 潜在问题检测:\n`;
        let hasIssues = false;
        
        if (!readEvents || readEvents.length === 0) {
          output += `❌ 没有阅读历史，推荐系统无法工作\n`;
          hasIssues = true;
        } else if (readEvents.length < 5) {
          output += `⚠️ 阅读历史较少(${readEvents.length}个)，推荐可能不准确\n`;
          hasIssues = true;
        }
        
        if (!allThreads || allThreads.length === 0) {
          output += `❌ 没有帖子数据，无法生成推荐\n`;
          hasIssues = true;
        }
        
        if (settings.dislikedTags && settings.dislikedTags.length > 0) {
          output += `ℹ️ 已设置 ${settings.dislikedTags.length} 个屏蔽标签\n`;
        }
        
        if (!hasIssues) {
          output += `✅ 未发现明显问题\n`;
        }
        
        debugOutput.innerHTML = output;
        showStatus(debugStatus, '诊断完成', 'success');
        
      } catch (error) {
        console.error('[options] Debug error:', error);
        showStatus(debugStatus, '诊断失败: ' + error.message, 'error');
        debugOutput.innerHTML = '诊断失败: ' + error.message;
      }
    });
    
    // 清除推荐缓存
    document.getElementById('btn-clear-recommendations')?.addEventListener('click', async () => {
      if (confirm('确定要清除所有推荐缓存吗？这将重新分析您的阅读偏好。\n\n此操作将清除：\n• TF-IDF缓存\n• 已点击推荐列表\n• 屏蔽标签设置\n• 推荐算法设置')) {
        try {
          const clearStatus = document.getElementById('clear-recommendations-status');
          showStatus(clearStatus, '正在清除推荐缓存...', 'info');
          
          const response = await chrome.runtime.sendMessage({
            type: 'recommend/clear-all'
          });
          
          if (response && response.ok) {
            showStatus(clearStatus, '✅ 推荐缓存已清除，系统将重新分析您的阅读偏好', 'success');
            
            // 清除后刷新偏好分析
            setTimeout(() => {
              loadPreferenceAnalysis();
            }, 1000);
          } else {
            showStatus(clearStatus, '❌ 清除失败: ' + (response?.error || '未知错误'), 'error');
          }
        } catch (error) {
          console.error('[options] Clear recommendations error:', error);
          const clearStatus = document.getElementById('clear-recommendations-status');
          showStatus(clearStatus, '❌ 清除失败: ' + error.message, 'error');
        }
      }
    });
    
    // 测试标签过滤
    document.getElementById('btn-test-tag-filtering')?.addEventListener('click', async () => {
      try {
        showStatus(debugStatus, '正在测试标签过滤...', 'info');
        debugOutput.style.display = 'block';
        debugOutput.innerHTML = '正在测试标签过滤功能...\n';
        
        const settings = await chrome.storage.local.get(['dislikedTags']);
        const dislikedTags = settings.dislikedTags || [];
        
        let output = '=== 标签过滤测试 ===\n\n';
        
        if (dislikedTags.length === 0) {
          output += '⚠️ 未设置任何屏蔽标签\n';
          output += '💡 建议：在"不感兴趣标签管理"中添加要屏蔽的标签\n';
        } else {
          output += `📋 当前屏蔽标签: ${dislikedTags.join(', ')}\n\n`;
          
          // 获取一些帖子进行测试
          const response = await chrome.runtime.sendMessage({ type: 'storage/get-all-threads' });
          const threads = response || [];
          
          if (threads.length > 0) {
            output += `🧪 测试结果:\n`;
            let filteredCount = 0;
            let testCount = 0;
            
            threads.slice(0, 20).forEach(thread => {
              if (thread.tags && thread.tags.length > 0) {
                testCount++;
                const hasDislikedTag = thread.tags.some(tag => {
                  return dislikedTags.some(dislikedTag => {
                    const tagLower = tag.toLowerCase().trim();
                    const dislikedTagLower = dislikedTag.toLowerCase().trim();
                    return tagLower === dislikedTagLower || 
                           (tagLower.includes(dislikedTagLower) && dislikedTagLower.length >= 3) ||
                           (dislikedTagLower.includes(tagLower) && tagLower.length >= 3);
                  });
                });
                
                if (hasDislikedTag) {
                  filteredCount++;
                  output += `❌ 过滤: "${thread.title}" (标签: ${thread.tags.join(', ')})\n`;
                }
              }
            });
            
            output += `\n📊 测试统计:\n`;
            output += `- 测试帖子数: ${testCount}\n`;
            output += `- 被过滤数: ${filteredCount}\n`;
            output += `- 过滤率: ${testCount > 0 ? (filteredCount / testCount * 100).toFixed(1) : 0}%\n`;
          } else {
            output += '❌ 没有帖子数据可供测试\n';
          }
        }
        
        debugOutput.innerHTML = output;
        showStatus(debugStatus, '标签过滤测试完成', 'success');
        
      } catch (error) {
        console.error('[options] Tag filtering test error:', error);
        showStatus(debugStatus, '测试失败: ' + error.message, 'error');
        debugOutput.innerHTML = '测试失败: ' + error.message;
      }
    });
  }

  // 初始化
  initThemeManager();
  loadSettings();
  loadStats();
  loadPreferenceAnalysis(); // 自动加载偏好分析
  initRecommendationDebug(); // 初始化推荐调试功能
})();


