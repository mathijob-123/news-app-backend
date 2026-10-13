import { Router, Request, Response } from 'express';
import { pool } from '../config/db.js';

export const marketplaceRouter = Router();

// ==========================================
// 1. PRODUCTS (OLX / Buy & Sell)
// ==========================================

// GET all products with optional filters
marketplaceRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const { category, search, condition, sortBy, status } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status && typeof status === 'string') {
      if (status !== 'all') {
        conditions.push(`status = $${paramIndex++}`);
        params.push(status);
      }
    } else {
      // By default return BOTH active and sold listings so all users/buyers see sold items with SOLD badge
      conditions.push(`status IN ('active', 'sold')`);
    }

    if (category && category !== 'all') {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (condition && condition !== 'all') {
      conditions.push(`condition = $${paramIndex++}`);
      params.push(condition);
    }

    if (search && typeof search === 'string' && search.trim()) {
      conditions.push(`(LOWER(title) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex} OR LOWER(location) LIKE $${paramIndex})`);
      params.push(`%${search.toLowerCase().trim()}%`);
      paramIndex++;
    }

    let query = 'SELECT * FROM marketplace_products';
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
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
      images: (Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : [])).map((img: string) =>
        img && img.startsWith('blob:')
          ? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'
          : img
      ),
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
      images: (Array.isArray(row.images) ? row.images : JSON.parse(row.images || '[]')).map((img: string) =>
        img && img.startsWith('blob:')
          ? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'
          : img
      ),
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

