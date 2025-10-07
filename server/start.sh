#!/bin/bash

# 快速启动脚本
echo "🚀 启动论坛分析服务器..."

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    echo "安装命令: curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 检查环境配置文件
if [ ! -f .env ]; then
    echo "📝 创建环境配置文件..."
    cp env.example .env
    echo "✅ 请编辑 .env 文件配置您的设置"
fi

# 启动服务
echo "🐳 启动 Docker 服务..."
docker-compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "🔍 检查服务状态..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ 服务器启动成功！"
    echo "🌐 访问地址: http://localhost:3000"
    echo "📊 健康检查: http://localhost:3000/health"
else
    echo "❌ 服务器启动失败，请检查日志:"
    echo "docker-compose logs"
fi

echo "🎉 部署完成！"
