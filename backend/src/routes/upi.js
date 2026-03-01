const router = require('express').Router();
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { protect } = require('../middleware/auth');
const { generateAndSaveInvoice } = require('../controllers/pdfController');
const { sendOrderNotificationSMS } = require('../services/smsService');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════════
// DIRECT UPI PAYMENT - PhonePe & Google Pay (No Razorpay)
// ════════════════════════════════════════════════════════════════════

// Reduce stock after payment
const reduceStockAfterPayment = async (order) => {
    if (!order || order.stockReduced) return false;
    
    try {
        for (const item of order.items) {
            if (item.product) {
                const product = await Product.findById(item.product);
                if (product) {
                    const newStock = Math.max(0, product.stock - (item.quantity || 1));
                    product.stock = newStock;
                    await product.save();
                    console.log(`📉 Stock reduced: ${product.name} → ${newStock} units`);
                }
            }
        }
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

// Create payment record
const createPaymentRecord = async (paymentData) => {
    try {
        const payment = new Payment({
            razorpayPaymentId: paymentData.paymentId,
            order: paymentData.orderId,
            user: paymentData.userId,
            amount: paymentData.amount,
            method: paymentData.method,
            methodDetails: paymentData.methodDetails || {},
            status: paymentData.status || 'PAID',
            contact: paymentData.contact || {},
            notes: paymentData.notes
        });
        
        await payment.save();
        console.log(`✅ Payment record created: ${paymentData.paymentId}`);
        return payment;
    } catch (err) {
        if (err.code === 11000) {
            console.log('⏭️ Payment record already exists');
            return null;
        }
        console.error('❌ Payment record error:', err.message);
        return null;
    }
};

// Generate UPI String for deep linking
const generateUPIString = (upiId, name, amount, transactionRef) => {
    // UPI format: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&tn=DESC&tr=REF
    const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&tn=${encodeURIComponent(`Order ${transactionRef}`)}&tr=${transactionRef}`;
    return upiString;
};

// Generate QR Code (returns data URL for QR)
const generateQRCode = async (upiString) => {
    try {
        const QRCode = require('qrcode');
        const qrDataUrl = await QRCode.toDataURL(upiString, { width: 300 });
        console.log('✅ QR Code generated successfully');
        return qrDataUrl;
    } catch (err) {
        console.error('⚠️ QR Code generation failed (continuing without QR):', err.message);
        // Return null instead of crashing - QR is optional
        return null;
    }
};

// ─────────────────────────────────────────────────────────────────
// ENDPOINT 1: Create Direct UPI Payment Link
// ─────────────────────────────────────────────────────────────────
router.post('/create-link', protect, async (req, res) => {
    try {
        const { orderId, amount } = req.body;

        console.log(`📱 UPI Payment Request - Order: ${orderId}, Amount: ${amount}, User: ${req.user._id}`);

        const order = await Order.findById(orderId);
        if (!order) {
            console.log(`❌ Order not found: ${orderId}`);
            return res.status(404).json({ message: 'Order not found' });
        }
        
        if (order.user.toString() !== req.user._id.toString()) {
            console.log(`❌ Access denied - Order user: ${order.user}, Request user: ${req.user._id}`);
            return res.status(403).json({ message: 'Access denied' });
        }

        // Get merchant UPI ID (from env or settings)
        const merchantUPI = process.env.MERCHANT_UPI_ID || 'tcsstore@upi';
        const merchantName = process.env.MERCHANT_NAME || 'TCS Store';
        const transactionRef = `TCS${Date.now()}`;

        console.log(`💳 Generating payment link - Merchant: ${merchantUPI}, TransRef: ${transactionRef}`);

        // Generate UPI string for deep linking
        const upiString = generateUPIString(merchantUPI, merchantName, amount, transactionRef);

        // Generate QR Code
        const qrCode = await generateQRCode(upiString);

        // Save transaction reference to order for webhook matching
        order.transactionRef = transactionRef;
        order.upiString = upiString;
        await order.save();

        console.log(`✅ UPI Payment link created successfully - TransRef: ${transactionRef}`);

        // Create standard UPI deep link that works with all apps
        const upiParams = new URLSearchParams({
            pa: merchantUPI,
            pn: merchantName,
            am: amount.toString(),
            tn: `TCS Order ${transactionRef}`,
            tr: transactionRef
        });
        const standardLink = `upi://pay?${upiParams.toString()}`;

        res.json({
            success: true,
            transactionRef,
            upiString,
            qrCode,
            amount,
            merchantUPI,
            merchantName,
            // Deep links for different apps - all use same format for compatibility
            deepLinks: {
                googlePay: standardLink,
                phonePe: standardLink,
                paytm: standardLink,
                standard: standardLink
            }
        });
    } catch (err) {
        console.error('❌ UPI link creation error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// ENDPOINT 2: Verify Direct UPI Payment (Manual or Webhook)
// ─────────────────────────────────────────────────────────────────
router.post('/verify-payment', protect, async (req, res) => {
    try {
        const { transactionRef, paymentId, method, shippingAddress, amount } = req.body;

        // Find order by transaction ref
        let order = await Order.findOne({ transactionRef });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if already paid
        if (order.paymentStatus === 'Paid') {
            return res.json({
                success: true,
                message: 'Payment already processed',
                orderId: order._id.toString(),
                orderNumber: order.orderNumber
            });
        }

        // Update order with payment details
        order.paymentId = paymentId || paymentId;
        order.paymentMethod = method || 'UPI';
        order.paymentStatus = 'Paid';
        order.status = 'PAID';
        order.shippingAddress = shippingAddress || order.shippingAddress;
        order.statusHistory.push({
            status: 'PAID',
            note: `Payment verified via ${method || 'UPI'}`
        });
        
        await order.save();
        console.log(`✅ Payment verified for order ${order.orderNumber}`);

        // Reduce stock after payment
        await reduceStockAfterPayment(order);

        // Create payment record
        const user = await User.findById(req.user._id);
        await createPaymentRecord({
            paymentId: paymentId || `UPI_${transactionRef}`,
            orderId: order._id,
            userId: req.user._id,
            amount: amount || order.totalAmount,
            method: method || 'UPI',
            status: 'PAID',
            contact: {
                name: user?.name || '',
                email: user?.email || '',
                phone: user?.phone || ''
            }
        });

        // Populate order for invoice
        await order.populate('user', 'name email phone');

        // Generate invoice
        try {
            const invoiceData = await generateAndSaveInvoice(order);
            order.invoicePath = invoiceData.invoicePath;
            order.invoiceUrl = invoiceData.invoiceUrl;
            await order.save();
        } catch (invoiceErr) {
            console.error('Invoice generation failed:', invoiceErr);
        }

        // Send SMS notification
        try {
            await sendOrderNotificationSMS(order);
        } catch (smsErr) {
            console.error('SMS notification failed (order still valid):', smsErr.message);
        }

        // Clear cart
        await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });

        res.json({
            success: true,
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            message: 'Payment verified successfully'
        });
    } catch (err) {
        console.error('❌ Payment verification error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// ENDPOINT 3: Check Payment Status
// ─────────────────────────────────────────────────────────────────
router.get('/check-status/:transactionRef', protect, async (req, res) => {
    try {
        const { transactionRef } = req.params;

        const order = await Order.findOne({ transactionRef });
        if (!order) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json({
            success: true,
            transactionRef,
            status: order.paymentStatus,
            orderId: order._id,
            orderNumber: order.orderNumber,
            amount: order.totalAmount,
            isPaid: order.paymentStatus === 'Paid'
        });
    } catch (err) {
        console.error('❌ Status check error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// ENDPOINT 4: PhonePe Webhook (if using PhonePe API)
// ─────────────────────────────────────────────────────────────────
router.post('/webhook/phonepe', async (req, res) => {
    try {
        console.log('📱 PhonePe Webhook received:', req.body);
        
        const { transactionId, status, amount, transactionRef } = req.body;

        if (status === 'SUCCESS' || status === 'Completed') {
            // Update order
            const order = await Order.findOne({ transactionRef: transactionRef || transactionId });
            if (order) {
                order.paymentStatus = 'Paid';
                order.paymentId = transactionId;
                await order.save();
                console.log(`✅ PhonePe payment confirmed: ${transactionId}`);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// ENDPOINT 5: Google Pay Webhook (if using Google Pay API)
// ─────────────────────────────────────────────────────────────────
router.post('/webhook/googlepay', async (req, res) => {
    try {
        console.log('🟢 Google Pay Webhook received:', req.body);
        
        const { transactionId, status, amount } = req.body;

        if (status === 'COMPLETED' || status === 'SUCCESS') {
            const order = await Order.findOne({ paymentId: transactionId });
            if (order) {
                order.paymentStatus = 'Paid';
                await order.save();
                console.log(`✅ Google Pay payment confirmed: ${transactionId}`);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
