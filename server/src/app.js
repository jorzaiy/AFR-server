const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { connectDB } = require('./database/connection');
const { connectRedis } = require('./cache/redis');

// 导入路由
const userRoutes = require('./routes/user');
const dataRoutes = require('./routes/data');
const analysisRoutes = require('./routes/analysis');
const recommendationRoutes = require('./routes/recommendation');
const forumRoutes = require('./routes/forum');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS配置
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 压缩和日志
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// 限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制每个IP 15分钟内最多100个请求
  message: {
    error: '请求过于频繁，请稍后再试',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// 解析JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API路由
app.use('/api/users', userRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/forums', forumRoutes);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: '接口不存在',
    path: req.originalUrl,
    method: req.method
  });
});

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
async function startServer() {
  try {
    // 连接数据库
    await connectDB();
    logger.info('数据库连接成功');

    // 连接Redis
    await connectRedis();
    logger.info('Redis连接成功');

    // 启动定时任务
    require('./jobs/scheduler');
    logger.info('定时任务已启动');

    // 启动服务器
    app.listen(PORT, () => {
      logger.info(`服务器启动成功，端口: ${PORT}`);
      logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，开始优雅关闭...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，开始优雅关闭...');
  process.exit(0);
});

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

startServer();

module.exports = app;


