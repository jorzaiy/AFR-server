# 开发文档

## 📋 项目概述

AFR-Server 是一个基于 Node.js 的论坛分析服务器，为浏览器扩展提供智能推荐和数据分析服务。

## 🏗️ 技术架构

### 系统架构
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   浏览器扩展     │    │   API 网关      │    │   推荐引擎      │
│                 │    │                 │    │                 │
│ • 数据抓取      │◄──►│ • 请求路由      │◄──►│ • 算法计算      │
│ • 行为追踪      │    │ • 身份验证      │    │ • 模型训练      │
│ • 推荐显示      │    │ • 限流控制      │    │ • 结果排序      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   数据存储层     │
                    │                 │
                    │ • MongoDB       │
                    │ • Redis         │
                    │ • 文件存储      │
                    └─────────────────┘
```

### 技术栈
- **后端框架**：Node.js + Express.js
- **数据库**：MongoDB (主数据库) + Redis (缓存)
- **推荐算法**：TF-IDF + 机器学习
- **部署方案**：Docker + Nginx
- **监控工具**：Prometheus + Grafana

## 🔧 开发环境设置

### 环境要求
- Node.js 18+
- MongoDB 6+
- Redis 6+
- Git

### 本地开发设置
```bash
# 1. 克隆项目
git clone https://github.com/jorzaiy/AFR-server.git
cd AFR-server

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp env.example .env
# 编辑 .env 文件

# 4. 启动数据库
# MongoDB
mongod --dbpath /path/to/data

# Redis
redis-server

# 5. 初始化数据库
npm run migrate

# 6. 启动开发服务器
npm run dev
```

### 开发工具配置
```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["javascript"],
  "prettier.configPath": ".prettierrc"
}
```

## 📁 项目结构

```
server/
├── src/                          # 源代码目录
│   ├── app.js                    # 应用入口文件
│   ├── database/                 # 数据库相关
│   │   ├── connection.js         # 数据库连接
│   │   ├── models/              # 数据模型
│   │   │   ├── User.js          # 用户模型
│   │   │   ├── ReadingEvent.js  # 阅读事件模型
│   │   │   └── Thread.js        # 帖子模型
│   │   └── migrate.js           # 数据库迁移
│   ├── services/                # 业务服务层
│   │   ├── RecommendationEngine.js  # 推荐引擎
│   │   ├── AnalyticsEngine.js       # 分析引擎
│   │   └── DataSyncService.js       # 数据同步服务
│   ├── routes/                  # API路由
│   │   ├── user.js              # 用户相关接口
│   │   ├── data.js              # 数据相关接口
│   │   ├── recommendation.js    # 推荐相关接口
│   │   └── analytics.js         # 分析相关接口
│   ├── middleware/              # 中间件
│   │   ├── auth.js              # 身份验证
│   │   ├── rateLimit.js         # 限流中间件
│   │   └── errorHandler.js      # 错误处理
│   ├── utils/                   # 工具函数
│   │   ├── logger.js            # 日志工具
│   │   ├── validator.js         # 数据验证
│   │   └── cache.js             # 缓存工具
│   └── config/                  # 配置文件
│       ├── database.js          # 数据库配置
│       └── redis.js            # Redis配置
├── tests/                       # 测试文件
│   ├── unit/                    # 单元测试
│   ├── integration/             # 集成测试
│   └── fixtures/                # 测试数据
├── docs/                        # 文档
│   ├── API.md                   # API文档
│   ├── DEVELOPMENT.md           # 开发文档
│   └── DEPLOYMENT.md            # 部署文档
├── scripts/                     # 脚本文件
│   ├── install.sh               # 安装脚本
│   └── backup.sh                # 备份脚本
├── docker-compose.yml           # Docker编排
├── Dockerfile                   # Docker镜像
├── package.json                 # 项目配置
└── README.md                    # 项目说明
```

## 🗄️ 数据库设计

### 数据模型

#### 用户模型 (User)
```javascript
{
  userId: String,           // 用户ID
  username: String,         // 用户名
  email: String,           // 邮箱
  preferences: {            // 用户偏好
    recommendationCount: Number,
    algorithm: String,
    autoRefresh: Boolean,
    thresholdSeconds: Number,
    thresholdScroll: Number
  },
  profile: {                // 用户画像
    totalReadTime: Number,
    totalReadCount: Number,
    averageReadTime: Number,
    completionRate: Number,
    lastActiveAt: Date
  },
  isActive: Boolean,        // 是否活跃
  createdAt: Date,          // 创建时间
  updatedAt: Date           // 更新时间
}
```

#### 阅读事件模型 (ReadingEvent)
```javascript
{
  eventId: String,          // 事件ID
  userId: String,           // 用户ID
  threadId: String,         // 帖子ID
  sessionId: String,        // 会话ID
  url: String,              // 页面URL
  enterAt: Date,            // 进入时间
  leaveAt: Date,            // 离开时间
  dwellMsEffective: Number, // 有效阅读时长
  maxScrollPct: Number,     // 最大滚动深度
  completed: Number,        // 是否完成阅读
  isVisible: Boolean,       // 页面是否可见
  isFocused: Boolean,       // 页面是否聚焦
  idle: Boolean,            // 是否空闲
  metadata: {               // 元数据
    userAgent: String,
    screenResolution: String,
    timezone: String,
    language: String
  },
  createdAt: Date,          // 创建时间
  updatedAt: Date           // 更新时间
}
```

#### 帖子模型 (Thread)
```javascript
{
  threadId: String,         // 帖子ID
  forumId: String,          // 论坛ID
  url: String,              // 帖子URL
  title: String,            // 标题
  category: String,         // 分类
  tags: [String],           // 标签
  publishedAt: Date,        // 发布时间
  authorName: String,       // 作者名称
  content: String,          // 内容摘要
  replyCount: Number,       // 回复数
  likeCount: Number,        // 点赞数
  viewCount: Number,        // 浏览数
  isNew: Boolean,           // 是否新帖子
  createdAt: Date,          // 创建时间
  updatedAt: Date           // 更新时间
}
```

### 数据库索引
```javascript
// 用户索引
db.users.createIndex({ userId: 1 });
db.users.createIndex({ email: 1 });
db.users.createIndex({ 'profile.lastActiveAt': -1 });

