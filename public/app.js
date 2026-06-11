// ============ 全局状态 ============
const state = {
  display: { files: [], result: null, analyzing: false },
  appearance: { files: [], result: null, analyzing: false },
  resource: { files: [], result: null, analyzing: false }
};

let resultId = null;

// ============ DOM 元素 ============
const dimensions = ['display', 'appearance', 'resource'];

// ============ 工具函数 ============

// 压缩图片到指定最大宽度，避免 Ollama 处理大图失败
function compressImage(file, maxWidth = 1024, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 如果图片本就不大（<500KB 且 宽度 ≤ 1024），直接返回
        if (file.size < 500 * 1024 && img.width <= maxWidth) {
          resolve(file);
          return;
        }
        // 计算压缩后尺寸
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        // canvas 重绘压缩
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          // 保留原文件名，后缀改为 .jpg
          const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], newName, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function showError(message) {
  const toast = document.getElementById('errorToast');
  const msg = document.getElementById('errorMessage');
  msg.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function ratingClass(rating) {
  return {
    '好': 'good',
    '较好': 'fair',
    '一般': 'poor',
    '差': 'worst'
  }[rating] || 'fair';
}

function updateSummary() {
  const results = dimensions.map(d => state[d].result);
  if (results.every(r => r === null)) {
    document.getElementById('summarySection').style.display = 'none';
    document.getElementById('shareBtn').disabled = true;
    return;
  }

  document.getElementById('summarySection').style.display = 'block';
  document.getElementById('shareBtn').disabled = false;

  // 3 维度评分
  dimensions.forEach(d => {
    const result = state[d].result;
    const el = document.getElementById(`summary${d.charAt(0).toUpperCase() + d.slice(1)}`);
    if (result) {
      el.innerHTML = `<span class="rating-badge ${ratingClass(result.rating)}">${result.rating}</span>`;
    } else {
      el.textContent = '（未评价）';
    }
  });

  // 综合评价文字
  const rated = results.filter(r => r !== null);
  const goodCount = rated.filter(r => r.rating === '好').length;
  if (goodCount >= 3) {
    document.getElementById('summaryText').textContent = `店铺整体表现优秀（${goodCount}项"好"），继续保持！`;
  } else if (goodCount >= 1) {
    document.getElementById('summaryText').textContent = `店铺整体表现良好（${goodCount}项"好"），有提升空间。`;
  } else if (rated.length > 0) {
    document.getElementById('summaryText').textContent = `店铺整体表现一般，建议优化陈列。`;
  }
}

// ============ 4 个维度的通用逻辑 ============

function setupDimension(type) {
  const dropZone = document.getElementById(`${type}DropZone`);
  const fileInput = document.getElementById(`${type}FileInput`);
  const previewEl = document.getElementById(`${type}Preview`);
  const analyzeBtn = document.getElementById(`${type}AnalyzeBtn`);
  const clearBtn = document.getElementById(`${type}ClearBtn`);
  const ratingEl = document.getElementById(`${type}Rating`);
  const resultEl = document.getElementById(`${type}Result`);
  const reasonEl = document.getElementById(`${type}Reason`);

  // 点击上传
  dropZone.addEventListener('click', () => fileInput.click());

  // 文件选择
  fileInput.addEventListener('change', (e) => {
    handleFiles(type, Array.from(e.target.files));
    fileInput.value = '';
  });

  // 拖拽
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    handleFiles(type, files);
  });

  // 分析按钮
  analyzeBtn.addEventListener('click', () => analyzeDimension(type));

  // 清空按钮
  clearBtn.addEventListener('click', () => clearDimension(type));

  function handleFiles(type, files) {
    if (files.length === 0) return;
    const validTypes = ['image/jpeg', 'image/png'];  // 不支持 webp
    const validFiles = files.filter(f => validTypes.includes(f.type));
    if (validFiles.length !== files.length) {
      showError('只支持 JPG、PNG 格式（webp 格式不被 AI 识别）');
    }
    validFiles.forEach(f => {
      if (f.size > 10 * 1024 * 1024) {
        showError(`图片 ${f.name} 超过 10MB，已跳过`);
        return;
      }
      // 压缩图片到 1024px 宽、质量 0.85，避免 Ollama 解析失败
      compressImage(f, 1024, 0.85).then(compressed => {
        state[type].files.push({ file: compressed, preview: URL.createObjectURL(compressed) });
        renderPreview();
      });
    });
    state[type].result = null; // 新图片重置结果
    ratingEl.style.display = 'none';
    resultEl.style.display = 'none';
    renderPreview();
  }

  function renderPreview() {
    const files = state[type].files;
    previewEl.innerHTML = '';
    files.forEach((f, i) => {
      const div = document.createElement('div');
      div.className = 'preview-item';
      div.innerHTML = `
        <img src="${f.preview}" alt="预览${i+1}">
        <button class="preview-remove" data-index="${i}">×</button>
      `;
      div.querySelector('.preview-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        state[type].files.splice(i, 1);
        renderPreview();
        updateButtons();
      });
      previewEl.appendChild(div);
    });
    updateButtons();
  }

  function updateButtons() {
    const fileCount = state[type].files.length;
    analyzeBtn.disabled = fileCount === 0 || state[type].analyzing;
    clearBtn.style.display = fileCount > 0 ? 'inline-block' : 'none';
    dropZone.style.display = fileCount > 0 ? 'none' : 'block';
  }

  async function analyzeDimension(type) {
    if (state[type].files.length === 0) {
      showError(`请先上传${getDimensionName(type)}照片`);
      return;
    }
    state[type].analyzing = true;
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '⏳ 分析中...';
    ratingEl.style.display = 'none';
    resultEl.style.display = 'none';

    try {
      const formData = new FormData();
      state[type].files.forEach(f => formData.append('images', f.file));

      // 增加超时控制（首次评价可能 30+ 秒）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 秒超时

      let response;
      try {
        response = await fetch(`/api/analyze/${type}`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('评价超时（超过 120 秒）。AI 推理较慢，请重试或检查 Ollama');
        }
        throw new Error('网络错误：' + fetchErr.message);
      }
      clearTimeout(timeoutId);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '分析失败');
      }

      state[type].result = data.data;
      if (!resultId) resultId = data.resultId;
      
      // 显示评分
      ratingEl.textContent = data.data.rating;
      ratingEl.className = `rating-badge ${ratingClass(data.data.rating)}`;
      ratingEl.style.display = 'inline-block';
      reasonEl.textContent = data.data.reason || '';
      resultEl.style.display = 'block';

      // 显示人工反馈区域 + 预填 AI 原评
      const feedbackArea = document.getElementById(`${type}Feedback`);
      if (feedbackArea) {
        feedbackArea.style.display = 'block';
        const hrSelect = document.getElementById(`${type}HumanRating`);
        const hrInput = document.getElementById(`${type}HumanReason`);
        if (hrSelect) hrSelect.value = data.data.rating;
        if (hrInput) hrInput.value = '';
        feedbackArea.dataset.aiRating = data.data.rating;
        feedbackArea.dataset.aiReason = data.data.reason || '';
      }

      updateSummary();
    } catch (error) {
      showError(error.message);
    } finally {
      state[type].analyzing = false;
      analyzeBtn.textContent = `${getIcon(type)} 分析${getDimensionName(type)}`;
      updateButtons();
    }
  }

  function clearDimension(type) {
    state[type].files = [];
    state[type].result = null;
    ratingEl.style.display = 'none';
    resultEl.style.display = 'none';
    const fb = document.getElementById(`${type}Feedback`);
    if (fb) fb.style.display = 'none';
    renderPreview();
    updateSummary();
  }
}

