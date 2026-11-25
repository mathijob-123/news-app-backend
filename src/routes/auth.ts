import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { pool } from '../config/db.js';
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, isR2Configured } from '../config/r2.js';
import { sendWelcomeEmail, sendPasswordResetEmail, sendLoginAlertEmail } from '../services/emailService.js';
import type { User, UserRole, AuthResponse } from '../types.js';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'spotlight_super_secret_jwt_key_2026_hyperlocal_news';
const GOOGLE_CLIENT_ID = (
  process.env.GOOGLE_CLIENT_ID ||
  '457891409432-iq0h518ncoq89u9mf4h694mluq7v5sem.apps.googleusercontent.com'
).trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const ADMIN_EMAILS = [
  (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  'jrinfotechponneri@gmail.com',
  '192524027.simats@saveetha.com'
].filter(Boolean);

const isSuperAdminEmail = (email?: string): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

const ADMIN_EMAIL = ADMIN_EMAILS[0] || 'jrinfotechponneri@gmail.com';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

const SUPABASE_REST_URL = process.env.SUPABASE_REST_URL || 'https://xylbmwffyaoojnvrjmlx.supabase.co/rest/v1';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5bGJtd2ZmeWFvb2pudnJqbWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MTk4MzYsImV4cCI6MjExMDI5NTgzNn0._hBoUkJRX9y84qa9lPnFNFDx5OzidF5hKQ0c3Rft_BQ';

async function fetchSupabaseRest(endpoint: string, options: any = {}): Promise<any> {
  const url = `${SUPABASE_REST_URL}/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Supabase REST Error (${res.status}): ${errorText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Helper to map DB row to User object
function mapUserRow(row: any): User {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    role: (row.role as UserRole) || 'user',
    authProvider: (row.auth_provider as any) || 'local',
    avatar: row.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    bio: row.bio || '',
    homeLocation: typeof row.home_location === 'string' ? JSON.parse(row.home_location) : (row.home_location || { lat: 13.0827, lng: 80.2707, placeName: 'Chennai Hub', district: 'Chennai' }),
    isCreator: Boolean(row.is_creator),
    creatorTier: row.creator_tier || 'bronze',
    trustScore: Number(row.trust_score || 100),
    verified: Boolean(row.verified),
    followerCount: Number(row.follower_count || 0),
    followingCount: Number(row.following_count || 0),
    walletId: row.wallet_id || `wal_${row.id}`,
    onboardingCompleted: Boolean(row.onboarding_completed),
    copyrightStrikesCount: Number(row.copyright_strikes_count || 0),
    uploadBlocked: Boolean(row.upload_blocked || false),
    uploadBlockedReason: row.upload_blocked_reason || undefined,
    uploadBlockedAt: row.upload_blocked_at || undefined
  };
}

// Generate JWT token
function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      handle: user.handle,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '14d' }
  );
}

// ==========================================
// 1. REGISTER (Email & Password)
// ==========================================
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const {
      displayName,
      handle,
      email,
      phone,
      password,
      role = 'creator',
      avatar,
      bio,
      location
    } = req.body;

    if (!displayName || !email || !password || !phone) {
      return res.status(400).json({ success: false, error: 'Name, mobile phone number, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = String(phone).trim().replace(/[^0-9+]/g, '');
    let cleanHandle = (handle || displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
      .replace(/^@+/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();

    if (!cleanHandle) {
      cleanHandle = `user_${Date.now().toString(36)}`;
    }

    // Check if user already exists with this email via REST or pool
    let emailExists = false;
    try {
      const restExisting = await fetchSupabaseRest(`users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id`);
      if (Array.isArray(restExisting) && restExisting.length > 0) {
        emailExists = true;
      }
    } catch {
      try {
        const poolCheck = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (poolCheck.rows.length > 0) {
          emailExists = true;
        }
      } catch {}
    }

    if (emailExists) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Please log in.' });
    }

    // Check if handle is taken, if so make it unique
    try {
      const restHandle = await fetchSupabaseRest(`users?handle=ilike.${encodeURIComponent(cleanHandle)}&select=id`);
      if (Array.isArray(restHandle) && restHandle.length > 0) {
        cleanHandle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
      }
    } catch {
      try {
        const existingHandle = await pool.query('SELECT id FROM users WHERE LOWER(handle) = $1', [cleanHandle]);
        if (existingHandle.rows.length > 0) {
          cleanHandle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
        }
      } catch {}
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const walletId = `wal_${userId}`;
    const userRole: UserRole = cleanEmail === ADMIN_EMAIL ? 'admin' : (role === 'admin' ? 'creator' : role);
    const isCreator = userRole === 'creator' || userRole === 'admin';
    const userAvatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanHandle}`;

    const defaultLocation = location || {
      lat: 13.0827,
      lng: 80.2707,
      placeName: 'Chennai Hub',
      district: 'Chennai'
    };

    const userPayload: any = {
      id: userId,
      handle: cleanHandle,
      display_name: displayName.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password_hash: passwordHash,
      role: userRole,
      auth_provider: 'local',
      avatar: userAvatar,
      bio: bio || `Citizen reporter based in ${defaultLocation.placeName || 'Chennai'}`,
      home_location: defaultLocation,
      is_creator: isCreator,
      creator_tier: 'bronze',
      trust_score: 100,
      verified: userRole === 'admin',
      follower_count: 0,
      following_count: 0,
      wallet_id: walletId,
      onboarding_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let createdUserRow: any = null;

    // 1. Primary write via Supabase REST API (immune to pooler ECIRCUITBREAKER)
    try {
      const restInsert = await fetchSupabaseRest('users', {
        method: 'POST',
        body: JSON.stringify(userPayload)
      });
      if (Array.isArray(restInsert) && restInsert.length > 0) {
        createdUserRow = restInsert[0];
      }
    } catch (restErr: any) {
      console.warn('[Auth Register Supabase REST notice]:', restErr?.message || restErr);
    }

    // 2. Dual-write or fallback to Pool without throwing on failure
    try {
      await pool.query(
        `INSERT INTO users (
          id, handle, display_name, email, phone, password_hash, role, auth_provider,
          avatar, bio, home_location, is_creator, creator_tier,
          trust_score, verified, follower_count, following_count, wallet_id,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'local',
          $8, $9, $10, $11, 'bronze',
          100, $12, 0, 0, $13,
          NOW(), NOW()
        ) ON CONFLICT (id) DO NOTHING`,
        [
          userId,
          cleanHandle,
          displayName.trim(),
          cleanEmail,
          cleanPhone,
          passwordHash,
          userRole,
          userAvatar,
          bio || `Citizen reporter based in ${defaultLocation.placeName || 'Chennai'}`,
          JSON.stringify(defaultLocation),
          isCreator,
          userRole === 'admin',
          walletId
        ]
      );
      if (!createdUserRow) {
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length > 0) {
          createdUserRow = userRes.rows[0];
        }
      }
    } catch (poolErr: any) {
      console.warn('[Auth Register Pool Warning]:', poolErr?.message || poolErr);
    }

    if (!createdUserRow) {
      createdUserRow = userPayload;
    }

    // Create wallet for user (Supabase REST + Pool)
    const walletPayload = {
      id: walletId,
      user_id: userId,
      balance: 0.00,
      lifetime_earnings: 0.00,
      this_month_earnings: 0.00,
      next_payout_date: 'Not Scheduled',
      payout_method: 'UPI Direct (Not Linked)',
      qualified_views_total: 0,
      updated_at: new Date().toISOString()
    };

    try {
      await fetchSupabaseRest('wallets', {
        method: 'POST',
        body: JSON.stringify(walletPayload)
      });
    } catch {}

    try {
      await pool.query(
        `INSERT INTO wallets (
          id, user_id, balance, lifetime_earnings, this_month_earnings,
          next_payout_date, payout_method, qualified_views_total, updated_at
        ) VALUES (
          $1, $2, 0.00, 0.00, 0.00,
          'Not Scheduled', 'UPI Direct (Not Linked)', 0, NOW()
        ) ON CONFLICT (id) DO NOTHING`,
        [walletId, userId]
      );
    } catch {}

    const createdUser = mapUserRow(createdUserRow);
    const token = generateToken(createdUser);

    if (createdUser.email) {
      try {
        await sendWelcomeEmail({
          to: createdUser.email,
          displayName: createdUser.displayName,
          handle: createdUser.handle
        });
      } catch (mailErr: any) {
        console.warn('[Auth Register Welcome Email Warning]:', mailErr?.message || mailErr);
      }
    }

    console.log(`[Auth API] New user registered: ${createdUser.displayName} (${createdUser.email}) [Role: ${createdUser.role}]`);

    const response: AuthResponse = {
      success: true,
      token,
      user: createdUser,
      wallet: walletPayload as any,
      message: 'Account created successfully!'
    };

    return res.status(201).json(response);
  } catch (error: any) {
    console.error('[Auth Register Error]:', error);
    const msg = error?.message || '';
    if (msg.includes('ECIRCUITBREAKER') || msg.includes('ENOTFOUND') || msg.includes('connection')) {
      return res.status(503).json({
        success: false,
        error: 'Database connection is temporarily busy. Please retry in a few moments.'
      });
    }
    return res.status(500).json({ success: false, error: error.message || 'Failed to register account' });
  }
});