// 阅读事件索引
db.readingevents.createIndex({ userId: 1, createdAt: -1 });
db.readingevents.createIndex({ threadId: 1 });
db.readingevents.createIndex({ sessionId: 1 });
db.readingevents.createIndex({ completed: 1, createdAt: -1 });

// 帖子索引
db.threads.createIndex({ threadId: 1 });
db.threads.createIndex({ forumId: 1 });
db.threads.createIndex({ publishedAt: -1 });
db.threads.createIndex({ category: 1 });
db.threads.createIndex({ tags: 1 });
```

## 🔄 API 设计

### RESTful API 规范

#### 用户相关接口
```http
# 获取用户信息
GET /api/users/:userId

# 更新用户设置
PUT /api/users/:userId/settings

# 获取用户统计
GET /api/users/:userId/stats
```

#### 数据相关接口
```http
# 上传阅读事件
POST /api/data/reading-events

# 批量上传数据
POST /api/data/reading-events/batch

# 获取用户阅读历史
GET /api/data/users/:userId/reading-history
```

#### 推荐相关接口
```http
# 获取个性化推荐
GET /api/recommendations/:userId?limit=10&algorithm=mixed

# 记录推荐点击
POST /api/recommendations/:userId/click

# 记录不感兴趣
POST /api/recommendations/:userId/dislike
```

#### 分析相关接口
```http
# 获取用户行为分析
GET /api/analytics/:userId/behavior

# 获取内容热度分析
GET /api/analytics/content/trending

