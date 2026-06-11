const fs = require('fs');
const path = require('path');
const { getFeedbackForDimension } = require('./feedback');

// 评价标准定义（4 个维度）
const CRITERIA = {
  display: {
    name: '陈列效果',
    levels: 3,
    good: { score: 3, indicators: ['固定陈列专区', '定期更新主题', '创意陈列元素多', '生动化陈列好', '整体陈列效果佳'] },
    fair: { score: 2, indicators: ['相对固定陈列专区', '零星创意陈列', '生动化陈列元素', '整体陈列效果较好'] },
    poor: { score: 1, indicators: ['无固定主题陈列专区', '陈列缺乏规划'] }
  },
  appearance: {
    name: '店容店貌',
    levels: 3,
    good: { score: 3, indicators: ['店招醒目', '商品陈列整齐有序', '规范亮证经营', '整体美观整洁'] },
    fair: { score: 2, indicators: ['店招较为醒目', '商品陈列较为整齐', '能亮证经营', '环境整洁'] },
    poor: { score: 1, indicators: ['无店招', '整体环境一般', '陈列杂乱'] }
  },
  resource: {
    name: '陈列资源',
    levels: 3,
    good: { score: 3, indicators: ['配备卷烟陈列前柜', '配备卷烟陈列背柜', '专业货架齐全'] },
    fair: { score: 2, indicators: ['有零星陈列设备', '货架不齐全'] },
    poor: { score: 1, indicators: ['完全无陈列设备', '未见前柜背柜'] }
  },
};

// 各维度的正面/负面关键词（用于后处理纠偏）
const KEYWORDS = {
  display: {
    positive: ['主题', '专区', '创意', '生动化', 'POP', '海报', '堆头', '装饰', '饱满', '整洁', '醒目', '造', '灯箱', '吸引', '多', '明显', '有', '足'],
    negative: ['杂乱', '无', '差', '乱', '脏', '破损', '缺乏', '不足', '没有', '未', '不', '低']
  },
  appearance: {
    positive: ['店招', '招牌', '整齐', '整洁', '规范', '证照', '执照', '干净', '美观', '灯光', '醒目', '有序', '清晰', '亮', '有', '好'],
    negative: ['杂乱', '无', '差', '乱', '脏', '破损', '缺乏', '不足', '没有', '未', '不', '低', '旧']
  },
  resource: {
    positive: ['前柜', '背柜', '货架', '设备', '专柜', '齐全', '完善', '多', '有'],
    negative: ['无', '差', '缺乏', '没有', '未', '不', '不足']
  },
};

// ============ 动态 Few-shot 注入（基于人工反馈学习） ============
// 中文每字约 1.5 tokens，英文每词约 1.3 tokens
// 单条样本上限 200 字（约 300 tokens），3 条约 900 tokens
const MAX_FEW_SHOT = 3;
const MAX_SAMPLE_REASON_LEN = 200;
const MAX_TOTAL_TOKENS = 6000;  // Few-shot 块总预算（图片 768 + 任务 1500 + 输出 300 留出空间）

function truncate(s, max) {
  if (!s) return '';
  s = String(s);
  if (s.length <= max) return s;
  return s.substring(0, max) + '...';
}

