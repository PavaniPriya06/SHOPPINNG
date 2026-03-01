import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCreditCard, FiSmartphone, FiCheckCircle, FiShield, FiLock, FiTruck, FiAlertTriangle } from 'react-icons/fi';
import api from '../utils/api';
import toast from 'react-hot-toast';
import DirectUPIPaymentModal from './DirectUPIPaymentModal';

// Brand icons as inline SVGs
const GooglePayIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const PhonePeIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#5F259F"/>
        <path d="M17.5 8.5H14.5V6.5C14.5 5.67 13.83 5 13 5H8.5C7.67 5 7 5.67 7 6.5V17.5C7 18.33 7.67 19 8.5 19H10V11.5H13.5C14.33 11.5 15 10.83 15 10V9.5H17.5C18.33 9.5 19 8.83 19 8C19 8.28 18.78 8.5 18.5 8.5H17.5Z" fill="white"/>
        <circle cx="15.5" cy="15.5" r="2.5" fill="white"/>
    </svg>
);

const PaytmIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#00BAF2"/>
        <path d="M5 12.5C5 10.29 6.79 8.5 9 8.5H12V10.5H9C7.9 10.5 7 11.4 7 12.5C7 13.6 7.9 14.5 9 14.5H12V16.5H9C6.79 16.5 5 14.71 5 12.5Z" fill="white"/>
        <path d="M12 8.5H15C17.21 8.5 19 10.29 19 12.5C19 14.71 17.21 16.5 15 16.5H12V14.5H15C16.1 14.5 17 13.6 17 12.5C17 11.4 16.1 10.5 15 10.5H12V8.5Z" fill="white"/>
    </svg>
);

const UPI_APPS = [
    { name: 'Google Pay', icon: <GooglePayIcon />, color: '#34A853', scheme: 'gpay' },
    { name: 'PhonePe', icon: <PhonePeIcon />, color: '#5F259F', scheme: 'phonepe' },
    { name: 'Paytm', icon: <PaytmIcon />, color: '#00BAF2', scheme: 'paytm' },
    { name: 'Any UPI App', icon: '📲', color: '#6B7280', scheme: 'upi' },
];

