const router = require('express').Router();
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { softDelete, restoreDeleted } = require('../utils/transactions');

// GET all products (public) with filters - excludes deleted products
router.get('/', async (req, res) => {
    try {
        const { category, gender, isNewArrival, isFeatured, search, sort, limit = 20, page = 1, includeDeleted } = req.query;
        const filter = { isActive: true, isDeleted: { $ne: true } };
        
        // Allow admin to see deleted products if explicitly requested
        if (includeDeleted === 'true') {
            delete filter.isDeleted;
        }
        
        if (category) filter.category = category;
        if (gender) filter.gender = gender;
        if (isNewArrival === 'true') filter.isNewArrival = true;
        if (isFeatured === 'true') filter.isFeatured = true;
        if (search) filter.name = { $regex: search, $options: 'i' };

        const sortOptions = sort === 'price_asc' ? { price: 1 }
            : sort === 'price_desc' ? { price: -1 }
                : { createdAt: -1 };

        const products = await Product.find(filter)
            .sort(sortOptions)
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Product.countDocuments(filter);
        res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET single product - also returns deleted products (for admin recovery)
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST create product (admin)
router.post('/', protect, adminOnly, upload.array('images', 8), async (req, res) => {
    try {
        const { name, price, originalPrice, qualityGrade, gender, description, category, sizes, colors, stock, isFeatured, isNewArrival, tags } = req.body;
        
        if (!name || !price || !gender || !description) {
            return res.status(400).json({ message: 'Name, price, gender, and description are required' });
        }

        const images = req.files ? req.files.map(f => `/uploads/products/${f.filename}`) : [];

        const product = await Product.create({
            name, price, originalPrice, qualityGrade, gender, description, category,
            sizes: sizes ? JSON.parse(sizes) : [],
            colors: colors ? JSON.parse(colors) : [],
            stock: stock || 10,
            images,
            isFeatured: isFeatured === 'true',
            isNewArrival: isNewArrival !== 'false',
            isActive: true,
            tags: tags ? JSON.parse(tags) : []
        });
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT update product (admin)
router.put('/:id', protect, adminOnly, upload.array('images', 8), async (req, res) => {
    try {
        const updates = { ...req.body };
        if (req.files && req.files.length > 0) {
            updates.images = req.files.map(f => `/uploads/products/${f.filename}`);
        }
        ['sizes', 'colors', 'tags'].forEach(field => {
            if (updates[field]) updates[field] = JSON.parse(updates[field]);
        });
        const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE product (admin) - SOFT DELETE (data preserved for recovery)
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { reason } = req.body;
        const product = await softDelete('Product', req.params.id, req.user._id, reason);
        res.json({ message: 'Product soft deleted (can be restored)', product });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// RESTORE deleted product (admin)
router.put('/:id/restore', protect, adminOnly, async (req, res) => {
    try {
        const product = await restoreDeleted('Product', req.params.id);
        res.json({ message: 'Product restored successfully', product });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// HARD DELETE product (admin) - PERMANENT, use with caution!
router.delete('/:id/permanent', protect, adminOnly, async (req, res) => {
    try {
        const { confirm } = req.body;
        
        if (confirm !== 'PERMANENTLY_DELETE') {
            return res.status(400).json({ 
                message: 'Permanent deletion requires confirmation. Send { confirm: "PERMANENTLY_DELETE" }' 
            });
        }
        
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product permanently deleted (cannot be recovered)' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// SYNC ENDPOINT - Real-time updates for Android/Web polling
// Returns products modified since a given timestamp
// ═══════════════════════════════════════════════════════════════════
router.get('/sync/updates', async (req, res) => {
    try {
        const { since, limit = 100 } = req.query;
        const filter = { isActive: true, isDeleted: { $ne: true } };
        
        // If 'since' timestamp provided, only get products updated after that
        if (since) {
            filter.updatedAt = { $gt: new Date(since) };
        }
        
        const products = await Product.find(filter)
            .sort({ updatedAt: -1 })
            .limit(Number(limit))
            .select('-__v'); // Exclude version field
        
        res.json({
            products,
            count: products.length,
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// ADMIN STATS - Quick product summary
// ═══════════════════════════════════════════════════════════════════
router.get('/admin/stats', protect, adminOnly, async (req, res) => {
    try {
        const [
            totalProducts,
            activeProducts,
            outOfStock,
            lowStock,
            featuredCount,
            newArrivals
        ] = await Promise.all([
            Product.countDocuments({ isDeleted: { $ne: true } }),
            Product.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
            Product.countDocuments({ stock: 0, isDeleted: { $ne: true } }),
            Product.countDocuments({ stock: { $gt: 0, $lte: 5 }, isDeleted: { $ne: true } }),
            Product.countDocuments({ isFeatured: true, isActive: true, isDeleted: { $ne: true } }),
            Product.countDocuments({ isNewArrival: true, isActive: true, isDeleted: { $ne: true } })
        ]);
        
        // Category breakdown
        const categoryStats = await Product.aggregate([
            { $match: { isActive: true, isDeleted: { $ne: true } } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            totalProducts,
            activeProducts,
            outOfStock,
            lowStock,
            featuredCount,
            newArrivals,
            categoryStats,
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
