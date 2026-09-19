import { Router, Request, Response } from 'express';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool } from '../config/db.js';
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, isR2Configured } from '../config/r2.js';
import { CURRENT_USER, INITIAL_POSTS, INITIAL_WALLET, INITIAL_TRANSACTIONS, INITIAL_COMMENTS } from '../data/mockData.js';
import type { VideoPost, User, Wallet, Transaction, Comment, AdminStats } from '../types.js';

export const apiRouter = Router();

// Fallback in-memory store if DB is disconnected
let memPosts: VideoPost[] = [...INITIAL_POSTS];
let memUser: User = { ...CURRENT_USER };
let memWallet: Wallet = { ...INITIAL_WALLET };
let memTransactions: Transaction[] = [...INITIAL_TRANSACTIONS];
let memComments: Record<string, Comment[]> = { ...INITIAL_COMMENTS };

// Helper to check if DB is configured
const hasDb = Boolean(process.env.DATABASE_URL);

// Row mappers
function mapPostRow(row: any): VideoPost {
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    creatorHandle: row.creator_handle,
    creatorAvatar: row.creator_avatar,
    creatorVerified: row.creator_verified,
    type: row.type,
    mediaUrl: row.media_url,
    thumbnailUrl: row.thumbnail_url,
    headline: row.headline,
    caption: row.caption,
    category: row.category,
    location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location,
    sourceCitation: row.source_citation,
    durationSeconds: Number(row.duration_seconds || 0),
    status: row.status,
    viewCount: Number(row.view_count || 0),
    qualifiedViewCount: Number(row.qualified_view_count || 0),
    likeCount: Number(row.like_count || 0),
    commentCount: Number(row.comment_count || 0),
    shareCount: Number(row.share_count || 0),
    isBreaking: row.is_breaking,
    adminReviewStatus: row.admin_review_status,
    adminPayoutAmount: Number(row.admin_payout_amount || 0),
    priceAward: Number(row.price_award || row.admin_payout_amount || 0),
    rpmRate: Number(row.rpm_rate || 350.0),
    adminBountyAwarded: Number(row.admin_bounty_awarded || 0),
    adminDisbursedDate: row.admin_disbursed_date,
    adminReviewerDesk: row.admin_reviewer_desk,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at
  };
}

function mapUserRow(row: any): User {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    email: row.email || undefined,
    role: (row.role as any) || 'user',
    authProvider: (row.auth_provider as any) || 'local',
    avatar: row.avatar,
    bio: row.bio,
    homeLocation: typeof row.home_location === 'string' ? JSON.parse(row.home_location) : row.home_location,
    isCreator: row.is_creator,
    creatorTier: row.creator_tier,
    trustScore: Number(row.trust_score || 100),
    verified: row.verified,
    followerCount: Number(row.follower_count || 0),
    followingCount: Number(row.following_count || 0),
    walletId: row.wallet_id
  };
}

function mapWalletRow(row: any): Wallet {
  return {
    id: row.id,
    userId: row.user_id,
    balance: Number(row.balance || 0),
    lifetimeEarnings: Number(row.lifetime_earnings || 0),
    thisMonthEarnings: Number(row.this_month_earnings || 0),
    nextPayoutDate: row.next_payout_date,
    payoutMethod: row.payout_method,
    qualifiedViewsTotal: Number(row.qualified_views_total || 0)
  };
}

function mapTransactionRow(row: any): Transaction {
  return {
    id: row.id,
    walletId: row.wallet_id,
    type: row.type,
    amount: Number(row.amount || 0),
    relatedPostId: row.related_post_id,
    relatedPostTitle: row.related_post_title,
    status: row.status,
    method: row.method,
    adminDesk: row.admin_desk,
    createdAt: row.created_at
  };
}

// Health check
apiRouter.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'unconfigured';
  if (hasDb) {
    try {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err: any) {
      dbStatus = `error: ${err.message}`;
    }
  }
  res.json({
    status: 'ok',
    database: dbStatus,
    r2Storage: isR2Configured ? 'configured' : 'missing_credentials',
    r2Bucket: R2_BUCKET_NAME,
    timestamp: new Date().toISOString()
  });
});