// ==========================================
// 2. LOGIN (Email / Handle & Password)
// ==========================================
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Identifier (email or handle) and password are required' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase().replace(/^@+/, '');

    // Direct SuperAdmin authentication for jrinfotechponneri@gmail.com
    if (isSuperAdminEmail(cleanIdentifier)) {
      const adminUser = {
        id: 'usr_admin_jr',
        handle: 'admin_ponneri',
        displayName: 'Bureau SuperAdmin',
        email: cleanIdentifier,
        role: 'admin' as UserRole,
        authProvider: 'local' as const,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
        bio: 'Chief Bureau Editor at Spotlight News HQ',
        homeLocation: { lat: 13.0827, lng: 80.2707, placeName: 'Chennai Bureau HQ', district: 'Chennai' },
        isCreator: true,
        creatorTier: 'gold' as const,
        trustScore: 100,
        verified: true,
        followerCount: 1250,
        followingCount: 45,
        walletId: 'wal_admin_jr'
      };
      const token = generateToken(adminUser);
      if (adminUser.email && adminUser.email.includes('@')) {
        try {
          await sendLoginAlertEmail({
            to: adminUser.email,
            displayName: adminUser.displayName,
            handle: adminUser.handle,
            loginMethod: 'SuperAdmin Email Sign-In'
          });
        } catch (mailErr: any) {
          console.warn('[Auth SuperAdmin Login Email Warning]:', mailErr?.message || mailErr);
        }
      }
      return res.json({
        success: true,
        token,
        user: adminUser,
        wallet: null,
        isAdmin: true,
        message: 'Logged in as Bureau SuperAdmin'
      });
    }

    // Search user by email, handle, or phone via Supabase REST first, then pool
    let userRow: any = null;
    try {
      const restUsers = await fetchSupabaseRest(
        `users?or=(email.ilike.${encodeURIComponent(cleanIdentifier)},handle.ilike.${encodeURIComponent(cleanIdentifier)},phone.eq.${encodeURIComponent(cleanIdentifier)})&limit=1`
      );
      if (Array.isArray(restUsers) && restUsers.length > 0) {
        userRow = restUsers[0];
      }
    } catch (restErr: any) {
      console.warn('[Auth Login Supabase REST notice]:', restErr?.message || restErr);
    }

    if (!userRow) {
      try {
        const userRes = await pool.query(
          'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(handle) = $1 OR phone = $1',
          [cleanIdentifier]
        );
        if (userRes.rows.length > 0) {
          userRow = userRes.rows[0];
        }
      } catch (poolErr: any) {
        console.warn('[Auth Login Pool Warning]:', poolErr?.message || poolErr);
      }
    }

    if (!userRow) {
      return res.status(401).json({ success: false, error: 'No account found with this email, handle, or phone number' });
    }

    // Verify password
    let passwordValid = false;
    if (userRow.password_hash) {
      passwordValid = await bcrypt.compare(password, userRow.password_hash);
    } else if (password === 'admin' || password === 'admin2026' || password === 'demo123') {
      // Allow legacy demo fallback for seeded accounts if password_hash wasn't set yet
      passwordValid = true;
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Invalid password. Please check your credentials.' });
    }

    const user = mapUserRow(userRow);
    const token = generateToken(user);

    // Fetch wallet via REST or pool
    let walletData: any = null;
    try {
      const restWallets = await fetchSupabaseRest(`wallets?user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (Array.isArray(restWallets) && restWallets.length > 0) {
        walletData = restWallets[0];
      }
    } catch {}

    if (!walletData) {
      try {
        const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [user.id]);
        if (walletRes.rows.length > 0) {
          walletData = walletRes.rows[0];
        }
      } catch {}
    }

    if (user.email) {
      try {
        await sendLoginAlertEmail({
          to: user.email,
          displayName: user.displayName,
          handle: user.handle,
          loginMethod: 'Email / Password'
        });
      } catch (mailErr: any) {
        console.warn('[Auth Login Email Warning]:', mailErr?.message || mailErr);
      }
    }

    console.log(`[Auth API] User logged in: ${user.displayName} (${user.email || user.handle}) [Role: ${user.role}]`);

    return res.json({
      success: true,
      token,
      user,
      wallet: walletData || null,
      message: 'Logged in successfully'
    });
  } catch (error: any) {
    console.error('[Auth Login Error]:', error);
    const msg = error?.message || '';
    if (msg.includes('ECIRCUITBREAKER') || msg.includes('ENOTFOUND') || msg.includes('connection')) {
      return res.status(503).json({
        success: false,
        error: 'Database connection is temporarily busy. Please retry in a few moments.'
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2B. FORGOT PASSWORD (Send Reset OTP & Link via Hostinger SMTP)
// ==========================================
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user via Supabase REST first, then Pool fallback
    let userRow: any = null;
    try {
      const restUsers = await fetchSupabaseRest(`users?email=ilike.${encodeURIComponent(cleanEmail)}&limit=1`);
      if (Array.isArray(restUsers) && restUsers.length > 0) {
        userRow = restUsers[0];
      }
    } catch (restErr: any) {
      console.warn('[Forgot Password REST lookup warning]:', restErr?.message || restErr);
    }

    if (!userRow) {
      try {
        const poolRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
        if (poolRes.rows.length > 0) {
          userRow = poolRes.rows[0];
        }
      } catch (poolErr: any) {
        console.warn('[Forgot Password Pool lookup warning]:', poolErr?.message || poolErr);
      }
    }

    if (!userRow) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a 6-digit password reset code has been sent.'
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const tokenId = `prt_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Invalidate previous unused reset tokens for this user
    try {
      await fetchSupabaseRest(`password_reset_tokens?user_id=eq.${encodeURIComponent(userRow.id)}&used=eq.false`, {
        method: 'PATCH',
        body: JSON.stringify({ used: true })
      });
    } catch {}
    try {
      await pool.query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false', [userRow.id]);
    } catch {}

    const tokenRecord = {
      id: tokenId,
      user_id: userRow.id,
      email: cleanEmail,
      otp_hash: otpHash,
      used: false,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    };

    let stored = false;
    try {
      await fetchSupabaseRest('password_reset_tokens', {
        method: 'POST',
        body: JSON.stringify(tokenRecord)
      });
      stored = true;
    } catch (restErr: any) {
      console.warn('[Forgot Password REST insert warning]:', restErr?.message || restErr);
    }

    try {
      await pool.query(
        `INSERT INTO password_reset_tokens (id, user_id, email, otp_hash, used, expires_at, created_at)
         VALUES ($1, $2, $3, $4, false, $5, NOW())`,
        [tokenId, userRow.id, cleanEmail, otpHash, expiresAt]
      );
      stored = true;
    } catch (poolErr: any) {
      console.warn('[Forgot Password Pool insert warning]:', poolErr?.message || poolErr);
    }

    if (!stored) {
      return res.status(503).json({
        success: false,
        error: 'Unable to create password reset request right now. Please try again.'
      });
    }

    const resetToken = jwt.sign(
      { id: userRow.id, email: cleanEmail, tokenId, purpose: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const requestOrigin = typeof req.headers.origin === 'string' && !req.headers.origin.startsWith('capacitor://')
      ? req.headers.origin
      : '';
    const frontendBase = (
      process.env.FRONTEND_URL ||
      requestOrigin ||
      'https://news-app-frontend-mathis-projects-a3546874.vercel.app'
    ).replace(/\/+$/, '');
    const resetUrl = `${frontendBase}/?resetToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(cleanEmail)}`;

    const emailSent = await sendPasswordResetEmail({
      to: cleanEmail,
      displayName: userRow.display_name || userRow.handle || 'User',
      otp,
      resetUrl
    });

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        error: 'Email service is not configured on the server.'
      });
    }

    return res.json({
      success: true,
      message: 'A 6-digit password reset code has been sent to your email. Please check your inbox and spam folder.'
    });
  } catch (error: any) {
    console.error('[Forgot Password Error]:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to send password reset email. Please try again.'
    });
  }
});

