// 主题管理系统
class ThemeManager {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'light';
    this.systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    this.autoDetect = localStorage.getItem('autoDetectTheme') === 'true';
    
    this.init();
  }
  
  init() {
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this.systemTheme = e.matches ? 'dark' : 'light';
      if (this.autoDetect) {
        this.setTheme('auto');
      }
    });
    
    // 应用初始主题
    this.applyTheme();
  }
  
  setTheme(theme) {
    if (theme === 'auto') {
      this.autoDetect = true;
      this.currentTheme = this.systemTheme;
    } else {
      this.autoDetect = false;
      this.currentTheme = theme;
    }
    
    localStorage.setItem('theme', this.currentTheme);
    localStorage.setItem('autoDetectTheme', this.autoDetect);
    this.applyTheme();
  }
  
  applyTheme() {
    const root = document.documentElement;
    root.setAttribute('data-theme', this.currentTheme);
    
    // 更新主题切换按钮状态
    this.updateThemeToggle();
    
    // 触发主题变化事件
    document.dispatchEvent(new CustomEvent('themeChanged', {
      detail: { theme: this.currentTheme, autoDetect: this.autoDetect }
    }));
  }
  
  updateThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.textContent = this.getThemeIcon();
      toggle.title = this.getThemeTitle();
    }
  }
  
  getThemeIcon() {
    if (this.autoDetect) return '🌓';
    return this.currentTheme === 'dark' ? '🌙' : '☀️';
  }
  
  getThemeTitle() {
    if (this.autoDetect) return '跟随系统主题';
    return this.currentTheme === 'dark' ? '深色主题' : '浅色主题';
  }
  
  toggleTheme() {
    if (this.autoDetect) {
      this.setTheme('light');
    } else {
      this.setTheme(this.currentTheme === 'light' ? 'dark' : 'light');
    }
  }
  
  getCurrentTheme() {
    return {
      theme: this.currentTheme,
      autoDetect: this.autoDetect,
      systemTheme: this.systemTheme
    };
  }
}

// 导出主题管理器
window.ThemeManager = ThemeManager;