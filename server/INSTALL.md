# 服务器端安装指南

## 🚀 快速安装

### 方法一：一键安装脚本（推荐）

```bash
# 下载并运行安装脚本
curl -fsSL https://raw.githubusercontent.com/your-repo/forum-analyzer-server/main/scripts/install.sh | bash
```

### 方法二：Docker 部署（最简单）

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/forum-analyzer-server.git
cd forum-analyzer-server

# 2. 配置环境变量
cp env.example .env
# 编辑 .env 文件，设置必要的配置

# 3. 启动所有服务
docker-compose up -d

# 4. 验证安装
curl http://localhost/health
```

### 方法三：手动安装

#### 1. 系统要求
- Ubuntu 20.04+ 或 Debian 10+
- 2GB+ RAM
- 20GB+ 磁盘空间

#### 2. 安装依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# 安装 Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 安装 PM2
sudo npm install -g pm2
```

#### 3. 部署应用

```bash
# 克隆项目
git clone https://github.com/your-repo/forum-analyzer-server.git
cd forum-analyzer-server

# 安装依赖
npm install

# 配置环境
cp env.example .env
# 编辑 .env 文件

# 初始化数据库
npm run migrate

# 启动服务
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔧 配置说明

### 环境变量配置

创建 `.env` 文件：

```env
# 服务器配置
NODE_ENV=production
PORT=3000

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/forum-analyzer
REDIS_URL=redis://localhost:6379

# JWT 密钥（请修改为随机字符串）
JWT_SECRET=your-super-secret-jwt-key-here

# CORS 配置
CORS_ORIGINS=http://localhost:3000,https://your-domain.com
```

### 数据库初始化

```bash
# 创建数据库用户
mongo --eval "
use forum-analyzer;
db.createUser({
  user: 'forum-user',
  pwd: 'your-secure-password',
  roles: [{ role: 'readWrite', db: 'forum-analyzer' }]
});
"

# 运行迁移脚本
npm run migrate
```

## 🐳 Docker 部署

### 1. 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 使用 Docker Compose

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app
```

### 3. 配置 Nginx 反向代理

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        location /api/ {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

## 🔍 验证安装

### 1. 检查服务状态

```bash
# 检查应用健康状态
curl http://localhost:3000/health

# 检查 MongoDB
mongo --eval "db.runCommand({ping: 1})"

# 检查 Redis
redis-cli ping

# 检查 PM2 进程
pm2 status
```

### 2. 测试 API 接口

```bash
# 测试推荐接口
curl -X GET "http://localhost:3000/api/recommendations/test-user?limit=5"

# 测试数据接口
curl -X POST http://localhost:3000/api/data/reading-events \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","threadId":"test:123","dwellMsEffective":5000}'
```

## 🚀 生产环境部署

### 1. 使用 PM2 管理进程

```bash
# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 重启应用
pm2 restart forum-analyzer

# 停止应用
pm2 stop forum-analyzer
```

### 2. 配置 SSL 证书

```bash
# 使用 Let's Encrypt
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加：0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. 配置防火墙

```bash
# 配置 UFW
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw deny 3000
```

## 📊 监控和维护

### 1. 日志管理

```bash
# 查看应用日志
pm2 logs forum-analyzer

# 查看系统日志
sudo journalctl -u mongod
sudo journalctl -u redis-server

# 配置日志轮转
sudo apt-get install logrotate
```

### 2. 性能监控

```bash
# 安装监控工具
npm install -g pm2-logrotate

# 配置日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 3. 数据备份

```bash
# 备份 MongoDB
mongodump --db forum-analyzer --out /backup/$(date +%Y%m%d)

# 备份 Redis
redis-cli --rdb /backup/redis-$(date +%Y%m%d).rdb

# 自动备份脚本
cat > /usr/local/bin/backup-forum-analyzer.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR
mongodump --db forum-analyzer --out $BACKUP_DIR/mongodb
redis-cli --rdb $BACKUP_DIR/redis.rdb
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR
EOF

chmod +x /usr/local/bin/backup-forum-analyzer.sh

# 添加到 crontab
echo "0 2 * * * /usr/local/bin/backup-forum-analyzer.sh" | sudo crontab -
```

## 🆘 故障排除

### 常见问题

**1. 端口被占用**
```bash
sudo netstat -tlnp | grep :3000
sudo kill -9 <PID>
```

**2. 内存不足**
```bash
free -h
# 增加交换空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

**3. 数据库连接失败**
```bash
sudo systemctl status mongod
sudo systemctl restart mongod
```

**4. Redis 连接失败**
```bash
sudo systemctl status redis-server
sudo systemctl restart redis-server
```

### 日志查看

```bash
# 应用日志
pm2 logs forum-analyzer

# 系统日志
sudo journalctl -u mongod -f
sudo journalctl -u redis-server -f

# Docker 日志
docker-compose logs -f app
```

## 📞 技术支持

如果遇到问题：

1. 检查系统日志：`journalctl -u mongod`
2. 检查应用日志：`pm2 logs`
3. 检查网络连接：`ping google.com`
4. 查看错误信息：`docker-compose logs`

---

**安装完成后，您的论坛分析服务器就可以为浏览器扩展提供强大的后端支持了！** 🎉
