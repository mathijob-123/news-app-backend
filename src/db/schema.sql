-- Spotlight PostgreSQL Database Schema (Supabase)

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  handle VARCHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT,
  role VARCHAR(32) DEFAULT 'user', -- 'user' | 'creator' | 'admin'
  google_id VARCHAR(128) UNIQUE,
  auth_provider VARCHAR(32) DEFAULT 'local', -- 'local' | 'google'
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
  copyright_strikes_count INTEGER DEFAULT 0,
  upload_blocked BOOLEAN DEFAULT FALSE,
  upload_blocked_reason TEXT,
  upload_blocked_at TIMESTAMPTZ,
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
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 6. Advertisements Table
CREATE TABLE IF NOT EXISTS advertisements (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  advertiser_name VARCHAR(128) NOT NULL,
  ad_type VARCHAR(32) NOT NULL DEFAULT 'image', -- 'image' | 'video' | 'banner'
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  target_url TEXT,
  call_to_action VARCHAR(64) DEFAULT 'Learn More',
  start_date VARCHAR(32) NOT NULL,
  end_date VARCHAR(32) NOT NULL,
  target_location JSONB NOT NULL DEFAULT '{"district":"All"}'::jsonb,
  position VARCHAR(64) NOT NULL DEFAULT 'interval_3', -- 'after_3' | 'after_5' | 'interval_3'
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' | 'inactive' | 'stopped'
  impressions INTEGER DEFAULT 0,
  reach_limit INTEGER DEFAULT NULL,
  auto_stop BOOLEAN DEFAULT TRUE,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. App Settings Table
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'editor', -- 'super_admin' | 'editor' | 'moderator' | 'ad_manager'
  status VARCHAR(32) DEFAULT 'active',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_status ON advertisements(status);
CREATE INDEX IF NOT EXISTS idx_ads_ad_type ON advertisements(ad_type);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);

-- 9. Social Media Imports Table
CREATE TABLE IF NOT EXISTS social_media_imports (
  id VARCHAR(64) PRIMARY KEY,
  platform VARCHAR(32) NOT NULL,
  source_handle VARCHAR(128) NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  source_avatar TEXT,
  source_url TEXT NOT NULL,
  external_post_id VARCHAR(128),
  media_type VARCHAR(32) NOT NULL DEFAULT 'video',
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  raw_title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  ai_headline TEXT,
  ai_summary TEXT,
  ai_category VARCHAR(64),
  ai_location JSONB,
  ai_keywords JSONB,
  ai_processed BOOLEAN DEFAULT false,
  is_duplicate BOOLEAN DEFAULT false,
  duplicate_score NUMERIC(5, 2) DEFAULT 0,
  duplicate_matched_post_id VARCHAR(64),
  duplicate_matched_title TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'staged_pending', -- 'staged_pending' | 'approved_published' | 'rejected'
  reviewed_by VARCHAR(128),
  reviewed_at TIMESTAMPTZ,
  published_post_id VARCHAR(64),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_imports_platform ON social_media_imports(platform);
CREATE INDEX IF NOT EXISTS idx_social_imports_status ON social_media_imports(status);
CREATE INDEX IF NOT EXISTS idx_social_imports_is_duplicate ON social_media_imports(is_duplicate);
CREATE INDEX IF NOT EXISTS idx_social_imports_imported_at ON social_media_imports(imported_at DESC);

-- 10. Copyright Reports Table
CREATE TABLE IF NOT EXISTS copyright_reports (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) REFERENCES video_posts(id) ON DELETE CASCADE,
  reporter_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  claimant_name VARCHAR(255) NOT NULL,
  claimant_email VARCHAR(255) NOT NULL,
  claimant_relation VARCHAR(64) DEFAULT 'owner',
  original_work_title TEXT NOT NULL,
  original_work_url TEXT,
  infringement_type VARCHAR(64) NOT NULL DEFAULT 'full_video',
  infringement_timestamp VARCHAR(64),
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'retracted'
  admin_notes TEXT,
  reviewed_by VARCHAR(128),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copyright_reports_post_id ON copyright_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_copyright_reports_status ON copyright_reports(status);
CREATE INDEX IF NOT EXISTS idx_copyright_reports_created_at ON copyright_reports(created_at DESC);

-- 11. Copyright Strikes Table (YouTube-style 3-Strike System)
CREATE TABLE IF NOT EXISTS copyright_strikes (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  report_id VARCHAR(64) REFERENCES copyright_reports(id) ON DELETE SET NULL,
  post_id VARCHAR(64),
  post_title TEXT,
  strike_number INTEGER NOT NULL, -- 1, 2, 3
  reason TEXT NOT NULL,
  claimant_name VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'revoked'
  expires_at TIMESTAMPTZ NOT NULL, -- 90 days expiration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copyright_strikes_user_id ON copyright_strikes(user_id);
CREATE INDEX IF NOT EXISTS idx_copyright_strikes_status ON copyright_strikes(status);
CREATE INDEX IF NOT EXISTS idx_copyright_strikes_expires_at ON copyright_strikes(expires_at);

-- 12. User Notifications Table
CREATE TABLE IF NOT EXISTS user_notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'copyright_strike',
  read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read ON user_notifications(read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC);

