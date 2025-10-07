#!/bin/bash

# GitHub 项目上传脚本
echo "🚀 开始上传项目到 GitHub..."

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查Git是否已初始化
if [ ! -d ".git" ]; then
    echo "📦 初始化Git仓库..."
    git init
fi

# 添加所有文件
echo "📁 添加文件到Git..."
git add .

# 检查是否有变更
if git diff --staged --quiet; then
    echo "ℹ️ 没有新的变更需要提交"
else
    # 提交变更
    echo "💾 提交变更..."
    git commit -m "Initial commit: AFR-Server 论坛分析服务器

- 完整的服务器端架构
- 智能推荐引擎
- 数据分析功能
- Docker部署支持
- API文档和开发指南"
fi

# 检查远程仓库是否已设置
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "🔗 设置远程仓库..."
    git remote add origin https://github.com/jorzaiy/AFR-server.git
fi

# 设置主分支
echo "🌿 设置主分支..."
git branch -M main

# 推送到GitHub
echo "⬆️ 推送到GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo "✅ 项目上传成功！"
    echo "🌐 访问地址: https://github.com/jorzaiy/AFR-server"
else
    echo "❌ 上传失败，请检查网络连接和GitHub权限"
    echo "💡 提示：如果遇到认证问题，请使用Personal Access Token"
fi
