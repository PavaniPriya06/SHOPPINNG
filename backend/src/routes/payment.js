const router = require('express').Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Payment = require('../models/Payment');
const { protect, adminOnly } = require('../middleware/auth');
const { generateAndSaveInvoice } = require('../controllers/pdfController');
const { sendOrderNotificationSMS } = require('../services/smsService');

const getRazorpay = () => new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder'
});

// ══════════════════════════════════════════════════════════════════════════
// STOCK MANAGEMENT - Reduce stock ONLY after payment success
// ══════════════════════════════════════════════════════════════════════════
const reduceStockAfterPayment = async (order) => {
    if (!order || order.stockReduced) {
        console.log('⏭️ Stock already reduced or order invalid');
        return false;
    }
    
    try {
        for (const item of order.items) {
            if (item.product) {
                const product = await Product.findById(item.product);
                if (product) {
                    const newStock = Math.max(0, product.stock - (item.quantity || 1));
                    product.stock = newStock;
                    await product.save();
                    console.log(`📉 Stock reduced: ${product.name} → ${newStock} units`);
                    
                    // Alert for low stock
                    if (newStock <= 5) {
                        console.log(`⚠️ LOW STOCK ALERT: ${product.name} has only ${newStock} units left!`);
                    }
                }
            }
        }
        
        // Mark stock as reduced on the order
        order.stockReduced = true;
        order.stockReducedAt = new Date();
        await order.save();
        
        console.log(`✅ Stock reduced for order ${order.orderNumber}`);
        return true;
    } catch (err) {
        console.error('❌ Stock reduction error:', err.message);
        return false;
    }
};

// ══════════════════════════════════════════════════════════════════════════
// PAYMENT RECORD - Create Payment record in database
// ══════════════════════════════════════════════════════════════════════════
const createPaymentRecord = async (paymentData) => {
    try {
        const payment = new Payment({
            razorpayPaymentId: paymentData.paymentId,
            razorpayOrderId: paymentData.razorpayOrderId,
            razorpaySignature: paymentData.razorpaySignature,
            order: paymentData.orderId,
            user: paymentData.userId,
            amount: paymentData.amount,
            method: paymentData.method || 'UPI',
            methodDetails: paymentData.methodDetails || {},
            status: paymentData.status || 'PAID',
            contact: paymentData.contact || {},
            notes: paymentData.notes
        });
        
        await payment.save();
        console.log(`✅ Payment record created: ${paymentData.paymentId}`);
        return payment;
    } catch (err) {
        // Duplicate payment is OK (idempotency)
        if (err.code === 11000) {
            console.log('⏭️ Payment record already exists');
            return null;
        }
        console.error('❌ Payment record error:', err.message);
        return null;
    }
};

// Helper: Save address to user profile ONLY after successful payment
const saveAddressToUserOnPaymentSuccess = async (userId, shippingAddress) => {
    if (!userId || !shippingAddress || !shippingAddress.pincode) return;
    
    try {
        const user = await User.findById(userId);
        if (!user) return;
        
        const existingAddr = user.addresses?.find(a => 
            a.pincode === shippingAddress.pincode && 
            a.houseNo === shippingAddress.houseNo
        );
        
        if (!existingAddr) {
            user.addresses = user.addresses || [];
            user.addresses.push({
                label: 'Home',
                fullName: shippingAddress.fullName || shippingAddress.name || '',
                phone: shippingAddress.phone || '',
                houseNo: shippingAddress.houseNo || '',
                street: shippingAddress.street || '',
                landmark: shippingAddress.landmark || '',
                city: shippingAddress.city || '',
                state: shippingAddress.state || '',
                pincode: shippingAddress.pincode || '',
                isDefault: user.addresses.length === 0
            });
            await user.save();
            console.log(`✅ Address saved to user profile after payment success`);
        }
    } catch (err) {
        console.error('Could not save address to user:', err.message);
    }
};

// Helper: Check if payment already processed (idempotency)
const isPaymentAlreadyProcessed = async (paymentId) => {
    if (!paymentId) return false;
    const existingOrder = await Order.findOne({ paymentId, paymentStatus: 'Paid' });
    return !!existingOrder;
};

// Get admin's UPI ID
const getAdminUpiId = async () => {
    try {
        const setting = await Settings.findOne({ key: 'upi' });
        return setting?.value || process.env.ADMIN_UPI_ID || 'store@upi';
    } catch {
        return process.env.ADMIN_UPI_ID || 'store@upi';
    }
};

