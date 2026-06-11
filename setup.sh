#!/bin/bash
# 店铺陈列 AI 评价系统 - 全新服务器部署脚本
# 用法: bash setup.sh
# 适用: Ubuntu 22.04+ 全新服务器（root 权限）

set -e

echo "===== 全新部署店铺陈列 AI 系统 ====="
echo "$(date)"

# 1. 装基础工具
echo "[1/6] 装基础工具..."
apt-get update -qq 2>&1 | tail -3
apt-get install -y -qq curl wget git 2>&1 | tail -3

# 2. 装 Node.js 20
if ! command -v node &> /dev/null; then
    echo "[2/6] 装 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -3
    apt-get install -y -qq nodejs 2>&1 | tail -3
    node --version
    npm --version
else
    echo "[2/6] Node 已装: $(node --version)"
fi

# 3. 装 Ollama v0.7.0
if ! command -v ollama &> /dev/null; then
    echo "[3/6] 装 Ollama v0.7.0..."
    cd /root
    if [ ! -f ollama-v070.tgz ]; then
        wget -q -O ollama-v070.tgz "https://gh-proxy.com/https://github.com/ollama/ollama/releases/download/v0.7.0/ollama-linux-amd64.tgz"
    fi
    mkdir -p /opt/ollama-v070
    tar -xzf ollama-v070.tgz -C /opt/ollama-v070
    ln -sf /opt/ollama-v070/bin/ollama /usr/local/bin/ollama
    ollama --version
else
    echo "[3/6] Ollama 已装: $(ollama --version | head -1)"
fi

# 4. 启动 Ollama + 拉模型
if ! pgrep -x "ollama" > /dev/null; then
    echo "[4/6] 启动 Ollama..."
    nohup ollama serve > /tmp/oll.log 2>&1 < /dev/null &
    disown
    sleep 8
fi

if ! ollama list 2>/dev/null | grep -q "qwen2.5vl:7b"; then
    echo "[4/6] 拉 qwen2.5vl:7b 模型（4.7G，需要几分钟）..."
    ollama pull qwen2.5vl:7b
else
    echo "[4/6] qwen2.5vl:7b 模型已下载"
fi

# 5. 部署项目代码
if [ ! -d /root/store-display-ai ]; then
    echo "[5/6] 克隆项目代码..."
    cd /root
    git clone https://github.com/HS-os/zhongduanpj.git store-display-ai
    cd store-display-ai
    npm install --omit=dev 2>&1 | tail -3
    if [ ! -f .env ]; then
        cp .env.example .env
        echo "  ⚠️  请编辑 /root/store-display-ai/.env 配置密钥"
    fi
else
    echo "[5/6] 项目已部署（/root/store-display-ai）"
fi

# 6. 启动服务
echo "[6/6] 启动服务..."
bash /root/store-display-ai/start.sh

echo ""
echo "===== 部署完成 ====="
echo ""
echo "后续操作："
echo "  - 配置密钥: nano /root/store-display-ai/.env"
echo "  - 重启服务: bash /root/store-display-ai/start.sh"
echo "  - 查看日志: tail -f /tmp/oll.log /tmp/node.log /tmp/tunnel.log"