function buildDynamicFewShot(dimension) {
  let feedbacks = getFeedbackForDimension(dimension, MAX_FEW_SHOT);
  if (feedbacks.length === 0) return '';

  let block = '\n\n## 【人工反馈学习样本】\n';
  block += '以下是客户经理人工校正后的标准答案，请严格按此标准评价：\n';

  // 按时间倒序（最新的优先）
  feedbacks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  let totalLen = 0;
  let used = 0;

  for (let i = 0; i < feedbacks.length; i++) {
    const fb = feedbacks[i];

    // 截断 reason（防超长样本撑爆上下文）
    const aiReason = truncate(fb.aiReason, MAX_SAMPLE_REASON_LEN);
    const humanReason = truncate(fb.humanReason, MAX_SAMPLE_REASON_LEN);

    const sampleBlock =
      '\n### 学习样本 ' + (i + 1) + '（' + new Date(fb.timestamp).toLocaleDateString('zh-CN') + '）' +
      '\nAI 原评：{"rating": "' + fb.aiRating + '", "reason": "' + aiReason + '"}' +
      '\n人工校正：{"rating": "' + fb.humanRating + '", "reason": "' + humanReason + '"}';

    // 累计检查：超过预算就停
    if (totalLen + sampleBlock.length > MAX_TOTAL_TOKENS) {
      console.log(`[few-shot ${dimension}] 预算用尽（${totalLen}/${MAX_TOTAL_TOKENS}），已用 ${used}/${feedbacks.length} 条`);
      break;
    }

    block += sampleBlock;
    totalLen += sampleBlock.length;
    used++;
  }

  if (used === 0) return '';
  block += '\n';
  console.log(`[few-shot ${dimension}] 注入 ${used} 条样本，约 ${Math.round(totalLen/2)} tokens`);
  return block;
}
// 4 个独立 prompt（从 v2 旧项目移植并增强）
const PROMPTS = {
  display: `你是一个零售店铺陈列评审专家。请分析以下店铺图片并评价陈列效果。

## 评价标准（任一条件满足即可）

### 陈列效果（好/较好/一般）
- 【好】满足以下**任一**条件即可：
  ① 有清晰的固定陈列专区（货架专区、堆头专区等）
  ② 有明确的陈列主题（节日/促销/品牌主题）
  ③ 有创意陈列元素（造型堆头、装饰道具、创意摆法）
  ④ 有生动化陈列（POP海报、价格牌、爆炸贴、灯箱等）
  ⑤ 整体视觉吸引力强、商品饱满整洁

- 【较好】：以上亮点都不明显，但有基本陈列

- 【一般】：无固定主题专区，陈列杂乱无章

## ⚠️ 重要提示（请严格遵守）
- **客观评价！** 好就是好，一般就是一般
- **不要为了"严谨"故意评低，也不要为了"鼓励"盲目评高**
- **按标准打分，不做额外平衡**

## 【示例 Few-shot】

### 示例1（评"好"）
图片中看到：节庆堆头 + POP海报 + 整齐货架
输出：{"rating": "好", "reason": "有春节堆头专区，POP海报醒目，货架整齐饱满"}

### 示例1（评"好"）
图片中看到：节庆堆头 + POP海报 + 整齐货架
输出：{"rating": "好", "reason": "有春节堆头专区，POP海报醒目，货架整齐饱满"}

### 示例2（评"较好"）
图片中看到：有1-2个明显的创意元素（小型堆头/装饰/灯光）
输出：{"rating": "较好", "reason": "有少量创意元素和POP装饰，但无固定主题专区"}

### 示例3（评"一般"）
图片中看到：只有基本货架陈列，无主题无创意，但整齐不乱
输出：{"rating": "一般", "reason": "仅有基本陈列，无主题专区或创意元素"}

### 示例4（评"一般"）
图片中看到：货架混乱、无序
输出：{"rating": "一般", "reason": "陈列杂乱无章，缺乏固定主题专区"}

## 决策规则（严格遵守）
1. **【好】** 必须有清晰的【固定专区】或【明确主题】或【明显创意】
2. **【较好】** 有少量亮点（如 1-2 个创意元素、装饰、POP）
3. **【一般】** 仅"有基本陈列"或"整齐不乱" → 都评"一般"，**不要评"较好"**
4. **【一般】** 陈列杂乱、无主题、缺规划 → 也评"一般"

⚠️ **关键：仅"有基本陈列"是"一般"，不是"较好"！**

请只返回JSON（不要其他文字）：
{"rating": "好|较好|一般", "reason": "30字以内说明"}`,

  appearance: `你是一个零售店铺陈列评审专家。请分析以下店铺图片并评价店容店貌。

## 评价标准（任一条件满足即可）

### 店容店貌（好/较好/一般）
- 【好】满足以下**任一**条件即可：
  ① 有店招（店名招牌）
  ② 商品陈列整齐有序
  ③ 整体环境整洁美观
  ④ 看到营业执照/许可证等证照
  ⑤ 灯光合适、地面干净

- 【较好】：以上亮点不明显，但有基本店容

- 【一般】：无店招或环境杂乱、陈列无序

## ⚠️ 重要提示（请严格遵守）
- **客观评价！** 看到店招评"好"，环境一般评"较好"，都没有评"一般"
- **不要为了"严谨"故意评低，也不要盲目评高**
- **按标准打分，不做平衡**

## 【示例 Few-shot】

### 示例1（评"好"）
图片中看到：醒目店招 + 商品整齐 + 地面干净 + 灯光合适
输出：{"rating": "好", "reason": "店招醒目，商品整齐，灯光合适，地面干净"}

### 示例2（评"较好"）
图片中看到：有店招 + 货架基本整齐，但环境一般
输出：{"rating": "较好", "reason": "有店招，货架整齐，但环境一般"}

### 示例3（评"较好"）
图片中看到：有店招 + 整洁，但无灯光或细节欠缺
输出：{"rating": "较好", "reason": "有店招，环境整洁，细节待提升"}

### 示例4（评"一般"）
图片中看到：无店招 + 货架混乱
输出：{"rating": "一般", "reason": "无店招，货架混乱"}

### 示例5（评"一般"）
图片中看到：有店招 + 货架较乱
输出：{"rating": "一般", "reason": "有店招但货架较乱，整体环境一般"}

## 决策规则（严格遵守）
1. **【好】** 店招醒目 + 商品整齐 + 地面干净 + 灯光合适（多项**全部**满足）
2. **【较好】** 有店招 + 基本整齐，但环境一般 / 细节欠缺
3. **【一般】** 无店招 / 货架混乱 / 整体环境差

⚠️ **关键：仅"有店招 + 整洁"是"较好"，不是"好"！** 必须多项都好才评"好"

请只返回JSON（不要其他文字）：
{"rating": "好|较好|一般", "reason": "30字以内说明"}`,

  resource: `你是一个零售店铺陈列评审专家。请分析以下店铺图片中的陈列资源。

## 评价标准

### 陈列资源（好/较好/一般）
- 【好】：配备卷烟陈列前柜、背柜等设备（任一即可）
- 【较好】：有零星陈列设备但不齐全
- 【一般】：完全无陈列设备

## ⚠️ 提示
- **看到任一陈列设备（前柜/背柜/货架）评"好"，没有评"一般"**
- 客观按标准打分

## 【示例 Few-shot】

### 示例1（评"好"）
图片中看到：卷烟背柜 + 货架
输出：{"rating": "好", "reason": "配备卷烟背柜及货架"}

### 示例2（评"好"）
图片中看到：只有前柜
输出：{"rating": "好", "reason": "配备卷烟陈列前柜"}

### 示例3（评"较好"）
图片中看到：只有少量普通货架
输出：{"rating": "较好", "reason": "有零星货架但非专业陈列设备"}

### 示例4（评"一般"）
图片中看到：无明显陈列柜
输出：{"rating": "一般", "reason": "未见前柜背柜等陈列设备"}

## 决策规则
1. 看到背柜或前柜（任一）→ 评"好"
2. 看到普通货架 → 评"较好"
3. 什么都看不到 → 评"一般"

请只返回JSON：
{"rating": "好|较好|一般", "reason": "30字以内说明"}`
};

