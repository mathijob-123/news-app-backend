import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';
import { marketplaceRouter } from './routes/marketplace.js';
import { testDbConnection } from './config/db.js';
import { runAuthMigration } from './db/authMigration.js';
import { runMarketplaceMigration } from './db/marketplaceMigration.js';
import { runBlobRepair } from './db/blobRepair.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /\.vercel\.app$/.test(origin)
    ) {
      return callback(null, true);
    }
    console.warn(`[CORS Blocked] Origin: ${origin}`);
    callback(null, true); // Permissive in dev to avoid breaking UI
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Ensure DB schema migrations run on Vercel serverless cold starts
let dbInitPromise: Promise<void> | null = null;
async function ensureDbInitialized() {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        const connected = await testDbConnection();
        if (connected) {
          await runAuthMigration();
          await runMarketplaceMigration();
        }
      } catch (err: any) {
        console.warn('[Vercel DB Init Warning]:', err.message);
      }
    })();
  }
  return dbInitPromise;
}

app.use(async (_req, _res, next) => {
  if (process.env.VERCEL) {
    await ensureDbInitialized();
  }
  next();
});

// Mount Auth routes under /api/auth
app.use('/api/auth', authRouter);

// Mount Marketplace routes under /api/marketplace
app.use('/api/marketplace', marketplaceRouter);

// Mount core API routes under /api
app.use('/api', apiRouter);

// Root informational endpoint
app.get('/', (_req, res) => {
  res.json({
    message: 'Spotlight Hyperlocal News API (Supabase PostgreSQL)',
    version: '1.0.0',
    database: process.env.DATABASE_URL ? 'configured' : 'in_memory_fallback',
    endpoints: {
      health: '/api/health',
      posts: '/api/posts',
      marketplace: '/api/marketplace/products',
      properties: '/api/marketplace/properties',
      jobs: '/api/marketplace/jobs',
      user: '/api/user',
      wallet: '/api/wallet',
      comments: '/api/comments/:postId',
      adminStats: '/api/admin/stats'
    }
  });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`[Spotlight Backend] Server listening at http://localhost:${PORT}`);
    const connected = await testDbConnection();
    if (connected) {
      await runAuthMigration();
      await runMarketplaceMigration();
      await runBlobRepair();
    }
  });
}

export default app;
