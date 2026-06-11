const crypto = require('crypto');
const { loadResult } = require('./storage');

const SECRET = process.env.SHARE_ID_SECRET || 'default-secret-change-me';

/**
 * 生成分享ID - 使用加密方式创建不可猜测的ID
 */
function generateShareLink(resultId) {
  const result = loadResult(resultId);
  if (!result) {
    throw new Error('结果不存在');
  }

  // 使用HMAC创建签名
  const timestamp = Date.now();
  const data = `${resultId}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16);

  // 组合成分享ID
  const shareId = `${timestamp}-${signature}-${resultId.substring(0, 8)}`;
  return shareId;
}

/**
 * 验证分享ID并获取原始结果ID
 */
function verifyShareId(shareId) {
  try {
    const parts = shareId.split('-');
    if (parts.length < 3) {
      return null;
    }

    const timestamp = parseInt(parts[0]);
    const signature = parts[1];
    const shortId = parts[2];

    // 检查是否过期 (7天)
    const now = Date.now();
    const age = now - timestamp;
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    
    if (age > maxAge) {
      console.log('分享链接已过期');
      return null;
    }

    // 遍历所有结果找到匹配的
    const dataDir = require('path').join(__dirname, '../', process.env.DATA_DIR || 'data');
    const fs = require('fs');
    
    if (!fs.existsSync(dataDir)) {
      return null;
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const filePath = require('path').join(dataDir, file);
      try {
        const data = fs.readFileSync(filePath, 'utf8');
        const result = JSON.parse(data);
        
        if (result.id.startsWith(shortId)) {
          // 验证签名
          const dataToVerify = `${result.id}:${timestamp}`;
          const expectedSignature = crypto
            .createHmac('sha256', SECRET)
            .update(dataToVerify)
            .digest('hex')
            .substring(0, 16);

          if (expectedSignature === signature) {
            return result.id;
          }
        }
      } catch (e) {
        // 继续检查下一个
      }
    }

    return null;
  } catch (error) {
    console.error('验证分享ID失败:', error);
    return null;
  }
}

module.exports = {
  generateShareLink,
  verifyShareId
};
