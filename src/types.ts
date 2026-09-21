export type NewsCategory =
  | 'all'
  | 'traffic'
  | 'weather'
  | 'civic'
  | 'community'
  | 'business'
  | 'safety'
  | 'sports'
  | 'other';

export type CreatorTier = 'bronze' | 'silver' | 'gold';

export type AdminReviewStatus =
  | 'pending_review'
  | 'verified_approved'
  | 'bounty_awarded'
  | 'rejected';

export interface LocationCoordinates {
  lat: number;
  lng: number;
  placeName: string;
  neighborhood?: string;
  district?: string;
  pincode?: string;
  radiusMeters?: number;
}

export type UserRole = 'user' | 'creator' | 'admin';

export interface User {
  id: string;
  handle: string;
  displayName: string;
  email?: string;
  role: UserRole;
  authProvider?: 'local' | 'google';
  avatar: string;
  bio: string;
  homeLocation: LocationCoordinates;
  isCreator: boolean;
  creatorTier: CreatorTier;
  trustScore: number;
  verified: boolean;
  followerCount: number;
  followingCount: number;
  walletId: string;
  onboardingCompleted?: boolean;
  copyrightStrikesCount?: number;
  uploadBlocked?: boolean;
  uploadBlockedReason?: string;
  uploadBlockedAt?: string;
}

export interface AuthSessionUser {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  role: UserRole;
  avatar: string;
  isCreator: boolean;
  verified: boolean;
  walletId: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
  wallet?: any;
  message?: string;
  isNewUser?: boolean;
  isAdmin?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  userHandle: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
  likes: number;
  isLiked?: boolean;
}

export interface VideoPost {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorAvatar: string;
  creatorVerified: boolean;
  type: 'video' | 'image' | 'text';
  mediaUrl: string;
  thumbnailUrl: string;
  headline: string;
  caption: string;
  category: NewsCategory;
  location: LocationCoordinates;
  sourceCitation: string | null;
  durationSeconds: number;
  status: 'draft' | 'in_review' | 'published' | 'removed' | 'copyright_takedown';
  createdAt: string;
  viewCount: number;
  qualifiedViewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked?: boolean;
  isSaved?: boolean;
  isBreaking?: boolean;
  distanceKm?: number;

  adminReviewStatus?: AdminReviewStatus;
  adminPayoutAmount?: number;
  priceAward?: number;
  rpmRate?: number;
  adminBountyAwarded?: number;
  adminDisbursedDate?: string;
  adminReviewerDesk?: string;
  rejectionReason?: string;
}

export interface Wallet {
  id: string;
  userId: string;
  balance: number;
  lifetimeEarnings: number;
  thisMonthEarnings: number;
  nextPayoutDate: string;
  payoutMethod: string | null;
  qualifiedViewsTotal: number;
}

export interface Transaction {
  id: string;
  walletId: string;
  type: 'admin_payout' | 'bounty' | 'earning' | 'payout' | 'tip' | 'adjustment';
  amount: number;
  relatedPostId?: string | null;
  relatedPostTitle?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  method?: string;
  adminDesk?: string;
}

export interface AdminStats {
  totalVideosSubmitted: number;
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalDisbursedINR: number;
  activeReportersCount: number;
  districtBreakdown: {
    chennai: number;
    tiruvallur: number;
    other: number;
  };
  categoryBreakdown: Record<string, number>;
  approvalRatePercent: number;
}

// Advertisements & App Settings Management
export type AdType = 'image' | 'video' | 'banner';

export type AdPosition =
  | 'after_3' // News 3க்கு பிறகு
  | 'after_5' // News 5க்கு பிறகு
  | 'after_7' // News 7க்கு பிறகு
  | 'interval_3' // News 3, News 6, etc.
  | 'interval_5'; // News 5, News 10, etc.

export interface TargetLocation {
  district: string;
  taluk?: string;
  area?: string;
}

export interface Advertisement {
  id: string;
  title: string;
  advertiserName: string;
  adType: AdType;
  mediaUrl: string;
  thumbnailUrl?: string;
  targetUrl?: string;
  callToAction: string; // e.g. "Learn More", "Call Now", "விவரங்களை அறிக"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  targetLocation: TargetLocation;
  position: AdPosition | string;
  status: 'active' | 'inactive' | 'stopped';
  impressions: number;
  reachLimit?: number | null; // Max impressions/reach cap (null/undefined/0 for unlimited)
  autoStop?: boolean; // Whether to automatically stop campaign when reachLimit is reached (default: true)
  clicks: number;
  createdAt: string;
  updatedAt?: string;
}

