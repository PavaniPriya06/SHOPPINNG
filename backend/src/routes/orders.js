const router = require('express').Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { protect, adminOnly } = require('../middleware/auth');
const { generateReceipt } = require('../controllers/pdfController');
const { cancelOrderWithStockRestore, softDelete, restoreDeleted } = require('../utils/transactions');

// Create order (for COD / manual orders / Buy Now)
router.post('/', protect, async (req, res) => {
    try {
        const { items, shippingAddress, paymentMethod, notes, saveAddress, location } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ message: 'No items in order' });

        // Validate shipping address is provided
        if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.pincode) {
            return res.status(400).json({ message: 'Complete shipping address is required' });
        }

        let totalAmount = 0;
        const enrichedItems = [];
        for (const item of items) {
            // Support both real product IDs and buy-now items with pre-filled price/name
            if (item.product && item.product.startsWith && item.product.startsWith('demo-')) {
                enrichedItems.push({ name: item.name, price: item.price, image: item.image, quantity: item.quantity || 1, size: item.size });
                totalAmount += item.price * (item.quantity || 1);
            } else if (item.product) {
                const product = await Product.findById(item.product);
                if (!product) return res.status(404).json({ message: `Product not found: ${item.product}` });
                enrichedItems.push({ product: item.product, name: item.name || product.name, price: item.price || product.price, image: item.image || (product.images?.[0] || ''), quantity: item.quantity || 1, size: item.size });
                totalAmount += (item.price || product.price) * (item.quantity || 1);
            } else {
                enrichedItems.push({ name: item.name, price: item.price, image: item.image, quantity: item.quantity || 1, size: item.size });
                totalAmount += item.price * (item.quantity || 1);
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // FETCH DELIVERY CHARGES FROM SETTINGS IN REAL-TIME ✅
        // ═════════════════════════════════════════════════════════════════════
        let deliveryCharges = 0;
        try {
            const deliverySetting = await Settings.findOne({ key: 'deliveryCharges' });
            deliveryCharges = deliverySetting?.value || 0;
            console.log(`📦 Delivery Charges Applied: ₹${deliveryCharges}`);
        } catch (err) {
            console.log('Could not fetch delivery charges, using default 0');
            deliveryCharges = 0;
        }
        const shippingCharge = deliveryCharges;
        totalAmount += shippingCharge;

        // Normalise address — frontend may send fullName/houseNo or legacy name/street
        const addr = shippingAddress || {};
        const normalisedAddress = {
            fullName: addr.fullName || addr.name || '',
            phone: addr.phone || addr.mobile || '',
            houseNo: addr.houseNo || addr.addressLine1 || '',
            street: addr.street || addr.addressLine2 || '',
            landmark: addr.landmark || '',
            city: addr.city || '',
            state: addr.state || '',
            pincode: addr.pincode || ''
        };

        // ══════════════════════════════════════════════════════════════════════════
        // LOCATION DATA - Capture user's location at order time
        // ══════════════════════════════════════════════════════════════════════════
        const loc = location || {};
        const locationData = {
            lat: loc.lat || null,
            lng: loc.lng || null,
            accuracy: loc.accuracy || null,
            locationSource: loc.locationSource || 'Unknown',
            ipAddress: loc.ipAddress || req.ip || req.connection?.remoteAddress || '',
            ipCity: loc.ipCity || '',
            ipRegion: loc.ipRegion || '',
            ipCountry: loc.ipCountry || ''
        };

        // Get admin UPI ID for reference
        let adminUpiId = '';
        try {
            const upiSetting = await Settings.findOne({ key: 'upi' });
            adminUpiId = upiSetting?.value || '';
        } catch {}

        const order = await Order.create({
            user: req.user._id,
            items: enrichedItems,
            totalAmount,
            shippingCharge,
            shippingAddress: normalisedAddress,
            // Location data
            lat: locationData.lat,
            lng: locationData.lng,
            accuracy: locationData.accuracy,
            locationSource: locationData.locationSource,
            ipAddress: locationData.ipAddress,
            ipCity: locationData.ipCity,
            ipRegion: locationData.ipRegion,
            ipCountry: locationData.ipCountry,
            paymentMethod: paymentMethod || 'Pending',
            paymentStatus: 'Pending',
            upiId: adminUpiId,
            notes,
            status: 'CREATED',
            statusHistory: [{ status: 'CREATED', note: 'Order created, awaiting payment' }]
        });

        // NOTE: Address is NOT saved to user profile here
        // It will only be saved after payment is confirmed (in payment.js verify routes)
        // This prevents storing addresses for failed/abandoned payments

        await order.populate('user', 'name email phone');
        res.status(201).json(order);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── IMPORTANT: Fixed routes BEFORE parameterized routes ───
// Get user's own orders (excludes deleted by default)
router.get('/my', protect, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id, isDeleted: { $ne: true } })
            .populate('items.product', 'name images')
            .sort({ createdAt: -1 });
        res.json({ orders, total: orders.length });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: get all orders (MUST come after /my) - excludes deleted by default
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const { status, page = 1, limit = 20, includeDeleted } = req.query;
        const filter = {};
        
        if (status) filter.status = status;
        
        // By default, exclude deleted orders unless admin explicitly requests them
        if (includeDeleted !== 'true') {
            filter.isDeleted = { $ne: true };
        }
        
        const orders = await Order.find(filter)
            .populate('user', 'name email phone')
            .populate('items.product', 'name images')
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));
        const total = await Order.countDocuments(filter);
        res.json({ orders, total });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─── PARAMETERIZED ROUTES BELOW ───