// 后处理纠偏：防止 AI 过于保守

// 清洗 AI 输出的 rating（处理 "好|较好|一般"、数组、空值、错别字等情况）
function sanitizeRating(rawRating) {
  if (rawRating === null || rawRating === undefined) return '一般';
  let r = String(rawRating).trim();

  // 处理数组（取第一个）
  if (Array.isArray(rawRating) && rawRating.length > 0) {
    r = String(rawRating[0]).trim();
  }

  // 处理 "好|较好|一般" 这种（|分隔）→ 取第一个
  // 处理 "好|较好|一般" 这种多选格式（| / /、 或 都算）
  // AI 不确定时会列出多个选项 → 默认返回 "一般"（中间档，最保守）
  if (r.includes('|') || r.includes('/') || r.includes('、') || r.includes('或')) {
    const parts = r.split(/[|/、或]/).map(s => s.trim()).filter(Boolean);
    console.log(`[sanitize] AI 返回多选: ${r} → 默认 "一般"`);
    return '一般';
  }

  // 处理 "/" "、" "或" 分隔
  if (r.includes('/') || r.includes('、') || r.includes('或')) {
    const parts = r.split(/[\/、或]/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) r = parts[0];
  }

  // 标准化：去掉空白和标点
  r = r.replace(/[\s　.,;:!?。，；：！？、]/g, '');

  // 错别字纠正
  const fixMap = {
    '很好': '好',
    '非常好': '好',
    '不错': '好',
    '优秀': '好',
    '良好': '好',
    '棒': '好',
    '可以': '较好',
    '还行': '较好',
    '尚可': '较好',
    '普通': '一般',
    '凑合': '一般',
    '不太好': '一般',
    '很差': '差',
    '糟糕': '差',
    '很差劲': '差'
  };
  if (fixMap[r]) r = fixMap[r];

  // 最终白名单校验
  const valid = ['好', '较好', '一般', '差'];
  if (valid.includes(r)) return r;

  // 包含关系（"较好一些" → "较好"）
  for (const v of valid) {
    if (r.includes(v)) return v;
  }

  // 不匹配任何 → 默认 "一般"
  return '一般';
}