# 获取推荐效果分析
GET /api/analytics/recommendations/performance
```

### API 响应格式
```javascript
// 成功响应
{
  "success": true,
  "data": {
    // 响应数据
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}

// 错误响应
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数错误",
    "details": [
      {
        "field": "userId",
        "message": "用户ID不能为空"
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🧠 推荐算法

### 算法架构
```javascript
class RecommendationEngine {
  // 多维度推荐算法
  calculateRecommendationScore(thread, userProfile) {
    const contentSimilarity = this.calculateContentSimilarity(thread, userProfile);
    const behaviorSimilarity = this.calculateBehaviorSimilarity(thread, userProfile);
    const freshnessScore = this.calculateFreshnessScore(thread);
    const popularityScore = this.calculatePopularityScore(thread);
    
    return {
      contentSimilarity,
      behaviorSimilarity,
      freshnessScore,
      popularityScore,
      finalScore: contentSimilarity * 0.4 + 
                 behaviorSimilarity * 0.3 + 
                 freshnessScore * 0.2 + 
                 popularityScore * 0.1
    };
  }
}
```

### 内容相似度计算
```javascript
// TF-IDF 相似度计算
calculateContentSimilarity(thread, userProfile) {
  const userHistory = this.getUserReadingHistory(userProfile.userId);
  const threadVector = this.buildThreadVector(thread);
  const userVector = this.buildUserVector(userHistory);
  
  return this.calculateCosineSimilarity(threadVector, userVector);
}
```

### 行为相似度计算
```javascript
// 基于用户行为模式的相似度
calculateBehaviorSimilarity(thread, userProfile) {
  const behaviorPattern = this.analyzeUserBehavior(userProfile);
  
  let score = 0;
  
  // 版块偏好匹配
  if (thread.category && behaviorPattern.preferredCategories.includes(thread.category)) {
    score += 0.4;
  }
  
  // 标签偏好匹配
  if (thread.tags && thread.tags.length > 0) {
    const tagMatches = thread.tags.filter(tag => 
      behaviorPattern.preferredTags.includes(tag)
    ).length;
    score += 0.3 * (tagMatches / thread.tags.length);
  }
  
  // 时间偏好匹配
  const threadHour = new Date(thread.publishedAt).getHours();
  if (behaviorPattern.activeHours.includes(threadHour)) {
    score += 0.2;
  }
  
  // 阅读深度匹配
  const expectedDepth = behaviorPattern.averageScrollDepth;
  const estimatedDepth = this.estimateScrollDepth(thread);
  const depthMatch = 1 - Math.abs(expectedDepth - estimatedDepth) / 100;
  score += 0.1 * Math.max(0, depthMatch);
  
  return Math.min(1, score);
}
```

## 📊 性能优化

### 数据库优化
```javascript
// 查询优化示例
async function getOptimizedRecommendations(userId, limit) {
  // 使用聚合管道优化查询
  const pipeline = [
    { $match: { userId } },
    { $lookup: {
      from: 'threads',
      localField: 'threadId',
      foreignField: 'threadId',
      as: 'thread'
    }},
    { $unwind: '$thread' },
    { $group: {
      _id: '$thread.category',
      count: { $sum: 1 },
      avgTime: { $avg: '$dwellMsEffective' }
    }},
    { $sort: { count: -1 } },
    { $limit: limit }
  ];
  
  return await ReadingEvent.aggregate(pipeline);
}
```

### 缓存策略
```javascript
// Redis 缓存实现
class CacheManager {
  async getRecommendations(userId, algorithm) {
    const cacheKey = `recommendations:${userId}:${algorithm}`;
    
    // 尝试从缓存获取
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // 计算推荐结果
    const recommendations = await this.calculateRecommendations(userId, algorithm);
    
    // 缓存结果
    await redis.setex(cacheKey, 3600, JSON.stringify(recommendations));
    
    return recommendations;
  }
}
```

### 异步处理
```javascript
// 使用消息队列处理耗时任务
const Queue = require('bull');

const recommendationQueue = new Queue('recommendation processing');

recommendationQueue.process(async (job) => {
  const { userId, algorithm } = job.data;
  
  // 计算推荐结果
  const recommendations = await calculateRecommendations(userId, algorithm);
  
  // 更新缓存
  await updateRecommendationCache(userId, recommendations);
  
  return recommendations;
});
```

## 🧪 测试策略

### 单元测试
```javascript
// 推荐算法测试
describe('RecommendationEngine', () => {
  test('should calculate content similarity correctly', () => {
    const engine = new RecommendationEngine();
    const thread = { title: 'Linux 系统管理', tags: ['Linux', '系统'] };
    const userHistory = ['Linux 基础', '系统优化'];
    
    const similarity = engine.calculateContentSimilarity(thread, userHistory);
    expect(similarity).toBeGreaterThan(0);
  });
});
```

### 集成测试
```javascript
// API 集成测试
describe('Recommendation API', () => {
  test('should return recommendations for valid user', async () => {
    const response = await request(app)
      .get('/api/recommendations/test-user')
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data.recommendations).toBeDefined();
  });
});
```

### 性能测试
```javascript
// 性能基准测试
describe('Performance Tests', () => {
  test('recommendation calculation should complete within 1s', async () => {
    const startTime = Date.now();
    await recommendationEngine.generateRecommendations('test-user', 10);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(1000);
  });
});
```

## 🔧 开发工具

### 代码质量工具
```json
// package.json
{
  "scripts": {
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write src/",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "eslint": "^8.0.0",
    "prettier": "^2.0.0",
    "jest": "^29.0.0",
    "supertest": "^6.0.0"
  }
}
```

### 调试工具
```javascript
// 开发环境调试配置
if (process.env.NODE_ENV === 'development') {
  // 启用详细日志
  logger.level = 'debug';
  
  // 启用性能监控
  const profiler = require('clinic');
  profiler.start();
}
```

## 📈 监控与日志

### 日志系统
```javascript
// 结构化日志
const logger = require('winston');

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

logger.configure({
  level: 'info',
  format: logFormat,
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});
```

### 性能监控
```javascript
// 性能指标收集
const prometheus = require('prom-client');

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

// 中间件记录性能指标
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
});
```

## 🚀 部署指南

### Docker 部署
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "src/app.js]
```

### 环境配置
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/forum-analyzer
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis

  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db

  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data
```

## 🤝 贡献指南

### 开发流程
1. Fork 项目到个人仓库
2. 创建功能分支：`git checkout -b feature/新功能`
3. 编写代码并添加测试
4. 运行测试确保通过：`npm test`
5. 提交代码：`git commit -m '添加新功能'`
6. 推送分支：`git push origin feature/新功能`
7. 创建 Pull Request

### 代码规范
- 使用 ESLint 进行代码检查
- 遵循 JavaScript Standard Style
- 编写完整的 JSDoc 注释
- 确保测试覆盖率 > 80%

### 提交规范
```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建过程或辅助工具的变动
```

---

**开发愉快！** 🎉
