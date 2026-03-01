import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiSmartphone, FiCopy } from 'react-icons/fi';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function DirectUPIPaymentModal({ isOpen, onClose, onSuccess, order, amount }) {
    const [paymentData, setPaymentData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('auto');
    const [polling, setPolling] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setPaymentData(null);
            initializePayment();
        }
    }, [isOpen]);

    // Poll for payment status
    useEffect(() => {
        if (!polling || !paymentData?.transactionRef) return;

        const pollInterval = setInterval(async () => {
            try {
                const { data } = await api.get(`/upi/check-status/${paymentData.transactionRef}`);
                if (data.isPaid) {
                    toast.success('✅ Payment verified!');
                    setPolling(false);
                    setTimeout(() => {
                        onSuccess(data.orderId);
                    }, 1000);
                }
            } catch (err) {
                console.log('Waiting for payment...');
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(pollInterval);
    }, [polling, paymentData]);

    const initializePayment = async () => {
        setLoading(true);
        setError(null);
        try {
            const orderId = typeof order._id === 'string' ? order._id : order._id?.toString();
            console.log('📲 Creating UPI payment link for order:', orderId, 'Amount:', amount);
            
            const { data } = await api.post('/upi/create-link', {
                orderId,
                amount
            });
            
            console.log('✅ UPI Payment link created:', data);
            setPaymentData(data);
            
            if (!data.transactionRef) {
                throw new Error('Invalid response: Missing transaction reference');
            }
        } catch (err) {
            console.error('❌ Payment initialization error:', err);
            const errorMsg = err.response?.data?.message || err.message || 'Failed to create payment link';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handlePhonePe = () => {
        if (paymentData?.deepLinks?.phonePe) {
            console.log('📱 Opening PhonePe with:', paymentData.deepLinks.phonePe);
            window.location.href = paymentData.deepLinks.phonePe;
            setPolling(true);
            toast.loading('🟣 PhonePe is opening...');
        }
    };

    const handleGooglePay = () => {
        if (paymentData?.deepLinks?.googlePay) {
            console.log('🟢 Opening Google Pay with:', paymentData.deepLinks.googlePay);
            window.location.href = paymentData.deepLinks.googlePay;
            setPolling(true);
            toast.loading('🟢 Google Pay is opening...');
        }
    };

    const handlePaytm = () => {
        if (paymentData?.deepLinks?.paytm) {
            console.log('🔵 Opening Paytm with:', paymentData.deepLinks.paytm);
            window.location.href = paymentData.deepLinks.paytm;
            setPolling(true);
            toast.loading('🔵 Paytm is opening...');
        }
    };

    const copyUPIString = () => {
        navigator.clipboard.writeText(paymentData?.upiString || '');
        setCopied(true);
        toast.success('UPI string copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleManualVerify = async () => {
        setLoading(true);
        try {
            console.log('💳 Manual payment verification:', paymentData.transactionRef);
            const { data } = await api.post('/upi/verify-payment', {
                transactionRef: paymentData.transactionRef,
                paymentId: `TCS_${Date.now()}`,
                method: 'UPI',
                shippingAddress: order.shippingAddress,
                amount
            });

            if (data.success) {
                toast.success('✅ Payment verified successfully!');
                onSuccess(data.orderId);
            } else {
                toast.error('Payment verification pending - check payment app');
            }
        } catch (err) {
            console.error('❌ Verification error:', err);
            toast.error(err.response?.data?.message || 'Verification failed - please try again');
        } finally {
            setLoading(false);
        }
    };

    const handleTestPayment = async () => {
        setLoading(true);
        try {
            console.log('🧪 TEST MODE: Simulating successful payment for', paymentData.transactionRef);
            const { data } = await api.post('/upi/verify-payment', {
                transactionRef: paymentData.transactionRef,
                paymentId: `TEST_${Date.now()}`,
                method: 'TEST_UPI',
                shippingAddress: order.shippingAddress,
                amount
            });

            if (data.success) {
                toast.success('✅ TEST Payment successful!');
                onSuccess(data.orderId);
            }
        } catch (err) {
            console.error('❌ Test payment error:', err);
            toast.error(err.response?.data?.message || 'Test payment failed');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            >
                <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.9 }}
                    className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-charcoal to-charcoal-light p-6 sticky top-0 z-10 flex items-center justify-between">
                        <h2 className="font-serif text-white text-xl">Pay with UPI</h2>
                        <button
                            onClick={onClose}
                            className="text-white hover:bg-white/20 rounded-full p-2 transition"
                        >
                            <FiX className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Amount */}
                        <div className="text-center">
                            <p className="text-charcoal-muted font-sans text-sm">Total Amount</p>
                            <p className="font-serif text-4xl text-charcoal font-bold">₹{amount}</p>
                        </div>

                        {loading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold mx-auto mb-3"></div>
                                <p className="font-sans text-charcoal-muted">Creating payment link...</p>
                            </div>
                        ) : error && !paymentData ? (
                            <div className="text-center py-8 space-y-4">
                                <div className="text-5xl">❌</div>
                                <div>
                                    <p className="font-sans font-bold text-charcoal mb-2">Payment Error</p>
                                    <p className="font-sans text-sm text-charcoal-muted mb-4">{error}</p>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={initializePayment}
                                    className="w-full bg-gold text-charcoal font-sans font-bold py-3 rounded-2xl hover:bg-gold-light transition"
                                >
                                    🔄 Retry Payment
                                </motion.button>
                            </div>
                        ) : paymentData ? (
                            <>
                                {/* Quick Payment Apps */}
                                <div className="space-y-3">
                                    <p className="font-sans text-sm text-charcoal-muted uppercase tracking-widest">Quick Pay</p>
                                    
                                    {/* Google Pay */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleGooglePay}
                                        className="w-full flex items-center gap-3 p-4 border-2 border-green-400 rounded-2xl hover:bg-green-50 transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                            </svg>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-sans font-bold text-charcoal">Google Pay</p>
                                            <p className="font-sans text-xs text-charcoal-muted">Fastest & Easiest</p>
                                        </div>
                                        <FiSmartphone className="w-5 h-5 text-charcoal" />
                                    </motion.button>

                                    {/* PhonePe */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handlePhonePe}
                                        className="w-full flex items-center gap-3 p-4 border-2 border-purple-500 rounded-2xl hover:bg-purple-50 transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#5F259F] flex items-center justify-center shadow-sm">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                                <path d="M6 4h8c1.1 0 2 .9 2 2v2h-2V6H6v12h2v2H6c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="white"/>
                                                <path d="M18 10h-4v2h4v8h-6v-4h-2v6h10V10c0-1.1-.9-2-2-2z" fill="white"/>
                                                <circle cx="17" cy="15" r="2" fill="white"/>
                                            </svg>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-sans font-bold text-charcoal">PhonePe</p>
                                            <p className="font-sans text-xs text-charcoal-muted">Cashback Available</p>
                                        </div>
                                        <FiSmartphone className="w-5 h-5 text-charcoal" />
                                    </motion.button>

                                    {/* Paytm */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handlePaytm}
                                        className="w-full flex items-center gap-3 p-4 border-2 border-blue-400 rounded-2xl hover:bg-blue-50 transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#00BAF2] flex items-center justify-center shadow-sm">
                                            <span className="text-white font-bold text-sm">₹</span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="font-sans font-bold text-charcoal">Paytm</p>
                                            <p className="font-sans text-xs text-charcoal-muted">Safe & Secure</p>
                                        </div>
                                        <FiSmartphone className="w-5 h-5 text-charcoal" />
                                    </motion.button>
                                </div>

                                {/* Divider */}
                                <div className="relative my-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-cream-300"></div>
                                    </div>
                                    <div className="relative flex justify-center text-xs">
                                        <span className="px-2 bg-white text-charcoal-muted">or</span>
                                    </div>
                                </div>

                                {/* QR Code */}
                                {paymentData.qrCode && (
                                    <div className="text-center space-y-3">
                                        <p className="font-sans text-sm text-charcoal-muted uppercase tracking-widest">Scan to Pay</p>
                                        <div className="flex justify-center bg-cream-100 p-3 rounded-2xl">
                                            <img src={paymentData.qrCode} alt="UPI QR Code" className="w-48 h-48" />
                                        </div>
                                        <p className="font-sans text-xs text-charcoal-muted">Scan with any UPI app</p>
                                    </div>
                                )}

                                {/* UPI String */}
                                <div className="bg-cream-100 rounded-2xl p-4 space-y-2">
                                    <p className="font-sans text-xs text-charcoal-muted uppercase tracking-widest mb-2">UPI ID</p>
                                    <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-cream-300">
                                        <code className="font-mono text-sm text-charcoal flex-1 truncate">
                                            {paymentData.merchantUPI}
                                        </code>
                                        <button
                                            onClick={copyUPIString}
                                            className="p-2 hover:bg-cream-100 rounded-lg transition"
                                        >
                                            <FiCopy className={`w-4 h-4 ${copied ? 'text-green-500' : 'text-charcoal'}`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Transaction Reference */}
                                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                                    <p className="font-sans text-xs text-charcoal-muted uppercase tracking-widest mb-1">Transaction Reference</p>
                                    <p className="font-mono text-sm text-charcoal font-bold">{paymentData.transactionRef}</p>
                                </div>

                                {/* Status Info */}
                                {polling ? (
                                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gold mx-auto mb-2"></div>
                                        <p className="font-sans text-sm text-charcoal">Waiting for payment...</p>
                                        <p className="font-sans text-xs text-charcoal-muted mt-1">This auto-checks every 3 seconds</p>
                                    </div>
                                ) : (
                                    <div className="bg-green-50 border border-green-300 rounded-2xl p-4 text-center">
                                        <p className="font-sans text-sm text-charcoal font-medium">✅ Ready to receive payment</p>
                                        <p className="font-sans text-xs text-charcoal-muted mt-1">Click above to open your UPI app</p>
                                    </div>
                                )}

                                {/* Manual Verify Button */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleManualVerify}
                                    disabled={loading || polling}
                                    className="w-full bg-charcoal text-cream-100 font-sans font-bold py-3 rounded-2xl hover:bg-charcoal-light transition disabled:opacity-50"
                                >
                                    {polling ? 'Waiting for payment...' : 'I\'ve already paid - Verify'}
                                </motion.button>

                                {/* Test Payment Button (DEV MODE) */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleTestPayment}
                                    disabled={loading}
                                    className="w-full bg-amber-500 text-white font-sans font-bold py-3 rounded-2xl hover:bg-amber-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    🧪 Test Payment (Demo Mode)
                                </motion.button>

                                {/* Helpful Info */}
                                <div className="bg-cream-100 rounded-2xl p-4 space-y-2">
                                    <p className="font-sans text-xs text-charcoal font-bold">💡 Payment Tips:</p>
                                    <ul className="font-sans text-xs text-charcoal-muted space-y-1">
                                        <li>✓ Click any app button above</li>
                                        <li>✓ Complete payment in the app</li>
                                        <li>✓ Return here automatically</li>
                                        <li>✓ Order will be confirmed</li>
                                    </ul>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8">
                                <div className="animate-pulse">
                                    <div className="h-8 bg-cream-200 rounded w-3/4 mx-auto mb-2"></div>
                                    <div className="h-4 bg-cream-200 rounded w-1/2 mx-auto"></div>
                                </div>
                            </div>
                        )}

                        {/* Close Button */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onClose}
                            className="w-full border-2 border-cream-400 text-charcoal font-sans font-bold py-3 rounded-2xl hover:bg-cream-50 transition"
                        >
                            Cancel
                        </motion.button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