function boostRating(rating, reason, category) {
  if (!reason) return rating;
  const r = String(rating);
  if (r === '好') return '好';

  // 处理 AI 可能输出"较差"的情况（应改为"差"，4 等级最差）
  if (r === '较差') {
    console.log(`[纠偏 ${category}] 原评"较差"→规范为"差"`);
    return '差';
  }

  const kw = KEYWORDS[category] || { positive: [], negative: [] };
  const posCount = kw.positive.filter(k => reason.includes(k)).length;
  const negCount = kw.negative.filter(k => reason.includes(k)).length;

  // 规则 1（已关闭）：不再把"较好"升级为"好"，避免评价偏高
  // 规则 2（已关闭）：不再把"一般"升级为"较好"，避免评价偏高
  return r;
}

async function _callAI(category, imageBase64, mimeType) {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1';
  const modelName = process.env.AI_MODEL || 'Qwen/Qwen2.5-VL-3B-Instruct';

  if (!apiKey) {
    return localFallback(category);
  }

  try {
    // 合并静态 prompt + 动态 few-shot
    const finalPrompt = PROMPTS[category] + buildDynamicFewShot(category);

    const requestBody = {
      model: modelName,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: finalPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ]
      }],
      max_tokens: 300,
      temperature: 0.3,
      stream: false
    };
    const bodyStr = JSON.stringify(requestBody);
    console.log(`[${category}] 请求体大小: ${Math.round(bodyStr.length/1024)} KB`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: bodyStr
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${category}] API 错误 ${response.status}: ${errorText.substring(0, 500)}`);
      throw new Error(`API请求失败: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 尝试从 AI 响应提取 JSON（兼容多种格式）
    let result = null;
    let rawJson = '';

    // 1. 尝试找 markdown 代码块中的 JSON
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (codeBlockMatch) rawJson = codeBlockMatch[1];

    // 2. 尝试找花括号包围的 JSON
    if (!rawJson) {
      const braceMatch = content.match(/\{[\s\S]*?\}/);
      if (braceMatch) rawJson = braceMatch[0];
    }

    // 3. 尝试全文 parse
    if (!rawJson) rawJson = content.trim();

    if (rawJson) {
      // 修复常见问题
      let cleanJson = rawJson
        .replace(/[“”]/g, '"')   // 全角引号 -> 半角
        .replace(/[‘’]/g, '\'')  // 全角单引号
        .replace(/,\s*([}\]])/g, '$1')   // 末尾多余逗号
        .replace(/([{,])\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*:/g, '$1"$2":') // 缺引号的 key
        ;

      try {
        result = JSON.parse(cleanJson);
      } catch (e1) {
        // 再试一次：移除控制字符
        try {
          result = JSON.parse(cleanJson.replace(/[\u0000-\u001f]/g, ''));
        } catch (e2) {
          console.log(`[${category}] JSON 解析失败(原): ${rawJson.substring(0, 200)}`);
          console.log(`[${category}] JSON 解析失败(清): ${cleanJson.substring(0, 200)}`);
          // 用正则抓 rating 和 reason
          const ratingMatch = rawJson.match(/(?:rating|评分|等级)["':\s]*([^"',}\]]+)/i);
          const reasonMatch = rawJson.match(/(?:reason|原因|说明)["':\s]*["']?([^"'}*]+)["']?/);
          if (ratingMatch || reasonMatch) {
            result = {
              rating: sanitizeRating(ratingMatch && ratingMatch[1].trim()),
              reason: (reasonMatch && reasonMatch[1].trim()) || 'AI响应解析出错，但提及了评价'
            };
            console.log(`[${category}] 退而次之：从文本提取 rating=${result.rating}`);
          }
        }
      }
    }

    if (!result) {
      console.log(`[${category}] AI 响应无 JSON: ${content.substring(0, 200)}`);
      return { rating: '一般', reason: 'AI响应解析失败', details: [] };
    }

    const finalRating = boostRating(sanitizeRating(result.rating), result.reason || '', category);

    return {
      rating: finalRating,
      reason: result.reason || '',
      details: []
    };
  } catch (error) {
    console.error(`[${category}] 评价失败:`, error.message);
    return localFallback(category);
  }
}

