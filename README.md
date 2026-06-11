# 店铺陈列AI评价系统

基于 Qwen2.5-VL 视觉大模型的店铺陈列智能评价系统。

## 核心功能

- 🖼️ 拍照上传，AI 自动评价陈列效果
- 📊 多维度评价（陈列效果 / 店容店貌 / 陈列资源）
- 🔗 一键分享评价结果
- 📈 人工反馈 + AI 训练数据收集

## 技术栈

- **后端**: Node.js + Express
- **AI**: Ollama + Qwen2.5-VL-7B
- **前端**: 原生 HTML/CSS/JS
- **公网**: Cloudflare Tunnel

## 快速部署

### 1. 安装 Ollama
```bash
curl -L -o ollama.tgz https://gh-proxy.com/https://github.com/ollama/ollama/releases/download/v0.7.0/ollama-linux-amd64.tgz
tar -xzf ollama.tgz -C /opt/ollama
ln -sf /opt/ollama/bin/ollama /usr/local/bin/ollama
nohup ollama serve > /tmp/oll.log 2>&1 &
ollama pull qwen2.5vl:7b
```

### 2. 部署项目
```bash
cd /root
git clone https://github.com/HS-os/zhongduanpj.git store-display-ai
cd store-display-ai
npm install --omit=dev
cp .env.example .env  # 编辑你的配置
nohup node server/server.js > /tmp/node.log 2>&1 &
```

### 3. 开公网隧道
```bash
curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/local/bin/cloudflared
nohup /usr/local/bin/cloudflared tunnel --url http://localhost:3000 > /tmp/tunnel.log 2>&1 &
```

## 环境变量

见 `.env.example`：
- `PORT`: Node 服务端口
- `AI_BASE_URL`: Ollama 地址
- `AI_MODEL`: 模型名称
- `SHARE_ID_SECRET`: 分享密钥

## 目录结构

```
store-display-ai/
├── server/          # Node 后端
│   ├── server.js    # 入口
│   ├── ai-service.js # AI 调用 + JSON 健壮解析
│   ├── feedback.js  # 反馈存储
│   ├── share.js     # 分享链接
│   └── storage.js   # 数据存储
├── public/          # 前端页面
├── uploads/         # 上传图片（gitignore）
├── data/            # 评价结果（gitignore）
└── feedback/        # 人工反馈（gitignore）
```

## License

MIT
