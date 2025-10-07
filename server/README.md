# 论坛分析服务器 (AFR-Server)

一个强大的服务器端论坛分析系统，为浏览器扩展提供智能推荐和数据分析服务。

## 🎯 项目概述

**AFR-Server** 是论坛助手的服务器端实现，提供强大的数据分析、智能推荐和用户行为分析功能。与轻量级浏览器扩展配合，实现完整的论坛阅读体验优化。

### 核心价值
- 🧠 **智能推荐引擎**：基于机器学习的个性化内容推荐
- 📊 **全局数据分析**：跨用户的行为模式分析
- ⚡ **高性能计算**：服务器端强大的计算能力
- 🔄 **实时同步**：与浏览器扩展无缝对接

## ✨ 功能特性

### 🎯 智能推荐系统
- **多维度推荐算法**：内容相似度 + 行为相似度 + 新鲜度 + 热度
- **机器学习优化**：基于用户反馈持续优化推荐效果
- **实时推荐更新**：新内容自动触发推荐刷新
- **个性化权重**：根据用户行为动态调整推荐策略

### 📊 数据分析引擎
- **用户行为分析**：阅读模式、时间偏好、内容偏好
- **内容热度分析**：帖子热度、标签趋势、版块活跃度
- **推荐效果评估**：点击率、完成率、用户满意度
- **趋势预测**：基于历史数据预测内容趋势

### 🔄 数据同步系统
- **实时数据上传**：浏览器扩展实时同步阅读数据
- **离线数据支持**：网络恢复后自动同步离线数据
- **数据一致性**：确保数据完整性和一致性
- **增量同步**：只同步变更数据，提高效率

### 🛡️ 安全与隐私
- **数据加密**：敏感数据端到端加密
- **访问控制**：基于JWT的身份验证
- **数据脱敏**：用户隐私数据自动脱敏
- **审计日志**：完整的操作审计记录

## 🏗️ 技术架构

### 核心技术栈
- **后端框架**：Node.js + Express.js
- **数据库**：MongoDB (主数据库) + Redis (缓存)
- **推荐引擎**：TF-IDF + 机器学习算法
- **API设计**：RESTful API + GraphQL
- **部署方案**：Docker + Nginx

### 系统架构图
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

### 核心模块

#### 1. 推荐引擎 (RecommendationEngine)
```javascript
// 多维度推荐算法
const recommendationScore = 
  contentSimilarity * 0.4 +      // 内容相似度
  behaviorSimilarity * 0.3 +    // 行为相似度  
  freshnessScore * 0.2 +        // 新鲜度
  popularityScore * 0.1;         // 热度
```

#### 2. 数据分析 (AnalyticsEngine)
- **用户画像构建**：基于阅读行为构建用户兴趣模型
- **内容特征提取**：自动提取帖子特征和标签
- **行为模式识别**：识别用户阅读模式和时间偏好
- **推荐效果评估**：实时评估推荐算法效果

#### 3. 数据同步 (DataSync)
- **实时同步**：浏览器扩展实时上传阅读数据
- **批量同步**：支持大量数据的高效同步
- **冲突解决**：智能处理数据冲突
- **数据验证**：确保数据完整性和准确性

## 🚀 快速开始

### 环境要求
- Node.js 18+
- MongoDB 6+
- Redis 6+
- Docker (可选)

### 安装部署

#### 方式一：Docker 部署（推荐）
```bash
# 1. 克隆项目
git clone https://github.com/jorzaiy/AFR-server.git
cd AFR-server

# 2. 配置环境
cp env.example .env
# 编辑 .env 文件

# 3. 启动服务
docker-compose up -d

# 4. 验证部署
curl http://localhost:3000/health
```

#### 方式二：手动部署
```bash
# 1. 安装依赖
npm install

# 2. 配置数据库
# 启动 MongoDB 和 Redis

# 3. 初始化数据库
npm run migrate

# 4. 启动服务
npm start
```

### 配置说明

#### 环境变量配置
```env
# 服务器配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/forum-analyzer
REDIS_URL=redis://localhost:6379

# JWT 配置
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# 推荐引擎配置
RECOMMENDATION_CACHE_TTL=3600
MAX_RECOMMENDATIONS=50
```

## 📊 API 文档

### 核心接口

#### 1. 推荐接口
```http
GET /api/recommendations/:userId?limit=10&algorithm=mixed
```
- **功能**：获取个性化推荐
- **参数**：
  - `userId`: 用户ID
  - `limit`: 推荐数量 (默认10)
  - `algorithm`: 推荐算法 (content/behavior/mixed/popular)