// Get single order by ID
router.get('/:id', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate('items.product', 'name images');
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: update order status
router.put('/:id/status', protect, adminOnly, async (req, res) => {
    try {
        const { status, note, paymentStatus } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        order.status = status;
        if (paymentStatus) order.paymentStatus = paymentStatus;
        order.statusHistory.push({ status, note: note || '' });
        await order.save();
        await order.populate('user', 'name email phone');
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// User: confirm UPI payment (self-confirm after manual UPI payment)
router.put('/:id/confirm-payment', protect, async (req, res) => {
    try {
        const { upiTransactionId } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        
        // Ensure user owns this order
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Only allow if still pending
        if (order.paymentStatus === 'Paid') {
            return res.status(400).json({ message: 'Payment already confirmed' });
        }

        order.paymentStatus = 'Paid';
        order.paymentMethod = 'UPI';
        order.status = 'Confirmed';
        if (upiTransactionId) order.upiTransactionId = upiTransactionId;
        order.statusHistory.push({ 
            status: 'Confirmed', 
            note: 'Payment confirmed by user (UPI)' 
        });
        
        await order.save();
        await order.populate('user', 'name email phone');
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Download receipt (generate on-the-fly or stream from file)
router.get('/:id/receipt', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate('items.product', 'name images');
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        await generateReceipt(order, res);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Download invoice (both user & admin can access)
router.get('/:id/invoice', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // User can only access their own invoice, admin can access all
        if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (!order.invoicePath) {
            return res.status(404).json({ message: 'Invoice not available for this order' });
        }

        // Stream invoice from disk
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../../' + order.invoicePath);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Invoice file not found' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=TCS-Invoice-${order.orderNumber}.pdf`);
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// CANCEL ORDER - With stock restoration (uses transaction)
// ═══════════════════════════════════════════════════════════════════
router.put('/:id/cancel', protect, async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        // User can only cancel their own orders, admin can cancel any
        if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        
        // Can only cancel orders that haven't been shipped/delivered
        if (['SHIPPED', 'DELIVERED'].includes(order.status)) {
            return res.status(400).json({ message: 'Cannot cancel order that has been shipped or delivered' });
        }
        
        // Use transaction to cancel order and restore stock
        const cancelledOrder = await cancelOrderWithStockRestore(
            req.params.id,
            reason || 'Cancelled by ' + (req.user.role === 'admin' ? 'admin' : 'user'),
            req.user._id
        );
        
        await cancelledOrder.populate('user', 'name email phone');
        res.json({ message: 'Order cancelled successfully', order: cancelledOrder });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// SOFT DELETE ORDER - Admin only (preserves data for recovery)
// ═══════════════════════════════════════════════════════════════════
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { reason } = req.body;
        
        const order = await softDelete('Order', req.params.id, req.user._id, reason);
        res.json({ message: 'Order soft deleted successfully', order });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// RESTORE DELETED ORDER - Admin only
// ═══════════════════════════════════════════════════════════════════
router.put('/:id/restore', protect, adminOnly, async (req, res) => {
    try {
        const order = await restoreDeleted('Order', req.params.id);
        await order.populate('user', 'name email phone');
        res.json({ message: 'Order restored successfully', order });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// SYNC ENDPOINT - Real-time updates for Android/Web polling
// Returns only orders updated since a given timestamp
// ═══════════════════════════════════════════════════════════════════
router.get('/sync/updates', protect, async (req, res) => {
    try {
        const { since, limit = 50 } = req.query;
        const filter = { isDeleted: { $ne: true } };
        
        // If user is not admin, only show their orders
        if (req.user.role !== 'admin') {
            filter.user = req.user._id;
        }
        
        // If 'since' timestamp provided, only get orders updated after that
        if (since) {
            filter.updatedAt = { $gt: new Date(since) };
        }
        
        const orders = await Order.find(filter)
            .populate('user', 'name email phone')
            .populate('items.product', 'name images price')
            .sort({ updatedAt: -1 })
            .limit(Number(limit));
        
        res.json({
            orders,
            count: orders.length,
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD STATS - Quick summary for admin
// ═══════════════════════════════════════════════════════════════════
router.get('/admin/stats/summary', protect, adminOnly, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [
            totalOrders,
            todayOrders,
            pendingOrders,
            paidOrders,
            shippedOrders,
            deliveredOrders,
            cancelledOrders
        ] = await Promise.all([
            Order.countDocuments({ isDeleted: { $ne: true } }),
            Order.countDocuments({ createdAt: { $gte: today }, isDeleted: { $ne: true } }),
            Order.countDocuments({ status: 'PENDING', isDeleted: { $ne: true } }),
            Order.countDocuments({ paymentStatus: 'Paid', isDeleted: { $ne: true } }),
            Order.countDocuments({ status: 'SHIPPED', isDeleted: { $ne: true } }),
            Order.countDocuments({ status: 'DELIVERED', isDeleted: { $ne: true } }),
            Order.countDocuments({ status: 'CANCELLED', isDeleted: { $ne: true } })
        ]);
        
        // Calculate revenue
        const revenueResult = await Order.aggregate([
            { $match: { paymentStatus: 'Paid', isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;
        
        // Today's revenue
        const todayRevenueResult = await Order.aggregate([
            { $match: { paymentStatus: 'Paid', createdAt: { $gte: today }, isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const todayRevenue = todayRevenueResult[0]?.total || 0;
        
        res.json({
            totalOrders,
            todayOrders,
            pendingOrders,
            paidOrders,
            shippedOrders,
            deliveredOrders,
            cancelledOrders,
            totalRevenue,
            todayRevenue,
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
