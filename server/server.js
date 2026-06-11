const express = require('express');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 导入服务
const { analyzeDimension, evaluateAllDimensions } = require('./ai-service');
const { saveResult, loadResult, listResults, cleanupExpiredFiles } = require('./storage');
const { generateShareLink, verifyShareId } = require('./share');
const { saveFeedback, getStats, loadAllFeedback, deleteFeedback, clearAllFeedback } = require('./feedback');

// 中间件
app.use(express.json({limit: "20mb"})); app.use(express.urlencoded({limit: "20mb", extended: true}));
app.use(express.static(path.join(__dirname, '../public')));

// 确保目录存在
const uploadDir = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads');
const dataDir = path.join(__dirname, '../', process.env.DATA_DIR || 'data');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// 文件上传配置（支持多文件）
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExts = /jpeg|jpg|png/;  // 明确不支持 webp
    const allowedMimes = /image\/jpeg|image\/jpg|image\/png/;
    const ext = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedMimes.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('只支持 jpg、png 格式（webp 格式不被 AI 识别，请转成 jpg/png 后再上传）'));
  }
});

// 缓存当前分析结果
const sessionCache = new Map(); // resultId -> { dimension -> { rating, reason, imageUrls } }

// ============ 路由 ============

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 3 个独立维度评价端点
['display', 'appearance', 'resource'].forEach(dimension => {
  app.post(`/api/analyze/${dimension}`, upload.array('images', 3), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: '请上传至少 1 张图片' });
      }

      const imagePaths = req.files.map(f => f.path);
      const imageUrls = req.files.map(f => `/uploads/${f.filename}`);

      console.log(`[${dimension}] 收到 ${imagePaths.length} 张图片`);

      // 调用 AI 评价
      const result = await analyzeDimension(dimension, imagePaths);

      // 缓存到会话
      const sessionId = req.body.sessionId || uuidv4();
      if (!sessionCache.has(sessionId)) sessionCache.set(sessionId, {});
      const session = sessionCache.get(sessionId);
      session[dimension] = { ...result, imageUrls, imagePaths, createdAt: new Date().toISOString() };

      // 保存到存储
      const resultObj = {
        id: sessionId,
        dimensions: session,
        createdAt: new Date().toISOString()
      };
      saveResult(resultObj);

      res.json({
        success: true,
        resultId: sessionId,
        data: { rating: result.rating, reason: result.reason, details: result.details || [] }
      });
    } catch (error) {
      console.error(`[${dimension}] 评价失败:`, error);
      res.status(500).json({ success: false, error: error.message || '分析失败，请重试' });
    }
  });
});

// 保存人工反馈
app.post('/api/feedback', async (req, res) => {
  try {
    const { dimension, imagePath, aiRating, aiReason, humanRating, humanReason, note } = req.body || {};
    if (!dimension || !humanRating) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }
    const id = saveFeedback({ dimension, imagePath, aiRating, aiReason, humanRating, humanReason, note });
    console.log(`[feedback] 收到 ${dimension} 校正: ${aiRating}→${humanRating} (id: ${id})`);
    res.json({ success: true, data: { id, message: '已记录此评价，AI 将在下次评价时参考' } });
  } catch (error) {
    console.error('[feedback] 保存失败:', error);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// 获取反馈统计
app.get('/api/feedback/stats', async (req, res) => {
  try {
    const stats = getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取所有反馈数据（用于调试）
app.get('/api/feedback/all', async (req, res) => {
  try {
    const all = loadAllFeedback();
    res.json({ success: true, data: all });


// 删除单条反馈
app.delete('/api/feedback/:id', async (req, res) => {
  try {
    const ok = deleteFeedback(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: '记录不存在' });
    console.log(`[feedback] 删除记录: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// 清空所有反馈
app.delete('/api/feedback/all', async (req, res) => {
  try {
    clearAllFeedback();
    console.log('[feedback] 清空所有数据');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: '清空失败' });
  }
});
  } catch (error) {
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 生成分享链接
app.post('/api/share', async (req, res) => {
  try {
    const { resultId } = req.body;
    if (!resultId) {
      return res.status(400).json({ success: false, error: '缺少结果ID' });
    }
    const shareId = generateShareLink(resultId);
    res.json({ success: true, data: { shareId } });
  } catch (error) {
    res.status(500).json({ success: false, error: '生成分享链接失败' });
  }
});

// 训练数据集可视化页面
app.get('/training', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/training.html'));
});

// 获取分享数据
app.get('/api/share/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const resultId = verifyShareId(shareId);
    if (!resultId) {
      return res.status(404).json({ success: false, error: '分享不存在或已过期' });
    }
    const result = loadResult(resultId);
    if (!result) {
      return res.status(404).json({ success: false, error: '结果不存在或已过期' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取单个结果
app.get('/api/result/:id', async (req, res) => {
  try {
    const result = loadResult(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, error: '结果不存在或已过期' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 静态文件服务
app.use('/uploads', express.static(uploadDir));

// 错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ success: false, error: err.message });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`店铺陈列AI评价系统已启动: http://localhost:${PORT}`);
  console.log('3 个独立评价端点:');
  console.log('  POST /api/analyze/display     - 陈列效果');
  console.log('  POST /api/analyze/appearance  - 店容店貌');
  console.log('  POST /api/analyze/resource    - 陈列资源');
  // area 路由已删除
  setInterval(cleanupExpiredFiles, 60 * 60 * 1000);
});
