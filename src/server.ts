import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiRouter } from './routes/api.js';
import { testDbConnection } from './config/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Mount API routes under /api
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
    await testDbConnection();
  });
}

export default app;
