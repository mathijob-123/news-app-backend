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

      // 5. Centralized Marketplace Reports & Complaints Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS marketplace_reports (
          id VARCHAR(64) PRIMARY KEY,
          item_type VARCHAR(32) NOT NULL, -- 'product' | 'job' | 'property' | 'user'
          item_id VARCHAR(64) NOT NULL,
          reported_user_id VARCHAR(64),
          reporter_id VARCHAR(64),
          reporter_name VARCHAR(128) NOT NULL,
          reporter_contact VARCHAR(128),
          reason VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(32) DEFAULT 'new', -- 'new' | 'under_review' | 'resolved' | 'rejected' | 'escalated'
          assigned_moderator VARCHAR(128),
          admin_notes TEXT,
          resolution TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_mp_reports_status ON marketplace_reports(status);
        CREATE INDEX IF NOT EXISTS idx_mp_reports_type ON marketplace_reports(item_type);
        CREATE INDEX IF NOT EXISTS idx_mp_reports_item ON marketplace_reports(item_id);
      `);

      // 6. Ensure schema column extensions for existing tables
      await client.query(`
        -- Alter marketplace_products
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(64);
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS district VARCHAR(128);
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS taluk VARCHAR(128);
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS area VARCHAR(128);
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0;
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS enquiries_count INTEGER DEFAULT 0;
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS whatsapp_clicks INTEGER DEFAULT 0;
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS contact_clicks INTEGER DEFAULT 0;
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS reports_count INTEGER DEFAULT 0;
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS admin_notes TEXT;
        ALTER TABLE marketplace_products ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

        -- Alter real_estate_properties
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS district VARCHAR(128);
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS taluk VARCHAR(128);
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS area VARCHAR(128);
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS super_built_up_area NUMERIC(10, 2) DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS plot_area NUMERIC(10, 2) DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS enquiries_count INTEGER DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS whatsapp_clicks INTEGER DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS contact_clicks INTEGER DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS reports_count INTEGER DEFAULT 0;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS admin_notes TEXT;
        ALTER TABLE real_estate_properties ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

        -- Alter marketplace_jobs
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS district VARCHAR(128);
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS area VARCHAR(128);
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS recruiter_name VARCHAR(128);
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS recruiter_whatsapp VARCHAR(32);
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS min_salary NUMERIC(12, 2) DEFAULT 0;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS max_salary NUMERIC(12, 2) DEFAULT 0;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS education VARCHAR(128);
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS benefits JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS openings_count INTEGER DEFAULT 1;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS expiry_date VARCHAR(64);
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS reports_count INTEGER DEFAULT 0;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS admin_notes TEXT;
        ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
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
            location: 'Anna Nagar, Chennai',
            distanceKm: 1.2,
            postedAt: '2 days ago',
            viewsCount: 48,
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
            location: 'T. Nagar, Chennai',
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
            location: 'Velachery, Chennai',
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
            `INSERT INTO marketplace_products (id, title, price, price_negotiable, category, condition, description, location, distance_km, posted_at, views_count, images, specs, seller, status, is_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)
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
            `INSERT INTO real_estate_properties (id, title, price, numeric_price, price_unit, listing_type, property_category, property_type, location, bedrooms, bathrooms, area_sq_ft, images, description, specifications, owner, status, is_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true)
             ON CONFLICT (id) DO NOTHING`,
            [pr.id, pr.title, pr.price, pr.numericPrice, pr.priceUnit, pr.listingType, pr.propertyCategory, pr.propertyType, pr.location, pr.bedrooms, pr.bathrooms, pr.areaSqFt, pr.images, pr.description, pr.specifications, pr.owner, pr.status]
          );
        }
      }

      // Check and Seed Initial Jobs
      const jobCheck = await client.query('SELECT COUNT(*) FROM marketplace_jobs');
      if (parseInt(jobCheck.rows[0].count, 10) === 0) {
        console.log('[Marketplace Migration] Seeding initial Jobs into Supabase...');
        const initialJobs = [
          {
            id: 'job-frontend-dev',
            title: 'Senior Frontend Developer (React)',
            company: 'Nexus Infotech Solutions',
            location: 'Tidel Park, Tharamani, Chennai',
            salary: '₹12 - 18 LPA',
            job_type: 'Full Time',
            experience: '4-7 Years',
            category: 'IT & Software',
            description: 'Looking for an experienced React/TypeScript specialist to build high-scale web products with modern UI/UX workflows.',
            requirements: JSON.stringify(['4+ years React/TypeScript', 'Tailwind or Modern CSS', 'REST API integrations', 'State Management']),
            skills: JSON.stringify(['React', 'TypeScript', 'Node.js', 'Redux', 'REST APIs']),
            contact_email: 'careers@nexusinfo.com',
            contact_phone: '+91 98405 67890',
            applicant_count: 14,
            status: 'active',
            is_verified: true
          },
          {
            id: 'job-sales-exec',
            title: 'Area Business Development Manager',
            company: 'Kavitha Motors & Logistics',
            location: 'Ambattur Industrial Estate, Chennai',
            salary: '₹35,000 - 50,000/mo',
            job_type: 'Full Time',
            experience: '2-5 Years',
            category: 'Sales',
            description: 'Responsible for B2B client acquisition, dealership relationships, and territory expansion across North Chennai.',
            requirements: JSON.stringify(['2+ years field sales', 'Excellent Tamil & English communication', 'Two wheeler required']),
            skills: JSON.stringify(['B2B Sales', 'Negotiation', 'Field Marketing', 'CRM']),
            contact_email: 'hr@kavithamotors.com',
            contact_phone: '+91 94441 23456',
            applicant_count: 8,
            status: 'active',
            is_verified: true
          }
        ];

        for (const j of initialJobs) {
          await client.query(
            `INSERT INTO marketplace_jobs (id, title, company, location, salary, job_type, experience, category, description, requirements, skills, contact_email, contact_phone, applicant_count, status, is_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (id) DO NOTHING`,
            [j.id, j.title, j.company, j.location, j.salary, j.job_type, j.experience, j.category, j.description, j.requirements, j.skills, j.contact_email, j.contact_phone, j.applicant_count, j.status, j.is_verified]
          );
        }
      }

      // Check and Seed Initial Reports
      const reportCheck = await client.query('SELECT COUNT(*) FROM marketplace_reports');
      if (parseInt(reportCheck.rows[0].count, 10) === 0) {
        console.log('[Marketplace Migration] Seeding initial Marketplace reports into Supabase...');
        const initialReports = [
          {
            id: 'rep-mp-101',
            item_type: 'product',
            item_id: 'prod-iphone15',
            reported_user_id: 'seller-rohit',
            reporter_id: 'usr_buyer_44',
            reporter_name: 'Vignesh K.',
            reporter_contact: '+91 97910 88231',
            reason: 'Suspected incorrect battery health claim',
            description: 'Seller claims 98% battery health but diagnostics screenshot is not attached in the listing description.',
            status: 'under_review',
            assigned_moderator: 'Moderator Desk',
            admin_notes: 'Checking IMEI and receipt verification with seller.'
          },
          {
            id: 'rep-mp-102',
            item_type: 'job',
            item_id: 'job-sales-exec',
            reported_user_id: 'usr_recruiter_9',
            reporter_id: 'usr_jobseeker_12',
            reporter_name: 'Anand Mohan',
            reporter_contact: 'anand.m@gmail.com',
            reason: 'Unclear working hours / incentive terms',
            description: 'Job description lists monthly salary but does not disclose travel allowance conditions for field sales.',
            status: 'new',
            assigned_moderator: 'Unassigned',
            admin_notes: 'Under initial review queue.'
          }
        ];

        for (const rep of initialReports) {
          await client.query(
            `INSERT INTO marketplace_reports (id, item_type, item_id, reported_user_id, reporter_id, reporter_name, reporter_contact, reason, description, status, assigned_moderator, admin_notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [rep.id, rep.item_type, rep.item_id, rep.reported_user_id, rep.reporter_id, rep.reporter_name, rep.reporter_contact, rep.reason, rep.description, rep.status, rep.assigned_moderator, rep.admin_notes]
          );
        }
      }

      console.log('[Marketplace Migration] Supabase tables ensured for marketplace_products, real_estate_properties, marketplace_jobs, marketplace_chats & marketplace_reports!');
      return true;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[Marketplace Migration Error]:', error.message);
    return false;
  }
}

