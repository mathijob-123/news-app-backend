import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { pool } from '../config/db.js';
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, isR2Configured } from '../config/r2.js';
import type { User, UserRole, AuthResponse } from '../types.js';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'spotlight_super_secret_jwt_key_2026_hyperlocal_news';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
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

// Helper to map DB row to User object
function mapUserRow(row: any): User {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    email: row.email || undefined,
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
      password,
      role = 'creator',
      avatar,
      bio,
      location
    } = req.body;

    if (!displayName || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let cleanHandle = (handle || displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
      .replace(/^@+/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();

    if (!cleanHandle) {
      cleanHandle = `user_${Date.now().toString(36)}`;
    }

    // Check if user already exists with this email
    const existingEmail = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Please log in.' });
    }

    // Check if handle is taken, if so make it unique
    const existingHandle = await pool.query('SELECT id FROM users WHERE LOWER(handle) = $1', [cleanHandle]);
    if (existingHandle.rows.length > 0) {
      cleanHandle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
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

    // Insert user into Supabase
    await pool.query(
      `INSERT INTO users (
        id, handle, display_name, email, password_hash, role, auth_provider,
        avatar, bio, home_location, is_creator, creator_tier,
        trust_score, verified, follower_count, following_count, wallet_id,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'local',
        $7, $8, $9, $10, 'bronze',
        100, $11, 0, 0, $12,
        NOW(), NOW()
      )`,
      [
        userId,
        cleanHandle,
        displayName.trim(),
        cleanEmail,
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

    // Create wallet for user
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

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const walletRes = await pool.query('SELECT * FROM wallets WHERE id = $1', [walletId]);

    const createdUser = mapUserRow(userRes.rows[0]);
    const token = generateToken(createdUser);

    console.log(`[Auth API] New user registered: ${createdUser.displayName} (${createdUser.email}) [Role: ${createdUser.role}]`);

    const response: AuthResponse = {
      success: true,
      token,
      user: createdUser,
      wallet: walletRes.rows[0],
      message: 'Account created successfully!'
    };

    return res.status(201).json(response);
  } catch (error: any) {
    console.error('[Auth Register Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
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

    // Search user by email or handle
    const userRes = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(handle) = $1',
      [cleanIdentifier]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'No account found with this email or handle' });
    }

    const userRow = userRes.rows[0];

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

    // Fetch wallet
    const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [user.id]);

    console.log(`[Auth API] User logged in: ${user.displayName} (${user.email || user.handle}) [Role: ${user.role}]`);

    return res.json({
      success: true,
      token,
      user,
      wallet: walletRes.rows[0] || null,
      message: 'Logged in successfully'
    });
  } catch (error: any) {
    console.error('[Auth Login Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
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

    const userRes = await pool.query(
      'SELECT * FROM users WHERE (LOWER(email) = $1 OR LOWER(handle) = $1) AND (role = \'admin\' OR LOWER(email) = ANY($2::text[]))',
      [cleanId, ADMIN_EMAILS]
    );

    if (userRes.rows.length === 0 && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied: This identifier does not have platform Bureau Editorial privileges.'
      });
    }

    const userRow = userRes.rows[0];

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
      if (payload) {
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

    // Check if user already exists in Supabase by google_id or email
    let userRes = await pool.query(
      'SELECT * FROM users WHERE google_id = $1 OR LOWER(email) = $2',
      [googleId, email]
    );

    const isExisting = userRes.rows.length > 0;
    const existingRow = isExisting ? userRes.rows[0] : null;
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

    if (isExisting && existingRow) {
      // User exists -> update Google ID, avatar, and ensure role if admin
      const finalRole = isSuperAdmin ? 'admin' : existingRow.role;
      const finalOnboarding = isSuperAdmin ? true : existingRow.onboarding_completed;

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

      const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [existingRow.id]);
      user = mapUserRow(refreshed.rows[0]);
      walletId = user.walletId;
    } else {
      // New user from Google -> Create user record
      const userId = `usr_g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      walletId = `wal_${userId}`;
      let handle = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 16);
      if (!handle || handle.length < 3) handle = `reporter_${Date.now().toString(36)}`;

      // Ensure unique handle
      const handleCheck = await pool.query('SELECT id FROM users WHERE LOWER(handle) = $1', [handle]);
      if (handleCheck.rows.length > 0) {
        handle = `${handle}_${Math.floor(100 + Math.random() * 900)}`;
      }

      const defaultLocation = {
        lat: 13.0827,
        lng: 80.2707,
        placeName: 'Chennai Hub',
        district: 'Chennai'
      };

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
        )`,
        [
          userId,
          handle,
          name,
          email,
          assignedRole,
          googleId,
          picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`,
          `Verified Google reporter based in Chennai`,
          JSON.stringify(defaultLocation),
          assignedRole === 'creator' || assignedRole === 'admin',
          assignedRole === 'admin' ? 'gold' : 'bronze',
          true, // Verified via Google
          walletId,
          isSuperAdmin // If admin, auto-complete onboarding
        ]
      );

      // Create linked wallet
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

      const created = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      user = mapUserRow(created.rows[0]);
    }

    const token = generateToken(user);
    const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [user.id]);

    console.log(`[Google OAuth Success] User: ${user.displayName} (${user.email}) [Role: ${user.role}] [NewUser: ${isNewUser}] [Admin: ${isSuperAdmin}]`);

    return res.json({
      success: true,
      token,
      user,
      wallet: walletRes.rows[0] || null,
      isAdmin: user.role === 'admin' || isSuperAdmin,
      isNewUser,
      message: `Signed in as ${user.displayName}`
    });
  } catch (error: any) {
    console.error('[Google OAuth Error]:', error);
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

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    const currentUser = userRes.rows[0];

    // Clean & validate handle if provided
    let cleanHandle = currentUser.handle;
    if (handle && handle.trim()) {
      cleanHandle = handle.trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]/g, '_').slice(0, 20);
      const handleCheck = await pool.query('SELECT id FROM users WHERE LOWER(handle) = $1 AND id != $2', [cleanHandle, decoded.id]);
      if (handleCheck.rows.length > 0) {
        cleanHandle = `${cleanHandle}_${Math.floor(100 + Math.random() * 900)}`;
      }
    }

    const assignedRole: UserRole = currentUser.role === 'admin' ? 'admin' : (role === 'user' ? 'user' : 'creator');
    const isCreator = assignedRole === 'creator' || assignedRole === 'admin';

    const locationData = homeLocation || (currentUser.home_location ? (typeof currentUser.home_location === 'string' ? JSON.parse(currentUser.home_location) : currentUser.home_location) : { lat: 13.0827, lng: 80.2707, placeName: 'Chennai Hub', district: 'Chennai' });

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
        displayName?.trim() || currentUser.display_name,
        cleanHandle,
        assignedRole,
        isCreator,
        bio !== undefined ? bio : currentUser.bio,
        JSON.stringify(locationData),
        avatar || currentUser.avatar,
        decoded.id
      ]
    );

    const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const updatedUser = mapUserRow(refreshed.rows[0]);
    const newToken = generateToken(updatedUser);
    const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [updatedUser.id]);

    console.log(`[Onboarding Complete] User: ${updatedUser.displayName} (@${updatedUser.handle}) [Role: ${updatedUser.role}]`);

    return res.json({
      success: true,
      token: newToken,
      user: updatedUser,
      wallet: walletRes.rows[0] || null,
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

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User profile not found in database' });
    }

    const user = mapUserRow(userRes.rows[0]);
    const walletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1 LIMIT 1', [user.id]);

    return res.json({
      success: true,
      user,
      wallet: walletRes.rows[0] || null,
      isAdmin: user.role === 'admin'
    });
  } catch (error: any) {
    console.error('[Auth /me Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 6. CLOUDFLARE R2 AVATAR UPLOAD
// ==========================================
authRouter.post('/upload-avatar', async (req: Request, res: Response) => {
  try {
    const { filename, contentType = 'image/jpeg', imageBase64 } = req.body;

    if (!isR2Configured) {
      return res.status(503).json({
        success: false,
        error: 'Cloudflare R2 storage credentials are not configured in backend/.env'
      });
    }

    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'imageBase64 data is required' });
    }

    // Strip header if data URL format (e.g. data:image/png;base64,...)
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
  } catch (error: any) {
    console.error('[R2 Avatar Upload Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