// ─── AUTO-CREATE ORDER FROM CART ───────────────────────────────────────
// Helper function to create order automatically from cart + payment details
const createOrderFromCart = async (userId, paymentDetails) => {
    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.items.length) {
        throw new Error('Cart is empty');
    }

    let totalAmount = 0;
    const enrichedItems = [];

    for (const item of cart.items) {
        if (item.product && item.product.startsWith && item.product.startsWith('demo-')) {
            enrichedItems.push({
                name: item.name,
                price: item.price,
                image: item.image,
                quantity: item.quantity || 1,
                size: item.size,
                color: item.color
            });
            totalAmount += item.price * (item.quantity || 1);
        } else if (item.product) {
            const product = await Product.findById(item.product);
            if (!product) {
                throw new Error(`Product not found: ${item.product}`);
            }
            enrichedItems.push({
                product: item.product,
                name: item.name || product.name,
                price: item.price || product.price,
                image: item.image || (product.images?.[0] || ''),
                quantity: item.quantity || 1,
                size: item.size,
                color: item.color
            });
            totalAmount += (item.price || product.price) * (item.quantity || 1);
        } else {
            enrichedItems.push({
                name: item.name,
                price: item.price,
                image: item.image,
                quantity: item.quantity || 1,
                size: item.size,
                color: item.color
            });
            totalAmount += item.price * (item.quantity || 1);
        }
    }

    const shippingCharge = totalAmount > 999 ? 0 : 49;
    totalAmount += shippingCharge;

    // Create order with payment details - status PAID after verification
    const adminUpiId = await getAdminUpiId();
    const order = new Order({
        user: userId,
        items: enrichedItems,
        totalAmount,
        shippingCharge,
        shippingAddress: paymentDetails.shippingAddress,
        paymentMethod: paymentDetails.paymentMethod || 'Razorpay',
        paymentStatus: 'Paid',  // ✅ Verified payment
        paymentId: paymentDetails.paymentId,
        razorpayOrderId: paymentDetails.razorpayOrderId,
        razorpaySignature: paymentDetails.razorpaySignature,
        upiId: adminUpiId,
        status: 'PAID',  // ✅ Order status = PAID (verified)
        statusHistory: [
            { status: 'PAID', note: 'Order created after payment verification' }
        ]
    });

    // Save order first
    await order.save();

    // ✅ REDUCE STOCK ONLY AFTER PAYMENT SUCCESS
    await reduceStockAfterPayment(order);

    // ✅ CREATE PAYMENT RECORD
    const user = await User.findById(userId);
    await createPaymentRecord({
        paymentId: paymentDetails.paymentId,
        razorpayOrderId: paymentDetails.razorpayOrderId,
        razorpaySignature: paymentDetails.razorpaySignature,
        orderId: order._id,
        userId: userId,
        amount: totalAmount,
        method: paymentDetails.paymentMethod === 'UPI' ? 'UPI' : 'Card',
        status: 'PAID',
        contact: {
            name: user?.name || '',
            email: user?.email || '',
            phone: user?.phone || paymentDetails.shippingAddress?.phone || ''
        }
    });

    // Populate and add invoice
    await order.populate('user', 'name email phone');

    // Generate PDF invoice automatically
    const invoiceData = await generateAndSaveInvoice(order);
    order.invoicePath = invoiceData.invoicePath;
    order.invoiceUrl = invoiceData.invoiceUrl;
    await order.save();

    // ──────────────────────────────────────────────────
    // SEND SMS NOTIFICATIONS (After order + invoice ready)
    // Only after: Razorpay confirms payment + Order created + Invoice generated
    // ──────────────────────────────────────────────────
    try {
        await sendOrderNotificationSMS(order);
    } catch (smsErr) {
        // Log error but DON'T fail the order
        // Order is already created and valid
        console.error('SMS notification error (order still valid):', smsErr.message);
    }

    // Clear user's cart
    await Cart.findOneAndUpdate({ user: userId }, { items: [] });

    return order;
};

