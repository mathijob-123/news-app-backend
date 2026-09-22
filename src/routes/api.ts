import { Router, Request, Response } from 'express';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool } from '../config/db.js';
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, isR2Configured } from '../config/r2.js';
import {
  CURRENT_USER,
  INITIAL_POSTS,
  INITIAL_WALLET,
  INITIAL_TRANSACTIONS,
  INITIAL_COMMENTS,
  INITIAL_ADVERTISEMENTS,
  INITIAL_APP_SETTINGS,
  INITIAL_ADMIN_USERS,
  INITIAL_SOCIAL_IMPORTS,
  INITIAL_COPYRIGHT_REPORTS,
  INITIAL_COPYRIGHT_STRIKES,
  INITIAL_NOTIFICATIONS
} from '../data/mockData.js';
import type {
  VideoPost,
  User,
  Wallet,
  Transaction,
  Comment,
  AdminStats,
  Advertisement,
  AppSettings,
  AdminUser,
  SocialMediaPost,
  CopyrightReport,
  CopyrightStrike,
  AppNotification
} from '../types.js';

export const apiRouter = Router();

// Fallback in-memory store if DB is disconnected
let memPosts: VideoPost[] = [...INITIAL_POSTS];
let memUser: User = { ...CURRENT_USER };
let memWallet: Wallet = { ...INITIAL_WALLET };
let memTransactions: Transaction[] = [...INITIAL_TRANSACTIONS];
let memComments: Record<string, Comment[]> = { ...INITIAL_COMMENTS };
let memAds: Advertisement[] = [...INITIAL_ADVERTISEMENTS];
let memSettings: AppSettings = { ...INITIAL_APP_SETTINGS };
let memAdminUsers: AdminUser[] = [...INITIAL_ADMIN_USERS];
let memSocialImports: SocialMediaPost[] = [...INITIAL_SOCIAL_IMPORTS];
let memReports: CopyrightReport[] = [...INITIAL_COPYRIGHT_REPORTS];
let memStrikes: CopyrightStrike[] = [...INITIAL_COPYRIGHT_STRIKES];
let memNotifications: AppNotification[] = [...INITIAL_NOTIFICATIONS];

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
    mediaUrl: (row.media_url && !row.media_url.startsWith('blob:') && !row.media_url.includes('commondatastorage.googleapis.com'))
      ? row.media_url
      : 'https://pub-5051362230a34232ba4afb2cf7ac345c.r2.dev/videos/1790055069322_p0l98f.mp4',
    thumbnailUrl: (row.thumbnail_url && !row.thumbnail_url.startsWith('blob:'))
      ? row.thumbnail_url
      : 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600',
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
    walletId: row.wallet_id,
    copyrightStrikesCount: Number(row.copyright_strikes_count || 0),
    uploadBlocked: Boolean(row.upload_blocked || false),
    uploadBlockedReason: row.upload_blocked_reason || undefined,
    uploadBlockedAt: row.upload_blocked_at || undefined
  };
}

