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
  radiusMeters?: number;
}

export interface User {
  id: string;
  handle: string;
  displayName: string;
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
  status: 'draft' | 'in_review' | 'published' | 'removed';
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