// --- CLOUDFLARE R2 UPLOAD ROUTES ---
apiRouter.post('/upload/presign', async (req: Request, res: Response) => {
  try {
    const { filename, contentType, folder = 'videos' } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ success: false, error: 'filename and contentType are required' });
    }

    if (!isR2Configured) {
      return res.status(503).json({
        success: false,
        error: 'Cloudflare R2 is not fully configured. Please set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in backend/.env'
      });
    }

    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const ext = cleanFilename.includes('.') ? cleanFilename.split('.').pop() : 'mp4';
    const key = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    // Presigned PUT URL valid for 15 minutes (900 seconds)
    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });
    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}` : `https://${R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    return res.json({
      success: true,
      uploadUrl,
      publicUrl,
      key
    });
  } catch (error: any) {
    console.error('[R2 Presign Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Direct server-side upload to R2 (bypasses browser CORS completely)
apiRouter.post('/upload/direct', async (req: Request, res: Response) => {
  try {
    const { filename, contentType, fileBase64, folder = 'reports' } = req.body;
    if (!filename || !contentType || !fileBase64) {
      return res.status(400).json({ success: false, error: 'filename, contentType, and fileBase64 are required' });
    }

    if (!isR2Configured) {
      return res.status(503).json({
        success: false,
        error: 'Cloudflare R2 is not fully configured in backend/.env'
      });
    }

    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const ext = cleanFilename.includes('.') ? cleanFilename.split('.').pop() : (contentType.startsWith('video') ? 'mp4' : 'jpg');
    const key = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType
      })
    );

    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
      : `https://${R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    console.log(`[R2 Direct Upload] File uploaded: ${publicUrl} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    return res.json({
      success: true,
      publicUrl,
      key,
      sizeBytes: buffer.length
    });
  } catch (error: any) {
    console.error('[R2 Direct Upload Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- POSTS ROUTES ---
apiRouter.get('/posts', async (_req: Request, res: Response) => {
  if (hasDb) {
    try {
      const result = await pool.query('SELECT * FROM video_posts ORDER BY created_at DESC');
      const posts = result.rows.map(mapPostRow);
      return res.json({ success: true, count: posts.length, data: posts, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Query Warning] Falling back to in-memory posts:', err.message);
    }
  }
  res.json({ success: true, count: memPosts.length, data: memPosts, source: 'in_memory' });
});

apiRouter.post('/posts', async (req: Request, res: Response) => {
  const p: VideoPost = req.body;
  if (!p.id) p.id = `post_${Date.now()}`;
  if (!p.createdAt) p.createdAt = new Date().toISOString();
  // Every post is sent as a request to the admin before posted public
  p.status = p.status || 'in_review';
  p.adminReviewStatus = p.adminReviewStatus || 'pending_review';
  p.priceAward = p.priceAward || 0;
  p.rpmRate = p.rpmRate || 0;

  // Always keep memPosts updated so fast lookups and in-memory fallbacks work
  const mIdx = memPosts.findIndex((item) => item.id === p.id);
  if (mIdx >= 0) {
    memPosts[mIdx] = { ...memPosts[mIdx], ...p };
  } else {
    memPosts.unshift(p);
  }

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO video_posts (
          id, creator_id, creator_name, creator_handle, creator_avatar, creator_verified,
          type, media_url, thumbnail_url, headline, caption, category, location,
          source_citation, duration_seconds, status, is_breaking, admin_review_status,
          admin_payout_amount, price_award, rpm_rate, admin_bounty_awarded, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        ) ON CONFLICT (id) DO UPDATE SET
          headline = EXCLUDED.headline,
          caption = EXCLUDED.caption,
          status = EXCLUDED.status,
          admin_review_status = EXCLUDED.admin_review_status,
          price_award = EXCLUDED.price_award,
          rpm_rate = EXCLUDED.rpm_rate,
          updated_at = NOW()`,
        [
          p.id, p.creatorId || 'usr_tn_001', p.creatorName, p.creatorHandle, p.creatorAvatar, p.creatorVerified || false,
          p.type || 'video', p.mediaUrl, p.thumbnailUrl, p.headline, p.caption, p.category, JSON.stringify(p.location),
          p.sourceCitation || null, p.durationSeconds || 0, p.status, p.isBreaking || false,
          p.adminReviewStatus, p.adminPayoutAmount || 0, p.priceAward || 0, p.rpmRate || 350, p.adminBountyAwarded || 0, p.createdAt
        ]
      );
      return res.status(201).json({ success: true, data: p, source: 'supabase_postgres' });
    } catch (err: any) {
      console.error('[DB Insert Error] Falling back to in-memory:', err.message);
    }
  }

  res.status(201).json({ success: true, data: p, source: 'in_memory' });
});

apiRouter.get('/posts/:id', async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  if (hasDb) {
    try {
      const result = await pool.query('SELECT * FROM video_posts WHERE id = $1', [postId]);
      if (result.rows.length > 0) {
        return res.json({ success: true, data: mapPostRow(result.rows[0]) });
      }
    } catch (err: any) {
      console.warn('[DB Error]:', err.message);
    }
  }
  const post = memPosts.find((p) => p.id === postId);
  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }
  res.json({ success: true, data: post });
});

apiRouter.patch('/posts/:id', async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  const updates = req.body;

  if (hasDb) {
    try {
      const existing = await pool.query('SELECT * FROM video_posts WHERE id = $1', [postId]);
      if (existing.rows.length > 0) {
        const merged = { ...mapPostRow(existing.rows[0]), ...updates };
        await pool.query(
          `UPDATE video_posts SET
            admin_review_status = $1,
            admin_payout_amount = $2,
            price_award = $3,
            rpm_rate = $4,
            admin_bounty_awarded = $5,
            admin_disbursed_date = $6,
            admin_reviewer_desk = $7,
            rejection_reason = $8,
            location = $9,
            source_citation = COALESCE($10, source_citation),
            is_breaking = COALESCE($11, is_breaking),
            status = COALESCE($12, status),
            view_count = $13,
            like_count = $14,
            comment_count = $15,
            updated_at = NOW()
           WHERE id = $16`,
          [
            merged.adminReviewStatus || 'verified_approved',
            merged.adminPayoutAmount ?? (merged.priceAward || 0),
            merged.priceAward ?? 0,
            merged.rpmRate ?? 350,
            merged.adminBountyAwarded ?? 0,
            merged.adminDisbursedDate || null,
            merged.adminReviewerDesk || null,
            merged.rejectionReason || null,
            JSON.stringify(merged.location || {}),
            merged.sourceCitation || null,
            merged.isBreaking ?? false,
            merged.status || 'published',
            merged.viewCount ?? 0,
            merged.likeCount ?? 0,
            merged.commentCount ?? 0,
            postId
          ]
        );

        // Keep memPosts in sync
        const idx = memPosts.findIndex((p) => p.id === postId);
        if (idx >= 0) {
          memPosts[idx] = merged;
        } else {
          memPosts.unshift(merged);
        }

        return res.json({ success: true, data: merged });
      }
    } catch (err: any) {
      console.warn('[DB Patch Error]:', err.message);
    }
  }

  const idx = memPosts.findIndex((p) => p.id === postId);
  if (idx !== -1) {
    memPosts[idx] = { ...memPosts[idx], ...updates };
    return res.json({ success: true, data: memPosts[idx] });
  }

  // If post was created client-side or during local session, register and return it gracefully
  const fallbackPost: VideoPost = {
    id: postId,
    creatorId: updates.creatorId || 'usr_tn_001',
    creatorName: updates.creatorName || 'Citizen Reporter',
    creatorHandle: updates.creatorHandle || 'citizen_reporter',
    creatorAvatar: updates.creatorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    creatorVerified: updates.creatorVerified || false,
    type: updates.type || 'video',
    mediaUrl: updates.mediaUrl || '',
    thumbnailUrl: updates.thumbnailUrl || updates.mediaUrl || '',
    headline: updates.headline || 'Citizen Dispatch',
    caption: updates.caption || '',
    category: updates.category || 'civic',
    location: updates.location || { placeName: 'Chennai Hub', lat: 13.0827, lng: 80.2707 },
    sourceCitation: updates.sourceCitation || 'Direct eyewitness report',
    durationSeconds: updates.durationSeconds || 15,
    status: updates.status || 'published',
    viewCount: updates.viewCount || 0,
    qualifiedViewCount: updates.qualifiedViewCount || 0,
    likeCount: updates.likeCount || 0,
    commentCount: updates.commentCount || 0,
    shareCount: updates.shareCount || 0,
    isBreaking: updates.isBreaking || false,
    adminReviewStatus: updates.adminReviewStatus || 'verified_approved',
    adminPayoutAmount: updates.adminPayoutAmount || updates.priceAward || 0,
    priceAward: updates.priceAward || 0,
    rpmRate: updates.rpmRate || 350,
    adminBountyAwarded: updates.adminBountyAwarded || 0,
    adminDisbursedDate: updates.adminDisbursedDate || new Date().toISOString(),
    adminReviewerDesk: updates.adminReviewerDesk || 'Chennai Bureau Desk',
    rejectionReason: updates.rejectionReason,
    createdAt: updates.createdAt || new Date().toISOString()
  };

  memPosts.unshift(fallbackPost);
  return res.json({ success: true, data: fallbackPost });
});

// --- USER ROUTES ---
apiRouter.get('/user', async (_req: Request, res: Response) => {
  if (hasDb) {
    try {
      const result = await pool.query('SELECT * FROM users LIMIT 1');
      if (result.rows.length > 0) {
        return res.json({ success: true, data: mapUserRow(result.rows[0]), source: 'supabase_postgres' });
      }
    } catch (err: any) {
      console.warn('[DB User Query Error]:', err.message);
    }
  }
  res.json({ success: true, data: memUser, source: 'in_memory' });
});

apiRouter.put('/user', async (req: Request, res: Response) => {
  const updates: Partial<User> = req.body;
  if (hasDb) {
    try {
      await pool.query(
        `UPDATE users SET
          display_name = COALESCE($1, display_name),
          bio = COALESCE($2, bio),
          avatar = COALESCE($3, avatar),
          home_location = COALESCE($4, home_location),
          updated_at = NOW()
         WHERE id = $5`,
        [
          updates.displayName, updates.bio, updates.avatar,
          updates.homeLocation ? JSON.stringify(updates.homeLocation) : null,
          updates.id || memUser.id
        ]
      );
      const updated = await pool.query('SELECT * FROM users WHERE id = $1', [updates.id || memUser.id]);
      if (updated.rows.length > 0) {
        return res.json({ success: true, data: mapUserRow(updated.rows[0]) });
      }
    } catch (err: any) {
      console.warn('[DB User Update Error]:', err.message);
    }
  }
  memUser = { ...memUser, ...updates };
  res.json({ success: true, data: memUser });
});

// --- WALLET & TRANSACTIONS ROUTES ---
apiRouter.get('/wallet', async (_req: Request, res: Response) => {
  if (hasDb) {
    try {
      const wRes = await pool.query('SELECT * FROM wallets LIMIT 1');
      const tRes = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC');
      if (wRes.rows.length > 0) {
        return res.json({
          success: true,
          data: mapWalletRow(wRes.rows[0]),
          transactions: tRes.rows.map(mapTransactionRow),
          source: 'supabase_postgres'
        });
      }
    } catch (err: any) {
      console.warn('[DB Wallet Error]:', err.message);
    }
  }
  res.json({ success: true, data: memWallet, transactions: memTransactions, source: 'in_memory' });
});

apiRouter.post('/wallet/payout', async (req: Request, res: Response) => {
  const { amount, method } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid payout amount' });
  }

  const txId = `tx_${Date.now()}`;
  if (hasDb) {
    try {
      const wRes = await pool.query('SELECT * FROM wallets LIMIT 1');
      if (wRes.rows.length > 0) {
        const wallet = mapWalletRow(wRes.rows[0]);
        if (amount > wallet.balance) {
          return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        await pool.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [amount, wallet.id]);
        await pool.query(
          `INSERT INTO transactions (id, wallet_id, type, amount, status, method, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [txId, wallet.id, 'payout', amount, 'completed', method || 'UPI Direct']
        );
        wallet.balance -= amount;
        return res.json({ success: true, data: wallet, transactionId: txId });
      }
    } catch (err: any) {
      console.warn('[DB Payout Error]:', err.message);
    }
  }

  if (amount > memWallet.balance) {
    return res.status(400).json({ success: false, error: 'Insufficient balance' });
  }
  memWallet.balance -= amount;
  const newTx: Transaction = {
    id: txId,
    walletId: memWallet.id,
    type: 'payout',
    amount,
    status: 'completed',
    createdAt: new Date().toISOString(),
    method: method || 'UPI Direct'
  };
  memTransactions.unshift(newTx);
  res.json({ success: true, data: memWallet, transaction: newTx });
});

// --- COMMENTS ROUTES ---
apiRouter.get('/comments/:postId', async (req: Request, res: Response) => {
  const postId = req.params.postId as string;
  if (hasDb) {
    try {
      const result = await pool.query('SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC', [postId]);
      return res.json({
        success: true,
        data: result.rows.map((r: any) => ({
          id: r.id,
          postId: r.post_id,
          userHandle: r.user_handle,
          userName: r.user_name,
          userAvatar: r.user_avatar,
          content: r.content,
          likes: Number(r.likes || 0),
          createdAt: r.created_at
        }))
      });
    } catch (err: any) {
      console.warn('[DB Comments Error]:', err.message);
    }
  }
  res.json({ success: true, data: memComments[postId] || [] });
});

apiRouter.post('/comments/:postId', async (req: Request, res: Response) => {
  const postId = req.params.postId as string;
  const { content, userHandle, userName, userAvatar } = req.body;

  if (!content) {
    return res.status(400).json({ success: false, error: 'Comment content is required' });
  }

  const newComment: Comment = {
    id: `cmt_${Date.now()}`,
    postId,
    userHandle: userHandle || memUser.handle,
    userName: userName || memUser.displayName,
    userAvatar: userAvatar || memUser.avatar,
    content,
    createdAt: new Date().toISOString(),
    likes: 0
  };

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO comments (id, post_id, user_handle, user_name, user_avatar, content, likes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newComment.id, newComment.postId, newComment.userHandle, newComment.userName, newComment.userAvatar, newComment.content, 0, newComment.createdAt]
      );
      await pool.query('UPDATE video_posts SET comment_count = comment_count + 1 WHERE id = $1', [postId]);
      return res.status(201).json({ success: true, data: newComment });
    } catch (err: any) {
      console.warn('[DB Comment Insert Error]:', err.message);
    }
  }

  if (!memComments[postId]) memComments[postId] = [];
  memComments[postId].unshift(newComment);
  res.status(201).json({ success: true, data: newComment });
});

