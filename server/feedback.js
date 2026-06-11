const fs = require('fs');
const path = require('path');

// 反馈存储文件
const FEEDBACK_DIR = path.join(__dirname, '../feedback');
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, 'feedback.json');

// 初始化：确保目录存在
function init() {
  if (!fs.existsSync(FEEDBACK_DIR)) {
    fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  }
  if (!fs.existsSync(FEEDBACK_FILE)) {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify({}), 'utf8');
  }
}

// 读取所有反馈
function loadAllFeedback() {
  init();
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

// 保存单条人工反馈
function saveFeedback(data) {
  init();
  const all = loadAllFeedback();
  const id = data.id || `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    timestamp: new Date().toISOString(),
    dimension: data.dimension,
    imagePath: data.imagePath,
    imageBase64: data.imageBase64,  // 存 base64 用于历史回看
    aiRating: data.aiRating,
    aiReason: data.aiReason,
    humanRating: data.humanRating,
    humanReason: data.humanReason,
    note: data.note || ''
  };
  if (!all[data.dimension]) all[data.dimension] = [];
  all[data.dimension].unshift(record);
  // 限制每个维度最多保留 100 条（避免数据膨胀）
  if (all[data.dimension].length > 100) {
    all[data.dimension] = all[data.dimension].slice(0, 100);
  }
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(all, null, 2), 'utf8');
  return id;
}

// 获取指定维度的历史反馈（用于 few-shot 注入）
function getFeedbackForDimension(dimension, limit = 5) {
  const all = loadAllFeedback();
  const list = all[dimension] || [];
  return list.slice(0, limit);
}

// 统计信息
function getStats() {
  const all = loadAllFeedback();
  const stats = {};
  for (const dim of Object.keys(all)) {
    stats[dim] = {
      total: all[dim].length,
      latest: all[dim][0]?.timestamp || null
    };
  }
  return stats;
}


// 删除单条反馈
function deleteFeedback(id) {
  const all = loadAllFeedback();
  for (const dim of Object.keys(all)) {
    const idx = all[dim].findIndex(f => f.id === id);
    if (idx >= 0) {
      all[dim].splice(idx, 1);
      if (all[dim].length === 0) delete all[dim];
      fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(all, null, 2), 'utf8');
      return true;
    }
  }
  return false;
}

// 清空全部反馈
function clearAllFeedback() {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify({}), 'utf8');
  return true;
}

module.exports = {
  init,
  loadAllFeedback,
  saveFeedback,
  getFeedbackForDimension,
  getStats,
  deleteFeedback,
  clearAllFeedback
};
