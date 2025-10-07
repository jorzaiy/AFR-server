#!/bin/bash

# 论坛分析服务器安装脚本
# 适用于 Ubuntu 20.04+ / Debian 10+

set -e

echo "🚀 开始安装论坛分析服务器..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root 用户
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "请不要使用 root 用户运行此脚本"
        exit 1
    fi
}

# 检查系统要求
check_system() {
    log_info "检查系统要求..."
    
    # 检查操作系统
    if ! command -v apt-get &> /dev/null; then
        log_error "此脚本仅支持基于 Debian 的系统 (Ubuntu/Debian)"
        exit 1
    fi
    
    # 检查内存
    total_mem=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    if [ $total_mem -lt 2048 ]; then
        log_warn "系统内存少于 2GB，可能影响性能"
    fi
    
    # 检查磁盘空间
    available_space=$(df / | awk 'NR==2{print $4}')
    if [ $available_space -lt 20971520 ]; then  # 20GB in KB
        log_error "可用磁盘空间少于 20GB"
        exit 1
    fi
    
    log_info "系统检查通过"
}

# 更新系统包
update_system() {
    log_info "更新系统包..."
    sudo apt-get update
    sudo apt-get upgrade -y
    sudo apt-get install -y curl wget gnupg2 software-properties-common apt-transport-https ca-certificates
}

# 安装 Node.js
install_nodejs() {
    log_info "安装 Node.js 18..."
    
    if command -v node &> /dev/null; then
        node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ $node_version -ge 18 ]; then
            log_info "Node.js 版本满足要求: $(node --version)"
            return
        fi
    fi
    
    # 添加 NodeSource 仓库
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # 验证安装
    if command -v node &> /dev/null; then
        log_info "Node.js 安装成功: $(node --version)"
    else
        log_error "Node.js 安装失败"
        exit 1
    fi
}

# 安装 MongoDB
install_mongodb() {
    log_info "安装 MongoDB..."
    
    if command -v mongod &> /dev/null; then
        log_info "MongoDB 已安装: $(mongod --version | head -n1)"
        return
    fi
    
    # 导入 MongoDB 公钥
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
    
    # 添加 MongoDB 仓库
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    
    # 更新包列表并安装
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    
    # 启动并启用 MongoDB
    sudo systemctl start mongod
    sudo systemctl enable mongod
    
    # 验证安装
    if systemctl is-active --quiet mongod; then
        log_info "MongoDB 安装成功"
    else
        log_error "MongoDB 启动失败"
        exit 1
    fi
}

# 安装 Redis
install_redis() {
    log_info "安装 Redis..."
    
    if command -v redis-server &> /dev/null; then
        log_info "Redis 已安装: $(redis-server --version | head -n1)"
        return
    fi
    
    sudo apt-get install -y redis-server
    
    # 配置 Redis
    sudo sed -i 's/^# maxmemory <bytes>/maxmemory 1gb/' /etc/redis/redis.conf
    sudo sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    
    # 启动并启用 Redis
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
    
    # 验证安装
    if redis-cli ping | grep -q PONG; then
        log_info "Redis 安装成功"
    else
        log_error "Redis 连接失败"
        exit 1
    fi
}

# 安装 PM2
install_pm2() {
    log_info "安装 PM2 进程管理器..."
    
    if command -v pm2 &> /dev/null; then
        log_info "PM2 已安装: $(pm2 --version)"
        return
    fi
    
    sudo npm install -g pm2
    
    # 验证安装
    if command -v pm2 &> /dev/null; then
        log_info "PM2 安装成功: $(pm2 --version)"
    else
        log_error "PM2 安装失败"
        exit 1
    fi
}

# 安装 Docker（可选）
install_docker() {
    read -p "是否安装 Docker？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "安装 Docker..."
        
        if command -v docker &> /dev/null; then
            log_info "Docker 已安装: $(docker --version)"
            return
        fi
        
        # 安装 Docker
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
        
        # 添加用户到 docker 组
        sudo usermod -aG docker $USER
        
        # 安装 Docker Compose
        sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        
        log_info "Docker 安装成功，请重新登录以使用 Docker"
    fi
}

# 配置防火墙
configure_firewall() {
    log_info "配置防火墙..."
    
    if command -v ufw &> /dev/null; then
        sudo ufw --force enable
        sudo ufw allow ssh
        sudo ufw allow 80
        sudo ufw allow 443
        sudo ufw deny 3000  # 禁止直接访问应用端口
        log_info "防火墙配置完成"
    else
        log_warn "UFW 未安装，跳过防火墙配置"
    fi
}

# 创建项目目录
setup_project() {
    log_info "设置项目目录..."
    
    PROJECT_DIR="/opt/forum-analyzer"
    
    # 创建项目目录
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
    
    # 创建日志目录
    sudo mkdir -p /var/log/forum-analyzer
    sudo chown $USER:$USER /var/log/forum-analyzer
    
    log_info "项目目录创建完成: $PROJECT_DIR"
}

# 安装完成提示
installation_complete() {
    log_info "安装完成！"
    echo
    echo "📋 下一步操作："
    echo "1. 将项目代码复制到 $PROJECT_DIR"
    echo "2. 配置环境变量: cp env.example .env"
    echo "3. 安装项目依赖: npm install"
    echo "4. 初始化数据库: npm run migrate"
    echo "5. 启动服务: pm2 start ecosystem.config.js"
    echo
    echo "🔧 配置文件位置："
    echo "- 环境配置: $PROJECT_DIR/.env"
    echo "- PM2 配置: $PROJECT_DIR/ecosystem.config.js"
    echo "- 日志目录: /var/log/forum-analyzer"
    echo
    echo "📚 更多信息请查看 README.md"
}

# 主函数
main() {
    echo "🎯 论坛分析服务器安装脚本"
    echo "================================"
    
    check_root
    check_system
    update_system
    install_nodejs
    install_mongodb
    install_redis
    install_pm2
    install_docker
    configure_firewall
    setup_project
    installation_complete
}

# 运行主函数
main "$@"