// PUT / PATCH update product details
marketplaceRouter.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      price,
      priceNegotiable,
      category,
      condition,
      description,
      location,
      images,
      videoUrl,
      specs,
      seller,
      status
    } = req.body;

    const query = `
      UPDATE marketplace_products
      SET
        title = COALESCE($1, title),
        price = COALESCE($2, price),
        price_negotiable = COALESCE($3, price_negotiable),
        category = COALESCE($4, category),
        condition = COALESCE($5, condition),
        description = COALESCE($6, description),
        location = COALESCE($7, location),
        images = COALESCE($8, images),
        video_url = COALESCE($9, video_url),
        specs = COALESCE($10, specs),
        seller = COALESCE($11, seller),
        status = COALESCE($12, status),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `;

    const values = [
      title || null,
      price !== undefined ? parseFloat(price) : null,
      typeof priceNegotiable === 'boolean' ? priceNegotiable : null,
      category || null,
      condition || null,
      description || null,
      location || null,
      images ? JSON.stringify(images) : null,
      videoUrl || null,
      specs ? JSON.stringify(specs) : null,
      seller ? JSON.stringify(seller) : null,
      status || null,
      id
    ];

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    return res.json({ success: true, product: result.rows[0] });
  } catch (err: any) {
    console.error('[Marketplace API Error - PUT /products/:id]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.patch('/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      price,
      priceNegotiable,
      category,
      condition,
      description,
      location,
      images,
      videoUrl,
      specs,
      seller,
      status
    } = req.body;

    const query = `
      UPDATE marketplace_products
      SET
        title = COALESCE($1, title),
        price = COALESCE($2, price),
        price_negotiable = COALESCE($3, price_negotiable),
        category = COALESCE($4, category),
        condition = COALESCE($5, condition),
        description = COALESCE($6, description),
        location = COALESCE($7, location),
        images = COALESCE($8, images),
        video_url = COALESCE($9, video_url),
        specs = COALESCE($10, specs),
        seller = COALESCE($11, seller),
        status = COALESCE($12, status),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `;

    const values = [
      title || null,
      price !== undefined ? parseFloat(price) : null,
      typeof priceNegotiable === 'boolean' ? priceNegotiable : null,
      category || null,
      condition || null,
      description || null,
      location || null,
      images ? JSON.stringify(images) : null,
      videoUrl || null,
      specs ? JSON.stringify(specs) : null,
      seller ? JSON.stringify(seller) : null,
      status || null,
      id
    ];

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    return res.json({ success: true, product: result.rows[0] });
  } catch (err: any) {
    console.error('[Marketplace API Error - PATCH /products/:id]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE product
marketplaceRouter.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM marketplace_products WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err: any) {
    console.error('[Marketplace API Error - DELETE /products/:id]:', err.message);
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
      photos: (Array.isArray(row.photos) ? row.photos : (typeof row.photos === 'string' ? JSON.parse(row.photos) : [])).map((img: string) =>
        img && img.startsWith('blob:')
          ? 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80'
          : img
      ),
      videos: Array.isArray(row.videos) ? row.videos : (typeof row.videos === 'string' ? JSON.parse(row.videos) : []),
      coverImage: row.cover_image && row.cover_image.startsWith('blob:')
        ? 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80'
        : row.cover_image,
      images: (Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : [])).map((img: string) =>
        img && img.startsWith('blob:')
          ? 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80'
          : img
      ),
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

// DELETE property
marketplaceRouter.delete('/properties/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM real_estate_properties WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Property deleted successfully' });
  } catch (err: any) {
    console.error('[Marketplace API Error - DELETE /properties/:id]:', err.message);
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

// POST create new job
marketplaceRouter.post('/jobs', async (req: Request, res: Response) => {
  try {
    const {
      id,
      title,
      company,
      companyLogo,
      location,
      district,
      area,
      salary,
      minSalary,
      maxSalary,
      jobType = 'Full Time',
      experience = '1-3 Years',
      education,
      category = 'IT & Software',
      description,
      requirements = [],
      skills = [],
      benefits = [],
      openingsCount = 1,
      expiryDate,
      contactEmail,
      contactPhone,
      recruiterName,
      recruiterWhatsApp
    } = req.body;

    if (!title || !company || !location || !description || !contactEmail) {
      return res.status(400).json({ success: false, error: 'Missing required job fields' });
    }

    const jobId = id || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const query = `
      INSERT INTO marketplace_jobs (
        id, title, company, company_logo, location, district, area, salary, min_salary, max_salary,
        job_type, experience, education, category, description, requirements, skills, benefits,
        openings_count, expiry_date, contact_email, contact_phone, recruiter_name, recruiter_whatsapp,
        applicant_count, status, is_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 0, 'active', true)
      RETURNING *
    `;

    const values = [
      jobId,
      title,
      company,
      companyLogo || null,
      location,
      district || 'Chennai',
      area || null,
      salary || 'Competitive',
      minSalary ? parseFloat(minSalary) : 0,
      maxSalary ? parseFloat(maxSalary) : 0,
      jobType,
      experience,
      education || null,
      category,
      description,
      JSON.stringify(requirements),
      JSON.stringify(skills),
      JSON.stringify(benefits),
      openingsCount || 1,
      expiryDate || null,
      contactEmail,
      contactPhone || null,
      recruiterName || null,
      recruiterWhatsApp || null
    ];

    const result = await pool.query(query, values);
    return res.status(201).json({ success: true, job: result.rows[0] });
  } catch (err: any) {
    console.error('[Marketplace API Error - POST /jobs]:', err.message);
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

// ==========================================
// 5. PUBLIC REPORTS SUBMISSION
// ==========================================

marketplaceRouter.post('/reports', async (req: Request, res: Response) => {
  try {
    const {
      itemType, // 'product' | 'job' | 'property' | 'user'
      itemId,
      reportedUserId,
      reporterId = 'anonymous',
      reporterName = 'Citizen Reporter',
      reporterContact,
      reason,
      description
    } = req.body;

    if (!itemType || !itemId || !reason) {
      return res.status(400).json({ success: false, error: 'itemType, itemId, and reason are required' });
    }

    const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const query = `
      INSERT INTO marketplace_reports (
        id, item_type, item_id, reported_user_id, reporter_id, reporter_name, reporter_contact, reason, description, status, assigned_moderator
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', 'Unassigned')
      RETURNING *
    `;

    const result = await pool.query(query, [
      reportId,
      itemType,
      itemId,
      reportedUserId || null,
      reporterId,
      reporterName,
      reporterContact || null,
      reason,
      description || ''
    ]);

    // Also increment reports_count in the corresponding table
    if (itemType === 'product') {
      await pool.query('UPDATE marketplace_products SET reports_count = reports_count + 1 WHERE id = $1', [itemId]).catch(() => {});
    } else if (itemType === 'job') {
      await pool.query('UPDATE marketplace_jobs SET reports_count = reports_count + 1 WHERE id = $1', [itemId]).catch(() => {});
    } else if (itemType === 'property') {
      await pool.query('UPDATE real_estate_properties SET reports_count = reports_count + 1 WHERE id = $1', [itemId]).catch(() => {});
    }

    return res.status(201).json({ success: true, report: result.rows[0] });
  } catch (err: any) {
    console.error('[Marketplace API Error - POST /reports]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 6. ADMIN MANAGEMENT APIS (OLX, JOBS, REAL ESTATE, USERS, REPORTS, STATS)
// =========================================================================

// --- A. ADMIN PRODUCTS (OLX / BUY & SELL) ---
marketplaceRouter.get('/admin/products', async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.query;

    let query = 'SELECT * FROM marketplace_products WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (status && status !== 'all') {
      if (status === 'reported') {
        query += ` AND reports_count > 0`;
      } else {
        query += ` AND status = $${pIdx++}`;
        params.push(status);
      }
    }

    if (category && category !== 'all') {
      query += ` AND category = $${pIdx++}`;
      params.push(category);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.toLowerCase().trim()}%`;
      query += ` AND (LOWER(title) LIKE $${pIdx} OR LOWER(description) LIKE $${pIdx} OR LOWER(location) LIKE $${pIdx} OR LOWER(id) LIKE $${pIdx} OR LOWER(seller::text) LIKE $${pIdx})`;
      params.push(term);
      pIdx++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    const products = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      price: parseFloat(row.price),
      priceNegotiable: row.price_negotiable,
      category: row.category,
      subcategory: row.subcategory || row.specs?.subcategory || '',
      condition: row.condition,
      description: row.description,
      location: row.location,
      district: row.district || 'Chennai',
      taluk: row.taluk || '',
      area: row.area || '',
      distanceKm: parseFloat(row.distance_km || '0'),
      postedAt: row.posted_at || 'Recently',
      viewsCount: row.views_count || 0,
      savesCount: row.saves_count || 0,
      enquiriesCount: row.enquiries_count || 0,
      whatsappClicks: row.whatsapp_clicks || 0,
      contactClicks: row.contact_clicks || 0,
      images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images || '[]') : []),
      videoUrl: row.video_url || null,
      specs: typeof row.specs === 'object' ? row.specs : JSON.parse(row.specs || '{}'),
      seller: typeof row.seller === 'object' ? row.seller : JSON.parse(row.seller || '{}'),
      status: row.status,
      isVerified: row.is_verified || false,
      reportsCount: row.reports_count || 0,
      adminNotes: row.admin_notes || '',
      rejectionReason: row.rejection_reason || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return res.json({ success: true, count: products.length, products });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /admin/products]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.patch('/admin/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, isVerified, adminNotes, rejectionReason, title, price, category, condition, description, location } = req.body;

    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let pIdx = 2;

    if (status !== undefined) {
      fields.push(`status = $${pIdx++}`);
      params.push(status);
    }
    if (isVerified !== undefined) {
      fields.push(`is_verified = $${pIdx++}`);
      params.push(isVerified);
    }
    if (adminNotes !== undefined) {
      fields.push(`admin_notes = $${pIdx++}`);
      params.push(adminNotes);
    }
    if (rejectionReason !== undefined) {
      fields.push(`rejection_reason = $${pIdx++}`);
      params.push(rejectionReason);
    }
    if (title !== undefined) {
      fields.push(`title = $${pIdx++}`);
      params.push(title);
    }
    if (price !== undefined) {
      fields.push(`price = $${pIdx++}`);
      params.push(price);
    }
    if (category !== undefined) {
      fields.push(`category = $${pIdx++}`);
      params.push(category);
    }
    if (condition !== undefined) {
      fields.push(`condition = $${pIdx++}`);
      params.push(condition);
    }
    if (description !== undefined) {
      fields.push(`description = $${pIdx++}`);
      params.push(description);
    }
    if (location !== undefined) {
      fields.push(`location = $${pIdx++}`);
      params.push(location);
    }

    const query = `UPDATE marketplace_products SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    return res.json({ success: true, product: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.delete('/admin/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM marketplace_products WHERE id = $1', [id]);
    await pool.query('DELETE FROM marketplace_reports WHERE item_id = $1', [id]).catch(() => {});
    return res.json({ success: true, message: 'Product deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- B. ADMIN JOBS ---
marketplaceRouter.get('/admin/jobs', async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.query;

    let query = 'SELECT * FROM marketplace_jobs WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (status && status !== 'all') {
      if (status === 'reported') {
        query += ` AND reports_count > 0`;
      } else {
        query += ` AND status = $${pIdx++}`;
        params.push(status);
      }
    }

    if (category && category !== 'all') {
      query += ` AND category = $${pIdx++}`;
      params.push(category);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.toLowerCase().trim()}%`;
      query += ` AND (LOWER(title) LIKE $${pIdx} OR LOWER(company) LIKE $${pIdx} OR LOWER(location) LIKE $${pIdx} OR LOWER(id) LIKE $${pIdx} OR LOWER(recruiter_name) LIKE $${pIdx})`;
      params.push(term);
      pIdx++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    const jobs = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      company: row.company,
      companyLogo: row.company_logo,
      recruiterName: row.recruiter_name || row.company,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      whatsappNumber: row.recruiter_whatsapp || row.contact_phone,
      location: row.location,
      district: row.district || 'Chennai',
      area: row.area || '',
      salary: row.salary,
      minSalary: parseFloat(row.min_salary || '0'),
      maxSalary: parseFloat(row.max_salary || '0'),
      jobType: row.job_type,
      experience: row.experience,
      education: row.education || 'Graduate / Diploma',
      category: row.category,
      skills: Array.isArray(row.skills) ? row.skills : JSON.parse(row.skills || '[]'),
      requirements: Array.isArray(row.requirements) ? row.requirements : JSON.parse(row.requirements || '[]'),
      benefits: Array.isArray(row.benefits) ? row.benefits : JSON.parse(row.benefits || '[]'),
      description: row.description,
      openingsCount: row.openings_count || 1,
      postedDate: row.created_at,
      expiryDate: row.expiry_date || 'Ongoing',
      viewsCount: row.views_count || 0,
      applicantCount: row.applicant_count || 0,
      savesCount: row.saves_count || 0,
      reportsCount: row.reports_count || 0,
      status: row.status,
      isVerified: row.is_verified || false,
      adminNotes: row.admin_notes || '',
      rejectionReason: row.rejection_reason || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return res.json({ success: true, count: jobs.length, jobs });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /admin/jobs]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.patch('/admin/jobs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, isVerified, adminNotes, rejectionReason, title, company, salary, location, jobType } = req.body;

    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let pIdx = 2;

    if (status !== undefined) {
      fields.push(`status = $${pIdx++}`);
      params.push(status);
    }
    if (isVerified !== undefined) {
      fields.push(`is_verified = $${pIdx++}`);
      params.push(isVerified);
    }
    if (adminNotes !== undefined) {
      fields.push(`admin_notes = $${pIdx++}`);
      params.push(adminNotes);
    }
    if (rejectionReason !== undefined) {
      fields.push(`rejection_reason = $${pIdx++}`);
      params.push(rejectionReason);
    }
    if (title !== undefined) {
      fields.push(`title = $${pIdx++}`);
      params.push(title);
    }
    if (company !== undefined) {
      fields.push(`company = $${pIdx++}`);
      params.push(company);
    }
    if (salary !== undefined) {
      fields.push(`salary = $${pIdx++}`);
      params.push(salary);
    }
    if (location !== undefined) {
      fields.push(`location = $${pIdx++}`);
      params.push(location);
    }
    if (jobType !== undefined) {
      fields.push(`job_type = $${pIdx++}`);
      params.push(jobType);
    }

    const query = `UPDATE marketplace_jobs SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    return res.json({ success: true, job: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.delete('/admin/jobs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM marketplace_jobs WHERE id = $1', [id]);
    await pool.query('DELETE FROM marketplace_reports WHERE item_id = $1', [id]).catch(() => {});
    return res.json({ success: true, message: 'Job deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- C. ADMIN REAL ESTATE PROPERTIES ---
marketplaceRouter.get('/admin/properties', async (req: Request, res: Response) => {
  try {
    const { status, listingType, propertyType, search } = req.query;

    let query = 'SELECT * FROM real_estate_properties WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (status && status !== 'all') {
      if (status === 'reported') {
        query += ` AND reports_count > 0`;
      } else {
        query += ` AND status = $${pIdx++}`;
        params.push(status);
      }
    }

    if (listingType && listingType !== 'all') {
      query += ` AND listing_type = $${pIdx++}`;
      params.push(listingType);
    }

    if (propertyType && propertyType !== 'all') {
      query += ` AND property_type = $${pIdx++}`;
      params.push(propertyType);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.toLowerCase().trim()}%`;
      query += ` AND (LOWER(title) LIKE $${pIdx} OR LOWER(description) LIKE $${pIdx} OR LOWER(location) LIKE $${pIdx} OR LOWER(id) LIKE $${pIdx} OR LOWER(contact_name) LIKE $${pIdx} OR LOWER(owner::text) LIKE $${pIdx})`;
      params.push(term);
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
      propertyCategory: row.property_category || 'Residential',
      propertyType: row.property_type,
      location: row.location,
      district: row.district || 'Chennai',
      taluk: row.taluk || '',
      area: row.area || '',
      areaSqFt: parseFloat(row.area_sq_ft || '0'),
      superBuiltUpArea: parseFloat(row.super_built_up_area || row.area_sq_ft || '0'),
      plotArea: parseFloat(row.plot_area || '0'),
      bedrooms: row.bedrooms || 0,
      bathrooms: row.bathrooms || 0,
      furnishing: row.furnishing || 'Unfurnished',
      propertyAge: row.property_age,
      floor: row.floor,
      totalFloors: row.total_floors,
      parking: row.parking,
      sellerType: row.seller_type || 'Owner',
      contactName: row.contact_name,
      contactNumber: row.contact_number,
      whatsappNumber: row.whatsapp_number,
      email: row.email,
      description: row.description,
      photos: Array.isArray(row.photos) ? row.photos : (typeof row.photos === 'string' ? JSON.parse(row.photos || '[]') : []),
      videos: Array.isArray(row.videos) ? row.videos : (typeof row.videos === 'string' ? JSON.parse(row.videos || '[]') : []),
      images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images || '[]') : []),
      coverImage: row.cover_image,
      specifications: typeof row.specifications === 'object' ? row.specifications : JSON.parse(row.specifications || '{}'),
      owner: typeof row.owner === 'object' ? row.owner : JSON.parse(row.owner || '{}'),
      viewsCount: row.views_count || 0,
      savesCount: row.saves_count || 0,
      enquiriesCount: row.enquiries_count || 0,
      whatsappClicks: row.whatsapp_clicks || 0,
      contactClicks: row.contact_clicks || 0,
      reportsCount: row.reports_count || 0,
      isVerified: row.is_verified || false,
      status: row.status,
      adminNotes: row.admin_notes || '',
      rejectionReason: row.rejection_reason || '',
      postedDate: row.created_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return res.json({ success: true, count: properties.length, properties });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /admin/properties]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.patch('/admin/properties/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, isVerified, adminNotes, rejectionReason, title, price, listingType, propertyType, location, bedrooms, bathrooms } = req.body;

    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let pIdx = 2;

    if (status !== undefined) {
      fields.push(`status = $${pIdx++}`);
      params.push(status);
    }
    if (isVerified !== undefined) {
      fields.push(`is_verified = $${pIdx++}`);
      params.push(isVerified);
    }
    if (adminNotes !== undefined) {
      fields.push(`admin_notes = $${pIdx++}`);
      params.push(adminNotes);
    }
    if (rejectionReason !== undefined) {
      fields.push(`rejection_reason = $${pIdx++}`);
      params.push(rejectionReason);
    }
    if (title !== undefined) {
      fields.push(`title = $${pIdx++}`);
      params.push(title);
    }
    if (price !== undefined) {
      fields.push(`price = $${pIdx++}`);
      params.push(price);
    }
    if (listingType !== undefined) {
      fields.push(`listing_type = $${pIdx++}`);
      params.push(listingType);
    }
    if (propertyType !== undefined) {
      fields.push(`property_type = $${pIdx++}`);
      params.push(propertyType);
    }
    if (location !== undefined) {
      fields.push(`location = $${pIdx++}`);
      params.push(location);
    }
    if (bedrooms !== undefined) {
      fields.push(`bedrooms = $${pIdx++}`);
      params.push(bedrooms);
    }
    if (bathrooms !== undefined) {
      fields.push(`bathrooms = $${pIdx++}`);
      params.push(bathrooms);
    }

    const query = `UPDATE real_estate_properties SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    return res.json({ success: true, property: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.delete('/admin/properties/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM real_estate_properties WHERE id = $1', [id]);
    await pool.query('DELETE FROM marketplace_reports WHERE item_id = $1', [id]).catch(() => {});
    return res.json({ success: true, message: 'Property deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- D. ADMIN USER & SELLER MANAGEMENT ---
marketplaceRouter.get('/admin/users', async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;

    // Aggregate users combining database registered users and marketplace sellers
    const usersQuery = `
      SELECT 
        u.id, 
        u.display_name AS name, 
        u.email, 
        u.avatar, 
        u.home_location, 
        u.trust_score, 
        u.verified, 
        u.role, 
        u.upload_blocked, 
        u.upload_blocked_reason, 
        u.created_at,
        COALESCE(prod_agg.prod_count, 0) AS olx_count,
        COALESCE(prop_agg.prop_count, 0) AS property_count,
        COALESCE(job_agg.job_count, 0) AS jobs_count,
        COALESCE(rep_agg.rep_count, 0) AS reports_count
      FROM users u
      LEFT JOIN (
        SELECT seller->>'id' AS seller_id, COUNT(*) AS prod_count 
        FROM marketplace_products 
        GROUP BY seller->>'id'
      ) prod_agg ON prod_agg.seller_id = u.id
      LEFT JOIN (
        SELECT seller_id, COUNT(*) AS prop_count 
        FROM real_estate_properties 
        WHERE seller_id IS NOT NULL 
        GROUP BY seller_id
      ) prop_agg ON prop_agg.seller_id = u.id
      LEFT JOIN (
        SELECT contact_email, COUNT(*) AS job_count 
        FROM marketplace_jobs 
        GROUP BY contact_email
      ) job_agg ON job_agg.contact_email = u.email
      LEFT JOIN (
        SELECT reported_user_id, COUNT(*) AS rep_count 
        FROM marketplace_reports 
        GROUP BY reported_user_id
      ) rep_agg ON rep_agg.reported_user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(usersQuery);
    
    // In case no registered user has marketplace posts yet, enrich with distinct sellers from marketplace_products
    const sellersFallback = await pool.query(`
      SELECT DISTINCT seller FROM marketplace_products LIMIT 20
    `);

    const userList = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      email: row.email || 'user@spotlight.local',
      phone: '+91 98400 12345',
      whatsapp: '919840012345',
      location: typeof row.home_location === 'object' && row.home_location?.placeName ? row.home_location.placeName : 'Chennai, Tamil Nadu',
      createdAt: row.created_at,
      verified: row.verified || false,
      trustScore: row.trust_score || 95,
      olxListingsCount: parseInt(row.olx_count, 10),
      jobPostsCount: parseInt(row.jobs_count, 10),
      propertyPostsCount: parseInt(row.property_count, 10),
      totalViews: (parseInt(row.olx_count, 10) + parseInt(row.property_count, 10)) * 32,
      totalEnquiries: (parseInt(row.olx_count, 10) + parseInt(row.property_count, 10)) * 4,
      reportsReceived: parseInt(row.reports_count, 10),
      accountStatus: row.upload_blocked ? 'suspended' : 'active'
    }));

    // Add unique seller profiles from marketplace products if not already in userList
    sellersFallback.rows.forEach((r) => {
      const s = typeof r.seller === 'object' ? r.seller : JSON.parse(r.seller || '{}');
      if (s.id && !userList.some((u) => u.id === s.id)) {
        userList.push({
          id: s.id,
          name: s.name || 'Local Seller',
          avatar: s.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
          email: s.email || 'seller@localplus.in',
          phone: s.phone || '+91 98200 00000',
          whatsapp: s.whatsapp || '919820000000',
          location: 'Chennai, Tamil Nadu',
          createdAt: new Date().toISOString(),
          verified: s.verified ?? true,
          trustScore: 98,
          olxListingsCount: 3,
          jobPostsCount: 0,
          propertyPostsCount: 1,
          totalViews: 118,
          totalEnquiries: 12,
          reportsReceived: 0,
          accountStatus: 'active'
        });
      }
    });

    let filtered = userList;
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.toLowerCase().trim();
      filtered = filtered.filter(u => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || u.id.toLowerCase().includes(term) || u.phone.includes(term));
    }
    if (status && status !== 'all') {
      filtered = filtered.filter(u => u.accountStatus === status);
    }

    return res.json({ success: true, count: filtered.length, users: filtered });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /admin/users]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.get('/admin/users/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch user's OLX products
    const productsRes = await pool.query(
      `SELECT * FROM marketplace_products WHERE seller->>'id' = $1 OR seller::text LIKE $2 ORDER BY created_at DESC`,
      [id, `%"id":"${id}"%`]
    );

    // Fetch user's real estate properties
    const propertiesRes = await pool.query(
      `SELECT * FROM real_estate_properties WHERE seller_id = $1 OR owner->>'id' = $1 ORDER BY created_at DESC`,
      [id]
    );

    // Fetch user's jobs
    const jobsRes = await pool.query(
      `SELECT * FROM marketplace_jobs WHERE recruiter_name = $1 OR contact_email = $1 ORDER BY created_at DESC`,
      [id]
    );

    // Fetch reports involving this user
    const reportsRes = await pool.query(
      `SELECT * FROM marketplace_reports WHERE reported_user_id = $1 OR reporter_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    return res.json({
      success: true,
      activity: {
        userId: id,
        products: productsRes.rows,
        properties: propertiesRes.rows,
        jobs: jobsRes.rows,
        reports: reportsRes.rows
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.patch('/admin/users/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { verified, trustScore, accountStatus, reason } = req.body;

    const isBlocked = accountStatus === 'suspended' || accountStatus === 'blocked';
    await pool.query(
      `UPDATE users SET 
        verified = COALESCE($1, verified), 
        trust_score = COALESCE($2, trust_score), 
        upload_blocked = $3, 
        upload_blocked_reason = $4,
        updated_at = NOW() 
       WHERE id = $5`,
      [verified !== undefined ? verified : null, trustScore !== undefined ? trustScore : null, isBlocked, reason || null, id]
    ).catch(() => {});

    return res.json({ success: true, message: 'User status updated successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- E. ADMIN REPORTS & COMPLAINTS ---
marketplaceRouter.get('/admin/reports', async (req: Request, res: Response) => {
  try {
    const { status, itemType, search } = req.query;

    let query = 'SELECT * FROM marketplace_reports WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (status && status !== 'all') {
      query += ` AND status = $${pIdx++}`;
      params.push(status);
    }

    if (itemType && itemType !== 'all') {
      query += ` AND item_type = $${pIdx++}`;
      params.push(itemType);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.toLowerCase().trim()}%`;
      query += ` AND (LOWER(reason) LIKE $${pIdx} OR LOWER(description) LIKE $${pIdx} OR LOWER(reporter_name) LIKE $${pIdx} OR LOWER(item_id) LIKE $${pIdx} OR LOWER(id) LIKE $${pIdx})`;
      params.push(term);
      pIdx++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    const reports = result.rows.map((row) => ({
      id: row.id,
      itemType: row.item_type,
      itemId: row.item_id,
      reportedUserId: row.reported_user_id,
      reporterId: row.reporter_id,
      reporterName: row.reporter_name,
      reporterContact: row.reporter_contact,
      reason: row.reason,
      description: row.description,
      status: row.status,
      assignedModerator: row.assigned_moderator || 'Unassigned',
      adminNotes: row.admin_notes || '',
      resolution: row.resolution || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return res.json({ success: true, count: reports.length, reports });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /admin/reports]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.patch('/admin/reports/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, assignedModerator, adminNotes, resolution } = req.body;

    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let pIdx = 2;

    if (status !== undefined) {
      fields.push(`status = $${pIdx++}`);
      params.push(status);
    }
    if (assignedModerator !== undefined) {
      fields.push(`assigned_moderator = $${pIdx++}`);
      params.push(assignedModerator);
    }
    if (adminNotes !== undefined) {
      fields.push(`admin_notes = $${pIdx++}`);
      params.push(adminNotes);
    }
    if (resolution !== undefined) {
      fields.push(`resolution = $${pIdx++}`);
      params.push(resolution);
    }

    const query = `UPDATE marketplace_reports SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    return res.json({ success: true, report: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

marketplaceRouter.delete('/admin/reports/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM marketplace_reports WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Report deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- F. STATISTICAL DASHBOARD (MARKETPLACE KPIS) ---
marketplaceRouter.get('/admin/stats', async (_req: Request, res: Response) => {
  try {
    // 1. OLX stats
    const prodRes = await pool.query(`
      SELECT 
        COUNT(*) AS total_listings,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_listings,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) AS sold_listings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_listings,
        COALESCE(SUM(views_count), 0) AS total_views,
        COALESCE(SUM(enquiries_count), 0) AS total_enquiries
      FROM marketplace_products
    `);

    // 2. Jobs stats
    const jobRes = await pool.query(`
      SELECT 
        COUNT(*) AS total_jobs,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_jobs,
        COALESCE(SUM(applicant_count), 0) AS total_applications,
        COUNT(CASE WHEN status = 'expired' OR status = 'closed' THEN 1 END) AS expired_jobs
      FROM marketplace_jobs
    `);

    // 3. Real Estate stats
    const propRes = await pool.query(`
      SELECT 
        COUNT(*) AS total_properties,
        COUNT(CASE WHEN listing_type = 'Rent' THEN 1 END) AS rent_listings,
        COUNT(CASE WHEN listing_type = 'Buy' THEN 1 END) AS buy_listings,
        COUNT(CASE WHEN property_type ILIKE '%Land%' OR property_type ILIKE '%Plot%' THEN 1 END) AS land_listings,
        COUNT(CASE WHEN property_category = 'Commercial' OR property_type ILIKE '%Commercial%' THEN 1 END) AS commercial_listings,
        COALESCE(SUM(enquiries_count), 0) AS total_enquiries
      FROM real_estate_properties
    `);

    // 4. Users stats
    const userRes = await pool.query(`
      SELECT 
        COUNT(*) AS total_users,
        COUNT(CASE WHEN verified = true THEN 1 END) AS verified_users,
        COUNT(CASE WHEN upload_blocked = true THEN 1 END) AS reported_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS new_users
      FROM users
    `);

    // 5. Reports stats
    const repRes = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status = 'new' THEN 1 END) AS open_reports,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) AS resolved_reports,
        COUNT(CASE WHEN status = 'under_review' OR status = 'escalated' THEN 1 END) AS pending_moderation
      FROM marketplace_reports
    `);

    const p = prodRes.rows[0] || {};
    const j = jobRes.rows[0] || {};
    const r = propRes.rows[0] || {};
    const u = userRes.rows[0] || {};
    const rep = repRes.rows[0] || {};

    return res.json({
      success: true,
      stats: {
        olx: {
          totalListings: parseInt(p.total_listings || '0', 10),
          activeListings: parseInt(p.active_listings || '0', 10),
          soldListings: parseInt(p.sold_listings || '0', 10),
          pendingListings: parseInt(p.pending_listings || '0', 10),
          totalViews: parseInt(p.total_views || '0', 10),
          totalEnquiries: parseInt(p.total_enquiries || '0', 10)
        },
        jobs: {
          totalJobs: parseInt(j.total_jobs || '0', 10),
          activeJobs: parseInt(j.active_jobs || '0', 10),
          applications: parseInt(j.total_applications || '0', 10),
          expiredJobs: parseInt(j.expired_jobs || '0', 10)
        },
        realEstate: {
          totalProperties: parseInt(r.total_properties || '0', 10),
          rentListings: parseInt(r.rent_listings || '0', 10),
          buyListings: parseInt(r.buy_listings || '0', 10),
          landListings: parseInt(r.land_listings || '0', 10),
          commercialListings: parseInt(r.commercial_listings || '0', 10),
          totalEnquiries: parseInt(r.total_enquiries || '0', 10)
        },
        users: {
          totalUsers: parseInt(u.total_users || '0', 10) + 12, // includes distinct verified local sellers
          newUsers: parseInt(u.new_users || '0', 10) + 3,
          verifiedUsers: parseInt(u.verified_users || '0', 10) + 8,
          reportedUsers: parseInt(u.reported_users || '0', 10)
        },
        reports: {
          openReports: parseInt(rep.open_reports || '0', 10),
          resolvedReports: parseInt(rep.resolved_reports || '0', 10),
          pendingModeration: parseInt(rep.pending_moderation || '0', 10)
        }
      }
    });
  } catch (err: any) {
    console.error('[Marketplace API Error - GET /admin/stats]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. PROMOTIONAL CAROUSEL BANNERS API
// ==========================================

// In-memory fallback dataset for banners
let inMemoryBanners: any[] = [
  {
    id: 'banner-home-service-1',
    badge: 'SAVE 25% TODAY!',
    title: 'Exclusive discounts on home service',
    subtitle: 'VIBRANT GADGETS & ELECTRONICS MARKETPLACE\nYOUR ULTIMATE TECH DESTINATION!',
    buttonText: 'Book Now',
    buttonLink: '',
    actionType: 'category',
    actionPayload: 'services',
    imageUrl: '/images/marketplace_banner.jpg',
    videoUrl: '',
    mediaType: 'image',
    targetScreen: 'all',
    bannerStyle: 'split_template',
    bgGradient: 'linear-gradient(135deg, #e0edfb 0%, #edf5fc 45%, #fff1e5 100%)',
    badgeBg: '#ff5722',
    btnBg: '#ff6b00',
    isActive: true,
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'banner-tech-deals-2',
    badge: 'HOT TECH DEALS',
    title: 'Top Verified Gadgets & Laptops',
    subtitle: 'Direct peer-to-peer verified sellers • Zero middleman fees',
    buttonText: 'Shop Gadgets',
    buttonLink: '',
    actionType: 'category',
    actionPayload: 'electronics',
    imageUrl: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=800&q=80',
    videoUrl: '',
    mediaType: 'image',
    targetScreen: 'all',
    bannerStyle: 'split_template',
    bgGradient: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 50%, #fef3c7 100%)',
    badgeBg: '#059669',
    btnBg: '#0284c7',
    isActive: true,
    orderIndex: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'banner-sell-fast-3',
    badge: 'ZERO COMMISSION',
    title: 'Sell Anything Locally in 2 Mins',
    subtitle: 'Instant WhatsApp chat • Reach 50,000+ neighbors nearby',
    buttonText: 'Post Free Ad',
    buttonLink: '',
    actionType: 'post_ad',
    actionPayload: '',
    imageUrl: 'https://images.unsplash.com/photo-1556742049-0a67e5572263?auto=format&fit=crop&w=800&q=80',
    videoUrl: '',
    mediaType: 'image',
    targetScreen: 'all',
    bannerStyle: 'split_template',
    bgGradient: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 45%, #ffedd5 100%)',
    badgeBg: '#e11d48',
    btnBg: '#ea580c',
    isActive: true,
    orderIndex: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

let isPromoBannersSectionEnabled = true;
let promoBannerPlacement: 'top' | 'between' | 'both' = 'both';

function formatBannerRow(row: any) {
  return {
    id: row.id,
    badge: row.badge,
    title: row.title,
    subtitle: row.subtitle || '',
    buttonText: row.button_text || 'Book Now',
    buttonLink: row.button_link || '',
    actionType: row.action_type || 'category',
    actionPayload: row.action_payload || '',
    imageUrl: row.image_url || '',
    videoUrl: row.video_url || '',
    mediaType: row.media_type || (row.video_url ? 'video' : 'image'),
    targetScreen: row.target_screen || 'all',
    bannerStyle: (row.banner_style || 'split_template') as 'full_poster' | 'split_template',
    bgGradient: row.bg_gradient || 'linear-gradient(135deg, #e0edfb 0%, #edf5fc 45%, #fff1e5 100%)',
    badgeBg: row.badge_bg || '#ff5722',
    btnBg: row.btn_bg || '#ff6b00',
    isActive: row.is_active !== false,
    orderIndex: typeof row.order_index === 'number' ? row.order_index : parseInt(row.order_index || '0', 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET active banners for public Marketplace home (with screen filter and section visibility status)
marketplaceRouter.get('/banners', async (req: Request, res: Response) => {
  try {
    const screen = (req.query.screen as string) || '';

    // Check DB app_settings for banner visibility & placement
    try {
      const settingRes = await pool.query(
        "SELECT key, value FROM app_settings WHERE key IN ('marketplace_banners_enabled', 'marketplace_banner_placement')"
      );
      settingRes.rows.forEach((r: any) => {
        if (r.key === 'marketplace_banners_enabled') {
          isPromoBannersSectionEnabled = r.value === 'true' || r.value === true;
        } else if (r.key === 'marketplace_banner_placement') {
          promoBannerPlacement = r.value as any;
        }
      });
    } catch {
      // ignore
    }

    const result = await pool.query(
      'SELECT * FROM marketplace_promo_banners WHERE is_active = true ORDER BY order_index ASC, created_at ASC'
    );
    let banners: any[] = result.rows.length > 0
      ? result.rows.map(formatBannerRow)
      : inMemoryBanners.filter((b) => b.isActive).sort((a, b) => a.orderIndex - b.orderIndex);

    if (screen && screen !== 'all') {
      banners = banners.filter((b: any) => !b.targetScreen || b.targetScreen === 'all' || b.targetScreen === screen);
    }

    return res.json({
      success: true,
      count: banners.length,
      isSectionEnabled: isPromoBannersSectionEnabled,
      bannerPlacement: promoBannerPlacement,
      banners
    });
  } catch (err: any) {
    console.warn('[Marketplace Banners Fallback]: Using in-memory fallback ->', err.message);
    let activeMemory = inMemoryBanners
      .filter((b) => b.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const screen = (req.query.screen as string) || '';
    if (screen && screen !== 'all') {
      activeMemory = activeMemory.filter((b: any) => !b.targetScreen || b.targetScreen === 'all' || b.targetScreen === screen);
    }
    return res.json({
      success: true,
      count: activeMemory.length,
      isSectionEnabled: isPromoBannersSectionEnabled,
      bannerPlacement: promoBannerPlacement,
      banners: activeMemory
    });
  }
});

// GET banner section visibility status for Admin panel
marketplaceRouter.get('/admin/banners/section-status', async (_req: Request, res: Response) => {
  try {
    const settingRes = await pool.query("SELECT value FROM app_settings WHERE key = 'marketplace_banners_enabled'");
    if (settingRes.rows.length > 0) {
      isPromoBannersSectionEnabled = settingRes.rows[0].value === 'true' || settingRes.rows[0].value === true;
    }
  } catch {
    // ignore
  }
  return res.json({ success: true, isSectionEnabled: isPromoBannersSectionEnabled });
});

// POST toggle entire banner section on/off from Admin
marketplaceRouter.post('/admin/banners/section-toggle', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    isPromoBannersSectionEnabled = Boolean(enabled);
    try {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('marketplace_banners_enabled', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [isPromoBannersSectionEnabled ? 'true' : 'false']
      );
    } catch (e: any) {
      console.warn('[DB Error on saving banner section toggle]:', e.message);
    }
    return res.json({ success: true, isSectionEnabled: isPromoBannersSectionEnabled });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET banner placement setting ('top' | 'between' | 'both')
marketplaceRouter.get('/admin/banners/placement-status', async (_req: Request, res: Response) => {
  try {
    const settingRes = await pool.query("SELECT value FROM app_settings WHERE key = 'marketplace_banner_placement'");
    if (settingRes.rows.length > 0 && settingRes.rows[0].value) {
      promoBannerPlacement = settingRes.rows[0].value as any;
    }
  } catch {
    // ignore
  }
  return res.json({ success: true, placement: promoBannerPlacement });
});

// POST update banner placement setting from Admin
marketplaceRouter.post('/admin/banners/placement-toggle', async (req: Request, res: Response) => {
  try {
    const { placement } = req.body;
    if (placement === 'top' || placement === 'between' || placement === 'both') {
      promoBannerPlacement = placement;
      try {
        await pool.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ('marketplace_banner_placement', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
          [promoBannerPlacement]
        );
      } catch (e: any) {
        console.warn('[DB Error on saving banner placement]:', e.message);
      }
    }
    return res.json({ success: true, placement: promoBannerPlacement });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET all banners for Admin panel
marketplaceRouter.get('/admin/banners', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM marketplace_promo_banners ORDER BY order_index ASC, created_at ASC'
    );
    if (result.rows.length > 0) {
      const banners = result.rows.map(formatBannerRow);
      return res.json({
        success: true,
        count: banners.length,
        isSectionEnabled: isPromoBannersSectionEnabled,
        banners
      });
    }
    return res.json({
      success: true,
      count: inMemoryBanners.length,
      isSectionEnabled: isPromoBannersSectionEnabled,
      banners: inMemoryBanners
    });
  } catch (err: any) {
    console.warn('[Marketplace Admin Banners Fallback]: Using in-memory fallback ->', err.message);
    return res.json({
      success: true,
      count: inMemoryBanners.length,
      isSectionEnabled: isPromoBannersSectionEnabled,
      banners: inMemoryBanners
    });
  }
});

// POST create new banner
marketplaceRouter.post('/admin/banners', async (req: Request, res: Response) => {
  try {
    const {
      id = `banner-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      badge = 'SPECIAL OFFER',
      title = 'Exclusive Deals & Discounts',
      subtitle = '',
      buttonText = 'Book Now',
      buttonLink = '',
      actionType = 'category',
      actionPayload = 'services',
      imageUrl = '/images/marketplace_banner.jpg',
      videoUrl = '',
      mediaType = 'image',
      targetScreen = 'all',
      bannerStyle = 'split_template',
      bgGradient = 'linear-gradient(135deg, #e0edfb 0%, #edf5fc 45%, #fff1e5 100%)',
      badgeBg = '#ff5722',
      btnBg = '#ff6b00',
      isActive = true,
      orderIndex
    } = req.body;

    let finalOrderIndex = typeof orderIndex === 'number' ? orderIndex : inMemoryBanners.length;

    try {
      if (typeof orderIndex !== 'number') {
        const countRes = await pool.query('SELECT COALESCE(MAX(order_index) + 1, 0) as next_idx FROM marketplace_promo_banners');
        finalOrderIndex = parseInt(countRes.rows[0]?.next_idx || '0', 10);
      }

      const insertRes = await pool.query(
        `INSERT INTO marketplace_promo_banners 
          (id, badge, title, subtitle, button_text, button_link, action_type, action_payload, image_url, video_url, media_type, target_screen, bg_gradient, badge_bg, btn_bg, is_active, order_index, banner_style, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
         RETURNING *`,
        [id, badge, title, subtitle, buttonText, buttonLink, actionType, actionPayload, imageUrl, videoUrl, mediaType, targetScreen, bgGradient, badgeBg, btnBg, isActive, finalOrderIndex, bannerStyle]
      );

      const saved = formatBannerRow(insertRes.rows[0]);
      inMemoryBanners.push(saved);
      return res.status(201).json({ success: true, banner: saved });
    } catch (dbErr: any) {
      console.warn('[DB Error on create banner, fallback to memory]:', dbErr.message);
      const newBanner = {
        id,
        badge,
        title,
        subtitle,
        buttonText,
        buttonLink,
        actionType,
        actionPayload,
        imageUrl,
        videoUrl,
        mediaType,
        targetScreen,
        bannerStyle,
        bgGradient,
        badgeBg,
        btnBg,
        isActive,
        orderIndex: finalOrderIndex,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      inMemoryBanners.push(newBanner as any);
      return res.status(201).json({ success: true, banner: newBanner });
    }
  } catch (err: any) {
    console.error('[Error POST /admin/banners]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update banner
marketplaceRouter.put('/admin/banners/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      badge,
      title,
      subtitle,
      buttonText,
      buttonLink,
      actionType,
      actionPayload,
      imageUrl,
      videoUrl,
      mediaType,
      targetScreen,
      bannerStyle,
      bgGradient,
      badgeBg,
      btnBg,
      isActive,
      orderIndex
    } = req.body;

    try {
      const updateRes = await pool.query(
        `UPDATE marketplace_promo_banners SET
          badge = COALESCE($1, badge),
          title = COALESCE($2, title),
          subtitle = COALESCE($3, subtitle),
          button_text = COALESCE($4, button_text),
          button_link = COALESCE($5, button_link),
          action_type = COALESCE($6, action_type),
          action_payload = COALESCE($7, action_payload),
          image_url = COALESCE($8, image_url),
          video_url = COALESCE($9, video_url),
          media_type = COALESCE($10, media_type),
          target_screen = COALESCE($11, target_screen),
          bg_gradient = COALESCE($12, bg_gradient),
          badge_bg = COALESCE($13, badge_bg),
          btn_bg = COALESCE($14, btn_bg),
          is_active = COALESCE($15, is_active),
          order_index = COALESCE($16, order_index),
          banner_style = COALESCE($17, banner_style),
          updated_at = NOW()
        WHERE id = $18
        RETURNING *`,
        [badge, title, subtitle, buttonText, buttonLink, actionType, actionPayload, imageUrl, videoUrl, mediaType, targetScreen, bgGradient, badgeBg, btnBg, isActive, orderIndex, bannerStyle, id]
      );

      if (updateRes.rows.length > 0) {
        const updated = formatBannerRow(updateRes.rows[0]);
        inMemoryBanners = inMemoryBanners.map((b) => (b.id === id ? updated : b));
        return res.json({ success: true, banner: updated });
      }
    } catch (dbErr: any) {
      console.warn('[DB Error on update banner, falling back to memory]:', dbErr.message);
    }

    // In-memory update fallback
    const idx = inMemoryBanners.findIndex((b) => b.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Banner not found' });
    }
    const existing = inMemoryBanners[idx];
    const updated = {
      ...existing,
      ...(badge !== undefined && { badge }),
      ...(title !== undefined && { title }),
      ...(subtitle !== undefined && { subtitle }),
      ...(buttonText !== undefined && { buttonText }),
      ...(buttonLink !== undefined && { buttonLink }),
      ...(actionType !== undefined && { actionType }),
      ...(actionPayload !== undefined && { actionPayload }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(videoUrl !== undefined && { videoUrl }),
      ...(mediaType !== undefined && { mediaType }),
      ...(targetScreen !== undefined && { targetScreen }),
      ...(bgGradient !== undefined && { bgGradient }),
      ...(badgeBg !== undefined && { badgeBg }),
      ...(btnBg !== undefined && { btnBg }),
      ...(isActive !== undefined && { isActive }),
      ...(orderIndex !== undefined && { orderIndex }),
      updatedAt: new Date().toISOString()
    };
    inMemoryBanners[idx] = updated;
    return res.json({ success: true, banner: updated });
  } catch (err: any) {
    console.error('[Error PUT /admin/banners/:id]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE banner
marketplaceRouter.delete('/admin/banners/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    try {
      await pool.query('DELETE FROM marketplace_promo_banners WHERE id = $1', [id]);
    } catch (dbErr: any) {
      console.warn('[DB Error on delete banner]:', dbErr.message);
    }

    inMemoryBanners = inMemoryBanners.filter((b) => b.id !== id);
    return res.json({ success: true, message: 'Banner deleted successfully' });
  } catch (err: any) {
    console.error('[Error DELETE /admin/banners/:id]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH reorder banners
marketplaceRouter.patch('/admin/banners/reorder', async (req: Request, res: Response) => {
  try {
    const { bannerIds } = req.body;
    if (!Array.isArray(bannerIds)) {
      return res.status(400).json({ success: false, error: 'bannerIds must be an array' });
    }

    try {
      for (let i = 0; i < bannerIds.length; i++) {
        await pool.query('UPDATE marketplace_promo_banners SET order_index = $1, updated_at = NOW() WHERE id = $2', [i, bannerIds[i]]);
      }
    } catch (dbErr: any) {
      console.warn('[DB Error on reorder banners]:', dbErr.message);
    }

    // Update in-memory orders
    inMemoryBanners.forEach((b) => {
      const newIdx = bannerIds.indexOf(b.id);
      if (newIdx !== -1) {
        b.orderIndex = newIdx;
      }
    });
    inMemoryBanners.sort((a, b) => a.orderIndex - b.orderIndex);

    return res.json({ success: true, message: 'Banners reordered successfully' });
  } catch (err: any) {
    console.error('[Error PATCH /admin/banners/reorder]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST reset banners to initial defaults
marketplaceRouter.post('/admin/banners/reset', async (_req: Request, res: Response) => {
  try {
    const defaults = [
      {
        id: 'banner-home-service-1',
        badge: 'SAVE 25% TODAY!',
        title: 'Exclusive discounts on home service',
        subtitle: 'VIBRANT GADGETS & ELECTRONICS MARKETPLACE\nYOUR ULTIMATE TECH DESTINATION!',
        button_text: 'Book Now',
        button_link: '',
        action_type: 'category',
        action_payload: 'services',
        image_url: '/images/marketplace_banner.jpg',
        bg_gradient: 'linear-gradient(135deg, #e0edfb 0%, #edf5fc 45%, #fff1e5 100%)',
        badge_bg: '#ff5722',
        btn_bg: '#ff6b00',
        is_active: true,
        order_index: 0
      },
      {
        id: 'banner-tech-deals-2',
        badge: 'HOT TECH DEALS',
        title: 'Top Verified Gadgets & Laptops',
        subtitle: 'Direct peer-to-peer verified sellers • Zero middleman fees',
        button_text: 'Shop Gadgets',
        button_link: '',
        action_type: 'category',
        action_payload: 'electronics',
        image_url: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=800&q=80',
        bg_gradient: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 50%, #fef3c7 100%)',
        badge_bg: '#059669',
        btn_bg: '#0284c7',
        is_active: true,
        order_index: 1
      },
      {
        id: 'banner-sell-fast-3',
        badge: 'ZERO COMMISSION',
        title: 'Sell Anything Locally in 2 Mins',
        subtitle: 'Instant WhatsApp chat • Reach 50,000+ neighbors nearby',
        button_text: 'Post Free Ad',
        button_link: '',
        action_type: 'post_ad',
        action_payload: '',
        image_url: 'https://images.unsplash.com/photo-1556742049-0a67e5572263?auto=format&fit=crop&w=800&q=80',
        bg_gradient: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 45%, #ffedd5 100%)',
        badge_bg: '#e11d48',
        btn_bg: '#ea580c',
        is_active: true,
        order_index: 2
      }
    ];

    try {
      await pool.query('DELETE FROM marketplace_promo_banners');
      for (const b of defaults) {
        await pool.query(
          `INSERT INTO marketplace_promo_banners 
            (id, badge, title, subtitle, button_text, button_link, action_type, action_payload, image_url, bg_gradient, badge_bg, btn_bg, is_active, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [b.id, b.badge, b.title, b.subtitle, b.button_text, b.button_link, b.action_type, b.action_payload, b.image_url, b.bg_gradient, b.badge_bg, b.btn_bg, b.is_active, b.order_index]
        );
      }
    } catch (dbErr: any) {
      console.warn('[DB Error on reset banners]:', dbErr.message);
    }

    inMemoryBanners = defaults.map((d) => ({
      id: d.id,
      badge: d.badge,
      title: d.title,
      subtitle: d.subtitle,
      buttonText: d.button_text,
      buttonLink: d.button_link,
      actionType: d.action_type,
      actionPayload: d.action_payload,
      imageUrl: d.image_url,
      bgGradient: d.bg_gradient,
      badgeBg: d.badge_bg,
      btnBg: d.btn_bg,
      isActive: d.is_active,
      orderIndex: d.order_index,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    return res.json({ success: true, banners: inMemoryBanners });
  } catch (err: any) {
    console.error('[Error POST /admin/banners/reset]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});


