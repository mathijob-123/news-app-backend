import type {
  VideoPost,
  User,
  Comment,
  Wallet,
  Transaction,
  SocialMediaPost,
  CopyrightReport,
  CopyrightStrike,
  AppNotification
} from '../types.js';

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
  walletId: 'wlt_tn_001',
  copyrightStrikesCount: 0,
  uploadBlocked: false
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

import type { Advertisement, AppSettings, AdminUser } from '../types.js';

export const INITIAL_ADVERTISEMENTS: Advertisement[] = [
  {
    id: 'ad_chennai_silks_01',
    title: 'தீபாவளி & திருமண பட்டுப் புடவைகள் சிறப்பு தள்ளுபடி - The Chennai Silks',
    advertiserName: 'The Chennai Silks & Textiles',
    adType: 'banner',
    mediaUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1200&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&auto=format&fit=crop&q=80',
    targetUrl: 'https://www.thechennaisilks.com',
    callToAction: 'விவரங்களை காண்க (50% Off)',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    targetLocation: {
      district: 'Chennai',
      taluk: 'Chennai Central',
      area: 'T. Nagar & Parrys'
    },
    position: 'after_3', // News 3க்கு பிறகு
    status: 'active',
    impressions: 1420,
    clicks: 86,
    createdAt: new Date().toISOString()
  },
  {
    id: 'ad_ponneri_motors_02',
    title: 'புதிய மின்சார இருசக்கர வாகனம் - பொன்னேரி ஈவி மோட்டார்ஸ்',
    advertiserName: 'Ponneri GreenEV Automotives',
    adType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=1200&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&auto=format&fit=crop&q=80',
    targetUrl: 'https://wa.me/919840123456',
    callToAction: 'டெஸ்ட் டிரைவ் புக் செய்க',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    targetLocation: {
      district: 'Tiruvallur',
      taluk: 'Ponneri',
      area: 'Ponneri & Minjur'
    },
    position: 'after_5', // News 5க்கு பிறகு
    status: 'active',
    impressions: 890,
    clicks: 45,
    createdAt: new Date().toISOString()
  },
  {
    id: 'ad_saravana_store_03',
    title: 'Super Saravana Stores - வீட்டு உபயோகப் பொருட்கள் திருவிழா',
    advertiserName: 'Super Saravana Stores',
    adType: 'video',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80',
    targetUrl: 'https://supersaravanastores.com',
    callToAction: 'இப்போதே வாங்குங்கள்',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    targetLocation: {
      district: 'All',
      taluk: 'All',
      area: 'All'
    },
    position: 'interval_3', // Every 3 News items
    status: 'active',
    impressions: 2150,
    clicks: 142,
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_ADMIN_USERS: AdminUser[] = [
  {
    id: 'adm_001',
    name: 'Chief Bureau Editor',
    email: 'jrinfotechponneri@gmail.com',
    role: 'super_admin',
    status: 'active',
    lastLogin: new Date().toISOString(),
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'adm_002',
    name: 'Chennai Senior Reporter',
    email: 'editor.chennai@spotlight.local',
    role: 'editor',
    status: 'active',
    lastLogin: new Date().toISOString(),
    createdAt: '2026-01-10T00:00:00.000Z'
  },
  {
    id: 'adm_003',
    name: 'Civic Content Reviewer',
    email: 'moderator@spotlight.local',
    role: 'moderator',
    status: 'active',
    lastLogin: new Date().toISOString(),
    createdAt: '2026-01-15T00:00:00.000Z'
  },
  {
    id: 'adm_004',
    name: 'Commercial Ad Desk',
    email: 'ads@spotlight.local',
    role: 'ad_manager',
    status: 'active',
    lastLogin: new Date().toISOString(),
    createdAt: '2026-01-20T00:00:00.000Z'
  }
];

export const INITIAL_APP_SETTINGS: AppSettings = {
  branding: {
    appName: 'Spotlight Hyperlocal News',
    tagline: 'Tamil Nadu Hyperlocal Breaking News & Citizen Video Network',
    logoUrl: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=160&auto=format&fit=crop&q=80',
    faviconUrl: '/favicon.ico',
    primaryColor: '#ea580c', // Spotlight Vibrant Orange
    supportEmail: 'contact@spotlightnews.local',
    supportPhone: '+91 98401 23456'
  },
  categories: [
    { id: 'cat_all', key: 'all', nameTamil: 'அனைத்தும்', nameEnglish: 'All News', icon: 'Compass', color: '#ea580c', enabled: true, sortOrder: 1 },
    { id: 'cat_traffic', key: 'traffic', nameTamil: 'போக்குவரத்து', nameEnglish: 'Traffic & Road', icon: 'Car', color: '#ef4444', enabled: true, sortOrder: 2 },
    { id: 'cat_weather', key: 'weather', nameTamil: 'வானிலை & மழை', nameEnglish: 'Weather & Rain', icon: 'CloudRain', color: '#0ea5e9', enabled: true, sortOrder: 3 },
    { id: 'cat_civic', key: 'civic', nameTamil: 'நகராட்சி & குடிமை', nameEnglish: 'Civic Issues', icon: 'Building2', color: '#f59e0b', enabled: true, sortOrder: 4 },
    { id: 'cat_safety', key: 'safety', nameTamil: 'பாதுகாப்பு & அவசரம்', nameEnglish: 'Safety & Police', icon: 'ShieldAlert', color: '#dc2626', enabled: true, sortOrder: 5 },
    { id: 'cat_community', key: 'community', nameTamil: 'சமூகம் & விழாக்கள்', nameEnglish: 'Community & Culture', icon: 'Users', color: '#8b5cf6', enabled: true, sortOrder: 6 },
    { id: 'cat_business', key: 'business', nameTamil: 'வணிகம் & சந்தை', nameEnglish: 'Business & Market', icon: 'TrendingUp', color: '#10b981', enabled: true, sortOrder: 7 },
    { id: 'cat_sports', key: 'sports', nameTamil: 'விளையாட்டு', nameEnglish: 'Sports', icon: 'Trophy', color: '#06b6d4', enabled: true, sortOrder: 8 }
  ],
  locations: {
    districts: [
      {
        name: 'Chennai',
        taluks: [
          { name: 'Chennai Central', areas: ['Parrys', 'George Town', 'Anna Salai', 'Egmore'] },
          { name: 'Mylapore', areas: ['Mylapore', 'Mandaveli', 'Alwarpet', 'RA Puram'] },
          { name: 'Guindy', areas: ['Guindy', 'Saidapet', 'Velachery', 'Adyar'] },
          { name: 'Ambattur', areas: ['Ambattur OT', 'Industrial Estate', 'Padi', 'Mogappair'] },
          { name: 'T. Nagar', areas: ['Pondy Bazaar', 'Panagal Park', 'Kodambakkam'] }
        ]
      },
      {
        name: 'Tiruvallur',
        taluks: [
          { name: 'Ponneri', areas: ['Ponneri Town', 'Minjur', 'Kavaraipettai', 'Medur'] },
          { name: 'Avadi', areas: ['Avadi Checkpost', 'Pattabiram', 'HVF Estate', 'Thirumullaivoyal'] },
          { name: 'Tiruvallur', areas: ['Collectorate Area', 'Railway Station', 'Veeraraghava Temple'] },
          { name: 'Poonamallee', areas: ['Poonamallee Trunk Road', 'Kumananchavadi', 'Mangadu'] },
          { name: 'Gummidipoondi', areas: ['SIPCOT Industrial Complex', 'Bazaar', 'Elavur'] }
        ]
      },
      {
        name: 'Chengalpattu',
        taluks: [
          { name: 'Tambaram', areas: ['Tambaram Sanatorium', 'West Tambaram', 'Chromepet', 'Pallavaram'] },
          { name: 'Chengalpattu', areas: ['Medical College', 'Guduvanchery', 'Maraimalai Nagar'] }
        ]
      },
      {
        name: 'Kanchipuram',
        taluks: [
          { name: 'Kanchipuram', areas: ['Silk Town', 'Bus Stand', 'Ennaikaran'] },
          { name: 'Sriperumbudur', areas: ['SIPCOT Zone', 'Toll Plaza', 'Vallakkottai'] }
        ]
      }
    ],
    defaultLat: 13.0827,
    defaultLng: 80.2707,
    defaultRadiusKm: 25
  },
  notifications: {
    pushAlertsEnabled: true,
    breakingNewsAlerts: true,
    reportApprovalAlerts: true,
    payoutAlerts: true,
    soundEnabled: true,
    fcmServerKeyConfigured: true
  },
  advertisements: {
    globalAdsEnabled: true,
    defaultAdPosition: 'interval_3',
    maxAdsPerSession: 8,
    sponsoredBadgeText: 'விளம்பரம் • Sponsored',
    allowThirdPartyNetworks: false,
    enableVideoInterstitialInSpots: true
  },
  socialImport: {
    autoImportEnabled: true,
    youtubeChannels: ['@PolimerNews', '@ThanthiTVNews', '@PuthiyathalaimuraiTV'],
    twitterHandles: ['@chennaipolice_', '@TiruvallurDist', '@dtnext'],
    instagramPages: ['@chennai_updates', '@spotlight_hyperlocal'],
    rssFeeds: ['https://www.dinamalar.com/rss.asp', 'https://www.dailythanthi.com/rss'],
    defaultReviewStatusForImported: 'pending_review'
  },
  api: {
    r2Configured: true,
    r2Bucket: 'spotlight-media',
    r2PublicUrl: 'https://pub-5051362230a34232ba4afb2cf7ac345c.r2.dev',
    googleOAuthConfigured: true,
    googleClientId: '457891409432-iq0h518ncoq89u9mf4h694mluq7v5sem.apps.googleusercontent.com',
    dbConfigured: true,
    webhookUrl: ''
  },
  adminUsers: INITIAL_ADMIN_USERS
};

export const INITIAL_SOCIAL_IMPORTS: SocialMediaPost[] = [
  {
    id: 'soc_gcc_001',
    platform: 'twitter',
    sourceHandle: '@chennaicorp',
    sourceName: 'Greater Chennai Corporation (GCC)',
    sourceAvatar: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=200&auto=format&fit=crop&q=80',
    sourceUrl: 'https://twitter.com/chennaicorp/status/18889201948',
    externalPostId: 'tw_gcc_18889201948',
    mediaType: 'video',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=600&auto=format&fit=crop&q=80',
    rawTitle: 'Severe waterlogging cleared at Vyasarpadi Ganesapuram Subway after high-power motor suction operations.',
    rawContent: 'GCC Disaster Management Teams have successfully drained stagnant rainwater from Vyasarpadi Ganesapuram subway using 100 HP submersible pumps. Traffic flow has now been restored normal for two-wheelers and MTC buses. #ChennaiRains #GCCUpdates',
    publishedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    importedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    aiHeadline: 'வியாசர்பாடி கணேசபுரம் சுரங்கப்பாதையில் தேங்கிய மழைநீர் அகற்றம் - போக்குவரத்து சீரானது!',
    aiSummary: 'பெருநகர சென்னை மாநகராட்சி பேரிடர் மேலாண்மைக் குழுவினர் 100 HP நீர் உறிஞ்சும் மோட்டார்கள் மூலம் வியாசர்பாடி கணேசபுரம் சுரங்கப்பாதையில் தேங்கியிருந்த மழைநீரை முழுமையாக அகற்றியுள்ளனர். தற்போது பேருந்துகள் மற்றும் இருசக்கர வாகனப் போக்குவரத்து இயல்பு நிலைக்குத் திரும்பியுள்ளது.',
    aiCategory: 'civic',
    aiLocation: {
      placeName: 'Vyasarpadi Subway',
      neighborhood: 'Zone 4 Tondiarpet / Vyasarpadi',
      district: 'Chennai',
      lat: 13.1097,
      lng: 80.2604,
      radiusMeters: 4000
    },
    aiKeywords: ['மழைநீர்', 'வியாசர்பாடி', 'சுரங்கப்பாதை', 'சென்னை மாநகராட்சி', 'போக்குவரத்து'],
    aiProcessed: true,
    isDuplicate: false,
    duplicateScore: 0,
    status: 'staged_pending'
  },
  {
    id: 'soc_cctp_002',
    platform: 'twitter',
    sourceHandle: '@ChennaiTraffic',
    sourceName: 'Greater Chennai Traffic Police (CCTP)',
    sourceAvatar: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200&auto=format&fit=crop&q=80',
    sourceUrl: 'https://twitter.com/ChennaiTraffic/status/18889345678',
    externalPostId: 'tw_cctp_18889345678',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop&q=80',
    rawTitle: 'Traffic Advisory: Anna Salai Sterling Road junction diversions starting tonight for Metro Line 4 construction.',
    rawContent: 'Commuters please note: From 10:00 PM tonight, vehicular movement from Gemini flyover towards Sterling Road will be diverted via College Road due to CMRL shaft boring. Heavy vehicles to use Chetpet route. Plan your commute accordingly. #ChennaiTrafficAlert',
    publishedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    importedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    aiHeadline: 'அண்ணா சாலை - ஸ்டெர்லிங் ரோடு சந்திப்பில் இன்றிரவு முதல் போக்குவரத்து மாற்றம்: முழு விவரம்!',
    aiSummary: 'சென்னை மெட்ரோ ரயில் இரண்டாம் கட்டப் பணிகள் காரணமாக அண்ணா சாலை ஜெமினி மேம்பாலத்திலிருந்து ஸ்டெர்லிங் சாலை செல்லும் வாகனங்கள் இன்றிரவு 10 மணி முதல் கல்லூரி சாலை வழியாக மாற்றிவிடப்படும் என்று சென்னை போக்குவரத்து காவல்துறை அறிவித்துள்ளது.',
    aiCategory: 'traffic',
    aiLocation: {
      placeName: 'Gemini Flyover / Anna Salai',
      neighborhood: 'Zone 9 Teynampet',
      district: 'Chennai',
      lat: 13.0538,
      lng: 80.2514,
      radiusMeters: 5000
    },
    aiKeywords: ['மெட்ரோ ரயில்', 'போக்குவரத்து மாற்றம்', 'அண்ணா சாலை', 'ஜெமினி மேம்பாலம்'],
    aiProcessed: true,
    isDuplicate: false,
    duplicateScore: 0,
    status: 'staged_pending'
  },
  {
    id: 'soc_dup_003',
    platform: 'rss',
    sourceHandle: '@dinamalar_news',
    sourceName: 'Dinamalar Online (தினமலர்)',
    sourceAvatar: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=200&auto=format&fit=crop&q=80',
    sourceUrl: 'https://www.dinamalar.com/news_detail.asp?id=3847291',
    externalPostId: 'rss_dina_3847291',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=400&auto=format&fit=crop&q=80',
    rawTitle: 'வியாசர்பாடி கணேசபுரம் சுரங்கப்பாதையில் தண்ணீர் அகற்றம்: போக்குவரத்து தொடங்கியது.',
    rawContent: 'வியாசர்பாடி பகுதியில் உள்ள கணேசபுரம் சுரங்கப்பாதையில் தேங்கியிருந்த மழைநீர் மோட்டார்கள் மூலம் வெளியேற்றப்பட்டு வாகனப் போக்குவரத்து மீண்டும் அனுமதிக்கப்பட்டது.',
    publishedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    importedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    aiHeadline: 'வியாசர்பாடி கணேசபுரம் சுரங்கப்பாதையில் மழைநீர் வெளியேற்றம்',
    aiSummary: 'வியாசர்பாடி சுரங்கப்பாதையில் நீர் வெளியேற்றப்பட்டு போக்குவரத்து துவங்கியுள்ளது.',
    aiCategory: 'civic',
    aiLocation: {
      placeName: 'Vyasarpadi Subway',
      neighborhood: 'Vyasarpadi',
      district: 'Chennai',
      lat: 13.1097,
      lng: 80.2604,
      radiusMeters: 4000
    },
    aiKeywords: ['வியாசர்பாடி', 'மழைநீர்'],
    aiProcessed: true,
    isDuplicate: true,
    duplicateScore: 92.5,
    duplicateMatchedPostId: 'soc_gcc_001',
    duplicateMatchedTitle: 'Severe waterlogging cleared at Vyasarpadi Ganesapuram Subway after high-power motor suction operations.',
    status: 'staged_pending'
  },
  {
    id: 'soc_youtube_004',
    platform: 'youtube',
    sourceHandle: '@ThanthiTVNews',
    sourceName: 'Thanthi TV (தந்தி டிவி)',
    sourceAvatar: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=200&auto=format&fit=crop&q=80',
    sourceUrl: 'https://www.youtube.com/watch?v=sample_thanthi_01',
    externalPostId: 'yt_thanthi_01',
    mediaType: 'video',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80',
    rawTitle: 'எண்ணூர் முகத்துவார கழிமுகப் பகுதியில் தீவிர சீரமைப்புப் பணிகள்: மாவட்ட ஆட்சியர் நேரில் ஆய்வு!',
    rawContent: 'எண்ணூர் கழிமுகப்பகுதியில் தூர்வாரும் பணிகள் போர்க்கால அடிப்படையில் நடைபெற்று வருகின்றன. திருவள்ளூர் மாவட்ட ஆட்சியர் மற்றும் சுற்றுச்சூழல் நிபுணர்கள் இணைந்து படகில் சென்று ஆய்வு மேற்கொண்டனர்.',
    publishedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    importedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    aiHeadline: 'எண்ணூர் முகத்துவாரத்தில் தூர்வாரும் பணி தீவிரம்: திருவள்ளூர் மாவட்ட ஆட்சியர் நேரில் ஆய்வு!',
    aiSummary: 'எண்ணூர் கழிமுகப் பகுதியில் படகுகள் தடையின்றி செல்லவும் வெள்ளநீர் சீராக வெளியேறவும் நடைபெற்று வரும் தூர்வாரும் பணிகளை திருவள்ளூர் மாவட்ட நிர்வாகம் தீவிரப்படுத்தியுள்ளது. ஆட்சியர் நேரில் சென்று பணிகளை ஆய்வு செய்தார்.',
    aiCategory: 'civic',
    aiLocation: {
      placeName: 'Ennore Creek / Port',
      neighborhood: 'Ennore / Kathivakkam',
      district: 'Tiruvallur',
      lat: 13.2081,
      lng: 80.3228,
      radiusMeters: 6000
    },
    aiKeywords: ['எண்ணூர்', 'கழிமுகம்', 'திருவள்ளூர் ஆட்சியர்', 'சீரமைப்பு'],
    aiProcessed: true,
    isDuplicate: false,
    duplicateScore: 0,
    status: 'staged_pending'
  }
];

export const INITIAL_COPYRIGHT_REPORTS: CopyrightReport[] = [
  {
    id: 'cr_rep_001',
    postId: 'post_01',
    postTitle: 'Severe Waterlogging at Koyambedu Market Wholesale Hub',
    postMediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    postThumbnailUrl: 'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?w=600',
    postCreatorId: 'usr_tn_001',
    postCreatorName: 'Citizen Journalist',
    postCreatorHandle: 'citizen_reporter',
    claimantName: 'Sun News Digital Rights Desk',
    claimantEmail: 'dmca@sunnetwork.in',
    claimantRelation: 'owner',
    originalWorkTitle: 'Chennai Rain Ground Broadcast Reel #4419',
    originalWorkUrl: 'https://youtube.com/watch?v=sample_sun_weather',
    infringementType: 'visual_clip',
    infringementTimestamp: '00:05 - 00:28',
    description: 'The uploaded citizen report contains 23 seconds of broadcast video footage recorded and owned exclusively by Sun News Tamil without licensing or editorial credit.',
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
  }
];

export const INITIAL_COPYRIGHT_STRIKES: CopyrightStrike[] = [];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif_welcome',
    userId: 'usr_tn_001',
    title: 'Spotlight360 Community Standing Notice',
    message: 'Welcome to Spotlight360! Please ensure all news dispatches are original eyewitness recordings or credited appropriately to avoid copyright strikes.',
    type: 'system',
    read: false,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  }
];

