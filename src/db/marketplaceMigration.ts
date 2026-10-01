import { pool } from '../config/db.js';

export async function runMarketplaceMigration(): Promise<boolean> {
  console.log('[Marketplace Migration] Starting Supabase schema check for Marketplace, Real Estate & Jobs...');

  try {
    const client = await pool.connect();
    try {
      // 1. Marketplace Products (OLX / Buy & Sell)
      await client.query(`
        CREATE TABLE IF NOT EXISTS marketplace_products (
          id VARCHAR(64) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          price NUMERIC(12, 2) NOT NULL,
          price_negotiable BOOLEAN DEFAULT FALSE,
          category VARCHAR(64) NOT NULL,
          condition VARCHAR(64) NOT NULL,
          description TEXT NOT NULL,
          location VARCHAR(255) NOT NULL,
          distance_km NUMERIC(6, 2) DEFAULT 0,
          posted_at VARCHAR(64),
          views_count INTEGER DEFAULT 0,
          images JSONB DEFAULT '[]'::jsonb,
          video_url TEXT,
          specs JSONB DEFAULT '{}'::jsonb,
          seller JSONB NOT NULL DEFAULT '{}'::jsonb,
          status VARCHAR(32) DEFAULT 'active',
          is_favorite BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_mp_products_cat ON marketplace_products(category);
        CREATE INDEX IF NOT EXISTS idx_mp_products_status ON marketplace_products(status);
        CREATE INDEX IF NOT EXISTS idx_mp_products_created ON marketplace_products(created_at DESC);
      `);

      // 2. Real Estate Properties
      await client.query(`
        CREATE TABLE IF NOT EXISTS real_estate_properties (
          id VARCHAR(64) PRIMARY KEY,
          seller_id VARCHAR(64),
          title VARCHAR(255) NOT NULL,
          price VARCHAR(128) NOT NULL,
          numeric_price NUMERIC(14, 2) DEFAULT 0,
          price_unit VARCHAR(32) DEFAULT 'total',
          listing_type VARCHAR(64) NOT NULL,
          property_category VARCHAR(64),
          property_type VARCHAR(64) NOT NULL,
          location VARCHAR(255) NOT NULL,
          area_sq_ft NUMERIC(10, 2) DEFAULT 0,
          bedrooms INTEGER DEFAULT 0,
          bathrooms INTEGER DEFAULT 0,
          furnishing VARCHAR(64),
          property_age VARCHAR(64),
          floor VARCHAR(64),
          total_floors VARCHAR(64),
          parking VARCHAR(64),
          description TEXT NOT NULL,
          seller_type VARCHAR(64) DEFAULT 'Owner',
          contact_name VARCHAR(128),
          contact_number VARCHAR(32),
          whatsapp_number VARCHAR(32),
          email VARCHAR(255),
          photos JSONB DEFAULT '[]'::jsonb,
          videos JSONB DEFAULT '[]'::jsonb,
          cover_image TEXT,
          images JSONB DEFAULT '[]'::jsonb,
          is_verified BOOLEAN DEFAULT FALSE,
          status VARCHAR(32) DEFAULT 'active',
          specifications JSONB DEFAULT '{}'::jsonb,
          owner JSONB DEFAULT '{}'::jsonb,
          is_saved BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_re_properties_type ON real_estate_properties(property_type);
        CREATE INDEX IF NOT EXISTS idx_re_properties_status ON real_estate_properties(status);
        CREATE INDEX IF NOT EXISTS idx_re_properties_created ON real_estate_properties(created_at DESC);
      `);

      // 3. Marketplace Jobs
      await client.query(`
        CREATE TABLE IF NOT EXISTS marketplace_jobs (
          id VARCHAR(64) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          company VARCHAR(255) NOT NULL,
          company_logo TEXT,
          location VARCHAR(255) NOT NULL,
          salary VARCHAR(128),
          job_type VARCHAR(64) NOT NULL,
          experience VARCHAR(64),
          category VARCHAR(64) NOT NULL,
          description TEXT NOT NULL,
          requirements JSONB DEFAULT '[]'::jsonb,
          skills JSONB DEFAULT '[]'::jsonb,
          contact_email VARCHAR(255) NOT NULL,
          contact_phone VARCHAR(32),
          applicant_count INTEGER DEFAULT 0,
          status VARCHAR(32) DEFAULT 'active',
          is_saved BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_category ON marketplace_jobs(category);
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON marketplace_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_created ON marketplace_jobs(created_at DESC);
      `);

      // 4. Marketplace Chats
      await client.query(`
        CREATE TABLE IF NOT EXISTS marketplace_chats (
          id VARCHAR(64) PRIMARY KEY,
          product_id VARCHAR(64) NOT NULL,
          sender_id VARCHAR(64) NOT NULL,
          sender_name VARCHAR(128) NOT NULL,
          text TEXT NOT NULL,
          timestamp VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_chats_product ON marketplace_chats(product_id);
      `);

      // Check and Seed Initial Products
      const prodCheck = await client.query('SELECT COUNT(*) FROM marketplace_products');
      if (parseInt(prodCheck.rows[0].count, 10) === 0) {
        console.log('[Marketplace Migration] Seeding initial OLX products into Supabase...');
        const initialProducts = [
          {
            id: 'prod-iphone15',
            title: 'iPhone 15 (256GB)',
            price: 62000,
            priceNegotiable: true,
            category: 'mobiles',
            condition: 'Like New',
            description: 'iPhone 15 256GB, original box with charger. Excellent condition, no scratches. Bill available. Battery health 98%.',
            location: 'Andheri West, Mumbai',
            distanceKm: 1.2,
            postedAt: '2 days ago',
            viewsCount: 13,
            images: JSON.stringify([
              'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80',
              'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=800&q=80'
            ]),
            specs: JSON.stringify({ brand: 'Apple', model: 'iPhone 15', storage: '256 GB', condition: 'Like New' }),
            seller: JSON.stringify({
              id: 'seller-rohit',
              name: 'Rohit Sharma',
              avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
              joinedDate: 'Jan 2024',
              verified: true,
              phone: '+91 98201 54321',
              whatsapp: '919820154321',
              email: 'rohit.sharma@example.com'
            }),
            status: 'active'
          },
          {
            id: 'prod-s23',
            title: 'Samsung Galaxy S23',
            price: 58000,
            priceNegotiable: true,
            category: 'mobiles',
            condition: 'Like New',
            description: 'Samsung Galaxy S23 128GB Phantom Black. Under brand warranty. With official silicon cover and original adapter.',
            location: 'Bandra, Mumbai',
            distanceKm: 2.5,
            postedAt: '3 days ago',
            viewsCount: 28,
            images: JSON.stringify([
              'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=800&q=80'
            ]),
            specs: JSON.stringify({ brand: 'Samsung', model: 'Galaxy S23', storage: '128 GB', condition: 'Like New' }),
            seller: JSON.stringify({
              id: 'seller-priya',
              name: 'Priya Patel',
              avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
              joinedDate: 'Mar 2023',
              verified: true,
              phone: '+91 98202 88412',
              whatsapp: '919820288412',
              email: 'priya.patel@example.com'
            }),
            status: 'active'
          },
          {
            id: 'prod-macbook-air-m2',
            title: 'MacBook Air M2 (16GB RAM, 512GB SSD)',
            price: 89000,
            priceNegotiable: false,
            category: 'electronics',
            condition: 'Like New',
            description: 'Midnight Blue MacBook Air M2 in pristine shape. Battery health 96%. Includes box, MagSafe cable, and 35W dual charger.',
            location: 'Powai, Mumbai',
            distanceKm: 4.1,
            postedAt: '1 day ago',
            viewsCount: 42,
            images: JSON.stringify([
              'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80'
            ]),
            specs: JSON.stringify({ brand: 'Apple', model: 'MacBook Air M2', storage: '512 GB' }),
            seller: JSON.stringify({
              id: 'seller-amit',
              name: 'Amit Verma',
              avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
              joinedDate: 'Nov 2022',
              verified: true,
              phone: '+91 98203 12984',
              whatsapp: '919820312984',
              email: 'amit.verma@example.com'
            }),
            status: 'active'
          }
        ];

        for (const p of initialProducts) {
          await client.query(
            `INSERT INTO marketplace_products (id, title, price, price_negotiable, category, condition, description, location, distance_km, posted_at, views_count, images, specs, seller, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, p.title, p.price, p.priceNegotiable, p.category, p.condition, p.description, p.location, p.distanceKm, p.postedAt, p.viewsCount, p.images, p.specs, p.seller, p.status]
          );
        }
      }

      // Check and Seed Initial Real Estate
      const propCheck = await client.query('SELECT COUNT(*) FROM real_estate_properties');
      if (parseInt(propCheck.rows[0].count, 10) === 0) {
        console.log('[Marketplace Migration] Seeding initial Real Estate properties into Supabase...');
        const initialProperties = [
          {
            id: 'prop-lux-anna-nagar',
            title: 'Ultra Luxury 3 BHK Highrise Apartment',
            price: '₹1.85 Cr',
            numericPrice: 18500000,
            priceUnit: 'total',
            listingType: 'Buy',
            propertyCategory: 'Residential',
            propertyType: 'Apartment',
            location: 'Anna Nagar West, Chennai',
            bedrooms: 3,
            bathrooms: 3,
            areaSqFt: 1850,
            images: JSON.stringify([
              'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
              'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'
            ]),
            description: 'Spacious east-facing 3BHK flat on 14th floor with panoramic city skyline view. 100% vaastu compliant, modular Italian kitchen, 2 covered car parks.',
            specifications: JSON.stringify({ furnishing: 'Semi-Furnished', facing: 'East Facing', floor: '14th of 18' }),
            owner: JSON.stringify({ name: 'Karthik Subramanian', role: 'Owner', phone: '+91 98401 23456', whatsapp: '919840123456', verified: true }),
            status: 'active'
          },
          {
            id: 'prop-villa-omr',
            title: 'Independent 4 BHK Gated Community Villa',
            price: '₹2.40 Cr',
            numericPrice: 24000000,
            priceUnit: 'total',
            listingType: 'Buy',
            propertyCategory: 'Residential',
            propertyType: 'Villa',
            location: 'OMR - Navalur, Chennai',
            bedrooms: 4,
            bathrooms: 4,
            areaSqFt: 2800,
            images: JSON.stringify([
              'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80'
            ]),
            description: 'Contemporary triplex designer villa inside a secured 25-acre luxury township with clubhouse, infinity pool, gym, and private terrace garden.',
            specifications: JSON.stringify({ furnishing: 'Fully Furnished', facing: 'North Facing', floor: 'G + 2 Floors' }),
            owner: JSON.stringify({ name: 'Elite Realty Associates', role: 'Agent', phone: '+91 98403 99881', whatsapp: '919840399881', verified: true }),
            status: 'active'
          }
        ];

        for (const pr of initialProperties) {
          await client.query(
            `INSERT INTO real_estate_properties (id, title, price, numeric_price, price_unit, listing_type, property_category, property_type, location, bedrooms, bathrooms, area_sq_ft, images, description, specifications, owner, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             ON CONFLICT (id) DO NOTHING`,
            [pr.id, pr.title, pr.price, pr.numericPrice, pr.priceUnit, pr.listingType, pr.propertyCategory, pr.propertyType, pr.location, pr.bedrooms, pr.bathrooms, pr.areaSqFt, pr.images, pr.description, pr.specifications, pr.owner, pr.status]
          );
        }
      }

      console.log('[Marketplace Migration] Supabase tables ensured for marketplace_products, real_estate_properties, marketplace_jobs, marketplace_chats!');
      return true;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[Marketplace Migration Error]:', error.message);
    return false;
  }
}
