import { pool } from '../config/db.js';
import { INITIAL_ADVERTISEMENTS, INITIAL_SOCIAL_IMPORTS } from '../data/mockData.js';
import dotenv from 'dotenv';

dotenv.config();

export async function runAuthMigration(): Promise<boolean> {
  const adminEmail = (process.env.ADMIN_EMAIL || 'jrinfotechponneri@gmail.com').toLowerCase().trim();
  console.log(`[Auth Migration] Running Supabase migration with SuperAdmin email: ${adminEmail}...`);

  try {
    const client = await pool.connect();
    try {
      // 1. Add authentication columns to public.users table if they do not exist
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'user';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128) UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32) DEFAULT 'local';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS copyright_strikes_count INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS upload_blocked BOOLEAN DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS upload_blocked_reason TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS upload_blocked_at TIMESTAMPTZ;

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

        -- Ensure video_posts has price_award and rpm_rate columns
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS price_award NUMERIC(10, 2) DEFAULT 0.00;
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS rpm_rate NUMERIC(10, 2) DEFAULT 350.00;
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS admin_reviewer_desk VARCHAR(128);
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS admin_disbursed_date TIMESTAMPTZ;
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

        -- Ensure advertisements table exists
        CREATE TABLE IF NOT EXISTS advertisements (
          id VARCHAR(64) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          advertiser_name VARCHAR(255) NOT NULL,
          ad_type VARCHAR(32) NOT NULL DEFAULT 'image',
          media_url TEXT NOT NULL,
          thumbnail_url TEXT,
          target_url TEXT NOT NULL,
          call_to_action VARCHAR(64) DEFAULT 'Learn More',
          start_date TIMESTAMPTZ NOT NULL,
          end_date TIMESTAMPTZ NOT NULL,
          target_location JSONB DEFAULT '{"district":"All","taluk":"All","area":"All"}'::jsonb,
          position VARCHAR(64) NOT NULL DEFAULT 'after_3',
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          impressions INTEGER DEFAULT 0,
          reach_limit INTEGER DEFAULT NULL,
          auto_stop BOOLEAN DEFAULT TRUE,
          clicks INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Ensure reach_limit and auto_stop columns exist on advertisements table
        ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS reach_limit INTEGER DEFAULT NULL;
        ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS auto_stop BOOLEAN DEFAULT TRUE;

        -- Ensure social_media_imports table exists
        CREATE TABLE IF NOT EXISTS social_media_imports (
          id VARCHAR(64) PRIMARY KEY,
          platform VARCHAR(32) NOT NULL,
          source_handle VARCHAR(128) NOT NULL,
          source_name VARCHAR(255) NOT NULL,
          source_avatar TEXT,
          source_url TEXT NOT NULL,
          raw_title TEXT NOT NULL,
          raw_content TEXT NOT NULL,
          media_type VARCHAR(32) NOT NULL DEFAULT 'video',
          media_url TEXT NOT NULL,
          thumbnail_url TEXT,
          external_published_at TIMESTAMPTZ NOT NULL,
          fetched_at TIMESTAMPTZ DEFAULT NOW(),
          is_duplicate BOOLEAN DEFAULT FALSE,
          duplicate_of_id VARCHAR(64),
          duplicate_score NUMERIC(5, 2) DEFAULT 0.00,
          ai_headline TEXT,
          ai_summary TEXT,
          ai_category VARCHAR(64),
          ai_location JSONB,
          status VARCHAR(32) NOT NULL DEFAULT 'staged_pending',
          published_post_id VARCHAR(64),
          rejection_reason TEXT,
          reviewed_by VARCHAR(128),
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_social_imports_status ON social_media_imports(status);
        CREATE INDEX IF NOT EXISTS idx_social_imports_platform ON social_media_imports(platform);
        CREATE INDEX IF NOT EXISTS idx_social_imports_duplicate ON social_media_imports(is_duplicate);

        -- Ensure all required columns exist on social_media_imports
        ALTER TABLE social_media_imports ADD COLUMN IF NOT EXISTS external_post_id VARCHAR(128);
        ALTER TABLE social_media_imports ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE social_media_imports ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE social_media_imports ADD COLUMN IF NOT EXISTS ai_keywords JSONB;
        ALTER TABLE social_media_imports ADD COLUMN IF NOT EXISTS ai_processed BOOLEAN DEFAULT false;
        ALTER TABLE social_media_imports ADD COLUMN IF NOT EXISTS duplicate_matched_post_id VARCHAR(64);
        ALTER TABLE social_media_imports ADD COLUMN IF NOT EXISTS duplicate_matched_title TEXT;
        ALTER TABLE social_media_imports ALTER COLUMN external_published_at DROP NOT NULL;

        -- Ensure copyright_reports table exists
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
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          admin_notes TEXT,
          reviewed_by VARCHAR(128),
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_copyright_reports_post_id ON copyright_reports(post_id);
        CREATE INDEX IF NOT EXISTS idx_copyright_reports_status ON copyright_reports(status);
        CREATE INDEX IF NOT EXISTS idx_copyright_reports_created_at ON copyright_reports(created_at DESC);

        -- Ensure copyright_strikes table exists
        CREATE TABLE IF NOT EXISTS copyright_strikes (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
          report_id VARCHAR(64) REFERENCES copyright_reports(id) ON DELETE SET NULL,
          post_id VARCHAR(64),
          post_title TEXT,
          strike_number INTEGER NOT NULL,
          reason TEXT NOT NULL,
          claimant_name VARCHAR(255),
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_copyright_strikes_user_id ON copyright_strikes(user_id);
        CREATE INDEX IF NOT EXISTS idx_copyright_strikes_status ON copyright_strikes(status);
        CREATE INDEX IF NOT EXISTS idx_copyright_strikes_expires_at ON copyright_strikes(expires_at);

        -- Ensure user_notifications table exists
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

        -- Ensure app_settings table exists
        CREATE TABLE IF NOT EXISTS app_settings (
          key VARCHAR(64) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('[Auth Migration] Schema altered successfully (auth columns, video_posts columns, ads, social_media_imports, copyright, notifications & app_settings ensured).');

      // Ensure existing users have onboarding_completed = true
      await client.query(`UPDATE users SET onboarding_completed = true WHERE onboarding_completed IS NULL OR role = 'admin' OR id IN ('usr_admin_jr', 'usr_tn_001')`);

      // 2. Check if SuperAdmin already exists
      const existingAdmin = await client.query('SELECT * FROM users WHERE email = $1 OR id = $2', [adminEmail, 'usr_admin_jr']);

      if (existingAdmin.rows.length === 0) {
        console.log(`[Auth Migration] Seeding initial SuperAdmin account for ${adminEmail}...`);
        await client.query(`
          INSERT INTO users (
            id, handle, display_name, email, role, auth_provider,
            avatar, bio, home_location, is_creator, creator_tier,
            trust_score, verified, follower_count, following_count, wallet_id, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, NOW(), NOW()
          )
        `, [
          'usr_admin_jr',
          'admin_ponneri',
          'Chief Bureau Editor',
          adminEmail,
          'admin',
          'google',
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
          'Editorial Bureau Chief & SuperAdmin at Spotlight News.',
          JSON.stringify({ lat: 13.0827, lng: 80.2707, placeName: 'Chennai Bureau HQ', district: 'Chennai' }),
          true,
          'gold',
          100,
          true,
          1250,
          45,
          'wal_admin_jr'
        ]);

        // Seed wallet for SuperAdmin
        await client.query(`
          INSERT INTO wallets (
            id, user_id, balance, lifetime_earnings, this_month_earnings,
            next_payout_date, payout_method, qualified_views_total, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, NOW()
          ) ON CONFLICT (id) DO NOTHING
        `, [
          'wal_admin_jr',
          'usr_admin_jr',
          50000.00,
          125000.00,
          18500.00,
          'Instant Direct Bank Transfer',
          'UPI Direct (Verified)',
          245000
        ]);
        console.log('[Auth Migration] SuperAdmin and Admin Wallet seeded in Supabase!');
      } else {
        // Ensure the existing user has role 'admin'
        await client.query(`UPDATE users SET role = 'admin', email = COALESCE(email, $1) WHERE id = $2 OR email = $1`, [adminEmail, existingAdmin.rows[0].id]);
        console.log(`[Auth Migration] Existing user ${existingAdmin.rows[0].id} updated with SuperAdmin role ('admin').`);
      }

      // Also ensure default citizen reporter has an email if null
      await client.query(`UPDATE users SET email = 'citizen@spotlight.local', role = 'creator' WHERE id = 'usr_tn_001' AND email IS NULL`);

      // Seed initial advertisements if table is empty
      try {
        const existingAds = await client.query('SELECT count(*) FROM advertisements');
        if (parseInt(existingAds.rows[0].count, 10) === 0) {
          console.log('[Auth Migration] Seeding initial advertisements...');
          for (const ad of INITIAL_ADVERTISEMENTS) {
            await client.query(`
              INSERT INTO advertisements (
                id, title, advertiser_name, ad_type, media_url, thumbnail_url,
                target_url, call_to_action, start_date, end_date, target_location,
                position, status, impressions, clicks, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
              ON CONFLICT (id) DO NOTHING
            `, [
              ad.id, ad.title, ad.advertiserName, ad.adType, ad.mediaUrl, ad.thumbnailUrl,
              ad.targetUrl, ad.callToAction, ad.startDate, ad.endDate, JSON.stringify(ad.targetLocation),
              ad.position, ad.status, ad.impressions, ad.clicks
            ]);
          }
        }
      } catch (adErr: any) {
        console.warn('[Auth Migration Ads Seed Warning]:', adErr.message);
      }

      // Seed initial social media imports if table is empty
      try {
        const existingSocials = await client.query('SELECT count(*) FROM social_media_imports');
        if (parseInt(existingSocials.rows[0].count, 10) === 0) {
          console.log('[Auth Migration] Seeding initial social media dispatches...');
          for (const s of INITIAL_SOCIAL_IMPORTS) {
            await client.query(`
              INSERT INTO social_media_imports (
                id, platform, source_handle, source_name, source_avatar, source_url, external_post_id,
                media_type, media_url, thumbnail_url, raw_title, raw_content, published_at, imported_at,
                ai_headline, ai_summary, ai_category, ai_location, ai_keywords, ai_processed,
                is_duplicate, duplicate_score, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
              ON CONFLICT (id) DO NOTHING
            `, [
              s.id, s.platform, s.sourceHandle, s.sourceName, s.sourceAvatar, s.sourceUrl, s.externalPostId,
              s.mediaType, s.mediaUrl, s.thumbnailUrl, s.rawTitle, s.rawContent, s.publishedAt, s.importedAt,
              s.aiHeadline, s.aiSummary, s.aiCategory, JSON.stringify(s.aiLocation), JSON.stringify(s.aiKeywords || []),
              s.aiProcessed, s.isDuplicate, s.duplicateScore, s.status
            ]);
          }
        }
      } catch (socErr: any) {
        console.warn('[Auth Migration Socials Seed Warning]:', socErr.message);
      }

      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[Auth Migration Error]:', err.message);
    return false;
  }
}

// Allow direct execution from CLI
if (process.argv[1]?.endsWith('authMigration.ts') || process.argv[1]?.endsWith('authMigration.js')) {
  runAuthMigration().then((success) => {
    console.log('[Auth Migration] Finished. Success:', success);
    process.exit(success ? 0 : 1);
  });
}
