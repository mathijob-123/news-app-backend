import { Router, Request, Response } from 'express';
import { pool } from '../config/db.js';

export const marketplaceRouter = Router();

// ==========================================
// 1. PRODUCTS (OLX / Buy & Sell)
// ==========================================

// GET all products with optional filters
marketplaceRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const { category, search, condition, sortBy } = req.query;

    let query = 'SELECT * FROM marketplace_products WHERE status = $1';
    const params: any[] = ['active'];
    let paramIndex = 2;

    if (category && category !== 'all') {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (condition && condition !== 'all') {
      query += ` AND condition = $${paramIndex++}`;
      params.push(condition);
    }

    if (search && typeof search === 'string' && search.trim()) {
      query += ` AND (LOWER(title) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex} OR LOWER(location) LIKE $${paramIndex})`;
      params.push(`%${search.toLowerCase().trim()}%`);
      paramIndex++;
    }

    if (sortBy === 'price_low') {
      query += ' ORDER BY price ASC';
    } else if (sortBy === 'price_high') {
      query += ' ORDER BY price DESC';
    } else {
      query += ' ORDER BY created_at DESC';
    }

    const result = await pool.query(query, params);
    
    // Format JSONB and fields for frontend consumption
    const products = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      price: parseFloat(row.price),
      priceNegotiable: row.price_negotiable,
      category: row.category,
      condition: row.condition,
      description: row.description,
      location: row.location,
      distanceKm: parseFloat(row.distance_km || '0'),
      postedAt: row.posted_at || 'Recently',
      viewsCount: row.views_count || 0,
      images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : []),
      videoUrl: row.video_url,
      specs: typeof row.specs === 'object' ? row.specs : JSON.parse(row.specs || '{}'),
      seller: typeof row.seller === 'object' ? row.seller : JSON.parse(row.seller || '{}'),
      status: row.status,
      isFavorite: row.is_favorite || false,
      createdAt: row.created_at
    }));

    return res.json({ success: true, count: products.length, products });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /products]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET single product by ID
marketplaceRouter.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM marketplace_products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    const row = result.rows[0];
    const product = {
      id: row.id,
      title: row.title,
      price: parseFloat(row.price),
      priceNegotiable: row.price_negotiable,
      category: row.category,
      condition: row.condition,
      description: row.description,
      location: row.location,
      distanceKm: parseFloat(row.distance_km || '0'),
      postedAt: row.posted_at || 'Recently',
      viewsCount: row.views_count || 0,
      images: Array.isArray(row.images) ? row.images : JSON.parse(row.images || '[]'),
      videoUrl: row.video_url,
      specs: typeof row.specs === 'object' ? row.specs : JSON.parse(row.specs || '{}'),
      seller: typeof row.seller === 'object' ? row.seller : JSON.parse(row.seller || '{}'),
      status: row.status,
      isFavorite: row.is_favorite || false
    };
    return res.json({ success: true, product });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST create new product ad