#### 2. 数据同步接口
```http
POST /api/data/reading-events
Content-Type: application/json

{
  "userId": "user123",
  "threadId": "linuxdo:123456",
  "dwellMsEffective": 5000,
  "maxScrollPct": 80,
  "completed": 1
}
```

#### 3. 统计分析接口
```http
GET /api/analytics/:userId/stats
```
- **功能**：获取用户阅读统计
- **返回**：阅读时长、完成率、偏好分析等

### 完整API文档
详细的API文档请参考：[API Documentation](./docs/API.md)

## 🔧 开发指南

### 项目结构
```
server/
├── src/
│   ├── app.js                 # 应用入口
│   ├── database/              # 数据库模块
│   │   ├── connection.js     # 数据库连接
│   │   └── models/           # 数据模型
│   ├── services/             # 业务服务
│   │   ├── RecommendationEngine.js  # 推荐引擎
│   │   └── AnalyticsEngine.js       # 分析引擎
│   ├── routes/               # API路由
│   │   ├── recommendation.js # 推荐接口
│   │   ├── data.js           # 数据接口
│   │   └── analytics.js      # 分析接口
│   ├── middleware/           # 中间件
│   └── utils/                # 工具函数
├── docker-compose.yml        # Docker配置
├── Dockerfile               # Docker镜像
└── package.json             # 项目配置
```

### 开发环境设置
```bash
# 1. 克隆项目
git clone https://github.com/jorzaiy/AFR-server.git
cd AFR-server

# 2. 安装依赖
npm install

# 3. 配置环境
cp env.example .env

# 4. 启动开发服务器
npm run dev
```

### 代码规范
- 使用 ESLint 进行代码检查
- 遵循 JavaScript Standard Style
- 编写单元测试和集成测试
- 使用 JSDoc 编写API文档

## 📈 性能优化

### 数据库优化
- **索引优化**：为常用查询字段创建索引
- **查询优化**：使用聚合管道优化复杂查询
- **分片策略**：大数据量时使用分片存储

### 缓存策略
- **Redis缓存**：推荐结果缓存，减少计算开销
- **内存缓存**：热点数据内存缓存
- **CDN加速**：静态资源CDN分发

### 推荐算法优化
- **预计算**：提前计算推荐结果
- **增量更新**：只更新变更的推荐
- **并行计算**：多线程并行计算推荐

## 🔒 安全考虑

### 数据安全
- **数据加密**：敏感数据AES加密存储
- **传输安全**：HTTPS加密传输
- **访问控制**：基于角色的权限控制

### API安全
- **请求限流**：防止API滥用
- **输入验证**：严格的参数验证
- **SQL注入防护**：使用参数化查询

### 隐私保护
- **数据脱敏**：用户隐私数据自动脱敏
- **数据最小化**：只收集必要数据
- **用户控制**：用户可控制数据使用

## 📊 监控与运维

### 性能监控
- **响应时间监控**：API响应时间统计
- **错误率监控**：系统错误率统计
- **资源使用监控**：CPU、内存、磁盘使用率

### 日志管理
- **结构化日志**：JSON格式日志
- **日志轮转**：自动日志文件轮转
- **日志分析**：ELK Stack日志分析

### 告警机制
- **异常告警**：系统异常自动告警
- **性能告警**：性能指标异常告警
- **容量告警**：存储容量告警

## 🤝 贡献指南

### 开发流程
1. Fork 项目
2. 创建功能分支：`git checkout -b feature/新功能`
3. 提交代码：`git commit -m '添加新功能'`
4. 推送分支：`git push origin feature/新功能`
5. 创建 Pull Request

### 代码贡献
- 遵循项目代码规范
- 编写完整的测试用例
- 更新相关文档
- 确保所有测试通过

## 📄 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

## 🔗 相关链接

- **浏览器扩展**：[AFR-Extension](https://github.com/jorzaiy/Automatic-forum-reading)
- **项目文档**：[Documentation](./docs/)
- **问题反馈**：[Issues](https://github.com/jorzaiy/AFR-server/issues)
- **讨论区**：[Discussions](https://github.com/jorzaiy/AFR-server/discussions)

## 📞 技术支持

如果您在使用过程中遇到问题：

1. 查看 [FAQ](./docs/FAQ.md) 常见问题
2. 搜索 [Issues](https://github.com/jorzaiy/AFR-server/issues) 是否有类似问题
3. 创建新的 Issue 描述您的问题
4. 联系维护者获取技术支持

---

**AFR-Server** - 让论坛阅读更智能，让内容发现更精准！ 🎯