// Create Razorpay order
router.post('/create-order', protect, async (req, res) => {
    try {
        const { amount, orderId, shippingAddress } = req.body; // amount in rupees

        // Validate that user has items in cart
        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart || !cart.items.length) {
            return res.status(400).json({ message: 'Cart is empty' });
        }

        const options = {
            amount: Math.round(amount * 100), // convert to paise
            currency: 'INR',
            receipt: `receipt_${orderId || Date.now()}`,
            notes: {
                userId: req.user._id.toString(),
                userEmail: req.user.email || '',
                userName: req.user.name || '',
                shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : ''
            }
        };

        const razorpayOrder = await getRazorpay().orders.create(options);
        res.json({
            id: razorpayOrder.id,
            currency: razorpayOrder.currency,
            amount: razorpayOrder.amount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Verify payment signature (called from frontend after Razorpay checkout)
router.post('/verify', protect, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

        // ── IDEMPOTENCY CHECK: Prevent duplicate order creation ──
        if (await isPaymentAlreadyProcessed(razorpay_payment_id)) {
            // Payment already processed - return existing order
            const existingOrder = await Order.findOne({ paymentId: razorpay_payment_id });
            return res.json({
                success: true,
                message: 'Payment already processed',
                orderId: existingOrder._id.toString(),
                orderNumber: existingOrder.orderNumber
            });
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'placeholder');
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const expectedSignature = hmac.digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // Auto-create order from cart + payment details
        const order = await createOrderFromCart(req.user._id, {
            paymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature,
            paymentMethod: 'Razorpay',
            shippingAddress
        });

        // ── SAVE ADDRESS TO USER ONLY AFTER PAYMENT SUCCESS ──
        await saveAddressToUserOnPaymentSuccess(req.user._id, shippingAddress);

        res.json({
            success: true,
            message: 'Payment verified & order created',
            orderId: order._id.toString(),
            orderNumber: order.orderNumber
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// CASH ON DELIVERY (COD) - Place order with pay on delivery
// ══════════════════════════════════════════════════════════════════════════
router.post('/cod', protect, async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        
        // Find the existing order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Verify user owns this order
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        // Check COD limit (max ₹5,000)
        if (order.totalAmount > 5000) {
            return res.status(400).json({ 
                success: false, 
                message: 'COD is only available for orders up to ₹5,000' 
            });
        }
        
        // Update order for COD
        order.paymentMethod = 'COD';
        order.paymentStatus = 'Pending'; // Payment will be collected on delivery
        order.status = 'PLACED';
        order.statusHistory.push({
            status: 'PLACED',
            note: 'Cash on Delivery order placed'
        });
        
        await order.save();
        
        // ✅ CREATE PAYMENT RECORD FOR TRACKING (status: Pending for COD)
        await createPaymentRecord({
            paymentId: `COD_${order._id}_${Date.now()}`,
            orderId: order._id,
            userId: req.user._id,
            amount: order.totalAmount,
            method: 'COD',
            status: 'PENDING', // Will be marked PAID when delivered
            contact: {
                name: order.shippingAddress?.fullName || '',
                phone: order.shippingAddress?.phone || ''
            },
            notes: { collectOnDelivery: true }
        });
        
        // Populate for response
        await order.populate('user', 'name email phone');
        
        // Generate PDF invoice
        try {
            const invoiceData = await generateAndSaveInvoice(order);
            order.invoicePath = invoiceData.invoicePath;
            order.invoiceUrl = invoiceData.invoiceUrl;
            await order.save();
        } catch (invoiceErr) {
            console.error('Invoice generation error:', invoiceErr.message);
        }
        
        // Send SMS notification
        try {
            await sendOrderNotificationSMS(order);
        } catch (smsErr) {
            console.error('SMS notification error:', smsErr.message);
        }
        
        // Save address to user profile
        await saveAddressToUserOnPaymentSuccess(req.user._id, order.shippingAddress);
        
        // Clear user's cart
        await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });
        
        res.json({
            success: true,
            message: 'COD order placed successfully',
            orderId: order._id.toString(),
            orderNumber: order.orderNumber
        });
    } catch (err) {
        console.error('COD order error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Razorpay Webhook — server-side payment confirmation
// NOTE: Requires raw body — handled via server.js special middleware for this path
router.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || 'placeholder';
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(JSON.stringify(req.body));
        const expectedSignature = hmac.digest('hex');

        if (signature !== expectedSignature) {
            return res.status(400).json({ message: 'Invalid webhook signature' });
        }

        const event = req.body.event;
        const payment = req.body.payload?.payment?.entity;

        if (event === 'payment.captured' && payment) {
            const paymentId = payment.id;
            const userId = payment.notes?.userId;
            const orderId = payment.notes?.orderId;
            const shippingAddressStr = payment.notes?.shippingAddress;

            // ── IDEMPOTENCY CHECK: Use paymentId as unique reference ──
            if (await isPaymentAlreadyProcessed(paymentId)) {
                console.log(`⏭️ Payment ${paymentId} already processed - skipping webhook`);
                return res.json({ received: true, status: 'already_processed' });
            }

            // Parse shipping address from notes
            let shippingAddress = {};
            if (shippingAddressStr) {
                try {
                    shippingAddress = JSON.parse(shippingAddressStr);
                } catch (e) {
                    console.error('Could not parse shipping address:', e);
                }
            }

            // Case 1: Order already exists (Buy Now flow) - just update it
            if (orderId) {
                try {
                    const order = await Order.findById(orderId);
                    if (order && order.paymentStatus !== 'Paid') {
                        order.paymentStatus = 'Paid';
                        order.paymentId = paymentId;
                        order.paymentMethod = 'UPI';
                        order.status = 'Placed';
                        order.statusHistory.push({ 
                            status: 'Placed', 
                            note: 'Payment confirmed via webhook' 
                        });
                        await order.save();
                        
                        // Save address to user profile after payment success
                        if (userId) {
                            await saveAddressToUserOnPaymentSuccess(userId, order.shippingAddress);
                        }
                        
                        console.log(`✅ Order ${orderId} updated via webhook for payment ${paymentId}`);
                    }
                } catch (orderErr) {
                    console.error('Failed to update order from webhook:', orderErr);
                }
            }
            // Case 2: Cart checkout - create new order
            else if (userId) {
                try {
                    const order = await createOrderFromCart(userId, {
                        paymentId: paymentId,
                        razorpayOrderId: payment.order_id,
                        paymentMethod: 'Razorpay',
                        shippingAddress
                    });
                    
                    // Save address to user profile after payment success
                    await saveAddressToUserOnPaymentSuccess(userId, shippingAddress);
                    
                    console.log(`✅ Order auto-created for payment ${paymentId}`);
                } catch (orderErr) {
                    // Check if error is due to duplicate paymentId (unique constraint)
                    if (orderErr.code === 11000 && orderErr.keyPattern?.paymentId) {
                        console.log(`⏭️ Payment ${paymentId} already has an order - duplicate webhook ignored`);
                    } else {
                        console.error('Failed to create order from webhook:', orderErr);
                    }
                }
            }
        }

        res.json({ received: true });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Get Razorpay public key (used by frontend)
router.get('/key', (req, res) => {
    res.json({ key: process.env.RAZORPAY_KEY_ID || '' });
});

// Get admin UPI ID for payment page
router.get('/upi-id', async (req, res) => {
    try {
        const upiId = await getAdminUpiId();
        res.json({ upiId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create Razorpay order for UPI payment (for direct order, not cart)
router.post('/create-upi-order', protect, async (req, res) => {
    try {
        const { orderId, amount } = req.body;

        // Validate the order exists and belongs to user
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const upiId = await getAdminUpiId();
        
        const options = {
            amount: Math.round(amount * 100), // convert to paise
            currency: 'INR',
            receipt: `order_${orderId}`,
            payment_capture: 1,
            notes: {
                userId: req.user._id.toString(),
                orderId: orderId,
                adminUpiId: upiId
            }
        };

        const razorpayOrder = await getRazorpay().orders.create(options);
        
        // Update order with razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        order.upiId = upiId;
        await order.save();

        res.json({
            id: razorpayOrder.id,
            currency: razorpayOrder.currency,
            amount: razorpayOrder.amount,
            upiId: upiId
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Verify UPI payment for existing order (Buy Now flow)
router.post('/verify-upi', protect, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        // ── IDEMPOTENCY CHECK: Prevent duplicate payment updates ──
        if (await isPaymentAlreadyProcessed(razorpay_payment_id)) {
            const existingOrder = await Order.findOne({ paymentId: razorpay_payment_id });
            return res.json({
                success: true,
                message: 'Payment already verified',
                orderId: existingOrder._id.toString(),
                orderNumber: existingOrder.orderNumber
            });
        }

        // Verify signature
        const secret = process.env.RAZORPAY_KEY_SECRET || 'placeholder';
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const expectedSignature = hmac.digest('hex');

        if (expectedSignature !== razorpay_signature) {
            // ❌ Payment signature invalid - reject and record as failed
            await createPaymentRecord({
                paymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                orderId: orderId,
                userId: req.user._id,
                amount: 0,
                status: 'FAILED',
                notes: { error: 'Invalid signature' }
            });
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // Update order status
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if this order is already paid (another idempotency check)
        if (order.paymentStatus === 'Paid') {
            return res.json({
                success: true,
                message: 'Order already paid',
                orderId: order._id.toString(),
                orderNumber: order.orderNumber
            });
        }

        // ✅ Update order to PAID status
        order.paymentStatus = 'Paid';
        order.paymentId = razorpay_payment_id;
        order.razorpaySignature = razorpay_signature;
        order.paymentMethod = 'UPI';
        order.status = 'PAID';
        order.statusHistory.push({ 
            status: 'PAID', 
            note: 'Payment verified via Razorpay UPI' 
        });
        
        await order.save();

        // ✅ REDUCE STOCK ONLY AFTER PAYMENT SUCCESS
        await reduceStockAfterPayment(order);

        // ✅ CREATE PAYMENT RECORD
        await createPaymentRecord({
            paymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature,
            orderId: order._id,
            userId: req.user._id,
            amount: order.totalAmount,
            method: 'UPI',
            status: 'PAID',
            contact: {
                name: order.shippingAddress?.fullName || '',
                phone: order.shippingAddress?.phone || ''
            }
        });

        // ── SAVE ADDRESS TO USER ONLY AFTER PAYMENT SUCCESS ──
        await saveAddressToUserOnPaymentSuccess(req.user._id, order.shippingAddress);

        // Populate and generate invoice
        await order.populate('user', 'name email phone');

        // Generate PDF invoice
        try {
            const invoiceData = await generateAndSaveInvoice(order);
            order.invoicePath = invoiceData.invoicePath;
            order.invoiceUrl = invoiceData.invoiceUrl;
            await order.save();
        } catch (invoiceErr) {
            console.error('Invoice generation error:', invoiceErr);
        }

        // Send SMS notifications
        try {
            await sendOrderNotificationSMS(order);
        } catch (smsErr) {
            console.error('SMS notification error:', smsErr.message);
        }

        res.json({
            success: true,
            message: 'Payment verified successfully',
            orderId: order._id.toString(),
            orderNumber: order.orderNumber
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS - View Payments, Stock Alerts
// ══════════════════════════════════════════════════════════════════════════

// Admin: Get all payments
router.get('/admin/all', protect, adminOnly, async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const filter = status ? { status } : {};
        
        const payments = await Payment.find(filter)
            .populate('user', 'name email phone')
            .populate('order', 'orderNumber totalAmount status')
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));
        
        const total = await Payment.countDocuments(filter);
        const stats = {
            total: await Payment.countDocuments(),
            paid: await Payment.countDocuments({ status: 'PAID' }),
            failed: await Payment.countDocuments({ status: 'FAILED' }),
            pending: await Payment.countDocuments({ status: 'PENDING' }),
            totalRevenue: await Payment.aggregate([
                { $match: { status: 'PAID' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]).then(r => r[0]?.total || 0)
        };
        
        res.json({ payments, total, stats });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: Get payment by ID
router.get('/admin/:paymentId', protect, adminOnly, async (req, res) => {
    try {
        const payment = await Payment.findOne({ razorpayPaymentId: req.params.paymentId })
            .populate('user', 'name email phone')
            .populate('order', 'orderNumber totalAmount status items shippingAddress');
        
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        
        res.json(payment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin: Get low stock products
router.get('/admin/stock/alerts', protect, adminOnly, async (req, res) => {
    try {
        const threshold = Number(req.query.threshold) || 10;
        
        const lowStockProducts = await Product.find({ stock: { $lte: threshold } })
            .sort({ stock: 1 })
            .select('name stock price images category');
        
        const outOfStock = lowStockProducts.filter(p => p.stock === 0);
        const criticalStock = lowStockProducts.filter(p => p.stock > 0 && p.stock <= 5);
        const lowStock = lowStockProducts.filter(p => p.stock > 5);
        
        res.json({
            outOfStock,
            criticalStock,
            lowStock,
            summary: {
                outOfStockCount: outOfStock.length,
                criticalCount: criticalStock.length,
                lowStockCount: lowStock.length
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