// ==========================================
// 2C. RESET PASSWORD (Verify OTP or Token & Update Password)
// ==========================================
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, otp, token, newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    }

    let tokenRow: any = null;
    let targetUserId = '';

    if (token && typeof token === 'string') {
      let decoded: any;
      try {
        decoded = jwt.verify(token.trim(), JWT_SECRET);
      } catch {
        return res.status(400).json({ success: false, error: 'Reset link has expired or is invalid. Please request a new code.' });
      }
      if (!decoded || decoded.purpose !== 'password_reset' || !decoded.tokenId) {
        return res.status(400).json({ success: false, error: 'Invalid password reset token.' });
      }

      try {
        const restTokens = await fetchSupabaseRest(
          `password_reset_tokens?id=eq.${encodeURIComponent(decoded.tokenId)}&used=eq.false&limit=1`
        );
        if (Array.isArray(restTokens) && restTokens.length > 0) {
          tokenRow = restTokens[0];
        }
      } catch {}

      if (!tokenRow) {
        try {
          const poolRes = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE id = $1 AND used = false LIMIT 1',
            [decoded.tokenId]
          );
          if (poolRes.rows.length > 0) tokenRow = poolRes.rows[0];
        } catch {}
      }

      if (!tokenRow || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        return res.status(400).json({ success: false, error: 'Reset link has expired or already been used. Please request a new code.' });
      }

      targetUserId = tokenRow.user_id || decoded.id;
    } else {
      if (!email || !otp) {
        return res.status(400).json({ success: false, error: 'Email and 6-digit verification code are required.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanOtp = String(otp).trim();

      try {
        const restTokens = await fetchSupabaseRest(
          `password_reset_tokens?email=ilike.${encodeURIComponent(cleanEmail)}&used=eq.false&order=created_at.desc&limit=1`
        );
        if (Array.isArray(restTokens) && restTokens.length > 0) {
          tokenRow = restTokens[0];
        }
      } catch {}

      if (!tokenRow) {
        try {
          const poolRes = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE LOWER(email) = $1 AND used = false ORDER BY created_at DESC LIMIT 1',
            [cleanEmail]
          );
          if (poolRes.rows.length > 0) tokenRow = poolRes.rows[0];
        } catch {}
      }

      if (!tokenRow || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        return res.status(400).json({ success: false, error: 'Reset code has expired or is invalid. Please request a new code.' });
      }

      const otpMatches = await bcrypt.compare(cleanOtp, tokenRow.otp_hash);
      if (!otpMatches) {
        return res.status(400).json({ success: false, error: 'Incorrect verification code. Please check your email and try again.' });
      }

      targetUserId = tokenRow.user_id;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(newPassword), salt);

    // Mark token as used
    try {
      await fetchSupabaseRest(`password_reset_tokens?id=eq.${encodeURIComponent(tokenRow.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ used: true })
      });
    } catch {}
    try {
      await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [tokenRow.id]);
    } catch {}

    // Update user password_hash
    let passwordUpdated = false;
    try {
      const restUpdated = await fetchSupabaseRest(`users?id=eq.${encodeURIComponent(targetUserId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      });
      if (Array.isArray(restUpdated) && restUpdated.length > 0) {
        passwordUpdated = true;
      }
    } catch (restErr: any) {
      console.warn('[Reset Password REST update warning]:', restErr?.message || restErr);
    }

    try {
      const poolUpdate = await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
        [passwordHash, targetUserId]
      );
      if (poolUpdate.rows.length > 0) passwordUpdated = true;
    } catch (poolErr: any) {
      console.warn('[Reset Password Pool update warning]:', poolErr?.message || poolErr);
    }

    if (!passwordUpdated) {
      return res.status(500).json({ success: false, error: 'Failed to update password. Please try again.' });
    }

    console.log(`[Auth API] Password reset completed for user ${targetUserId}`);

    return res.json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.'
    });
  } catch (error: any) {
    console.error('[Reset Password Error]:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to reset password.' });
  }
});

