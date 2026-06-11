# 店铺陈列AI评价系统 - Supabase部署版本

## 一键部署说明

### 准备工作 (5分钟)

1. **注册 Supabase**（免费）
   - 访问 https://supabase.com
   - 用邮箱注册一个账号
   - 创建新项目，记住 `Project URL` 和 `anon public` key

2. **注册 MiniMax API**（免费）
   - 访问 https://platform.minimax.chat
   - 注册后获取 API Key

### 部署步骤

#### 步骤1: 创建Supabase数据库

1. 登录 Supabase 后，进入你的项目
2. 点击左侧 **SQL Editor**
3. 复制以下SQL并运行：

```sql
-- 创建用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建门店评价记录表
CREATE TABLE store_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  image_url TEXT NOT NULL,
  display_rating TEXT,
  display_reason TEXT,
  display_details JSONB,
  appearance_rating TEXT,
  appearance_reason TEXT,
  appearance_details JSONB,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_reviews ENABLE ROW LEVEL SECURITY;

-- 创建访问策略
CREATE POLICY "Users can read own data" ON store_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own data" ON store_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own profile" ON users FOR SELECT USING (auth.uid() = id);
```

#### 步骤2: 部署前端

1. 注册 Vercel：https://vercel.com
2. 点击 "Add New Project" → "Import GitHub Repository"
3. 如果没有GitHub，可以直接上传本项目文件夹
4. 在 Environment Variables 中添加：
   - `VITE_SUPABASE_URL` = 你的Supabase项目URL
   - `VITE_SUPABASE_ANON_KEY` = 你的Supabase anon key
   - `VITE_AI_API_KEY` = 你的MiniMax API Key
5. 点击 Deploy

#### 步骤3: 使用

- 部署完成后，Vercel会给你一个网址
- 用这个网址分享给150位客户经理
- 每个人用邮箱注册后即可使用

## 功能说明

✅ **用户登录** - 邮箱注册/登录，数据隔离
✅ **图片上传** - 拖拽或点击上传店铺照片
✅ **AI评价** - 自动分析陈列效果和店容店貌
✅ **历史记录** - 查看自己上传的所有门店评价
✅ **分享** - 生成分享链接供其他人查看

## 评价标准

### 陈列效果
- **好**: 有固定陈列专区并定期更新主题，创意陈列元素多，生动化陈列好
- **较好**: 有相对固定陈列专区，有零星创意陈列、生动化陈列元素
- **一般**: 无固定主题陈列专区

### 店容店貌
- **好**: 有店招且醒目，商品陈列整齐有序，规范亮证经营，美观整洁
- **较好**: 有店招较为醒目，商品陈列较为整齐，能亮证经营
- **一般**: 无店招，整体环境一般，陈列杂乱