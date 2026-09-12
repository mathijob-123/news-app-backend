-- Spotlight PostgreSQL Database Schema (Supabase)

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  handle VARCHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  avatar TEXT,
  bio TEXT,
  home_location JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_creator BOOLEAN DEFAULT TRUE,
  creator_tier VARCHAR(32) DEFAULT 'bronze',
  trust_score INTEGER DEFAULT 100,
  verified BOOLEAN DEFAULT FALSE,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  wallet_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(12, 2) DEFAULT 0.00,
  lifetime_earnings NUMERIC(12, 2) DEFAULT 0.00,
  this_month_earnings NUMERIC(12, 2) DEFAULT 0.00,
  next_payout_date VARCHAR(64) DEFAULT 'Not Scheduled',
  payout_method VARCHAR(128) DEFAULT 'UPI Direct (Not Linked)',
  qualified_views_total INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Video Posts Table
CREATE TABLE IF NOT EXISTS video_posts (
  id VARCHAR(64) PRIMARY KEY,
  creator_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  creator_name VARCHAR(128) NOT NULL,
  creator_handle VARCHAR(64) NOT NULL,
  creator_avatar TEXT,
  creator_verified BOOLEAN DEFAULT FALSE,
  type VARCHAR(32) DEFAULT 'video',
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  headline TEXT NOT NULL,
  caption TEXT,
  category VARCHAR(64) NOT NULL,
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_citation TEXT,
  duration_seconds INTEGER DEFAULT 0,
  status VARCHAR(32) DEFAULT 'published',
  view_count INTEGER DEFAULT 0,
  qualified_view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  is_breaking BOOLEAN DEFAULT FALSE,
  
  -- Admin Verification & Payout Engine
  admin_review_status VARCHAR(64) DEFAULT 'pending_review',
  admin_payout_amount NUMERIC(10, 2) DEFAULT 0.00,
  admin_bounty_awarded NUMERIC(10, 2) DEFAULT 0.00,
  admin_disbursed_date TIMESTAMPTZ,
  admin_reviewer_desk VARCHAR(128),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(64) PRIMARY KEY,
  wallet_id VARCHAR(64) REFERENCES wallets(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  related_post_id VARCHAR(64),
  related_post_title TEXT,
  status VARCHAR(32) DEFAULT 'completed',
  method VARCHAR(128),
  admin_desk VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) REFERENCES video_posts(id) ON DELETE CASCADE,
  user_handle VARCHAR(64) NOT NULL,
  user_name VARCHAR(128) NOT NULL,
  user_avatar TEXT,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_category ON video_posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_status ON video_posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON video_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