export type AdminRoleType = 'super_admin' | 'editor' | 'moderator' | 'ad_manager';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRoleType;
  status: 'active' | 'inactive';
  lastLogin?: string;
  createdAt: string;
}

export interface AppBrandingSettings {
  appName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  supportEmail: string;
  supportPhone: string;
}

export interface NewsCategorySetting {
  id: string;
  key: string;
  nameTamil: string;
  nameEnglish: string;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export interface LocationCoverageSetting {
  districts: Array<{
    name: string;
    taluks: Array<{
      name: string;
      areas: string[];
    }>;
  }>;
  defaultLat: number;
  defaultLng: number;
  defaultRadiusKm: number;
}

export interface NotificationSettings {
  pushAlertsEnabled: boolean;
  breakingNewsAlerts: boolean;
  reportApprovalAlerts: boolean;
  payoutAlerts: boolean;
  soundEnabled: boolean;
  fcmServerKeyConfigured: boolean;
}

export interface AdvertisementSettings {
  globalAdsEnabled: boolean;
  defaultAdPosition: string;
  maxAdsPerSession: number;
  sponsoredBadgeText: string;
  allowThirdPartyNetworks: boolean;
  enableVideoInterstitialInSpots: boolean;
}

export interface SocialMediaImportSettings {
  autoImportEnabled: boolean;
  youtubeChannels: string[];
  twitterHandles: string[];
  instagramPages: string[];
  rssFeeds: string[];
  defaultReviewStatusForImported: 'pending_review' | 'verified_approved';
}

export interface ApiSettings {
  r2Configured: boolean;
  r2Bucket: string;
  r2PublicUrl: string;
  googleOAuthConfigured: boolean;
  googleClientId: string;
  dbConfigured: boolean;
  webhookUrl?: string;
}

export interface AppSettings {
  branding: AppBrandingSettings;
  categories: NewsCategorySetting[];
  locations: LocationCoverageSetting;
  notifications: NotificationSettings;
  advertisements: AdvertisementSettings;
  socialImport: SocialMediaImportSettings;
  api: ApiSettings;
  adminUsers: AdminUser[];
}

export type SocialPlatform = 'youtube' | 'twitter' | 'instagram' | 'facebook' | 'rss';
export type ImportStatus = 'staged_pending' | 'approved_published' | 'rejected';

export interface SocialMediaPost {
  id: string;
  platform: SocialPlatform;
  sourceHandle: string;
  sourceName: string;
  sourceAvatar?: string;
  sourceUrl: string;
  externalPostId: string;
  mediaType: 'video' | 'image' | 'text';
  mediaUrl: string;
  thumbnailUrl: string;
  rawTitle: string;
  rawContent: string;
  publishedAt: string;
  importedAt: string;

  // AI Editorial Refinements
  aiHeadline?: string;
  aiSummary?: string;
  aiCategory?: NewsCategory;
  aiLocation?: LocationCoordinates;
  aiKeywords?: string[];
  aiProcessed: boolean;

  // Duplicate Detection
  isDuplicate: boolean;
  duplicateScore?: number; // 0 to 100
  duplicateMatchedPostId?: string;
  duplicateMatchedTitle?: string;

  // Strict Editorial Review Workflow (No direct publishing)
  status: ImportStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  publishedPostId?: string;
  rejectionReason?: string;
}

// Copyright Strike & Moderation Types
export type CopyrightReportStatus = 'pending' | 'approved' | 'rejected' | 'retracted';
export type CopyrightStrikeStatus = 'active' | 'expired' | 'revoked';

export interface CopyrightReport {
  id: string;
  postId: string;
  postTitle?: string;
  postMediaUrl?: string;
  postThumbnailUrl?: string;
  postCreatorId?: string;
  postCreatorName?: string;
  postCreatorHandle?: string;
  reporterUserId?: string;
  claimantName: string;
  claimantEmail: string;
  claimantRelation: 'owner' | 'authorized_agent';
  originalWorkTitle: string;
  originalWorkUrl?: string;
  infringementType: 'full_video' | 'audio_track' | 'visual_clip' | 'thumbnail';
  infringementTimestamp?: string;
  description: string;
  status: CopyrightReportStatus;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CopyrightStrike {
  id: string;
  userId: string;
  userName?: string;
  userHandle?: string;
  reportId?: string;
  postId: string;
  postTitle?: string;
  strikeNumber: number; // 1, 2, 3
  reason: string;
  claimantName?: string;
  status: CopyrightStrikeStatus;
  expiresAt: string; // 90 days from creation
  createdAt: string;
  updatedAt?: string;
}

export type NotificationType =
  | 'copyright_strike'
  | 'strike_warning'
  | 'upload_blocked'
  | 'strike_revoked'
  | 'report_status'
  | 'system';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
}