export default function PaymentModal({ isOpen, onClose, onSuccess, order, amount }) {
    const [method, setMethod] = useState('razorpay'); // Default to Razorpay for UPI
    const [adminUpi, setAdminUpi] = useState('');
    const [loading, setLoading] = useState(false);
    const [razorpayLoaded, setRazorpayLoaded] = useState(false);
    const [razorpayKey, setRazorpayKey] = useState('');
    const [razorpayConfigured, setRazorpayConfigured] = useState(true); // Track if Razorpay is configured
    const [showDirectUPI, setShowDirectUPI] = useState(false); // Show direct UPI modal

    useEffect(() => {
        // Fetch admin UPI and Razorpay key
        const fetchData = async () => {
            try {
                const [upiRes, keyRes] = await Promise.all([
                    api.get('/payment/upi-id').catch(() => ({ data: {} })),
                    api.get('/payment/key').catch(() => ({ data: {} }))
                ]);
                if (upiRes.data?.upiId) setAdminUpi(upiRes.data.upiId);
                if (keyRes.data?.key && keyRes.data.key.length > 0 && !keyRes.data.key.includes('placeholder')) {
                    setRazorpayKey(keyRes.data.key);
                    setRazorpayConfigured(true);
                } else {
                    setRazorpayKey('');
                    setRazorpayConfigured(false);
                    // Auto-switch to COD if Razorpay not configured
                    setMethod('cod');
                }
            } catch {
                setRazorpayConfigured(false);
                setMethod('cod');
            }
        };
        fetchData();

        // Load Razorpay script
        if (!window.Razorpay) {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => setRazorpayLoaded(true);
            script.onerror = () => toast.error('Payment service unavailable');
            document.body.appendChild(script);
        } else {
            setRazorpayLoaded(true);
        }
    }, []);

    // Razorpay UPI Payment (RECOMMENDED - Real payment via Razorpay)
    const handleRazorpayUPI = async () => {
        if (!razorpayConfigured || !razorpayKey) {
            toast.error('Online payment not configured. Use Direct UPI or Cash on Delivery.');
            setShowDirectUPI(true); // Show direct UPI fallback
            return;
        }
        
        if (!razorpayLoaded) {
            toast.error('Payment gateway loading, please wait...');
            return;
        }
        
        // Check if keys are placeholders
        if (razorpayKey.includes('placeholder') || razorpayKey === 'rzp_test_placeholder') {
            toast.error('⚠️ Payment keys not configured. Add real Razorpay keys to proceed.');
            console.warn('⚠️ Razorpay key is placeholder:', razorpayKey);
            setShowDirectUPI(true);
            return;
        }
        
        setLoading(true);
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log('📱 Payment Platform:', isMobile ? 'MOBILE' : 'DESKTOP');
        console.log('💳 Payment Method:', 'UPI');
        
        try {
            // Create Razorpay order for this specific order
            const { data: rpOrder } = await api.post('/payment/create-upi-order', {
                orderId: order._id,
                amount: amount
            });

            // Save shipping address to sessionStorage for mobile callback recovery
            if (order.shippingAddress) {
                sessionStorage.setItem('pendingShippingAddress', JSON.stringify(order.shippingAddress));
                sessionStorage.setItem('pendingOrderAmount', String(amount));
            }

            // Get the base URL for callbacks
            const baseUrl = window.location.origin;
            const callbackUrl = `${baseUrl}/payment-callback/${order._id}`;
            
            console.log('🔗 Callback URL:', callbackUrl);
            console.log('🎯 Razorpay Order:', rpOrder.id);

            const options = {
                key: razorpayKey,
                amount: rpOrder.amount,
                currency: 'INR',
                name: 'TCS – The Co-ord Set Studio',
                description: `Order #${order.orderNumber}`,
                order_id: rpOrder.id,
                prefill: {
                    name: order.shippingAddress?.fullName || '',
                    contact: order.shippingAddress?.phone || '',
                },
                // Mobile-specific: redirect callback URL
                callback_url: isMobile ? callbackUrl : undefined,
                redirect: isMobile,
                config: {
                    display: {
                        blocks: {
                            upi: {
                                name: "Pay via UPI",
                                instruments: [
                                    { method: "upi", flows: isMobile ? ["intent", "qrcode"] : ["qrcode", "collect", "intent"] }
                                ]
                            }
                        },
                        sequence: ["block.upi"],
                        preferences: {
                            show_default_blocks: false
                        }
                    }
                },
                theme: { 
                    color: '#D4A574', 
                    backdrop_color: '#2C1810',
                    hide_topbar: false
                },
                modal: { 
                    backdropclose: false,
                    escape: false,
                    confirm_close: true,
                    ondismiss: () => {
                        setLoading(false);
                        console.log('❌ Payment cancelled by user');
                        toast.error('Payment cancelled');
                    }
                },
                handler: async (response) => {
                    try {
                        console.log('✅ Payment response received:', response.razorpay_payment_id);
                        
                        // ✅ VERIFY PAYMENT SIGNATURE AND AUTO-CREATE ORDER
                        const verifyRes = await api.post('/payment/verify', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            shippingAddress: order.shippingAddress,
                            amount
                        });
                        
                        if (verifyRes.data.success && verifyRes.data.orderId) {
                            // Clear sessionStorage after successful verification
                            sessionStorage.removeItem('pendingShippingAddress');
                            sessionStorage.removeItem('pendingOrderAmount');
                            console.log('🎉 Order created successfully:', verifyRes.data.orderId);
                            toast.success('✅ Order Placed Successfully! 🎉');
                            onSuccess(verifyRes.data.orderId); // Pass auto-created order ID
                        } else {
                            toast.error('Payment verification failed');
                        }
                    } catch (err) {
                        toast.error(err.response?.data?.message || 'Payment verification failed');
                        console.error('Verify error:', err);
                    } finally {
                        setLoading(false);
                    }
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (response) => {
                console.error('❌ Payment failed:', response.error.description);
                toast.error(`Payment failed: ${response.error.description}`);
                setLoading(false);
            });
            
            console.log('🚀 Opening Razorpay payment modal...');
            console.log('📱 On mobile - UPI app will open with intent flow');
            rzp.open();
        } catch (err) {
            console.error('❌ Payment initiation error:', err);
            toast.error(err.response?.data?.message || 'Could not initiate payment');
            setLoading(false);
        }
    };

    // Razorpay Full Payment (Cards, Net Banking, Wallets, UPI)
    const handleRazorpayFull = async () => {
        if (!razorpayLoaded || !razorpayKey) {
            toast.error('Payment gateway loading, please wait...');
            return;
        }
        
        setLoading(true);
        try {
            const { data: rpOrder } = await api.post('/payment/create-upi-order', {
                orderId: order._id,
                amount: amount
            });

            // Save shipping address to sessionStorage for mobile callback recovery
            if (order.shippingAddress) {
                sessionStorage.setItem('pendingShippingAddress', JSON.stringify(order.shippingAddress));
                sessionStorage.setItem('pendingOrderAmount', String(amount));
            }

            // Detect if mobile device
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // Get the base URL for callbacks
            const baseUrl = window.location.origin;
            const callbackUrl = `${baseUrl}/payment-callback/${order._id}`;

            const options = {
                key: razorpayKey,
                amount: rpOrder.amount,
                currency: 'INR',
                name: 'TCS – The Co-ord Set Studio',
                description: `Order #${order.orderNumber}`,
                order_id: rpOrder.id,
                prefill: {
                    name: order.shippingAddress?.fullName || '',
                    contact: order.shippingAddress?.phone || '',
                },
                // Mobile-specific: redirect callback URL
                callback_url: isMobile ? callbackUrl : undefined,
                redirect: isMobile,
                theme: { 
                    color: '#D4A574', 
                    backdrop_color: '#2C1810'
                },
                modal: { 
                    backdropclose: false,
                    escape: false,
                    confirm_close: true,
                    ondismiss: () => {
                        setLoading(false);
                        toast.error('Payment cancelled');
                    }
                },
                handler: async (response) => {
                    try {
                        const verifyRes = await api.post('/payment/verify-upi', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            orderId: order._id
                        });
                        
                        // Clear sessionStorage after successful verification
                        sessionStorage.removeItem('pendingShippingAddress');
                        sessionStorage.removeItem('pendingOrderAmount');
                        toast.success('Payment successful! 🎉');
                        onSuccess(verifyRes.data.orderId);
                    } catch (err) {
                        toast.error('Payment verification failed. Contact support.');
                    } finally {
                        setLoading(false);
                    }
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (response) => {
                toast.error(`Payment failed: ${response.error.description}`);
                setLoading(false);
            });
            rzp.open();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not initiate payment');
            setLoading(false);
        }
    };

    // Cash on Delivery Handler
    const handleCOD = async () => {
        if (amount > 5000) {
            toast.error('COD is only available for orders up to ₹5,000');
            return;
        }
        
        setLoading(true);
        try {
            const { data } = await api.post('/payment/cod', {
                orderId: order._id
            });
            
            if (data.success) {
                toast.success('🎉 Order placed successfully! Pay on delivery.');
                onSuccess(data.orderId);
            } else {
                toast.error(data.message || 'Could not place COD order');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not place COD order');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 25 }}
                    className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-7 py-5 border-b border-cream-200 rounded-t-[2rem]">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-gold to-gold-dark rounded-2xl flex items-center justify-center shadow-soft">
                                <FiCreditCard className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="font-serif text-2xl text-charcoal">Secure Payment</h2>
                                <p className="font-sans text-xs text-charcoal-muted">Step 2 of 2 — Pay ₹{amount?.toLocaleString()}</p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            disabled={loading}
                            className="w-10 h-10 bg-cream-100 hover:bg-cream-200 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
                        >
                            <FiX className="w-5 h-5 text-charcoal" />
                        </button>
                    </div>

                    <div className="p-7 space-y-5">
                        {/* Trust badges */}
                        <div className="flex items-center gap-3 justify-center py-2">
                            {[
                                { icon: FiLock, text: '256-bit SSL' },
                                { icon: FiShield, text: 'PCI DSS' },
                                { icon: FiCheckCircle, text: 'Verified' }
                            ].map(({ icon: Icon, text }) => (
                                <span key={text} className="font-sans text-xs text-charcoal-muted bg-green-50 border border-green-200 px-3 py-2 rounded-full flex items-center gap-1.5">
                                    <Icon className="w-3 h-3 text-green-600" /> {text}
                                </span>
                            ))}
                        </div>

                        {/* Order info */}
                        {order && (
                            <div className="bg-gradient-to-r from-charcoal to-charcoal-light rounded-2xl p-5 flex justify-between items-center text-white">
                                <div>
                                    <p className="font-sans text-xs text-cream-400 uppercase tracking-wider">Order</p>
                                    <p className="font-serif text-xl">#{order.orderNumber}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-sans text-xs text-cream-400 uppercase tracking-wider">Amount</p>
                                    <p className="font-sans text-2xl font-bold text-gold">₹{amount?.toLocaleString()}</p>
                                </div>
                            </div>
                        )}

                        {/* Payment destination info */}
                        {adminUpi && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                <p className="font-sans text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">💰 Payment goes to:</p>
                                <p className="font-sans text-lg font-bold text-amber-900">{adminUpi}</p>
                                <p className="font-sans text-xs text-amber-700 mt-1">via Razorpay secure gateway</p>
                            </div>
                        )}

                        {/* Method Tabs */}
                        <div className="flex gap-2 bg-cream-100 rounded-2xl p-1.5">
                            {[
                                { id: 'razorpay', label: 'UPI', icon: FiSmartphone },
                                { id: 'all', label: 'Cards/Banks', icon: FiCreditCard },
                                { id: 'cod', label: 'Cash on Delivery', icon: FiTruck },
                            ].map(({ id, label, icon: Icon }) => (
                                <button key={id} onClick={() => setMethod(id)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-sans text-xs font-medium transition-all ${method === id ? 'bg-white text-charcoal shadow-soft' : 'text-charcoal-muted hover:text-charcoal'}`}>
                                    <Icon className="w-4 h-4" /> {label}
                                </button>
                            ))}
                        </div>

                        {/* UPI Method (via Razorpay) */}
                        {method === 'razorpay' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                {!razorpayConfigured ? (
                                    /* Show when Razorpay is NOT configured */
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
                                        <div className="flex items-center justify-center gap-2 text-amber-700">
                                            <FiAlertTriangle className="w-5 h-5" />
                                            <p className="font-sans text-sm font-bold">Online Payment Not Configured</p>
                                        </div>
                                        <p className="font-sans text-xs text-amber-600 text-center">
                                            Razorpay gateway is not set up. You can use Direct UPI or Cash on Delivery instead.
                                        </p>
                                        
                                        {adminUpi && (
                                            <motion.button 
                                                onClick={() => setShowDirectUPI(true)} 
                                                whileHover={{ scale: 1.02 }} 
                                                whileTap={{ scale: 0.98 }}
                                                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-sans font-medium flex items-center justify-center gap-2"
                                            >
                                                <FiSmartphone className="w-5 h-5" />
                                                Pay Direct UPI to {adminUpi}
                                            </motion.button>
                                        )}
                                        
                                        <motion.button 
                                            onClick={() => setMethod('cod')} 
                                            whileHover={{ scale: 1.02 }} 
                                            whileTap={{ scale: 0.98 }}
                                            className="w-full bg-charcoal hover:bg-charcoal-light text-white py-3 rounded-xl font-sans font-medium flex items-center justify-center gap-2"
                                        >
                                            <FiTruck className="w-5 h-5" />
                                            Use Cash on Delivery
                                        </motion.button>
                                    </div>
                                ) : (
                                    /* Show when Razorpay IS configured */
                                    <>
                                <div className="bg-cream-100 rounded-2xl p-5 space-y-4">
                                    <p className="font-sans text-sm font-bold text-charcoal text-center">Pay securely via UPI</p>
                                    
                                    {/* UPI App Icons */}
                                    <div className="flex justify-center gap-4">
                                        {UPI_APPS.map(app => (
                                            <div key={app.name} className="flex flex-col items-center gap-1">
                                                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: typeof app.icon === 'string' ? 'transparent' : `${app.color}15` }}>
                                                    {typeof app.icon === 'string' ? <span className="text-3xl">{app.icon}</span> : app.icon}
                                                </div>
                                                <span className="font-sans text-xs text-charcoal-muted">{app.name.split(' ')[0]}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-2 justify-center text-xs font-sans text-green-700 bg-green-100 px-4 py-2 rounded-full">
                                        <FiCheckCircle className="w-4 h-4" />
                                        <span>Powered by Razorpay • Money goes directly to seller</span>
                                    </div>
                                </div>

                                <motion.button 
                                    onClick={handleRazorpayUPI} 
                                    disabled={loading || !razorpayLoaded}
                                    whileHover={{ scale: loading ? 1 : 1.02 }} 
                                    whileTap={{ scale: loading ? 1 : 0.98 }}
                                    className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-lg disabled:opacity-70"
                                >
                                    {loading ? (
                                        <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                    ) : (
                                        <FiSmartphone className="w-5 h-5" />
                                    )}
                                    {loading ? 'Opening UPI...' : `Pay ₹${amount?.toLocaleString()} via UPI`}
                                </motion.button>

                                <p className="text-xs text-center text-charcoal-muted">
                                    You'll be redirected to Razorpay to complete payment
                                </p>
                                    </>
                                )}
                            </motion.div>
                        )}

                        {/* All Payment Methods (via Razorpay) */}
                        {method === 'all' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                {!razorpayConfigured ? (
                                    /* Show when Razorpay is NOT configured */
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
                                        <div className="flex items-center justify-center gap-2 text-amber-700">
                                            <FiAlertTriangle className="w-5 h-5" />
                                            <p className="font-sans text-sm font-bold">Cards/Banks Not Available</p>
                                        </div>
                                        <p className="font-sans text-xs text-amber-600 text-center">
                                            Razorpay gateway is not configured. Please use Cash on Delivery.
                                        </p>
                                        
                                        <motion.button 
                                            onClick={() => setMethod('cod')} 
                                            whileHover={{ scale: 1.02 }} 
                                            whileTap={{ scale: 0.98 }}
                                            className="w-full bg-charcoal hover:bg-charcoal-light text-white py-3 rounded-xl font-sans font-medium flex items-center justify-center gap-2"
                                        >
                                            <FiTruck className="w-5 h-5" />
                                            Use Cash on Delivery
                                        </motion.button>
                                    </div>
                                ) : (
                                    <>
                                <div className="bg-cream-100 rounded-2xl p-5 space-y-3">
                                    <p className="font-sans text-sm font-bold text-charcoal">All payment methods:</p>
                                    {[
                                        '📲 UPI - Google Pay, PhonePe, Paytm',
                                        '💳 Debit / Credit Cards',
                                        '🏦 Net Banking',
                                        '👛 Digital Wallets'
                                    ].map(m => (
                                        <div key={m} className="flex items-center gap-2 text-sm font-sans text-charcoal-muted">
                                            <FiCheckCircle className="text-green-500 w-4 h-4 flex-shrink-0" />
                                            {m}
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="text-xs font-sans text-charcoal-muted text-center flex items-center justify-center gap-2">
                                    <FiLock className="w-4 h-4" /> Secured by Razorpay — PCI DSS Compliant
                                </div>

                                <motion.button 
                                    onClick={handleRazorpayFull} 
                                    disabled={loading || !razorpayLoaded}
                                    whileHover={{ scale: loading ? 1 : 1.02 }} 
                                    whileTap={{ scale: loading ? 1 : 0.98 }}
                                    className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-lg disabled:opacity-70"
                                >
                                    {loading ? (
                                        <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                    ) : (
                                        <FiCreditCard className="w-5 h-5" />
                                    )}
                                    {loading ? 'Opening Razorpay...' : `Pay ₹${amount?.toLocaleString()}`}
                                </motion.button>
                                    </>
                                )}
                            </motion.div>
                        )}

                        {/* Cash on Delivery */}
                        {method === 'cod' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                <div className="bg-cream-100 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-center justify-center gap-3 mb-3">
                                        <FiTruck className="w-8 h-8 text-charcoal" />
                                        <span className="font-sans text-lg font-bold text-charcoal">Cash on Delivery</span>
                                    </div>
                                    <p className="font-sans text-sm text-charcoal-muted text-center">
                                        Pay when your order arrives at your doorstep
                                    </p>
                                    {[
                                        '🚚 Pay only when you receive the product',
                                        '💵 Cash / UPI accepted on delivery',
                                        '📦 Inspect before you pay',
                                        '🔄 Easy returns if not satisfied'
                                    ].map(m => (
                                        <div key={m} className="flex items-center gap-2 text-sm font-sans text-charcoal-muted">
                                            <FiCheckCircle className="text-green-500 w-4 h-4 flex-shrink-0" />
                                            {m}
                                        </div>
                                    ))}
                                </div>
                                
                                {amount > 5000 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                                        <p className="font-sans text-xs text-amber-700">
                                            ⚠️ COD available for orders up to ₹5,000. For larger orders, please use online payment.
                                        </p>
                                    </div>
                                )}

                                <motion.button 
                                    onClick={handleCOD} 
                                    disabled={loading || amount > 5000}
                                    whileHover={{ scale: loading || amount > 5000 ? 1 : 1.02 }} 
                                    whileTap={{ scale: loading || amount > 5000 ? 1 : 0.98 }}
                                    className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-lg disabled:opacity-70"
                                >
                                    {loading ? (
                                        <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                    ) : (
                                        <FiTruck className="w-5 h-5" />
                                    )}
                                    {loading ? 'Placing Order...' : `Place COD Order — ₹${amount?.toLocaleString()}`}
                                </motion.button>
                                
                                <p className="text-xs text-center text-charcoal-muted">
                                    Please keep exact change ready for faster delivery
                                </p>
                            </motion.div>
                        )}

                        {/* Security notice */}
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                            <p className="font-sans text-xs text-blue-800">
                                🔒 Your payment is protected by 256-bit encryption. We never store your card details.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
            
            {/* Direct UPI Payment Modal (fallback when Razorpay not configured) */}
            {showDirectUPI && adminUpi && (
                <DirectUPIPaymentModal
                    isOpen={showDirectUPI}
                    onClose={() => setShowDirectUPI(false)}
                    onSuccess={(orderId) => {
                        setShowDirectUPI(false);
                        onSuccess(orderId);
                    }}
                    order={order}
                    amount={amount}
                    upiId={adminUpi}
                />
            )}
        </AnimatePresence>
    );
}