function getDimensionName(type) {
  return { display: '陈列效果', appearance: '店容店貌', resource: '陈列资源' }[type];
}

function getIcon(type) {
  return { display: '🎨', appearance: '🏪', resource: '🗄️' }[type];
}

// ============ 初始化所有维度 ============
dimensions.forEach(setupDimension);

// ============ 人工反馈按钮 ============
document.querySelectorAll('.btn-feedback').forEach(btn => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.type;
    const fbArea = document.getElementById(`${type}Feedback`);
    const aiRating = fbArea.dataset.aiRating;
    const aiReason = fbArea.dataset.aiReason;
    const humanRating = document.getElementById(`${type}HumanRating`).value;
    const humanReason = document.getElementById(`${type}HumanReason`).value.trim() || '人工校正';

    if (humanRating === aiRating && humanReason === aiReason) {
      showError('校正结果与 AI 评价相同，无需提交');
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ 提交中...';

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimension: type,
          aiRating,
          aiReason,
          humanRating,
          humanReason
        })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      btn.textContent = '✅ 已记录，AI 下次会参考';
      btn.style.background = '#10b981';

      // 1.5 秒后清空该维度（图片 + 结果 + 校正 UI），准备评价下一张图
      setTimeout(() => {
        const dim = state[type];
        if (dim) {
          dim.files = [];
          dim.result = null;
        }
        ratingEl.style.display = 'none';
        resultEl.style.display = 'none';
        const fb = document.getElementById(type + 'Feedback');
        if (fb) {
          fb.style.display = 'none';
          // 关闭 details 折叠
          const det = fb.querySelector('details');
          if (det) det.open = false;
        }
        previewEl.innerHTML = '';
        document.getElementById(type + 'DropZone').style.display = 'block';
        document.getElementById(type + 'ClearBtn').style.display = 'none';
        document.getElementById(type + 'AnalyzeBtn').disabled = true;
        updateSummary();

        // 恢复按钮
        btn.disabled = false;
        btn.textContent = '提交校正';
        btn.style.background = '';
      }, 1500);
    } catch (error) {
      showError(error.message);
      btn.disabled = false;
      btn.textContent = '提交校正';
    }
  });
});

// ============ 全局按钮 ============
document.getElementById('resetAllBtn').addEventListener('click', () => {
  if (!confirm('确定要清空所有数据和结果吗？')) return;
  dimensions.forEach(d => {
    state[d].files = [];
    state[d].result = null;
    document.getElementById(`${d}Rating`).style.display = 'none';
    document.getElementById(`${d}Result`).style.display = 'none';
    document.getElementById(`${d}Preview`).innerHTML = '';
    document.getElementById(`${d}DropZone`).style.display = 'block';
    document.getElementById(`${d}ClearBtn`).style.display = 'none';
    document.getElementById(`${d}AnalyzeBtn`).disabled = true;
  });
  resultId = null;
  document.getElementById('summarySection').style.display = 'none';
  document.getElementById('shareBtn').disabled = true;
  document.getElementById('shareSection').style.display = 'none';
});

document.getElementById('shareBtn').addEventListener('click', async () => {
  if (!resultId) return;
  try {
    const response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultId })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || '生成分享链接失败');
    const shareUrl = `${window.location.origin}/share/${data.data.shareId}`;
    document.getElementById('shareLinkInput').value = shareUrl;
    document.getElementById('shareSection').style.display = 'block';
  } catch (error) {
    showError(error.message);
  }
});

document.getElementById('copyLinkBtn').addEventListener('click', () => {
  const link = document.getElementById('shareLinkInput').value;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById('copyLinkBtn');
    btn.textContent = '已复制!';
    setTimeout(() => { btn.textContent = '复制'; }, 2000);
  }).catch(() => showError('复制失败，请手动复制'));
});