marketplaceRouter.post('/products', async (req: Request, res: Response) => {
  try {
    const {
      id,
      title,
      price,
      priceNegotiable = false,
      category,
      condition = 'Like New',
      description,
      location,
      distanceKm = 0,
      postedAt = 'Just now',
      images = [],
      videoUrl,
      specs = {},
      seller = {}
    } = req.body;

    if (!title || !price || !category || !description || !location) {
      return res.status(400).json({ success: false, error: 'Missing required product fields' });
    }

    const productId = id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const query = `
      INSERT INTO marketplace_products (
        id, title, price, price_negotiable, category, condition, description,
        location, distance_km, posted_at, views_count, images, video_url, specs, seller, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active')
      RETURNING *
    `;

    const values = [
      productId,
      title,
      price,
      priceNegotiable,
      category,
      condition,
      description,
      location,
      distanceKm,
      postedAt,
      1,
      JSON.stringify(images),
      videoUrl || null,
      JSON.stringify(specs),
      JSON.stringify(seller)
    ];

    const result = await pool.query(query, values);
    const created = result.rows[0];

    return res.status(201).json({
      success: true,
      product: {
        id: created.id,
        title: created.title,
        price: parseFloat(created.price),
        priceNegotiable: created.price_negotiable,
        category: created.category,
        condition: created.condition,
        description: created.description,
        location: created.location,
        distanceKm: parseFloat(created.distance_km || '0'),
        postedAt: created.posted_at,
        viewsCount: created.views_count,
        images: Array.isArray(created.images) ? created.images : JSON.parse(created.images || '[]'),
        videoUrl: created.video_url,
        specs: typeof created.specs === 'object' ? created.specs : JSON.parse(created.specs || '{}'),
        seller: typeof created.seller === 'object' ? created.seller : JSON.parse(created.seller || '{}'),
        status: created.status
      }
    });
  } catch (err: any) {
    console.error('[Marketplace API Error - POST /products]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH product status (sold, paused, active)
marketplaceRouter.patch('/products/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    await pool.query('UPDATE marketplace_products SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    return res.json({ success: true, message: `Product status updated to ${status}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. REAL ESTATE PROPERTIES
// ==========================================

// GET all properties
marketplaceRouter.get('/properties', async (req: Request, res: Response) => {
  try {
    const { listingType, propertyType, search } = req.query;

    let query = 'SELECT * FROM real_estate_properties WHERE status = $1';
    const params: any[] = ['active'];
    let pIdx = 2;

    if (listingType && listingType !== 'all') {
      query += ` AND listing_type = $${pIdx++}`;
      params.push(listingType);
    }

    if (propertyType && propertyType !== 'all') {
      query += ` AND property_type = $${pIdx++}`;
      params.push(propertyType);
    }

    if (search && typeof search === 'string' && search.trim()) {
      query += ` AND (LOWER(title) LIKE $${pIdx} OR LOWER(description) LIKE $${pIdx} OR LOWER(location) LIKE $${pIdx})`;
      params.push(`%${search.toLowerCase().trim()}%`);
      pIdx++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    const properties = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      price: row.price,
      numericPrice: parseFloat(row.numeric_price || '0'),
      priceUnit: row.price_unit,
      listingType: row.listing_type,
      propertyCategory: row.property_category,
      propertyType: row.property_type,
      location: row.location,
      areaSqFt: parseFloat(row.area_sq_ft || '0'),
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      furnishing: row.furnishing,
      propertyAge: row.property_age,
      floor: row.floor,
      totalFloors: row.total_floors,
      parking: row.parking,
      description: row.description,
      sellerType: row.seller_type,
      contactName: row.contact_name,
      contactNumber: row.contact_number,
      whatsappNumber: row.whatsapp_number,
      email: row.email,
      photos: Array.isArray(row.photos) ? row.photos : (typeof row.photos === 'string' ? JSON.parse(row.photos) : []),
      videos: Array.isArray(row.videos) ? row.videos : (typeof row.videos === 'string' ? JSON.parse(row.videos) : []),
      coverImage: row.cover_image,
      images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : []),
      isVerified: row.is_verified,
      status: row.status,
      specifications: typeof row.specifications === 'object' ? row.specifications : JSON.parse(row.specifications || '{}'),
      owner: typeof row.owner === 'object' ? row.owner : JSON.parse(row.owner || '{}'),
      isSaved: row.is_saved || false,
      createdAt: row.created_at
    }));

    return res.json({ success: true, count: properties.length, properties });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /properties]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST create new property
marketplaceRouter.post('/properties', async (req: Request, res: Response) => {
  try {
    const {
      id,
      title,
      price,
      numericPrice = 0,
      priceUnit = 'total',
      listingType = 'Buy',
      propertyCategory = 'Residential',
      propertyType = 'Apartment',
      location,
      areaSqFt = 0,
      bedrooms = 0,
      bathrooms = 0,
      furnishing,
      description,
      sellerType = 'Owner',
      contactName,
      contactNumber,
      whatsappNumber,
      email,
      photos = [],
      videos = [],
      images = [],
      specifications = {},
      owner = {}
    } = req.body;

    if (!title || !price || !location) {
      return res.status(400).json({ success: false, error: 'title, price, and location are required' });
    }

    const propertyId = id || `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const query = `
      INSERT INTO real_estate_properties (
        id, title, price, numeric_price, price_unit, listing_type, property_category, property_type,
        location, area_sq_ft, bedrooms, bathrooms, furnishing, description, seller_type,
        contact_name, contact_number, whatsapp_number, email, photos, videos, images, specifications, owner, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'active')
      RETURNING *
    `;

    const values = [
      propertyId,
      title,
      price,
      numericPrice,
      priceUnit,
      listingType,
      propertyCategory,
      propertyType,
      location,
      areaSqFt,
      bedrooms,
      bathrooms,
      furnishing || null,
      description || '',
      sellerType,
      contactName || null,
      contactNumber || null,
      whatsappNumber || null,
      email || null,
      JSON.stringify(photos),
      JSON.stringify(videos),
      JSON.stringify(images.length > 0 ? images : photos),
      JSON.stringify(specifications),
      JSON.stringify(owner)
    ];

    const result = await pool.query(query, values);
    return res.status(201).json({ success: true, property: result.rows[0] });
  } catch (err: any) {
    console.error('[Marketplace API Error - POST /properties]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. JOBS
// ==========================================

marketplaceRouter.get('/jobs', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM marketplace_jobs WHERE status = $1 ORDER BY created_at DESC', ['active']);
    const jobs = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      company: row.company,
      companyLogo: row.company_logo,
      location: row.location,
      salary: row.salary,
      jobType: row.job_type,
      experience: row.experience,
      category: row.category,
      description: row.description,
      requirements: Array.isArray(row.requirements) ? row.requirements : JSON.parse(row.requirements || '[]'),
      skills: Array.isArray(row.skills) ? row.skills : JSON.parse(row.skills || '[]'),
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      applicantCount: row.applicant_count || 0,
      isSaved: row.is_saved || false,
      createdAt: row.created_at
    }));
    return res.json({ success: true, jobs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. CHAT MESSAGES
// ==========================================

marketplaceRouter.get('/chats/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const result = await pool.query('SELECT * FROM marketplace_chats WHERE product_id = $1 ORDER BY created_at ASC', [productId]);
    const messages = result.rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      text: row.text,
      timestamp: row.timestamp || new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: false
    }));
    return res.json({ success: true, messages });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.post('/chats', async (req: Request, res: Response) => {
  try {
    const { productId, senderId = 'usr_guest', senderName = 'Buyer', text } = req.body;
    if (!productId || !text) return res.status(400).json({ error: 'productId and text are required' });

    const msgId = `msg_${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    await pool.query(
      `INSERT INTO marketplace_chats (id, product_id, sender_id, sender_name, text, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [msgId, productId, senderId, senderName, text, timestamp]
    );

    return res.status(201).json({
      success: true,
      message: {
        id: msgId,
        productId,
        senderId,
        senderName,
        text,
        timestamp,
        isMe: true
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
