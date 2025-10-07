# 使用官方 Node.js 18 镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 创建必要的目录
RUN mkdir -p logs uploads && \
    chown -R nextjs:nodejs /app

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 启动应用
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