function mapReportRow(row: any): CopyrightReport {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title || row.headline,
    postMediaUrl: row.post_media_url || row.media_url,
    postThumbnailUrl: row.post_thumbnail_url || row.thumbnail_url,
    postCreatorId: row.post_creator_id || row.creator_id,
    postCreatorName: row.post_creator_name || row.creator_name,
    postCreatorHandle: row.post_creator_handle || row.creator_handle,
    reporterUserId: row.reporter_user_id,
    claimantName: row.claimant_name,
    claimantEmail: row.claimant_email,
    claimantRelation: row.claimant_relation || 'owner',
    originalWorkTitle: row.original_work_title,
    originalWorkUrl: row.original_work_url,
    infringementType: row.infringement_type || 'full_video',
    infringementTimestamp: row.infringement_timestamp,
    description: row.description,
    status: row.status,
    adminNotes: row.admin_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStrikeRow(row: any): CopyrightStrike {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.display_name || row.user_name,
    userHandle: row.handle || row.user_handle,
    reportId: row.report_id,
    postId: row.post_id,
    postTitle: row.post_title,
    strikeNumber: Number(row.strike_number || 1),
    reason: row.reason,
    claimantName: row.claimant_name,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNotificationRow(row: any): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    read: Boolean(row.read),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    createdAt: row.created_at
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

function mapAdRow(row: any): Advertisement {
  return {
    id: row.id,
    title: row.title,
    advertiserName: row.advertiser_name,
    adType: row.ad_type,
    mediaUrl: row.media_url,
    thumbnailUrl: row.thumbnail_url || undefined,
    targetUrl: row.target_url || undefined,
    callToAction: row.call_to_action || 'Learn More',
    startDate: row.start_date,
    endDate: row.end_date,
    targetLocation: typeof row.target_location === 'string' ? JSON.parse(row.target_location) : (row.target_location || { district: 'All' }),
    position: row.position,
    status: row.status,
    impressions: Number(row.impressions || 0),
    reachLimit: row.reach_limit !== null && row.reach_limit !== undefined ? Number(row.reach_limit) : undefined,
    autoStop: row.auto_stop !== null && row.auto_stop !== undefined ? Boolean(row.auto_stop) : true,
    clicks: Number(row.clicks || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAdminUserRow(row: any): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLogin: row.last_login,
    createdAt: row.created_at
  };
}

function mapSocialImportRow(row: any): SocialMediaPost {
  return {
    id: row.id,
    platform: row.platform,
    sourceHandle: row.source_handle,
    sourceName: row.source_name,
    sourceAvatar: row.source_avatar,
    sourceUrl: row.source_url,
    externalPostId: row.external_post_id,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    thumbnailUrl: row.thumbnail_url,
    rawTitle: row.raw_title,
    rawContent: row.raw_content,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : new Date().toISOString(),
    importedAt: row.imported_at ? new Date(row.imported_at).toISOString() : new Date().toISOString(),
    aiHeadline: row.ai_headline,
    aiSummary: row.ai_summary,
    aiCategory: row.ai_category,
    aiLocation: typeof row.ai_location === 'string' ? JSON.parse(row.ai_location) : row.ai_location,
    aiKeywords: typeof row.ai_keywords === 'string' ? JSON.parse(row.ai_keywords) : row.ai_keywords,
    aiProcessed: Boolean(row.ai_processed),
    isDuplicate: Boolean(row.is_duplicate),
    duplicateScore: Number(row.duplicate_score || 0),
    duplicateMatchedPostId: row.duplicate_matched_post_id,
    duplicateMatchedTitle: row.duplicate_matched_title,
    status: row.status || 'staged_pending',
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
    publishedPostId: row.published_post_id,
    rejectionReason: row.rejection_reason
  };
}

// Helper: Duplicate Detection Algorithm using Jaccard token overlap
function checkDuplicate(rawTitle: string, rawContent: string, externalId?: string, sourceUrl?: string): {
  isDuplicate: boolean;
  score: number;
  matchedId?: string;
  matchedTitle?: string;
} {
  // Check exact external ID or URL
  if (externalId) {
    const existing = memSocialImports.find((p) => p.externalPostId === externalId);
    if (existing) {
      return { isDuplicate: true, score: 100, matchedId: existing.id, matchedTitle: existing.rawTitle };
    }
  }
  if (sourceUrl) {
    const existing = memSocialImports.find((p) => p.sourceUrl === sourceUrl);
    if (existing) {
      return { isDuplicate: true, score: 100, matchedId: existing.id, matchedTitle: existing.rawTitle };
    }
  }

  // Tokenize candidate text
  const candidateText = `${rawTitle} ${rawContent}`.toLowerCase();
  const candidateTokens = new Set(
    candidateText
      .replace(/[^\w\u0B80-\u0BFF\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

  let bestScore = 0;
  let matchedId: string | undefined;
  let matchedTitle: string | undefined;

  // Compare with current live news posts
  for (const post of memPosts) {
    const postText = `${post.headline} ${post.caption}`.toLowerCase();
    const postTokens = new Set(
      postText
        .replace(/[^\w\u0B80-\u0BFF\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
    if (postTokens.size === 0 || candidateTokens.size === 0) continue;

    let overlap = 0;
    for (const token of candidateTokens) {
      if (postTokens.has(token)) overlap++;
    }
    const union = new Set([...candidateTokens, ...postTokens]).size;
    const similarity = (overlap / union) * 100;
    if (similarity > bestScore) {
      bestScore = similarity;
      matchedId = post.id;
      matchedTitle = post.headline;
    }
  }

  // Compare with already imported social posts
  for (const imp of memSocialImports) {
    const impText = `${imp.rawTitle} ${imp.rawContent}`.toLowerCase();
    const impTokens = new Set(
      impText
        .replace(/[^\w\u0B80-\u0BFF\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
    if (impTokens.size === 0 || candidateTokens.size === 0) continue;

    let overlap = 0;
    for (const token of candidateTokens) {
      if (impTokens.has(token)) overlap++;
    }
    const union = new Set([...candidateTokens, ...impTokens]).size;
    const similarity = (overlap / union) * 100;
    if (similarity > bestScore) {
      bestScore = similarity;
      matchedId = imp.id;
      matchedTitle = imp.rawTitle;
    }
  }

  const rounded = Math.min(100, Math.round(bestScore * 10) / 10);
  return {
    isDuplicate: rounded >= 60,
    score: rounded,
    matchedId: rounded >= 60 ? matchedId : undefined,
    matchedTitle: rounded >= 60 ? matchedTitle : undefined
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
apiRouter.get('/posts', async (req: Request, res: Response) => {
  const { status, includeScheduled } = req.query;
  if (hasDb) {
    try {
      let query = 'SELECT * FROM video_posts';
      const params: any[] = [];
      if (status && status !== 'all') {
        if (status === 'pending' || status === 'in_review') {
          query += " WHERE (status = 'in_review' OR admin_review_status = 'pending_review')";
        } else {
          params.push(status);
          query += ` WHERE status = $1`;
        }
      } else if (!includeScheduled && status !== 'all') {
        // Return published, in_review, and rejected posts so editorial desk & user profile can inspect them (exclude scheduled)
        query += " WHERE (status IN ('published', 'in_review', 'rejected') OR status IS NULL)";
      }
      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);
      const posts = result.rows.map(mapPostRow);
      return res.json({ success: true, count: posts.length, data: posts, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Query Warning] Falling back to in-memory posts:', err.message);
    }
  }
  let filtered = [...memPosts];
  if (status && status !== 'all') {
    if (status === 'pending' || status === 'in_review') {
      filtered = filtered.filter((p) => p.status === 'in_review' || p.adminReviewStatus === 'pending_review');
    } else {
      filtered = filtered.filter((p) => p.status === status);
    }
  } else if (!includeScheduled && status !== 'all') {
    filtered = filtered.filter((p) => p.status !== 'copyright_takedown' && p.status !== 'scheduled');
  }
  res.json({ success: true, count: filtered.length, data: filtered, source: 'in_memory' });
});

apiRouter.post('/posts', async (req: Request, res: Response) => {
  const p: VideoPost = req.body;
  const creatorId = p.creatorId || 'usr_tn_001';

  // Strict enforcement: Block uploads if user has reached 3 active copyright strikes
  let isBlocked = false;
  let strikesCount = 0;
  let blockReason = 'Upload privileges suspended due to 3 active copyright strikes on your channel.';

  if (hasDb) {
    try {
      const uRes = await pool.query('SELECT upload_blocked, copyright_strikes_count, upload_blocked_reason FROM users WHERE id = $1', [creatorId]);
      if (uRes.rows.length > 0) {
        const u = uRes.rows[0];
        strikesCount = Number(u.copyright_strikes_count || 0);
        if (Boolean(u.upload_blocked) || strikesCount >= 3) {
          isBlocked = true;
          if (u.upload_blocked_reason) blockReason = u.upload_blocked_reason;
        }
      }
    } catch (err: any) {
      console.warn('[DB Upload Strike Check Error]:', err.message);
    }
  } else {
    if (memUser.id === creatorId) {
      strikesCount = memUser.copyrightStrikesCount || 0;
      if (memUser.uploadBlocked || strikesCount >= 3) {
        isBlocked = true;
        blockReason = memUser.uploadBlockedReason || blockReason;
      }
    }
  }

  if (isBlocked) {
    return res.status(403).json({
      success: false,
      error: blockReason,
      uploadBlocked: true,
      strikesCount
    });
  }

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

// Delete a video post / citizen dispatch
apiRouter.delete('/posts/:id', async (req: Request, res: Response) => {
  const postId = req.params.id as string;

  memPosts = memPosts.filter((p) => p.id !== postId);
  delete memComments[postId];

  if (hasDb) {
    try {
      await pool.query('DELETE FROM comments WHERE post_id = $1', [postId]);
      await pool.query('DELETE FROM video_posts WHERE id = $1', [postId]);
      return res.json({
        success: true,
        message: 'Post and associated comments deleted successfully',
        source: 'supabase_postgres'
      });
    } catch (err: any) {
      console.warn('[DB Post Delete Error]:', err.message);
    }
  }

  res.json({
    success: true,
    message: 'Post deleted successfully from in-memory store',
    source: 'in_memory'
  });
});

// Bulk update video posts (bulk approve, bulk reject, bulk delete, bulk category/location update)
apiRouter.post('/posts/bulk-update', async (req: Request, res: Response) => {
  const { postIds, action, updates = {} } = req.body;

  if (!Array.isArray(postIds) || postIds.length === 0) {
    return res.status(400).json({ success: false, error: 'postIds must be a non-empty array' });
  }

  const validActions = ['approve', 'reject', 'delete', 'update'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ success: false, error: `action must be one of: ${validActions.join(', ')}` });
  }

  const now = new Date().toISOString();

  if (action === 'delete') {
    memPosts = memPosts.filter((p) => !postIds.includes(p.id));
    postIds.forEach((id) => delete memComments[id]);

    if (hasDb) {
      try {
        await pool.query('DELETE FROM comments WHERE post_id = ANY($1)', [postIds]);
        await pool.query('DELETE FROM video_posts WHERE id = ANY($1)', [postIds]);
        return res.json({
          success: true,
          count: postIds.length,
          message: `${postIds.length} posts deleted successfully`,
          source: 'supabase_postgres'
        });
      } catch (err: any) {
        console.warn('[DB Bulk Delete Error]:', err.message);
      }
    }

    return res.json({
      success: true,
      count: postIds.length,
      message: `${postIds.length} posts deleted from in-memory store`,
      source: 'in_memory'
    });
  }

  if (action === 'approve') {
    memPosts = memPosts.map((p) => {
      if (postIds.includes(p.id)) {
        return {
          ...p,
          status: 'published',
          adminReviewStatus: 'verified_approved',
          priceAward: updates.priceAward ?? p.priceAward ?? 100,
          adminPayoutAmount: updates.adminPayoutAmount ?? p.adminPayoutAmount ?? 100,
          rpmRate: updates.rpmRate ?? p.rpmRate ?? 350,
          adminReviewerDesk: updates.adminReviewerDesk || 'Spotlight Bureau Desk',
          adminDisbursedDate: now
        };
      }
      return p;
    });

    if (hasDb) {
      try {
        await pool.query(
          `UPDATE video_posts SET
            status = 'published',
            admin_review_status = 'verified_approved',
            price_award = COALESCE($2, price_award, 100),
            admin_payout_amount = COALESCE($3, admin_payout_amount, 100),
            rpm_rate = COALESCE($4, rpm_rate, 350),
            admin_reviewer_desk = $5,
            admin_disbursed_date = $6
           WHERE id = ANY($1)`,
          [
            postIds,
            updates.priceAward ?? 100,
            updates.adminPayoutAmount ?? 100,
            updates.rpmRate ?? 350,
            updates.adminReviewerDesk || 'Spotlight Bureau Desk',
            now
          ]
        );
        return res.json({
          success: true,
          count: postIds.length,
          message: `${postIds.length} posts approved successfully`,
          source: 'supabase_postgres'
        });
      } catch (err: any) {
        console.warn('[DB Bulk Approve Error]:', err.message);
      }
    }

    return res.json({
      success: true,
      count: postIds.length,
      message: `${postIds.length} posts approved in-memory`,
      source: 'in_memory'
    });
  }

  if (action === 'reject') {
    const reason = updates.rejectionReason || 'Does not meet editorial guidelines';
    memPosts = memPosts.map((p) => {
      if (postIds.includes(p.id)) {
        return {
          ...p,
          status: 'removed',
          adminReviewStatus: 'rejected',
          rejectionReason: reason
        };
      }
      return p;
    });

    if (hasDb) {
      try {
        await pool.query(
          `UPDATE video_posts SET
            status = 'removed',
            admin_review_status = 'rejected',
            rejection_reason = $2
           WHERE id = ANY($1)`,
          [postIds, reason]
        );
        return res.json({
          success: true,
          count: postIds.length,
          message: `${postIds.length} posts rejected successfully`,
          source: 'supabase_postgres'
        });
      } catch (err: any) {
        console.warn('[DB Bulk Reject Error]:', err.message);
      }
    }

    return res.json({
      success: true,
      count: postIds.length,
      message: `${postIds.length} posts rejected in-memory`,
      source: 'in_memory'
    });
  }

  if (action === 'update') {
    memPosts = memPosts.map((p) => {
      if (postIds.includes(p.id)) {
        return {
          ...p,
          ...(updates.category ? { category: updates.category } : {}),
          ...(updates.location ? { location: updates.location } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.adminReviewStatus ? { adminReviewStatus: updates.adminReviewStatus } : {})
        };
      }
      return p;
    });

    if (hasDb) {
      try {
        if (updates.category) {
          await pool.query(`UPDATE video_posts SET category = $2 WHERE id = ANY($1)`, [postIds, updates.category]);
        }
        if (updates.location) {
          await pool.query(`UPDATE video_posts SET location = $2 WHERE id = ANY($1)`, [postIds, JSON.stringify(updates.location)]);
        }
        return res.json({
          success: true,
          count: postIds.length,
          message: `${postIds.length} posts updated successfully`,
          source: 'supabase_postgres'
        });
      } catch (err: any) {
        console.warn('[DB Bulk Update Error]:', err.message);
      }
    }

    return res.json({
      success: true,
      count: postIds.length,
      message: `${postIds.length} posts updated in-memory`,
      source: 'in_memory'
    });
  }

  res.json({ success: true, count: postIds.length });
});

// --- SPOTLIGHT 360 BULK CREATE & RETRIEVE ROUTES ---
let memSpotlight360Videos: any[] = [];

apiRouter.post('/spotlight360/bulk-create', async (req: Request, res: Response) => {
  const { videos } = req.body;
  if (!Array.isArray(videos) || videos.length === 0) {
    return res.status(400).json({ success: false, error: 'Expected non-empty videos array' });
  }

  const createdVideos: any[] = [];

  for (const item of videos) {
    const videoId = item.id || `sp360_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const loc = item.location || {
      area: 'Ponneri',
      city: 'Chennai',
      district: 'Tiruvallur',
      lat: 13.3331,
      lng: 80.1989,
      radiusKm: 5
    };
    const radiusMeters = (loc.radiusKm || 5) * 1000;

    const rawHandle = (item.creatorHandle || item.creatorName || 'reporter')
      .replace(/^@/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    const cleanHandle = `@${rawHandle || 'reporter'}`;
    let creatorId = item.creatorId || `usr_${rawHandle || 'reporter'}_${Date.now().toString(36)}`;
    const creatorName = item.creatorName || item.advertiserName || 'Spotlight Reporter';
    const creatorAvatar = item.creatorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200';
    const creatorVerified = item.creatorVerified !== undefined ? item.creatorVerified : true;

    if (hasDb) {
      try {
        const existingU = await pool.query('SELECT id FROM users WHERE handle = $1 OR id = $2 LIMIT 1', [rawHandle, creatorId]);
        if (existingU.rows.length > 0) {
          creatorId = existingU.rows[0].id;
          await pool.query(
            `UPDATE users SET display_name = $1, avatar = $2, verified = $3, updated_at = NOW() WHERE id = $4`,
            [creatorName, creatorAvatar, creatorVerified, creatorId]
          );
        } else {
          await pool.query(
            `INSERT INTO users (id, display_name, handle, avatar, role, verified, bio, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'citizen', $5, 'Spotlight Hyperlocal Citizen Reporter', NOW(), NOW())`,
            [creatorId, creatorName, rawHandle, creatorAvatar, creatorVerified]
          );
        }
      } catch (userErr: any) {
        console.warn('[DB User Upsert Warning]:', userErr.message);
        // Fallback to verified existing admin user if foreign key requires it
        try {
          const chk = await pool.query('SELECT id FROM users WHERE id = $1', [creatorId]);
          if (chk.rows.length === 0) {
            creatorId = 'usr_admin_jr';
          }
        } catch {}
      }
    }

    const postRecord: VideoPost = {
      id: videoId,
      creatorId,
      creatorName,
      creatorHandle: cleanHandle,
      creatorAvatar,
      creatorVerified,
      type: 'video',
      mediaUrl: (item.mediaUrl && !item.mediaUrl.startsWith('blob:') && !item.mediaUrl.includes('commondatastorage.googleapis.com')) 
        ? item.mediaUrl 
        : 'https://pub-5051362230a34232ba4afb2cf7ac345c.r2.dev/videos/1790055069322_p0l98f.mp4',
      thumbnailUrl: item.thumbnailUrl || item.mediaUrl,
      headline: item.title || 'Spotlight360 Video',
      caption: item.description || '',
      category: item.category || 'business',
      location: {
        lat: loc.lat,
        lng: loc.lng,
        placeName: loc.area || loc.city || 'Chennai Hub',
        neighborhood: loc.area,
        district: loc.district,
        pincode: loc.pincode,
        radiusMeters
      },
      sourceCitation: item.campaignName ? `Spotlight360 Campaign: ${item.campaignName}` : 'Spotlight360 Hyperlocal Hub',
      durationSeconds: item.durationSeconds || 30,
      status: item.status === 'active' ? 'published' : 'draft',
      viewCount: item.views || 0,
      qualifiedViewCount: item.impressions || 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      isBreaking: false,
      adminReviewStatus: 'verified_approved',
      adminPayoutAmount: 0,
      priceAward: 0,
      rpmRate: 0,
      createdAt: new Date().toISOString()
    };

    if (hasDb) {
      try {
        await pool.query(
          `INSERT INTO video_posts (
            id, creator_id, creator_name, creator_handle, creator_avatar, creator_verified,
            type, media_url, thumbnail_url, headline, caption, category, location,
            source_citation, duration_seconds, status, view_count, qualified_view_count,
            like_count, comment_count, share_count, is_breaking, admin_review_status,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            headline = EXCLUDED.headline,
            caption = EXCLUDED.caption,
            category = EXCLUDED.category,
            location = EXCLUDED.location,
            media_url = EXCLUDED.media_url,
            thumbnail_url = EXCLUDED.thumbnail_url,
            status = EXCLUDED.status,
            updated_at = NOW()`,
          [
            postRecord.id,
            postRecord.creatorId,
            postRecord.creatorName,
            postRecord.creatorHandle,
            postRecord.creatorAvatar,
            postRecord.creatorVerified,
            postRecord.type,
            postRecord.mediaUrl,
            postRecord.thumbnailUrl,
            postRecord.headline,
            postRecord.caption,
            postRecord.category,
            JSON.stringify(postRecord.location),
            postRecord.sourceCitation,
            postRecord.durationSeconds,
            postRecord.status,
            postRecord.viewCount,
            postRecord.qualifiedViewCount,
            postRecord.likeCount,
            postRecord.commentCount,
            postRecord.shareCount,
            postRecord.isBreaking,
            postRecord.adminReviewStatus
          ]
        );
      } catch (err: any) {
        console.warn('[DB Spotlight360 Insert Error]:', err.message);
      }
    }

    // Sync in-memory posts
    const existingIdx = memPosts.findIndex(p => p.id === postRecord.id);
    if (existingIdx >= 0) {
      memPosts[existingIdx] = postRecord;
    } else {
      memPosts.unshift(postRecord);
    }

    const spItem = {
      ...item,
      id: videoId,
      location: loc,
      createdAt: new Date().toISOString()
    };
    createdVideos.push(spItem);
    memSpotlight360Videos.unshift(spItem);
  }

  res.json({
    success: true,
    count: createdVideos.length,
    data: createdVideos,
    message: `${createdVideos.length} Spotlight360 videos created & synced successfully`
  });
});

apiRouter.get('/spotlight360', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: memSpotlight360Videos,
    count: memSpotlight360Videos.length
  });
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

// --- CREATORS & REPORTERS DIRECTORY ---
apiRouter.get('/creators', async (_req: Request, res: Response) => {
  const creatorsMap = new Map<string, { id: string; name: string; handle: string; avatar: string; verified: boolean }>();

  // Default known reporters and creators
  const defaultCreators = [
    { id: 'usr_admin_jr', name: 'Spotlight360 Official', handle: 'spotlight360', avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200', verified: true },
    { id: 'usr_tn_health', name: 'TN Health Desk', handle: 'TNHealthDesk', avatar: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=200', verified: true },
    { id: 'usr_tn_civic', name: 'Ponneri Citizen Watch', handle: 'ponnericivic', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200', verified: true },
    { id: 'usr_tn_traffic', name: 'Chennai Traffic Live', handle: 'chennaitraffic', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200', verified: true },
    { id: 'usr_tn_001', name: 'Citizen Journalist', handle: 'citizen_reporter', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200', verified: false }
  ];
  for (const c of defaultCreators) {
    creatorsMap.set(c.id, c);
  }

  if (hasDb) {
    try {
      const uRes = await pool.query('SELECT id, display_name, handle, avatar, verified FROM users LIMIT 100');
      for (const row of uRes.rows) {
        creatorsMap.set(row.id, {
          id: row.id,
          name: row.display_name || row.handle || 'Reporter',
          handle: row.handle || 'reporter',
          avatar: row.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
          verified: Boolean(row.verified)
        });
      }

      const pRes = await pool.query('SELECT DISTINCT creator_id, creator_name, creator_handle, creator_avatar, creator_verified FROM video_posts LIMIT 50');
      for (const row of pRes.rows) {
        if (row.creator_id && !creatorsMap.has(row.creator_id)) {
          creatorsMap.set(row.creator_id, {
            id: row.creator_id,
            name: row.creator_name || 'Reporter',
            handle: row.creator_handle || 'reporter',
            avatar: row.creator_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
            verified: Boolean(row.creator_verified)
          });
        }
      }
    } catch (err: any) {
      console.warn('[DB Creators Query Error]:', err.message);
    }
  }

  res.json({ success: true, count: creatorsMap.size, data: Array.from(creatorsMap.values()) });
});

apiRouter.post('/creators', async (req: Request, res: Response) => {
  const { name, handle, avatar, verified = true, bio } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }

  const cleanHandle = (handle || name.toLowerCase().replace(/[^a-z0-9_]/g, '')).replace(/^@/, '');
  const id = `usr_cr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanAvatar = avatar || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200`;

  const newCreator = {
    id,
    name: name.trim(),
    handle: cleanHandle,
    avatar: cleanAvatar,
    verified: Boolean(verified),
    bio: bio || 'Citizen reporter and creator for Spotlight hyperlocal network.'
  };

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO users (id, handle, display_name, avatar, bio, verified, is_creator, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [newCreator.id, newCreator.handle, newCreator.name, newCreator.avatar, newCreator.bio, newCreator.verified]
      );
    } catch (err: any) {
      console.warn('[DB Creator Insert Error]:', err.message);
    }
  }

  res.json({ success: true, data: newCreator });
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

// ==========================================
// --- ADVERTISEMENTS MANAGEMENT ROUTES ---
// ==========================================

// 1. Get all advertisements (optional query: ?status=active)
apiRouter.get('/ads', async (req: Request, res: Response) => {
  const { status } = req.query;
  if (hasDb) {
    try {
      let query = 'SELECT * FROM advertisements ORDER BY created_at DESC';
      const params: any[] = [];
      if (status && typeof status === 'string') {
        query = 'SELECT * FROM advertisements WHERE status = $1 ORDER BY created_at DESC';
        params.push(status);
      }
      const result = await pool.query(query, params);
      const ads = result.rows.map(mapAdRow);
      return res.json({ success: true, count: ads.length, data: ads, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Query Warning] Falling back to in-memory ads:', err.message);
    }
  }

  let filtered = memAds;
  if (status && typeof status === 'string') {
    filtered = memAds.filter((ad) => ad.status === status);
  }
  res.json({ success: true, count: filtered.length, data: filtered, source: 'in_memory' });
});

// 2. Create Advertisement
apiRouter.post('/ads', async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload.title || !payload.advertiserName || !payload.mediaUrl) {
    return res.status(400).json({ success: false, error: 'Title, advertiser name, and media URL are required' });
  }

  const newAd: Advertisement = {
    id: payload.id || `ad_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: payload.title.trim(),
    advertiserName: payload.advertiserName.trim(),
    adType: payload.adType || 'image',
    mediaUrl: payload.mediaUrl,
    thumbnailUrl: payload.thumbnailUrl || payload.mediaUrl,
    targetUrl: payload.targetUrl || '',
    callToAction: payload.callToAction || 'Learn More',
    startDate: payload.startDate || new Date().toISOString().split('T')[0],
    endDate: payload.endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    targetLocation: payload.targetLocation || { district: 'All' },
    position: payload.position || 'interval_3',
    status: payload.status || 'active',
    impressions: 0,
    reachLimit: payload.reachLimit ? Number(payload.reachLimit) : undefined,
    autoStop: payload.autoStop !== undefined ? Boolean(payload.autoStop) : true,
    clicks: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  memAds.unshift(newAd);

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO advertisements (
          id, title, advertiser_name, ad_type, media_url, thumbnail_url, target_url,
          call_to_action, start_date, end_date, target_location, position, status,
          impressions, reach_limit, auto_stop, clicks, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          advertiser_name = EXCLUDED.advertiser_name,
          ad_type = EXCLUDED.ad_type,
          media_url = EXCLUDED.media_url,
          thumbnail_url = EXCLUDED.thumbnail_url,
          target_url = EXCLUDED.target_url,
          call_to_action = EXCLUDED.call_to_action,
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          target_location = EXCLUDED.target_location,
          position = EXCLUDED.position,
          status = EXCLUDED.status,
          reach_limit = EXCLUDED.reach_limit,
          auto_stop = EXCLUDED.auto_stop,
          updated_at = NOW()`,
        [
          newAd.id,
          newAd.title,
          newAd.advertiserName,
          newAd.adType,
          newAd.mediaUrl,
          newAd.thumbnailUrl,
          newAd.targetUrl,
          newAd.callToAction,
          newAd.startDate,
          newAd.endDate,
          JSON.stringify(newAd.targetLocation),
          newAd.position,
          newAd.status,
          newAd.impressions,
          newAd.reachLimit || null,
          newAd.autoStop !== false,
          newAd.clicks,
          newAd.createdAt,
          newAd.updatedAt
        ]
      );
      return res.status(201).json({ success: true, data: newAd, source: 'supabase_postgres' });
    } catch (err: any) {
      console.error('[DB Ad Insert Error] Fallback to in-memory:', err.message);
    }
  }

  res.status(201).json({ success: true, data: newAd, source: 'in_memory' });
});

// 3. Get Advertisement by ID
apiRouter.get('/ads/:id', async (req: Request, res: Response) => {
  const adId = req.params.id as string;
  if (hasDb) {
    try {
      const result = await pool.query('SELECT * FROM advertisements WHERE id = $1', [adId]);
      if (result.rows.length > 0) {
        return res.json({ success: true, data: mapAdRow(result.rows[0]) });
      }
    } catch (err: any) {
      console.warn('[DB Ad Query Error]:', err.message);
    }
  }

  const ad = memAds.find((a) => a.id === adId);
  if (!ad) {
    return res.status(404).json({ success: false, error: 'Advertisement not found' });
  }
  res.json({ success: true, data: ad });
});

// 4. Update Advertisement
apiRouter.patch('/ads/:id', async (req: Request, res: Response) => {
  const adId = req.params.id as string;
  const updates = req.body;

  const idx = memAds.findIndex((a) => a.id === adId);
  if (idx !== -1) {
    memAds[idx] = { ...memAds[idx], ...updates, updatedAt: new Date().toISOString() };
  }

  if (hasDb) {
    try {
      const existing = await pool.query('SELECT * FROM advertisements WHERE id = $1', [adId]);
      if (existing.rows.length > 0) {
        const merged = { ...mapAdRow(existing.rows[0]), ...updates, updatedAt: new Date().toISOString() };
        await pool.query(
          `UPDATE advertisements SET
            title = COALESCE($1, title),
            advertiser_name = COALESCE($2, advertiser_name),
            ad_type = COALESCE($3, ad_type),
            media_url = COALESCE($4, media_url),
            thumbnail_url = COALESCE($5, thumbnail_url),
            target_url = COALESCE($6, target_url),
            call_to_action = COALESCE($7, call_to_action),
            start_date = COALESCE($8, start_date),
            end_date = COALESCE($9, end_date),
            target_location = COALESCE($10, target_location),
            position = COALESCE($11, position),
            status = COALESCE($12, status),
            impressions = COALESCE($13, impressions),
            clicks = COALESCE($14, clicks),
            reach_limit = $15,
            auto_stop = COALESCE($16, auto_stop),
            updated_at = NOW()
           WHERE id = $17`,
          [
            merged.title,
            merged.advertiserName,
            merged.adType,
            merged.mediaUrl,
            merged.thumbnailUrl,
            merged.targetUrl,
            merged.callToAction,
            merged.startDate,
            merged.endDate,
            merged.targetLocation ? JSON.stringify(merged.targetLocation) : null,
            merged.position,
            merged.status,
            merged.impressions,
            merged.clicks,
            merged.reachLimit || null,
            merged.autoStop !== false,
            adId
          ]
        );
        return res.json({ success: true, data: merged });
      }
    } catch (err: any) {
      console.warn('[DB Ad Patch Error]:', err.message);
    }
  }

  if (idx !== -1) {
    return res.json({ success: true, data: memAds[idx] });
  }
  res.status(404).json({ success: false, error: 'Advertisement not found' });
});

// 5. Delete Advertisement
apiRouter.delete('/ads/:id', async (req: Request, res: Response) => {
  const adId = req.params.id as string;
  memAds = memAds.filter((a) => a.id !== adId);

  if (hasDb) {
    try {
      await pool.query('DELETE FROM advertisements WHERE id = $1', [adId]);
    } catch (err: any) {
      console.warn('[DB Ad Delete Error]:', err.message);
    }
  }

  res.json({ success: true, message: 'Advertisement deleted successfully' });
});

// 6. Track Ad Impression (Concurrency-Safe with Atomic Auto-Stop)
apiRouter.post('/ads/:id/impression', async (req: Request, res: Response) => {
  const adId = req.params.id as string;

  if (hasDb) {
    try {
      // Concurrency-safe atomic single-statement SQL update with row-level lock
      const result = await pool.query(
        `UPDATE advertisements
         SET impressions = impressions + 1,
             status = CASE
               WHEN auto_stop = true AND reach_limit IS NOT NULL AND reach_limit > 0 AND (impressions + 1) >= reach_limit THEN 'stopped'
               ELSE status
             END,
             updated_at = NOW()
         WHERE id = $1 AND status = 'active'
         RETURNING id, impressions, reach_limit, auto_stop, status`,
        [adId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const autoStopped = row.status === 'stopped';
        const updatedState = {
          id: row.id,
          impressions: Number(row.impressions),
          status: row.status,
          reachLimit: row.reach_limit ? Number(row.reach_limit) : null,
          autoStopped
        };

        // Sync in-memory store
        const memAd = memAds.find((a) => a.id === adId);
        if (memAd) {
          memAd.impressions = Number(row.impressions);
          memAd.status = row.status;
        }

        return res.json({ success: true, data: updatedState });
      } else {
        // If 0 rows updated, check if ad exists but is not active (already stopped or paused)
        const checkRes = await pool.query('SELECT id, impressions, reach_limit, status FROM advertisements WHERE id = $1', [adId]);
        if (checkRes.rows.length > 0) {
          const row = checkRes.rows[0];
          return res.json({
            success: false,
            message: `Ad is not active (status: ${row.status})`,
            data: {
              id: row.id,
              impressions: Number(row.impressions),
              status: row.status,
              reachLimit: row.reach_limit ? Number(row.reach_limit) : null,
              autoStopped: row.status === 'stopped'
            }
          });
        }
      }
    } catch (err: any) {
      console.warn('[DB Ad Impression Error]:', err.message);
    }
  }

  // In-memory fallback (Boundary check with atomic auto-stop)
  const ad = memAds.find((a) => a.id === adId);
  if (ad) {
    if (ad.status === 'active') {
      ad.impressions = (ad.impressions || 0) + 1;
      const isLimitReached = ad.autoStop !== false && ad.reachLimit && ad.reachLimit > 0 && ad.impressions >= ad.reachLimit;
      if (isLimitReached) {
        ad.status = 'stopped';
      }
      return res.json({
        success: true,
        data: {
          id: ad.id,
          impressions: ad.impressions,
          status: ad.status,
          reachLimit: ad.reachLimit,
          autoStopped: ad.status === 'stopped'
        }
      });
    } else {
      return res.json({
        success: false,
        message: `Ad is not active (status: ${ad.status})`,
        data: {
          id: ad.id,
          impressions: ad.impressions,
          status: ad.status,
          reachLimit: ad.reachLimit,
          autoStopped: ad.status === 'stopped'
        }
      });
    }
  }

  res.status(404).json({ success: false, error: 'Advertisement not found' });
});

// 7. Track Ad Click
apiRouter.post('/ads/:id/click', async (req: Request, res: Response) => {
  const adId = req.params.id as string;
  const ad = memAds.find((a) => a.id === adId);
  if (ad) {
    ad.clicks = (ad.clicks || 0) + 1;
  }

  if (hasDb) {
    try {
      await pool.query('UPDATE advertisements SET clicks = clicks + 1 WHERE id = $1', [adId]);
    } catch (err: any) {
      console.warn('[DB Ad Click Error]:', err.message);
    }
  }

  res.json({ success: true });
});

// ==========================================
// --- APP SETTINGS & ADMIN ROLES ROUTES ---
// ==========================================

// 8. Get App Settings
apiRouter.get('/settings', async (_req: Request, res: Response) => {
  if (hasDb) {
    try {
      const result = await pool.query("SELECT value FROM app_settings WHERE key = 'global_settings'");
      if (result.rows.length > 0) {
        const dbSettings = result.rows[0].value;
        memSettings = { ...memSettings, ...dbSettings };
        return res.json({ success: true, data: memSettings, source: 'supabase_postgres' });
      }
    } catch (err: any) {
      console.warn('[DB Settings Query Error]:', err.message);
    }
  }

  res.json({ success: true, data: memSettings, source: 'in_memory' });
});

// 9. Update App Settings
apiRouter.put('/settings', async (req: Request, res: Response) => {
  const updates = req.body;
  memSettings = { ...memSettings, ...updates };

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('global_settings', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(memSettings)]
      );
      return res.json({ success: true, data: memSettings, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Settings Update Error]:', err.message);
    }
  }

  res.json({ success: true, data: memSettings, source: 'in_memory' });
});

apiRouter.get('/admin/users', async (_req: Request, res: Response) => {
  if (hasDb) {
    try {
      const result = await pool.query('SELECT * FROM admin_users ORDER BY created_at ASC');
      if (result.rows.length > 0) {
        const users = result.rows.map(mapAdminUserRow);
        return res.json({ success: true, data: users, source: 'supabase_postgres' });
      }
    } catch (err: any) {
      console.warn('[DB Admin Users Query Error]:', err.message);
    }
  }

  res.json({ success: true, data: memAdminUsers, source: 'in_memory' });
});

// 11. Create Admin User
apiRouter.post('/admin/users', async (req: Request, res: Response) => {
  const { name, email, role = 'editor', status = 'active' } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const newUser: AdminUser = {
    id: `adm_${Date.now().toString(36)}`,
    name: name.trim(),
    email: cleanEmail,
    role,
    status,
    createdAt: new Date().toISOString()
  };

  memAdminUsers.push(newUser);

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO admin_users (id, name, email, role, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, status = EXCLUDED.status`,
        [newUser.id, newUser.name, newUser.email, newUser.role, newUser.status, newUser.createdAt]
      );
      return res.status(201).json({ success: true, data: newUser, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Admin User Insert Error]:', err.message);
    }
  }

  res.status(201).json({ success: true, data: newUser, source: 'in_memory' });
});

// 12. Update Admin User
apiRouter.patch('/admin/users/:id', async (req: Request, res: Response) => {
  const userId = req.params.id as string;
  const updates = req.body;

  const idx = memAdminUsers.findIndex((u) => u.id === userId);
  if (idx !== -1) {
    memAdminUsers[idx] = { ...memAdminUsers[idx], ...updates };
  }

  if (hasDb) {
    try {
      await pool.query(
        `UPDATE admin_users SET
          role = COALESCE($1, role),
          status = COALESCE($2, status),
          name = COALESCE($3, name)
         WHERE id = $4`,
        [updates.role, updates.status, updates.name, userId]
      );
    } catch (err: any) {
      console.warn('[DB Admin User Update Error]:', err.message);
    }
  }

  if (idx !== -1) {
    return res.json({ success: true, data: memAdminUsers[idx] });
  }
  res.status(404).json({ success: false, error: 'Admin user not found' });
});

// 13. Delete Admin User
apiRouter.delete('/admin/users/:id', async (req: Request, res: Response) => {
  const userId = req.params.id as string;
  memAdminUsers = memAdminUsers.filter((u) => u.id !== userId);

  if (hasDb) {
    try {
      await pool.query('DELETE FROM admin_users WHERE id = $1', [userId]);
    } catch (err: any) {
      console.warn('[DB Admin User Delete Error]:', err.message);
    }
  }

  res.json({ success: true, message: 'Admin user deleted successfully' });
});

// ==========================================
// --- SOCIAL MEDIA CONTENT IMPORTS API ---
// ==========================================

// 14. Get Social Media Imports
apiRouter.get('/social/imports', async (req: Request, res: Response) => {
  const { status, platform } = req.query;

  if (hasDb) {
    try {
      let query = 'SELECT * FROM social_media_imports';
      const params: any[] = [];
      const conditions: string[] = [];

      if (status && status !== 'all') {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (platform && platform !== 'all') {
        params.push(platform);
        conditions.push(`platform = $${params.length}`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY imported_at DESC';

      const result = await pool.query(query, params);
      const items = result.rows.map(mapSocialImportRow);
      return res.json({ success: true, count: items.length, data: items, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Social Imports Query Error]:', err.message);
    }
  }

  let filtered = [...memSocialImports];
  if (status && status !== 'all') {
    filtered = filtered.filter((item) => item.status === status);
  }
  if (platform && platform !== 'all') {
    filtered = filtered.filter((item) => item.platform === platform);
  }

  res.json({ success: true, count: filtered.length, data: filtered, source: 'in_memory' });
});

// 15. Fetch Social Media Content (from official channels & feeds with duplicate check)
apiRouter.post('/social/fetch', async (req: Request, res: Response) => {
  const { platform = 'all', source = 'all', dateRange = '24h', location = 'All', category = 'all', limit = 5 } = req.body;

  // Catalog of official Tamil Nadu government & agency dispatches
  const dispatchesCatalog = [
    {
      platform: 'twitter',
      sourceHandle: '@chennaicorp',
      sourceName: 'Greater Chennai Corporation (GCC)',
      sourceAvatar: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=200',
      sourceUrl: `https://twitter.com/chennaicorp/status/${Date.now()}`,
      externalPostId: `tw_gcc_${Date.now()}`,
      mediaType: 'video',
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=600',
      rawTitle: 'GCC opens 24x7 control room for monsoon disaster preparedness at Ripon Building.',
      rawContent: 'Commissioner inspection at GCC Central Control Room (1913). Over 1,200 field staff on standby across 15 zones with tree-clearing power cutters and diesel suction pumps. Citizens advised to call 1913 helpline for waterlogging assistance. #ChennaiRains #GCC',
      aiHeadline: 'சென்னை மாநகராட்சி ரிப்பன் மாளிகையில் 24 மணி நேர அவசரக் கட்டுப்பாட்டு மையம் தொடக்கம்!',
      aiSummary: 'பருவமழை முன்னெச்சரிக்கை நடவடிக்கையாக சென்னை மாநகராட்சி ரிப்பன் மாளிகையில் 24 மணி நேரமும் செயல்படும் அவசரக் கட்டுப்பாட்டு மையம் திறக்கப்பட்டுள்ளது. 1913 என்ற உதவி எண்ணை அழைத்து பொதுமக்கள் உதவி பெறலாம் என்று அறிவிக்கப்பட்டுள்ளது.',
      aiCategory: 'civic',
      aiLocation: { placeName: 'Ripon Building / Central', neighborhood: 'Zone 5 Royapuram', district: 'Chennai', lat: 13.0838, lng: 80.2707, radiusMeters: 5000 },
      category: 'civic',
      location: 'Chennai'
    },
    {
      platform: 'twitter',
      sourceHandle: '@ChennaiTraffic',
      sourceName: 'Greater Chennai Traffic Police (CCTP)',
      sourceAvatar: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200',
      sourceUrl: `https://twitter.com/ChennaiTraffic/status/${Date.now() + 1}`,
      externalPostId: `tw_cctp_${Date.now() + 1}`,
      mediaType: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800',
      thumbnailUrl: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=600',
      rawTitle: 'Koyambedu Roundabout traffic diversions in place due to flyover resurfacing.',
      rawContent: 'Due to overnight bituminization and road repair work near Koyambedu Omni Bus Stand, heavy commercial vehicles entering from Maduravoyal bypass are diverted via 100 Feet Road. Two-wheelers allowed normal transit. Expect minor delays. #TrafficAdvisory',
      aiHeadline: 'கோயம்பேடு ரவுண்டானா அருகே சாலை சீரமைப்புப் பணி: போக்குவரத்து மாற்றுப்பாதையில் மாற்றம்!',
      aiSummary: 'கோயம்பேடு ரவுண்டானா மற்றும் ஆம்னி பேருந்து நிலையம் அருகே தார்ச்சாலை அமைக்கும் பணிகள் நடைபெறுவதால், மதுரவாயல் பைபாஸ் வழியாக வரும் கனரக வாகனங்கள் 100 அடி சாலை வழியாக மாற்றிவிடப்பட்டுள்ளன.',
      aiCategory: 'traffic',
      aiLocation: { placeName: 'Koyambedu Roundabout', neighborhood: 'Zone 8 Anna Nagar West', district: 'Chennai', lat: 13.0694, lng: 80.1948, radiusMeters: 4000 },
      category: 'traffic',
      location: 'Chennai'
    },
    {
      platform: 'youtube',
      sourceHandle: '@ThanthiTVNews',
      sourceName: 'Thanthi TV (தந்தி டிவி)',
      sourceAvatar: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=200',
      sourceUrl: `https://www.youtube.com/watch?v=thanthi_${Date.now()}`,
      externalPostId: `yt_thanthi_${Date.now()}`,
      mediaType: 'video',
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1498084393753-b411b2d26b34?w=600',
      rawTitle: 'திருவள்ளூர் பூண்டி நீர்த்தேக்கத்திற்கு நீர்வரத்து அதிகரிப்பு: உபரிநீர் திறப்பு தயார் நிலை!',
      rawContent: 'நீர்ப்பிடிப்பு பகுதிகளில் பெய்து வரும் கனமழை காரணமாக பூண்டி ஏரிக்கு வினாடிக்கு 4,500 கனஅடி நீர் வந்து கொண்டிருக்கிறது. ஏரியின் பாதுகாப்பைக் கருதி கொசஸ்தலை ஆற்றில் உபரி நீர் திறந்து விடப்படலாம் என பொதுப்பணித்துறை அதிகாரிகள் எச்சரித்துள்ளனர்.',
      aiHeadline: 'பூண்டி நீர்த்தேக்கத்திற்கு நீர்வரத்து தீவிரம்: கொசஸ்தலை ஆற்றுப்படுகை மக்களுக்கு வெள்ள அபாய எச்சரிக்கை!',
      aiSummary: 'திருவள்ளூர் மாவட்டம் பூண்டி நீர்த்தேக்கத்திற்கு நீர்வரத்து வினாடிக்கு 4,500 கனஅடியாக உயர்ந்துள்ளது. பாதுகாப்பு முன்னெச்சரிக்கையாக உபரிநீர் திறக்கப்பட வாய்ப்புள்ளதால் கொசஸ்தலை ஆற்றின் கரையோர மக்கள் பாதுகாப்பாக இருக்குமாறு மாவட்ட ஆட்சியர் எச்சரித்துள்ளார்.',
      aiCategory: 'weather',
      aiLocation: { placeName: 'Poondi Reservoir', neighborhood: 'Poondi / Tiruvallur West', district: 'Tiruvallur', lat: 13.1903, lng: 79.8601, radiusMeters: 8000 },
      category: 'weather',
      location: 'Tiruvallur'
    },
    {
      platform: 'rss',
      sourceHandle: '@PTTVOnlineNews',
      sourceName: 'Puthiya Thalaimurai (புதிய தலைமுறை)',
      sourceAvatar: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=200',
      sourceUrl: `https://www.puthiyathalaimurai.com/news/${Date.now()}`,
      externalPostId: `rss_pt_${Date.now()}`,
      mediaType: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800',
      thumbnailUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=600',
      rawTitle: 'சென்னை மெரினா கடற்கரையில் மாற்றுத்திறனாளிகளுக்கான சிறப்பு மரப்பாதை சீரமைப்பு நிறைவு!',
      rawContent: 'மாற்றுத்திறனாளிகள் கடலலை அருகே செல்ல அமைக்கப்பட்டிருந்த சிறப்பு மரப்பாதை அலைசீற்றத்தால் சேதமடைந்திருந்த நிலையில், சென்னை மாநகராட்சி அதனை நவீன முறையில் புதுப்பித்து மீண்டும் பயன்பாட்டுக்கு திறந்து வைத்துள்ளது.',
      aiHeadline: 'மெரினா கடற்கரையில் மாற்றுத்திறனாளிகளுக்கான சிறப்பு மரப்பாதை புதுப்பிக்கப்பட்டு மீண்டும் திறப்பு!',
      aiSummary: 'சென்னை மெரினா கடற்கரையில் மாற்றுத்திறனாளிகளுக்காக அமைக்கப்பட்ட சிறப்பு மரப்பாதையை சென்னை மாநகராட்சி முழுமையாகச் சீரமைத்து பொதுமக்களின் பயன்பாட்டுக்கு மீண்டும் அர்ப்பணித்துள்ளது.',
      aiCategory: 'community',
      aiLocation: { placeName: 'Marina Beach Promenade', neighborhood: 'Zone 9 Mylapore', district: 'Chennai', lat: 13.0499, lng: 80.2824, radiusMeters: 3000 },
      category: 'community',
      location: 'Chennai'
    }
  ];

  // Filter candidates matching user selection
  let candidates = dispatchesCatalog.filter((item) => {
    if (platform !== 'all' && item.platform !== platform) return false;
    if (location !== 'All' && item.location !== location) return false;
    if (category !== 'all' && item.category !== category) return false;
    return true;
  });

  if (candidates.length === 0) {
    candidates = [dispatchesCatalog[0]];
  }

  const newlyFetched: SocialMediaPost[] = [];
  let duplicatesFound = 0;

  for (const c of candidates.slice(0, Number(limit) || 3)) {
    const dupResult = checkDuplicate(c.rawTitle, c.rawContent, c.externalPostId, c.sourceUrl);
    if (dupResult.isDuplicate) duplicatesFound++;

    const newImport: SocialMediaPost = {
      id: `soc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      platform: c.platform as any,
      sourceHandle: c.sourceHandle,
      sourceName: c.sourceName,
      sourceAvatar: c.sourceAvatar,
      sourceUrl: c.sourceUrl,
      externalPostId: c.externalPostId,
      mediaType: c.mediaType as any,
      mediaUrl: c.mediaUrl,
      thumbnailUrl: c.thumbnailUrl,
      rawTitle: c.rawTitle,
      rawContent: c.rawContent,
      publishedAt: new Date(Date.now() - Math.floor(Math.random() * 7200000)).toISOString(),
      importedAt: new Date().toISOString(),
      aiHeadline: c.aiHeadline,
      aiSummary: c.aiSummary,
      aiCategory: c.aiCategory as any,
      aiLocation: c.aiLocation,
      aiKeywords: ['சென்னை', 'முக்கியசெய்தி', c.aiCategory],
      aiProcessed: true,
      isDuplicate: dupResult.isDuplicate,
      duplicateScore: dupResult.score,
      duplicateMatchedPostId: dupResult.matchedId,
      duplicateMatchedTitle: dupResult.matchedTitle,
      status: 'staged_pending' // STRICT: Never auto-published!
    };

    memSocialImports.unshift(newImport);
    newlyFetched.push(newImport);

    if (hasDb) {
      try {
        await pool.query(
          `INSERT INTO social_media_imports (
            id, platform, source_handle, source_name, source_avatar, source_url, external_post_id,
            media_type, media_url, thumbnail_url, raw_title, raw_content, published_at, imported_at,
            ai_headline, ai_summary, ai_category, ai_location, ai_keywords, ai_processed,
            is_duplicate, duplicate_score, duplicate_matched_post_id, duplicate_matched_title, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
          [
            newImport.id, newImport.platform, newImport.sourceHandle, newImport.sourceName, newImport.sourceAvatar,
            newImport.sourceUrl, newImport.externalPostId, newImport.mediaType, newImport.mediaUrl, newImport.thumbnailUrl,
            newImport.rawTitle, newImport.rawContent, newImport.publishedAt, newImport.importedAt,
            newImport.aiHeadline, newImport.aiSummary, newImport.aiCategory, JSON.stringify(newImport.aiLocation),
            JSON.stringify(newImport.aiKeywords), newImport.aiProcessed, newImport.isDuplicate, newImport.duplicateScore,
            newImport.duplicateMatchedPostId || null, newImport.duplicateMatchedTitle || null, newImport.status
          ]
        );
      } catch (dbErr: any) {
        console.warn('[DB Social Import Insert Error]:', dbErr.message);
      }
    }
  }

  res.json({
    success: true,
    data: {
      newlyFetched,
      totalStaged: memSocialImports.filter((p) => p.status === 'staged_pending').length,
      duplicatesFound
    }
  });
});

// 16. AI Editorial Enhancement & Cleansing
apiRouter.post('/social/ai-enhance', async (req: Request, res: Response) => {
  const { id, customPrompt } = req.body;
  const post = memSocialImports.find((p) => p.id === id);

  if (!post) {
    return res.status(404).json({ success: false, error: 'Social media dispatch not found' });
  }

  // Simulate rich AI journalism processing
  let enhancedHeadline = post.aiHeadline || post.rawTitle;
  let enhancedSummary = post.aiSummary || post.rawContent;
  let enhancedCategory = post.aiCategory || 'civic';

  // Format clean Tamil headline (remove hashtags & RT symbols)
  enhancedHeadline = enhancedHeadline
    .replace(/(#\w+|RT\s+|https?:\/\/\S+)/gi, '')
    .trim();
  if (!enhancedHeadline.endsWith('!') && !enhancedHeadline.endsWith('.')) {
    enhancedHeadline += ' - புதிய விவரங்கள்!';
  }

  enhancedSummary = `【அதிகாரப்பூர்வ அறிக்கை】: ${enhancedSummary.replace(/(#\w+|https?:\/\/\S+)/gi, '').trim()}`;

  post.aiHeadline = enhancedHeadline;
  post.aiSummary = enhancedSummary;
  post.aiProcessed = true;

  if (hasDb) {
    try {
      await pool.query(
        `UPDATE social_media_imports SET
          ai_headline = $1,
          ai_summary = $2,
          ai_processed = true,
          updated_at = NOW()
         WHERE id = $3`,
        [post.aiHeadline, post.aiSummary, id]
      );
    } catch (err: any) {
      console.warn('[DB AI Enhance Error]:', err.message);
    }
  }

  res.json({ success: true, data: post });
});

// 17. Approve & Publish Staged Item to Public Feed (Direct publish is NEVER allowed)
apiRouter.post('/social/approve', async (req: Request, res: Response) => {
  const {
    id,
    headline,
    caption,
    category,
    location,
    priceAward = 100,
    rpmRate = 350,
    isBreaking = false,
    reviewerDesk = 'Chennai Bureau Editorial Desk',
    sourceCitation
  } = req.body;

  const staged = memSocialImports.find((p) => p.id === id);
  if (!staged) {
    return res.status(404).json({ success: false, error: 'Staged dispatch not found' });
  }

  const generatedPostId = `post_soc_${Date.now()}`;
  const finalHeadline = headline || staged.aiHeadline || staged.rawTitle;
  const finalCaption = caption || staged.aiSummary || staged.rawContent;
  const finalCategory = category || staged.aiCategory || 'civic';
  const finalLocation = location || staged.aiLocation || { placeName: 'Chennai Hub', lat: 13.0827, lng: 80.2707, radiusMeters: 4000 };

  const newPost: VideoPost = {
    id: generatedPostId,
    creatorId: 'usr_tn_001',
    creatorName: staged.sourceName,
    creatorHandle: staged.sourceHandle.replace('@', ''),
    creatorAvatar: staged.sourceAvatar || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=200',
    creatorVerified: true,
    type: staged.mediaType,
    mediaUrl: staged.mediaUrl,
    thumbnailUrl: staged.thumbnailUrl || staged.mediaUrl,
    headline: finalHeadline,
    caption: finalCaption,
    category: finalCategory,
    location: finalLocation,
    sourceCitation: sourceCitation || `Official Feed: ${staged.sourceName} (${staged.sourceHandle})`,
    durationSeconds: 30,
    status: 'published',
    viewCount: 0,
    qualifiedViewCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isBreaking: Boolean(isBreaking),
    adminReviewStatus: 'verified_approved',
    adminPayoutAmount: priceAward,
    priceAward,
    rpmRate,
    adminBountyAwarded: isBreaking ? 150 : 0,
    adminDisbursedDate: new Date().toISOString(),
    adminReviewerDesk: reviewerDesk,
    createdAt: new Date().toISOString()
  };

  // Add to live news feed
  memPosts.unshift(newPost);

  // Update staged item status
  staged.status = 'approved_published';
  staged.publishedPostId = newPost.id;
  staged.reviewedBy = reviewerDesk;
  staged.reviewedAt = new Date().toISOString();

  if (hasDb) {
    try {
      // 1. Insert into video_posts
      await pool.query(
        `INSERT INTO video_posts (
          id, creator_id, creator_name, creator_handle, creator_avatar, creator_verified,
          type, media_url, thumbnail_url, headline, caption, category, location,
          source_citation, duration_seconds, status, is_breaking, admin_review_status,
          admin_payout_amount, price_award, rpm_rate, admin_bounty_awarded, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )`,
        [
          newPost.id, newPost.creatorId, newPost.creatorName, newPost.creatorHandle, newPost.creatorAvatar, newPost.creatorVerified,
          newPost.type, newPost.mediaUrl, newPost.thumbnailUrl, newPost.headline, newPost.caption, newPost.category,
          JSON.stringify(newPost.location), newPost.sourceCitation, newPost.durationSeconds, newPost.status, newPost.isBreaking,
          newPost.adminReviewStatus, newPost.adminPayoutAmount, newPost.priceAward, newPost.rpmRate, newPost.adminBountyAwarded,
          newPost.createdAt
        ]
      );

      // 2. Update social_media_imports status
      await pool.query(
        `UPDATE social_media_imports SET
          status = 'approved_published',
          published_post_id = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          updated_at = NOW()
         WHERE id = $3`,
        [newPost.id, reviewerDesk, id]
      );
    } catch (err: any) {
      console.warn('[DB Social Approve Error]:', err.message);
    }
  }

  res.json({ success: true, data: { post: staged, publishedPost: newPost } });
});

// 18. Reject / Discard Staged Social Dispatch
apiRouter.post('/social/reject', async (req: Request, res: Response) => {
  const { id, reason = 'Duplicate or outside coverage zone' } = req.body;
  const staged = memSocialImports.find((p) => p.id === id);

  if (!staged) {
    return res.status(404).json({ success: false, error: 'Staged dispatch not found' });
  }

  staged.status = 'rejected';
  staged.rejectionReason = reason;

  if (hasDb) {
    try {
      await pool.query(
        `UPDATE social_media_imports SET
          status = 'rejected',
          rejection_reason = $1,
          updated_at = NOW()
         WHERE id = $2`,
        [reason, id]
      );
    } catch (err: any) {
      console.warn('[DB Social Reject Error]:', err.message);
    }
  }

  res.json({ success: true, data: staged });
});

// 19. Delete Social Media Staged Item
apiRouter.delete('/social/imports/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  memSocialImports = memSocialImports.filter((p) => p.id !== id);

  if (hasDb) {
    try {
      await pool.query('DELETE FROM social_media_imports WHERE id = $1', [id]);
    } catch (err: any) {
      console.warn('[DB Social Import Delete Error]:', err.message);
    }
  }

  res.json({ success: true, message: 'Social media dispatch deleted successfully' });
});

// ==========================================
// 20. COPYRIGHT REPORTS & STRIKES (YouTube 3-Strike System)
// ==========================================

// GET /api/copyright/reports - List all copyright reports
apiRouter.get('/copyright/reports', async (req: Request, res: Response) => {
  const { status } = req.query;

  if (hasDb) {
    try {
      let query = `
        SELECT
          cr.*,
          vp.headline as post_title,
          vp.media_url as post_media_url,
          vp.thumbnail_url as post_thumbnail_url,
          vp.creator_id as post_creator_id,
          vp.creator_name as post_creator_name,
          vp.creator_handle as post_creator_handle
        FROM copyright_reports cr
        LEFT JOIN video_posts vp ON cr.post_id = vp.id
      `;
      const params: any[] = [];
      if (status && status !== 'all') {
        query += ` WHERE cr.status = $1`;
        params.push(status);
      }
      query += ` ORDER BY cr.created_at DESC`;

      const result = await pool.query(query, params);
      const reports = result.rows.map(mapReportRow);
      return res.json({ success: true, count: reports.length, data: reports, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB Copyright Reports Query Error]:', err.message);
    }
  }

  let filtered = [...memReports];
  if (status && status !== 'all') {
    filtered = filtered.filter((r) => r.status === status);
  }
  res.json({ success: true, count: filtered.length, data: filtered, source: 'in_memory' });
});

// POST /api/copyright/reports - Submit a user copyright infringement claim
apiRouter.post('/copyright/reports', async (req: Request, res: Response) => {
  const {
    postId,
    claimantName,
    claimantEmail,
    claimantRelation = 'owner',
    originalWorkTitle,
    originalWorkUrl,
    infringementType = 'full_video',
    infringementTimestamp,
    description,
    reporterUserId
  } = req.body;

  if (!postId || !claimantName || !claimantEmail || !originalWorkTitle || !description) {
    return res.status(400).json({
      success: false,
      error: 'Missing required copyright claim fields (postId, claimantName, claimantEmail, originalWorkTitle, description).'
    });
  }

  // Find post details to attach metadata
  let targetPost: VideoPost | undefined = memPosts.find((p) => p.id === postId);
  if (!targetPost && hasDb) {
    try {
      const pRes = await pool.query('SELECT * FROM video_posts WHERE id = $1', [postId]);
      if (pRes.rows.length > 0) {
        targetPost = mapPostRow(pRes.rows[0]);
      }
    } catch (err: any) {
      console.warn('[DB Post lookup for report error]:', err.message);
    }
  }

  const reportId = `cr_rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const newReport: CopyrightReport = {
    id: reportId,
    postId,
    postTitle: targetPost?.headline || 'Reported News Video',
    postMediaUrl: targetPost?.mediaUrl || '',
    postThumbnailUrl: targetPost?.thumbnailUrl || targetPost?.mediaUrl || '',
    postCreatorId: targetPost?.creatorId || 'usr_tn_001',
    postCreatorName: targetPost?.creatorName || 'Citizen Reporter',
    postCreatorHandle: targetPost?.creatorHandle || 'citizen_reporter',
    reporterUserId: reporterUserId || undefined,
    claimantName: claimantName.trim(),
    claimantEmail: claimantEmail.trim().toLowerCase(),
    claimantRelation,
    originalWorkTitle: originalWorkTitle.trim(),
    originalWorkUrl: originalWorkUrl?.trim() || undefined,
    infringementType,
    infringementTimestamp: infringementTimestamp?.trim() || undefined,
    description: description.trim(),
    status: 'pending',
    createdAt: now,
    updatedAt: now
  };

  memReports.unshift(newReport);

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO copyright_reports (
          id, post_id, reporter_user_id, claimant_name, claimant_email, claimant_relation,
          original_work_title, original_work_url, infringement_type, infringement_timestamp,
          description, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )`,
        [
          newReport.id,
          newReport.postId,
          newReport.reporterUserId || null,
          newReport.claimantName,
          newReport.claimantEmail,
          newReport.claimantRelation,
          newReport.originalWorkTitle,
          newReport.originalWorkUrl || null,
          newReport.infringementType,
          newReport.infringementTimestamp || null,
          newReport.description,
          newReport.status,
          newReport.createdAt,
          newReport.updatedAt
        ]
      );
    } catch (err: any) {
      console.warn('[DB Insert Copyright Report Error]:', err.message);
    }
  }

  // Create acknowledgement notification for reporter if logged in
  if (reporterUserId) {
    const notif: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: reporterUserId,
      title: 'Copyright Infringement Claim Received',
      message: `Your copyright claim for "${newReport.postTitle}" (Ref: ${reportId}) has been submitted to the Spotlight Bureau for priority review.`,
      type: 'report_status',
      read: false,
      metadata: { reportId, postId },
      createdAt: now
    };
    memNotifications.unshift(notif);
    if (hasDb) {
      try {
        await pool.query(
          `INSERT INTO user_notifications (id, user_id, title, message, type, read, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [notif.id, notif.userId, notif.title, notif.message, notif.type, notif.read, JSON.stringify(notif.metadata), notif.createdAt]
        );
      } catch {}
    }
  }

  res.status(201).json({
    success: true,
    data: newReport,
    message: 'Copyright infringement claim registered. Admin review pending.'
  });
});

// POST /api/copyright/reports/:id/review - Admin approves or rejects copyright report
apiRouter.post('/copyright/reports/:id/review', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, notes = '', reviewerName = 'SuperAdmin Bureau Desk' } = req.body;

  if (action !== 'approved' && action !== 'rejected') {
    return res.status(400).json({ success: false, error: 'action must be "approved" or "rejected"' });
  }

  // Locate report
  let report = memReports.find((r) => r.id === id);
  if (!report && hasDb) {
    try {
      const rRes = await pool.query(`
        SELECT cr.*, vp.headline as post_title, vp.creator_id as post_creator_id, vp.creator_name as post_creator_name, vp.creator_handle as post_creator_handle
        FROM copyright_reports cr
        LEFT JOIN video_posts vp ON cr.post_id = vp.id
        WHERE cr.id = $1
      `, [id]);
      if (rRes.rows.length > 0) {
        report = mapReportRow(rRes.rows[0]);
      }
    } catch (err: any) {
      console.warn('[DB fetch report error]:', err.message);
    }
  }

  if (!report) {
    return res.status(404).json({ success: false, error: 'Copyright report not found' });
  }

  const now = new Date().toISOString();
  report.status = action;
  report.adminNotes = notes;
  report.reviewedBy = reviewerName;
  report.reviewedAt = now;
  report.updatedAt = now;

  // DB update report
  if (hasDb) {
    try {
      await pool.query(
        `UPDATE copyright_reports SET
          status = $1,
          admin_notes = $2,
          reviewed_by = $3,
          reviewed_at = $4,
          updated_at = NOW()
         WHERE id = $5`,
        [action, notes, reviewerName, now, id]
      );
    } catch (err: any) {
      console.warn('[DB update report review error]:', err.message);
    }
  }

  // REJECTION FLOW
  if (action === 'rejected') {
    // Notify claimant/reporter
    if (report.reporterUserId) {
      const notif: AppNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: report.reporterUserId,
        title: 'Copyright Report Dismissed',
        message: `Your infringement claim regarding "${report.postTitle}" was reviewed and dismissed by the Bureau: ${notes || 'Fair use / insufficient proof of ownership.'}`,
        type: 'report_status',
        read: false,
        metadata: { reportId: report.id, reason: notes },
        createdAt: now
      };
      memNotifications.unshift(notif);
      if (hasDb) {
        try {
          await pool.query(
            `INSERT INTO user_notifications (id, user_id, title, message, type, read, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [notif.id, notif.userId, notif.title, notif.message, notif.type, notif.read, JSON.stringify(notif.metadata), notif.createdAt]
          );
        } catch {}
      }
    }
    return res.json({ success: true, data: report, message: 'Copyright report dismissed.' });
  }

  // APPROVAL FLOW: Content Takedown & YouTube 3-Strike Incrementation
  const creatorId = report.postCreatorId || 'usr_tn_001';

  // 1. Take down the offending video post immediately
  const postIdx = memPosts.findIndex((p) => p.id === report!.postId);
  if (postIdx >= 0) {
    memPosts[postIdx].status = 'copyright_takedown';
  }

  if (hasDb) {
    try {
      await pool.query(
        `UPDATE video_posts SET status = 'copyright_takedown', updated_at = NOW() WHERE id = $1`,
        [report.postId]
      );
    } catch (err: any) {
      console.warn('[DB post takedown error]:', err.message);
    }
  }

  // 2. Count creator's current active strikes
  let currentActiveStrikes = 0;
  if (hasDb) {
    try {
      const strikeRes = await pool.query(
        `SELECT COUNT(*) FROM copyright_strikes WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()`,
        [creatorId]
      );
      currentActiveStrikes = parseInt(strikeRes.rows[0].count, 10) || 0;
    } catch (err: any) {
      console.warn('[DB active strikes count error]:', err.message);
      currentActiveStrikes = memStrikes.filter((s) => s.userId === creatorId && s.status === 'active').length;
    }
  } else {
    currentActiveStrikes = memStrikes.filter((s) => s.userId === creatorId && s.status === 'active').length;
  }

  const newStrikeNumber = Math.min(3, currentActiveStrikes + 1);
  const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(); // 90 days validity

  // 3. Record new Copyright Strike
  const strikeId = `cr_strk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newStrike: CopyrightStrike = {
    id: strikeId,
    userId: creatorId,
    userName: report.postCreatorName,
    userHandle: report.postCreatorHandle,
    reportId: report.id,
    postId: report.postId,
    postTitle: report.postTitle,
    strikeNumber: newStrikeNumber,
    reason: notes || `Copyright infringement claim by ${report.claimantName} (${report.originalWorkTitle})`,
    claimantName: report.claimantName,
    status: 'active',
    expiresAt,
    createdAt: now,
    updatedAt: now
  };

  memStrikes.unshift(newStrike);

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO copyright_strikes (
          id, user_id, report_id, post_id, post_title, strike_number, reason,
          claimant_name, status, expires_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`,
        [
          newStrike.id,
          newStrike.userId,
          newStrike.reportId,
          newStrike.postId,
          newStrike.postTitle,
          newStrike.strikeNumber,
          newStrike.reason,
          newStrike.claimantName,
          newStrike.status,
          newStrike.expiresAt,
          newStrike.createdAt,
          newStrike.updatedAt
        ]
      );
    } catch (err: any) {
      console.warn('[DB Insert Strike Error]:', err.message);
    }
  }

  // 4. Update User: strike count and potential upload block
  const shouldBlockUpload = newStrikeNumber >= 3;
  const blockReason = shouldBlockUpload ? 'Account upload privileges suspended due to 3 active copyright strikes.' : undefined;

  if (memUser.id === creatorId) {
    memUser.copyrightStrikesCount = newStrikeNumber;
    if (shouldBlockUpload) {
      memUser.uploadBlocked = true;
      memUser.uploadBlockedReason = blockReason;
      memUser.uploadBlockedAt = now;
    }
  }

  if (hasDb) {
    try {
      await pool.query(
        `UPDATE users SET
          copyright_strikes_count = $1,
          upload_blocked = $2,
          upload_blocked_reason = $3,
          upload_blocked_at = $4,
          updated_at = NOW()
         WHERE id = $5`,
        [newStrikeNumber, shouldBlockUpload, blockReason || null, shouldBlockUpload ? now : null, creatorId]
      );
    } catch (err: any) {
      console.warn('[DB User strike increment error]:', err.message);
    }
  }

  // 5. Send High-Urgency Notifications
  // Creator notification
  const creatorNotif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: creatorId,
    title: shouldBlockUpload
      ? `Copyright Strike 3 of 3 — Upload Privileges Suspended`
      : newStrikeNumber === 2
      ? `Copyright Strike 2 of 3 — Final Upload Warning`
      : `Copyright Strike 1 of 3 Issued`,
    message: shouldBlockUpload
      ? `Your video "${report.postTitle}" was taken down following a copyright claim from ${report.claimantName}. Because your channel has accumulated 3 active strikes, your upload privileges have been locked.`
      : newStrikeNumber === 2
      ? `Your video "${report.postTitle}" was removed due to copyright infringement. This is your 2nd strike. Receiving 1 more strike within 90 days will suspend your ability to upload.`
      : `Your video "${report.postTitle}" was removed due to copyright infringement claimed by ${report.claimantName}. Strikes remain active for 90 days. Please review Spotlight Community Guidelines.`,
    type: shouldBlockUpload ? 'upload_blocked' : 'copyright_strike',
    read: false,
    metadata: {
      strikeId: newStrike.id,
      strikeNumber: newStrikeNumber,
      reportId: report.id,
      postId: report.postId,
      postTitle: report.postTitle,
      claimantName: report.claimantName,
      expiresAt
    },
    createdAt: now
  };

  memNotifications.unshift(creatorNotif);

  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO user_notifications (id, user_id, title, message, type, read, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [creatorNotif.id, creatorNotif.userId, creatorNotif.title, creatorNotif.message, creatorNotif.type, creatorNotif.read, JSON.stringify(creatorNotif.metadata), creatorNotif.createdAt]
      );
    } catch (err: any) {
      console.warn('[DB creator notif error]:', err.message);
    }
  }

  // Claimant notification (if registered)
  if (report.reporterUserId) {
    const claimantNotif: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: report.reporterUserId,
      title: 'Copyright Infringement Claim Approved',
      message: `Your infringement claim regarding "${report.postTitle}" has been verified and approved. The content has been taken down and a strike was issued.`,
      type: 'report_status',
      read: false,
      metadata: { reportId: report.id, postId: report.postId },
      createdAt: now
    };
    memNotifications.unshift(claimantNotif);
    if (hasDb) {
      try {
        await pool.query(
          `INSERT INTO user_notifications (id, user_id, title, message, type, read, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [claimantNotif.id, claimantNotif.userId, claimantNotif.title, claimantNotif.message, claimantNotif.type, claimantNotif.read, JSON.stringify(claimantNotif.metadata), claimantNotif.createdAt]
        );
      } catch {}
    }
  }

  res.json({
    success: true,
    data: report,
    strike: newStrike,
    newStrikeNumber,
    uploadBlocked: shouldBlockUpload,
    message: `Report approved. Content taken down. Strike ${newStrikeNumber} of 3 recorded.${shouldBlockUpload ? ' Upload privileges locked.' : ''}`
  });
});

// GET /api/copyright/strikes - List all strikes
apiRouter.get('/copyright/strikes', async (_req: Request, res: Response) => {
  if (hasDb) {
    try {
      const result = await pool.query(`
        SELECT cs.*, u.display_name as user_name, u.handle as user_handle
        FROM copyright_strikes cs
        LEFT JOIN users u ON cs.user_id = u.id
        ORDER BY cs.created_at DESC
      `);
      const strikes = result.rows.map(mapStrikeRow);
      return res.json({ success: true, count: strikes.length, data: strikes, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB strikes query error]:', err.message);
    }
  }

  res.json({ success: true, count: memStrikes.length, data: memStrikes, source: 'in_memory' });
});

// POST /api/copyright/strikes/:id/revoke - Revoke a strike (Counter-Notification or Appeal)
apiRouter.post('/copyright/strikes/:id/revoke', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason = 'Counter-notification accepted / Claimant retracted claim' } = req.body;

  let strike = memStrikes.find((s) => s.id === id);
  if (!strike && hasDb) {
    try {
      const sRes = await pool.query('SELECT * FROM copyright_strikes WHERE id = $1', [id]);
      if (sRes.rows.length > 0) {
        strike = mapStrikeRow(sRes.rows[0]);
      }
    } catch (err: any) {
      console.warn('[DB fetch strike for revoke error]:', err.message);
    }
  }

  if (!strike) {
    return res.status(404).json({ success: false, error: 'Strike not found' });
  }

  const now = new Date().toISOString();
  strike.status = 'revoked';
  strike.updatedAt = now;

  if (hasDb) {
    try {
      await pool.query(
        `UPDATE copyright_strikes SET status = 'revoked', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } catch (err: any) {
      console.warn('[DB strike revoke error]:', err.message);
    }
  }

  // Recalculate remaining active strikes for creator
  const creatorId = strike.userId;
  let remainingStrikes = 0;
  if (hasDb) {
    try {
      const countRes = await pool.query(
        `SELECT COUNT(*) FROM copyright_strikes WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()`,
        [creatorId]
      );
      remainingStrikes = parseInt(countRes.rows[0].count, 10) || 0;
    } catch {
      remainingStrikes = memStrikes.filter((s) => s.userId === creatorId && s.status === 'active').length;
    }
  } else {
    remainingStrikes = memStrikes.filter((s) => s.userId === creatorId && s.status === 'active').length;
  }

  const isBlocked = remainingStrikes >= 3;

  if (memUser.id === creatorId) {
    memUser.copyrightStrikesCount = remainingStrikes;
    memUser.uploadBlocked = isBlocked;
    if (!isBlocked) memUser.uploadBlockedReason = undefined;
  }

  if (hasDb) {
    try {
      await pool.query(
        `UPDATE users SET
          copyright_strikes_count = $1,
          upload_blocked = $2,
          upload_blocked_reason = $3,
          updated_at = NOW()
         WHERE id = $4`,
        [remainingStrikes, isBlocked, isBlocked ? '3 active copyright strikes on account' : null, creatorId]
      );
    } catch (err: any) {
      console.warn('[DB update user after strike revoke error]:', err.message);
    }
  }

  // Notify creator of strike revocation
  const notif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId: creatorId,
    title: 'Copyright Strike Revoked',
    message: `A copyright strike against "${strike.postTitle || 'your video'}" was revoked (${reason}). Your standing is now ${remainingStrikes} of 3 strikes.${!isBlocked ? ' Upload privileges are active.' : ''}`,
    type: 'strike_revoked',
    read: false,
    metadata: { strikeId: strike.id, remainingStrikes, reason },
    createdAt: now
  };
  memNotifications.unshift(notif);
  if (hasDb) {
    try {
      await pool.query(
        `INSERT INTO user_notifications (id, user_id, title, message, type, read, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [notif.id, notif.userId, notif.title, notif.message, notif.type, notif.read, JSON.stringify(notif.metadata), notif.createdAt]
      );
    } catch {}
  }

  res.json({
    success: true,
    data: strike,
    remainingStrikes,
    uploadBlocked: isBlocked,
    message: `Strike revoked. Active strikes: ${remainingStrikes}/3.`
  });
});

// ==========================================
// 21. NOTIFICATIONS ENDPOINTS
// ==========================================

// GET /api/notifications - Get current user notifications
apiRouter.get('/notifications', async (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_tn_001';

  if (hasDb) {
    try {
      const result = await pool.query(
        `SELECT * FROM user_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      const notifs = result.rows.map(mapNotificationRow);
      return res.json({ success: true, count: notifs.length, data: notifs, source: 'supabase_postgres' });
    } catch (err: any) {
      console.warn('[DB notifications query error]:', err.message);
    }
  }

  const userNotifs = memNotifications.filter((n) => n.userId === userId || n.userId === 'all');
  res.json({ success: true, count: userNotifs.length, data: userNotifs, source: 'in_memory' });
});

// PATCH /api/notifications/:id/read - Mark notification as read
apiRouter.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  const { id } = req.params;
  const notif = memNotifications.find((n) => n.id === id);
  if (notif) notif.read = true;

  if (hasDb) {
    try {
      await pool.query('UPDATE user_notifications SET read = true WHERE id = $1', [id]);
    } catch (err: any) {
      console.warn('[DB mark notification read error]:', err.message);
    }
  }

  res.json({ success: true, id, read: true });
});

// POST /api/notifications/mark-all-read - Mark all as read for user
apiRouter.post('/notifications/mark-all-read', async (req: Request, res: Response) => {
  const userId = (req.body.userId as string) || 'usr_tn_001';

  memNotifications.forEach((n) => {
    if (n.userId === userId || n.userId === 'all') n.read = true;
  });

  if (hasDb) {
    try {
      await pool.query('UPDATE user_notifications SET read = true WHERE user_id = $1', [userId]);
    } catch (err: any) {
      console.warn('[DB mark all read error]:', err.message);
    }
  }

  res.json({ success: true, message: 'All notifications marked as read' });
});