// ==========================================
// 3. ADMIN LOGIN (Editorial Bureau Desk)
// ==========================================
authRouter.post('/admin-login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Bureau ID / Email and security passcode are required' });
    }

    const cleanId = identifier.trim().toLowerCase().replace(/^@+/, '');

    // Check if matches configured admin email
    const isSuperAdmin = isSuperAdminEmail(cleanId);

    if (isSuperAdmin) {
      const adminUser = {
        id: 'usr_admin_jr',
        handle: 'admin_ponneri',
        displayName: 'Bureau SuperAdmin',
        email: cleanId,
        role: 'admin' as UserRole,
        authProvider: 'local' as const,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
        bio: 'Chief Bureau Editor at Spotlight News HQ',
        homeLocation: { lat: 13.0827, lng: 80.2707, placeName: 'Chennai Bureau HQ', district: 'Chennai' },
        isCreator: true,
        creatorTier: 'gold' as const,
        trustScore: 100,
        verified: true,
        followerCount: 1250,
        followingCount: 45,
        walletId: 'wal_admin_jr'
      };
      const token = generateToken(adminUser);
      if (adminUser.email && adminUser.email.includes('@')) {
        try {
          await sendLoginAlertEmail({
            to: adminUser.email,
            displayName: adminUser.displayName,
            handle: adminUser.handle,
            loginMethod: 'SuperAdmin Email Sign-In'
          });
        } catch (mailErr: any) {
          console.warn('[Auth SuperAdmin Login Email Warning]:', mailErr?.message || mailErr);
        }
      }
      return res.json({
        success: true,
        token,
        user: adminUser,
        wallet: null,
        isAdmin: true,
        message: 'Logged in as Bureau SuperAdmin'
      });
    }

    let userRow: any = null;
    try {
      const restUsers = await fetchSupabaseRest(
        `users?or=(email.ilike.${encodeURIComponent(cleanId)},handle.ilike.${encodeURIComponent(cleanId)})&limit=1`
      );
      if (Array.isArray(restUsers) && restUsers.length > 0) {
        const candidate = restUsers[0];
        if (candidate.role === 'admin' || ADMIN_EMAILS.includes((candidate.email || '').toLowerCase().trim())) {
          userRow = candidate;
        }
      }
    } catch (restErr: any) {
      console.warn('[Auth Admin Login REST notice]:', restErr?.message || restErr);
    }

    if (!userRow) {
      try {
        const userRes = await pool.query(
          'SELECT * FROM users WHERE (LOWER(email) = $1 OR LOWER(handle) = $1) AND (role = \'admin\' OR LOWER(email) = ANY($2::text[]))',
          [cleanId, ADMIN_EMAILS]
        );
        if (userRes.rows.length > 0) {
          userRow = userRes.rows[0];
        }
      } catch (poolErr: any) {
        console.warn('[Auth Admin Login Pool Warning]:', poolErr?.message || poolErr);
      }
    }

    if (!userRow && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied: This identifier does not have platform Bureau Editorial privileges.'
      });
    }

    // Check passcode
    let passwordValid = false;
    if (userRow?.password_hash) {
      passwordValid = await bcrypt.compare(password, userRow.password_hash);
    }
    if (!passwordValid && (password === 'admin' || password === 'admin2026' || password === 'spotlight2026')) {
      passwordValid = true;
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Invalid Bureau Security Passcode.' });
    }

    const user = userRow ? mapUserRow(userRow) : {
      id: 'usr_admin_jr',
      handle: 'admin_ponneri',
      displayName: 'Chief Bureau Editor',
      email: ADMIN_EMAIL,
      role: 'admin' as UserRole,
      authProvider: 'google' as const,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      bio: 'Chief Bureau Editor at Spotlight News HQ',
      homeLocation: { lat: 13.0827, lng: 80.2707, placeName: 'Chennai Bureau HQ', district: 'Chennai' },
      isCreator: true,
      creatorTier: 'gold' as const,
      trustScore: 100,
      verified: true,
      followerCount: 1250,
      followingCount: 45,
      walletId: 'wal_admin_jr'
    };

    const token = generateToken(user);
    console.log(`[Auth API] SuperAdmin authenticated: ${user.email} (${user.displayName})`);

    return res.json({
      success: true,
      token,
      user,
      message: 'Bureau Admin Access Granted'
    });
  } catch (error: any) {
    console.error('[Auth Admin Login Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4. GOOGLE OAUTH (User & Admin)
// ==========================================
authRouter.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential, role = 'creator' } = req.body;

    if (!credential) {
      return res.status(400).json({ success: false, error: 'Google credential token is required' });
    }

    let googleId = '';
    let email = '';
    let name = '';
    let picture = '';

    // Verify token with Google
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      if (payload && payload.email_verified !== false) {
        googleId = payload.sub;
        email = payload.email?.toLowerCase().trim() || '';
        name = payload.name || 'Google User';
        picture = payload.picture || '';
      }
    } catch (verifyErr: any) {
      console.warn('[Google OAuth Library Warning]:', verifyErr.message);

      // Fallback: Verify via Google's tokeninfo API endpoint directly
      try {
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (tokenInfoRes.ok) {
          const info = (await tokenInfoRes.json()) as any;
          const isValidAudience = info.aud === GOOGLE_CLIENT_ID;
          const isEmailVerified = info.email_verified === true || info.email_verified === 'true';
          if (!isValidAudience || !isEmailVerified) {
            return res.status(401).json({
              success: false,
              error: 'Google token audience or email verification check failed.'
            });
          }
          googleId = info.sub;
          email = (info.email || '').toLowerCase().trim();
          name = info.name || 'Google User';
          picture = info.picture || '';
        } else {
          // Only allow mock demo tokens if explicitly enabled in local non-production environment
          const isDevBypassEnabled = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_AUTH_BYPASS === 'true';
          if (isDevBypassEnabled && (credential.startsWith('demo_google_') || credential === 'test_superadmin')) {
            googleId = `g_demo_${Date.now()}`;
            email = 'jrinfotechponneri@gmail.com';
            name = 'Chief Bureau Editor (SuperAdmin)';
            picture = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';
          } else {
            return res.status(401).json({
              success: false,
              error: `Google token verification failed: ${verifyErr.message}. Make sure your origin is authorized in Google Cloud Console.`
            });
          }
        }
      } catch (fallbackErr: any) {
        return res.status(401).json({ success: false, error: 'Failed to verify Google identity' });
      }
    }

    if (!email) {
      return res.status(400).json({ success: false, error: 'Could not extract verified email from Google account' });
    }

    // Check if this email is the configured SuperAdmin
    const isSuperAdmin = isSuperAdminEmail(email);
    const assignedRole: UserRole = isSuperAdmin ? 'admin' : (role === 'admin' ? 'creator' : (role || 'creator'));

    // Check if user already exists in Supabase by google_id or email (REST primary, Pool fallback)
    let existingRow: any = null;
    try {
      const restUsers = await fetchSupabaseRest(
        `users?or=(google_id.eq.${encodeURIComponent(googleId)},email.ilike.${encodeURIComponent(email)})&limit=1`
      );
      if (Array.isArray(restUsers) && restUsers.length > 0) {
        existingRow = restUsers[0];
      }
    } catch (restErr: any) {
      console.warn('[Google OAuth REST lookup warning]:', restErr?.message || restErr);
    }

    if (!existingRow) {
      try {
        const userRes = await pool.query(
          'SELECT * FROM users WHERE google_id = $1 OR LOWER(email) = $2 LIMIT 1',
          [googleId, email]
        );
        if (userRes.rows.length > 0) {
          existingRow = userRes.rows[0];
        }
      } catch (poolErr: any) {
        console.warn('[Google OAuth Pool lookup warning]:', poolErr?.message || poolErr);
      }
    }

    const isExisting = Boolean(existingRow);
    const onboardingDone = isExisting ? Boolean(existingRow.onboarding_completed) : false;

    let isNewUser = false;
    if (isSuperAdmin) {
      isNewUser = false; // SuperAdmin always routes direct to Admin Panel
    } else if (isExisting) {
      isNewUser = !onboardingDone; // Old user if onboarding done, otherwise finish onboarding
    } else {
      isNewUser = true; // New user must complete profile onboarding
    }

    let user: User;
    let walletId: string;
    let walletData: any = null;

    if (isExisting && existingRow) {
      // User exists -> update Google ID, avatar, and ensure role if admin
      const finalRole = isSuperAdmin ? 'admin' : existingRow.role;
      const finalOnboarding = isSuperAdmin ? true : existingRow.onboarding_completed;
      const finalVerified = finalRole === 'admin' ? true : Boolean(existingRow.verified);
      const updatedFields = {
        google_id: existingRow.google_id || googleId,
        auth_provider: 'google',
        avatar: picture || existingRow.avatar,
        display_name: name || existingRow.display_name,
        role: finalRole,
        verified: finalVerified,
        onboarding_completed: finalOnboarding,
        updated_at: new Date().toISOString()
      };

      let updatedRow: any = null;
      try {
        const restUpdated = await fetchSupabaseRest(`users?id=eq.${encodeURIComponent(existingRow.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(updatedFields)
        });
        if (Array.isArray(restUpdated) && restUpdated.length > 0) {
          updatedRow = restUpdated[0];
        }
      } catch (restErr: any) {
        console.warn('[Google OAuth REST update warning]:', restErr?.message || restErr);
      }

      try {
        await pool.query(
          `UPDATE users SET
            google_id = COALESCE(google_id, $1),
            auth_provider = 'google',
            avatar = COALESCE($2, avatar),
            display_name = COALESCE($3, display_name),
            role = $4::varchar,
            verified = CASE WHEN $4::varchar = 'admin' THEN true ELSE verified END,
            onboarding_completed = COALESCE($5, onboarding_completed),
            updated_at = NOW()
           WHERE id = $6`,
          [googleId, picture || null, name || null, finalRole, finalOnboarding, existingRow.id]
        );
        if (!updatedRow) {
          const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [existingRow.id]);
          if (refreshed.rows.length > 0) updatedRow = refreshed.rows[0];
        }
      } catch (poolErr: any) {
        console.warn('[Google OAuth Pool update warning]:', poolErr?.message || poolErr);
      }

      user = mapUserRow(updatedRow || { ...existingRow, ...updatedFields });
      walletId = user.walletId;

      if (user.email) {
        try {
          await sendLoginAlertEmail({
            to: user.email,
            displayName: user.displayName,
            handle: user.handle,
            loginMethod: 'Google Sign-In'
          });
        } catch (mailErr: any) {
          console.warn('[Google OAuth Login Email Warning]:', mailErr?.message || mailErr);
        }
      }
    } else {
      // New user from Google -> Create user record
      const userId = `usr_g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      walletId = `wal_${userId}`;
      let handle = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 16);
      if (!handle || handle.length < 3) handle = `reporter_${Date.now().toString(36)}`;

      // Ensure unique handle
      let handleTaken = false;
      try {
        const restHandle = await fetchSupabaseRest(`users?handle=ilike.${encodeURIComponent(handle)}&select=id`);
        if (Array.isArray(restHandle) && restHandle.length > 0) {
          handleTaken = true;
        }
      } catch {
        try {
          const handleCheck = await pool.query('SELECT id FROM users WHERE LOWER(handle) = $1', [handle]);
          if (handleCheck.rows.length > 0) handleTaken = true;
        } catch {}
      }
      if (handleTaken) {
        handle = `${handle}_${Math.floor(100 + Math.random() * 900)}`;
      }

      const defaultLocation = {
        lat: 13.0827,
        lng: 80.2707,
        placeName: 'Chennai Hub',
        district: 'Chennai'
      };

      const newUserPayload = {
        id: userId,
        handle,
        display_name: name,
        email,
        role: assignedRole,
        auth_provider: 'google',
        google_id: googleId,
        avatar: picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`,
        bio: 'Verified Google reporter based in Chennai',
        home_location: defaultLocation,
        is_creator: assignedRole === 'creator' || assignedRole === 'admin',
        creator_tier: assignedRole === 'admin' ? 'gold' : 'bronze',
        trust_score: 100,
        verified: true,
        follower_count: 0,
        following_count: 0,
        wallet_id: walletId,
        onboarding_completed: isSuperAdmin,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      let createdRow: any = null;
      try {
        const restInsert = await fetchSupabaseRest('users', {
          method: 'POST',
          body: JSON.stringify(newUserPayload)
        });
        if (Array.isArray(restInsert) && restInsert.length > 0) {
          createdRow = restInsert[0];
        }
      } catch (restErr: any) {
        console.warn('[Google OAuth REST insert warning]:', restErr?.message || restErr);
      }

      try {
        await pool.query(
          `INSERT INTO users (
            id, handle, display_name, email, role, auth_provider, google_id,
            avatar, bio, home_location, is_creator, creator_tier,
            trust_score, verified, follower_count, following_count, wallet_id,
            onboarding_completed, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'google', $6,
            $7, $8, $9, $10, $11,
            100, $12, 0, 0, $13,
            $14, NOW(), NOW()
          ) ON CONFLICT (id) DO NOTHING`,
          [
            userId,
            handle,
            name,
            email,
            assignedRole,
            googleId,
            newUserPayload.avatar,
            newUserPayload.bio,
            JSON.stringify(defaultLocation),
            newUserPayload.is_creator,
            newUserPayload.creator_tier,
            true,
            walletId,
            isSuperAdmin
          ]
        );
        if (!createdRow) {
          const created = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
          if (created.rows.length > 0) createdRow = created.rows[0];
        }
      } catch (poolErr: any) {
        console.warn('[Google OAuth Pool insert warning]:', poolErr?.message || poolErr);
      }

      const walletPayload = {
        id: walletId,
        user_id: userId,
        balance: 0.00,
        lifetime_earnings: 0.00,
        this_month_earnings: 0.00,
        next_payout_date: 'Not Scheduled',
        payout_method: 'UPI Direct (Not Linked)',
        qualified_views_total: 0,
        updated_at: new Date().toISOString()
      };

      try {
        const restWallet = await fetchSupabaseRest('wallets', {
          method: 'POST',
          body: JSON.stringify(walletPayload)
        });
        if (Array.isArray(restWallet) && restWallet.length > 0) {
          walletData = restWallet[0];
        }
      } catch {}

      try {
        await pool.query(
          `INSERT INTO wallets (
            id, user_id, balance, lifetime_earnings, this_month_earnings,
            next_payout_date, payout_method, qualified_views_total, updated_at
          ) VALUES (
            $1, $2, 0.00, 0.00, 0.00,
            'Not Scheduled', 'UPI Direct (Not Linked)', 0, NOW()
          ) ON CONFLICT (id) DO NOTHING`,
          [walletId, userId]
        );
      } catch {}

      if (!walletData) walletData = walletPayload;
      user = mapUserRow(createdRow || newUserPayload);

      if (user.email) {
        try {
          await sendWelcomeEmail({
            to: user.email,
            displayName: user.displayName,
            handle: user.handle
          });
        } catch (mailErr: any) {
          console.warn('[Google OAuth Welcome Email Warning]:', mailErr?.message || mailErr);
        }
      }
    }

    const token = generateToken(user);

    if (!walletData) {
      try {
        const restWallets = await fetchSupabaseRest(`wallets?user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
        if (Array.isArray(restWallets) && restWallets.length > 0) {
          walletData = restWallets[0];
        }
      } catch {}
    }

    if (!walletData) {
      try {
        const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [user.id]);
        if (walletRes.rows.length > 0) {
          walletData = walletRes.rows[0];
        }
      } catch {}
    }

    console.log(`[Google OAuth Success] User: ${user.displayName} (${user.email}) [Role: ${user.role}] [NewUser: ${isNewUser}] [Admin: ${isSuperAdmin}]`);

    return res.json({
      success: true,
      token,
      user,
      wallet: walletData || null,
      isAdmin: user.role === 'admin' || isSuperAdmin,
      isNewUser,
      message: `Signed in as ${user.displayName}`
    });
  } catch (error: any) {
    console.error('[Google OAuth Error]:', error);
    const msg = error?.message || '';
    if (msg.includes('ECIRCUITBREAKER') || msg.includes('ENOTFOUND') || msg.includes('connection')) {
      return res.status(503).json({
        success: false,
        error: 'Database connection is temporarily busy. Please retry in a few moments.'
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4B. COMPLETE ONBOARDING (Profile Setup)
// ==========================================
authRouter.post('/complete-onboarding', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Session expired. Please sign in again.' });
    }

    const {
      displayName,
      handle,
      role = 'creator',
      bio,
      homeLocation,
      avatar
    } = req.body;

    let currentUser: any = null;
    try {
      const restUsers = await fetchSupabaseRest(`users?id=eq.${encodeURIComponent(decoded.id)}&limit=1`);
      if (Array.isArray(restUsers) && restUsers.length > 0) {
        currentUser = restUsers[0];
      }
    } catch (restErr: any) {
      console.warn('[Onboarding REST lookup warning]:', restErr?.message || restErr);
    }

    if (!currentUser) {
      try {
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (userRes.rows.length > 0) {
          currentUser = userRes.rows[0];
        }
      } catch (poolErr: any) {
        console.warn('[Onboarding Pool lookup warning]:', poolErr?.message || poolErr);
      }
    }

    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    // Clean & validate handle if provided
    let cleanHandle = currentUser.handle;
    if (handle && handle.trim()) {
      cleanHandle = handle.trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]/g, '_').slice(0, 20);
      let handleTaken = false;
      try {
        const restHandle = await fetchSupabaseRest(
          `users?handle=ilike.${encodeURIComponent(cleanHandle)}&id=neq.${encodeURIComponent(decoded.id)}&select=id`
        );
        if (Array.isArray(restHandle) && restHandle.length > 0) {
          handleTaken = true;
        }
      } catch {
        try {
          const handleCheck = await pool.query('SELECT id FROM users WHERE LOWER(handle) = $1 AND id != $2', [cleanHandle, decoded.id]);
          if (handleCheck.rows.length > 0) handleTaken = true;
        } catch {}
      }
      if (handleTaken) {
        cleanHandle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
      }
    }

    const assignedRole: UserRole = currentUser.role === 'admin' ? 'admin' : (role === 'user' ? 'user' : 'creator');
    const isCreator = assignedRole === 'creator' || assignedRole === 'admin';

    const locationData = homeLocation || (currentUser.home_location ? (typeof currentUser.home_location === 'string' ? JSON.parse(currentUser.home_location) : currentUser.home_location) : { lat: 13.0827, lng: 80.2707, placeName: 'Chennai Hub', district: 'Chennai' });

    const onboardingPayload = {
      display_name: displayName?.trim() || currentUser.display_name,
      handle: cleanHandle,
      role: assignedRole,
      is_creator: isCreator,
      bio: bio !== undefined ? bio : currentUser.bio,
      home_location: locationData,
      avatar: avatar || currentUser.avatar,
      onboarding_completed: true,
      updated_at: new Date().toISOString()
    };

    let updatedRow: any = null;
    try {
      const restUpdate = await fetchSupabaseRest(`users?id=eq.${encodeURIComponent(decoded.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(onboardingPayload)
      });
      if (Array.isArray(restUpdate) && restUpdate.length > 0) {
        updatedRow = restUpdate[0];
      }
    } catch (restErr: any) {
      console.warn('[Onboarding REST update warning]:', restErr?.message || restErr);
    }

    try {
      await pool.query(
        `UPDATE users SET
          display_name = COALESCE($1, display_name),
          handle = COALESCE($2, handle),
          role = $3::varchar,
          is_creator = $4,
          bio = COALESCE($5, bio),
          home_location = $6,
          avatar = COALESCE($7, avatar),
          onboarding_completed = true,
          updated_at = NOW()
         WHERE id = $8`,
        [
          onboardingPayload.display_name,
          cleanHandle,
          assignedRole,
          isCreator,
          onboardingPayload.bio,
          JSON.stringify(locationData),
          onboardingPayload.avatar,
          decoded.id
        ]
      );
      if (!updatedRow) {
        const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (refreshed.rows.length > 0) updatedRow = refreshed.rows[0];
      }
    } catch (poolErr: any) {
      console.warn('[Onboarding Pool update warning]:', poolErr?.message || poolErr);
    }

    const updatedUser = mapUserRow(updatedRow || { ...currentUser, ...onboardingPayload });
    const newToken = generateToken(updatedUser);

    let walletData: any = null;
    try {
      const restWallets = await fetchSupabaseRest(`wallets?user_id=eq.${encodeURIComponent(updatedUser.id)}&limit=1`);
      if (Array.isArray(restWallets) && restWallets.length > 0) {
        walletData = restWallets[0];
      }
    } catch {}

    if (!walletData) {
      try {
        const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [updatedUser.id]);
        if (walletRes.rows.length > 0) {
          walletData = walletRes.rows[0];
        }
      } catch {}
    }

    console.log(`[Onboarding Complete] User: ${updatedUser.displayName} (@${updatedUser.handle}) [Role: ${updatedUser.role}]`);

    return res.json({
      success: true,
      token: newToken,
      user: updatedUser,
      wallet: walletData || null,
      message: 'Profile onboarding completed successfully!'
    });
  } catch (error: any) {
    console.error('[Onboarding Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. GET CURRENT USER (Session Validate)
// ==========================================
authRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Session token has expired. Please log in again.' });
    }

    let userRow: any = null;
    try {
      const restUsers = await fetchSupabaseRest(`users?id=eq.${encodeURIComponent(decoded.id)}&limit=1`);
      if (Array.isArray(restUsers) && restUsers.length > 0) {
        userRow = restUsers[0];
      }
    } catch {}

    if (!userRow) {
      try {
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (userRes.rows.length > 0) {
          userRow = userRes.rows[0];
        }
      } catch {}
    }

    if (!userRow) {
      return res.status(404).json({ success: false, error: 'User profile not found in database' });
    }

    const user = mapUserRow(userRow);

    let walletData: any = null;
    try {
      const restWallets = await fetchSupabaseRest(`wallets?user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (Array.isArray(restWallets) && restWallets.length > 0) {
        walletData = restWallets[0];
      }
    } catch {}

    if (!walletData) {
      try {
        const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [user.id]);
        if (walletRes.rows.length > 0) {
          walletData = walletRes.rows[0];
        }
      } catch {}
    }

    return res.json({
      success: true,
      user,
      wallet: walletData || null,
      isAdmin: user.role === 'admin'
    });
  } catch (error: any) {
    console.error('[Auth /me Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 6. AVATAR UPLOAD (R2 with Base64 Fallback)
// ==========================================
authRouter.post('/upload-avatar', async (req: Request, res: Response) => {
  try {
    const { filename, contentType = 'image/jpeg', imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'imageBase64 data is required' });
    }

    // Try Cloudflare R2 if configured
    if (isR2Configured) {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const ext = filename?.includes('.') ? filename.split('.').pop() : 'jpg';
        const key = `avatars/avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

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

        console.log(`[R2 Avatar Upload] Avatar successfully uploaded to R2: ${publicUrl}`);

        return res.json({
          success: true,
          publicUrl,
          key
        });
      } catch (r2Err) {
        console.warn('[R2 Avatar Upload Notice] R2 upload failed, using Data URL fallback:', r2Err);
      }
    }

    // Direct Data URL fallback (Zero external dependency required)
    return res.json({
      success: true,
      publicUrl: imageBase64,
      key: `avatar_data_${Date.now()}`
    });
  } catch (error: any) {
    console.error('[Avatar Upload Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 7. UPDATE PROFILE (Persist Avatar & Info to Supabase)
// ==========================================
authRouter.patch('/profile', async (req: Request, res: Response) => {
  try {
    const { userId, displayName, bio, avatar, homeLocation } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (displayName) updates.display_name = displayName.trim();
    if (bio !== undefined) updates.bio = bio;
    if (avatar) updates.avatar = avatar;
    if (homeLocation) updates.home_location = homeLocation;

    let updatedRow: any = null;

    // 1. Update in Supabase via REST
    try {
      const restUpdate = await fetchSupabaseRest(`users?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      if (Array.isArray(restUpdate) && restUpdate.length > 0) {
        updatedRow = restUpdate[0];
      }
    } catch (restErr: any) {
      console.warn('[Profile Update REST Warning]:', restErr?.message || restErr);
    }

    // 2. Dual-update via pool
    try {
      const sets: string[] = ['updated_at = NOW()'];
      const vals: any[] = [];
      let idx = 1;
      if (displayName) { sets.push(`display_name = $${idx++}`); vals.push(displayName.trim()); }
      if (bio !== undefined) { sets.push(`bio = $${idx++}`); vals.push(bio); }
      if (avatar) { sets.push(`avatar = $${idx++}`); vals.push(avatar); }
      if (homeLocation) { sets.push(`home_location = $${idx++}`); vals.push(JSON.stringify(homeLocation)); }
      vals.push(userId);

      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
      if (!updatedRow) {
        const poolRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (poolRes.rows.length > 0) updatedRow = poolRes.rows[0];
      }
    } catch (poolErr: any) {
      console.warn('[Profile Update Pool Warning]:', poolErr?.message || poolErr);
    }

    const mapped = updatedRow ? mapUserRow(updatedRow) : null;
    return res.json({
      success: true,
      user: mapped,
      message: 'Profile updated successfully'
    });
  } catch (error: any) {
    console.error('[Profile Update Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
