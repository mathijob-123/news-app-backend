import { pool } from '../config/db.js';
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

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

        -- Ensure video_posts has price_award and rpm_rate columns
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS price_award NUMERIC(10, 2) DEFAULT 0.00;
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS rpm_rate NUMERIC(10, 2) DEFAULT 350.00;
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS admin_reviewer_desk VARCHAR(128);
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS admin_disbursed_date TIMESTAMPTZ;
        ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      `);
      console.log('[Auth Migration] Schema altered successfully (auth columns, video_posts columns & indexes ensured).');

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