// 本地规则引擎（API 失败时兜底）
function localFallback(category) {
  const fallbacks = {
    display: { rating: '较好', reason: 'AI服务不可用，使用本地规则（待配置API）', details: ['已检测到基本陈列区域', '建议配置 API 以获得准确评价'] },
    appearance: { rating: '较好', reason: 'AI服务不可用，使用本地规则（待配置API）', details: ['环境整洁度良好', '建议配置 API 以获得准确评价'] },
    resource: { rating: '较好', reason: 'AI服务不可用，使用本地规则（待配置API）', details: ['检测到基础陈列设备', '建议配置 API 以获得准确评价'] },
  };
  return fallbacks[category] || fallbacks.display;
}

// 主入口：并行调用 3 个维度评价
async function analyzeImage(imagePath) {
  // 读取图片转 base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  console.log('[analyzeImage] 开始 3 维度并行评价...');

  // 3 个维度并行调用（速度 ≈ 单次调用）
  const [display, appearance, resource] = await Promise.all([
    evaluateDimension(base64Image, mimeType, 'display'),
    evaluateDimension(base64Image, mimeType, 'appearance'),
    evaluateDimension(base64Image, mimeType, 'resource')
  ]);

  console.log(`[analyzeImage] 完成: display=${display.rating}, appearance=${appearance.rating}, resource=${resource.rating}`);

  return {
    display,
    appearance,
    resource,
    summary: generateSummary({ display, appearance, resource })
  };
}

// 单维度评价入口（供 server.js 调用，签名：category, imagePaths）
async function evaluateDimension(category, imagePaths) {
  if (!imagePaths || imagePaths.length === 0) {
    return localFallback(category);
  }
  // 取第一张图片（多图暂未启用）
  const imagePath = imagePaths[0];
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  return await _callAI(category, imageBase64, mimeType);
}

// 生成总结
function generateSummary(result) {
  const ratings = [result.display, result.appearance, result.resource];
  const goodCount = ratings.filter(r => r.rating === '好').length;
  const fairCount = ratings.filter(r => r.rating === '较好').length;
  const poorCount = ratings.filter(r => r.rating === '一般' || r.rating === '差').length;

  if (goodCount >= 3) return `店铺整体表现优秀（${goodCount}项"好"），继续保持！`;
  if (goodCount >= 1) return `店铺整体表现良好（${goodCount}项"好"），有提升空间。`;
  if (fairCount >= 2) return `店铺整体表现一般（${fairCount}项"较好"），建议优化陈列。`;
  return `店铺整体表现欠佳，需要重点改进。`;
}

module.exports = {
  analyzeImage,
  analyzeDimension: evaluateDimension,  // 4 个独立维度调用的入口
  evaluateAllDimensions: analyzeImage,   // 兼容旧接口
  CRITERIA,
  KEYWORDS,
  PROMPTS
};
