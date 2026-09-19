import type { VideoPost, User, Comment, Wallet, Transaction } from '../types.js';

export const CURRENT_USER: User = {
  id: 'usr_tn_001',
  handle: 'citizen_reporter',
  displayName: 'Citizen Journalist',
  email: 'citizen@spotlight.local',
  role: 'creator',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
  bio: 'Citizen journalist reporting on civic, traffic, and community news across Chennai & Tiruvallur Districts.',
  homeLocation: {
    placeName: 'Chennai Central & Parrys',
    neighborhood: 'Chennai Central Hub',
    district: 'Chennai',
    lat: 13.0827,
    lng: 80.2707,
    radiusMeters: 4000
  },
  isCreator: true,
  creatorTier: 'bronze',
  trustScore: 100,
  verified: false,
  followerCount: 0,
  followingCount: 0,
  walletId: 'wlt_tn_001'
};

export const INITIAL_WALLET: Wallet = {
  id: 'wlt_tn_001',
  userId: 'usr_tn_001',
  balance: 0.0,
  lifetimeEarnings: 0.0,
  thisMonthEarnings: 0.0,
  nextPayoutDate: 'Not Scheduled',
  payoutMethod: 'UPI Direct (Not Linked)',
  qualifiedViewsTotal: 0
};

export const INITIAL_TRANSACTIONS: Transaction[] = [];

export const INITIAL_POSTS: VideoPost[] = [];

export const INITIAL_COMMENTS: Record<string, Comment[]> = {};
