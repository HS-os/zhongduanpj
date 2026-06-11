const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../', process.env.DATA_DIR || 'data');
const UPLOAD_DIR = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads');
const EXPIRE_HOURS = parseInt(process.env.IMAGE_EXPIRE_HOURS) || 24;

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 保存分析结果
function saveResult(result) {
  ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, `${result.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`结果已保存: ${result.id}`);
}

// 加载分析结果
function loadResult(id) {
  const filePath = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const result = JSON.parse(data);
    
    // 检查是否过期
    const createdAt = new Date(result.createdAt);
    const now = new Date();
    const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
    
    if (hoursDiff > EXPIRE_HOURS) {
      // 清理过期数据
      deleteResult(id);
      return null;
    }
    
    return result;
  } catch (error) {
    console.error('加载结果失败:', error);
    return null;
  }
}

// 删除结果（同时删除图片）
function deleteResult(id) {
  const dataFile = path.join(DATA_DIR, `${id}.json`);
  const result = loadResult(id);
  
  if (result && result.imagePath) {
    try {
      const imagePath = path.join(__dirname, '../', result.imagePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`图片已删除: ${result.imagePath}`);
      }
    } catch (error) {
      console.error('删除图片失败:', error);
    }
  }
  
  try {
    if (fs.existsSync(dataFile)) {
      fs.unlinkSync(dataFile);
      console.log(`数据已删除: ${id}`);
    }
  } catch (error) {
    console.error('删除数据失败:', error);
  }
}

// 列出所有结果
function listResults() {
  ensureDir(DATA_DIR);
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const results = [];
  
  for (const file of files) {
    try {
      const data = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
      const result = JSON.parse(data);
      results.push({
        id: result.id,
        createdAt: result.createdAt,
        imageUrl: result.imageUrl
      });
    } catch (error) {
      console.error(`读取失败: ${file}`, error);
    }
  }
  
  return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// 清理过期文件
function cleanupExpiredFiles() {
  console.log('开始清理过期文件...');
  const expireMs = EXPIRE_HOURS * 60 * 60 * 1000;
  const now = new Date();
  
  // 清理数据文件
  ensureDir(DATA_DIR);
  const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of dataFiles) {
    try {
      const filePath = path.join(DATA_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtime;
      
      if (age > expireMs) {
        const id = file.replace('.json', '');
        deleteResult(id);
      }
    } catch (error) {
      console.error(`清理失败: ${file}`, error);
    }
  }
  
  // 清理未引用的图片
  ensureDir(UPLOAD_DIR);
  const imageFiles = fs.readdirSync(UPLOAD_DIR);
  
  for (const file of imageFiles) {
    try {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtime;
      
      if (age > expireMs) {
        fs.unlinkSync(filePath);
        console.log(`清理过期图片: ${file}`);
      }
    } catch (error) {
      console.error(`清理图片失败: ${file}`, error);
    }
  }
  
  console.log('清理完成');
}

module.exports = {
  saveResult,
  loadResult,
  deleteResult,
  listResults,
  cleanupExpiredFiles
};
