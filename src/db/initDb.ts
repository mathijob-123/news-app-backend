import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testDbConnection } from '../config/db.js';
import { CURRENT_USER, INITIAL_WALLET } from '../data/mockData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeDatabase() {
  console.log('[Database Init] Starting Supabase database setup...');
  
  const isConnected = await testDbConnection();
  if (!isConnected) {
    console.error('[Database Init Error] Could not connect to Supabase PostgreSQL. Please check your DATABASE_URL in backend/.env');
    process.exit(1);
  }

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('[Database Init] Executing schema.sql...');
    await pool.query(schemaSql);
    console.log('[Database Init] Tables and indexes created successfully!');

    // Seed default user if not exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [CURRENT_USER.id]);
    if (userCheck.rows.length === 0) {
      console.log('[Database Init] Seeding default user...');
      await pool.query(
        `INSERT INTO users (id, handle, display_name, avatar, bio, home_location, is_creator, creator_tier, trust_score, verified, follower_count, following_count, wallet_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          CURRENT_USER.id,
          CURRENT_USER.handle,
          CURRENT_USER.displayName,
          CURRENT_USER.avatar,
          CURRENT_USER.bio,
          JSON.stringify(CURRENT_USER.homeLocation),
          CURRENT_USER.isCreator,
          CURRENT_USER.creatorTier,
          CURRENT_USER.trustScore,
          CURRENT_USER.verified,
          CURRENT_USER.followerCount,
          CURRENT_USER.followingCount,
          CURRENT_USER.walletId
        ]
      );
    }

    // Seed default wallet if not exists
    const walletCheck = await pool.query('SELECT id FROM wallets WHERE id = $1', [INITIAL_WALLET.id]);
    if (walletCheck.rows.length === 0) {
      console.log('[Database Init] Seeding default wallet...');
      await pool.query(
        `INSERT INTO wallets (id, user_id, balance, lifetime_earnings, this_month_earnings, next_payout_date, payout_method, qualified_views_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          INITIAL_WALLET.id,
          INITIAL_WALLET.userId,
          INITIAL_WALLET.balance,
          INITIAL_WALLET.lifetimeEarnings,
          INITIAL_WALLET.thisMonthEarnings,
          INITIAL_WALLET.nextPayoutDate,
          INITIAL_WALLET.payoutMethod,
          INITIAL_WALLET.qualifiedViewsTotal
        ]
      );
    }

    console.log('[Database Init] Database initialized and seeded successfully!');
  } catch (err: any) {
    console.error('[Database Init Error]:', err.message);
  } finally {
    await pool.end();
  }
}

// Run directly if invoked from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeDatabase();
}
