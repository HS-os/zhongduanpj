#!/bin/bash
# 店铺陈列 AI 评价系统 - 一键启动脚本
# 用法: bash /root/start_all.sh

echo "===== 启动店铺陈列 AI 系统 ====="
echo "$(date)"

# 1. 启动 Ollama
if ! pgrep -x "ollama" > /dev/null; then
    echo "[1/3] 启动 Ollama..."
    nohup ollama serve > /tmp/oll.log 2>&1 < /dev/null &
    disown
    sleep 8
    OLLAMA_HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:11434/api/tags)
    echo "  Ollama: HTTP $OLLAMA_HTTP"
else
    echo "[1/3] Ollama 已在跑"
fi

# 2. 启动 Node
if ! pgrep -f "node /root/store-display-ai/server" > /dev/null; then
    echo "[2/3] 启动 Node..."
    cd /root/store-display-ai
    setsid nohup node server/server.js > /tmp/node.log 2>&1 < /dev/null &
    disown
    sleep 5
    NODE_HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:3000/)
    echo "  Node: HTTP $NODE_HTTP"
else
    echo "[2/3] Node 已在跑"
fi

# 3. 启动 cloudflared
if ! pgrep -x "cloudflared" > /dev/null; then
    echo "[3/3] 启动 cloudflared 隧道..."
    rm -f /tmp/tunnel.log
    setsid nohup /usr/local/bin/cloudflared tunnel --url http://localhost:3000 > /tmp/tunnel.log 2>&1 < /dev/null &
    disown
    sleep 8
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tunnel.log | head -1)
    if [ -n "$URL" ]; then
        echo "  ✓ 公网 URL: $URL"
    else
        echo "  ✗ URL 没拿到，看 /tmp/tunnel.log"
    fi
else
    echo "[3/3] cloudflared 已在跑"
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/tunnel.log | head -1)
    if [ -n "$URL" ]; then
        echo "  公网 URL: $URL"
    fi
fi

echo ""
echo "===== 启动完成 ====="
echo "Ollama: http://localhost:11434"
echo "Node: http://localhost:3000"
echo "公网: $URL"