// --- ADMIN STATS ROUTE ---
apiRouter.get('/admin/stats', async (_req: Request, res: Response) => {
  if (hasDb) {
    try {
      const postsRes = await pool.query('SELECT * FROM video_posts');
      const posts = postsRes.rows.map(mapPostRow);
      const total = posts.length;
      const pending = posts.filter((p) => p.adminReviewStatus === 'pending_review').length;
      const approved = posts.filter((p) => p.adminReviewStatus === 'verified_approved' || p.adminReviewStatus === 'bounty_awarded').length;
      const rejected = posts.filter((p) => p.adminReviewStatus === 'rejected').length;
      const totalDisbursed = posts.reduce((sum, p) => sum + (p.adminPayoutAmount || 0) + (p.adminBountyAwarded || 0), 0);

      const stats: AdminStats = {
        totalVideosSubmitted: total,
        pendingReviewCount: pending,
        approvedCount: approved,
        rejectedCount: rejected,
        totalDisbursedINR: totalDisbursed,
        activeReportersCount: new Set(posts.map((p) => p.creatorId)).size,
        districtBreakdown: {
          chennai: posts.filter((p) => p.location.district?.toLowerCase() === 'chennai').length,
          tiruvallur: posts.filter((p) => p.location.district?.toLowerCase() === 'tiruvallur').length,
          other: posts.filter((p) => !['chennai', 'tiruvallur'].includes(p.location.district?.toLowerCase() || '')).length
        },
        categoryBreakdown: posts.reduce((acc, p) => {
          acc[p.category] = (acc[p.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        approvalRatePercent: total > 0 ? Math.round((approved / total) * 100) : 100
      };
      return res.json({ success: true, data: stats, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Admin Stats Error]:', err.message);
    }
  }

  // Fallback stats
  res.json({
    success: true,
    data: {
      totalVideosSubmitted: memPosts.length,
      pendingReviewCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      totalDisbursedINR: 0,
      activeReportersCount: 1,
      districtBreakdown: { chennai: 0, tiruvallur: 0, other: 0 },
      categoryBreakdown: {},
      approvalRatePercent: 100
    },
    source: 'in_memory'
  });
});
