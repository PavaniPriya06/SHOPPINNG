import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSave, FiInfo, FiCreditCard, FiAlertCircle, FiCheckCircle, FiTruck } from 'react-icons/fi';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function AdminSettings() {
    const [upiId, setUpiId] = useState('');
    const [deliveryCharges, setDeliveryCharges] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [upiValid, setUpiValid] = useState(null);

    useEffect(() => {
        const fetchSettings = async () => {
            setLoading(true);
            try {
                const [upiRes, deliveryRes] = await Promise.all([
                    api.get('/settings/upi').catch(() => ({ data: { value: '' } })),
                    api.get('/settings/deliveryCharges').catch(() => ({ data: { value: 0 } }))
                ]);
                if (upiRes.data.value) setUpiId(upiRes.data.value);
                if (deliveryRes.data.value !== undefined) setDeliveryCharges(Number(deliveryRes.data.value));
            } catch (err) {
                // Not found is fine
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    // Validate UPI ID format
    const validateUpiId = (id) => {
        if (!id) return false;
        // UPI ID format: username@bankname (e.g., name@upi, name@okaxis, name@ybl)
        const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
        return upiRegex.test(id);
    };

    const handleUpiChange = (value) => {
        setUpiId(value);
        if (value.length > 3) {
            setUpiValid(validateUpiId(value));
        } else {
            setUpiValid(null);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        
        if (!validateUpiId(upiId)) {
            toast.error('Please enter a valid UPI ID (e.g., name@upi, name@okaxis)');
            return;
        }

        if (deliveryCharges < 0) {
            toast.error('Delivery charges cannot be negative');
            return;
        }

        setSaving(true);
        try {
            await Promise.all([
                api.post('/settings', { key: 'upi', value: upiId }),
                api.post('/settings', { key: 'deliveryCharges', value: Number(deliveryCharges) })
            ]);
            toast.success('Settings saved successfully! Changes take effect immediately.');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-gold/10 rounded-2xl flex items-center justify-center text-gold">
                    <FiCreditCard className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="font-serif text-3xl text-charcoal">Payment Settings</h1>
                    <p className="font-sans text-charcoal-muted text-sm">Configure where customer payments are received</p>
                </div>
            </div>

            <form onSubmit={handleSave} className="max-w-2xl space-y-8">
                {/* UPI Settings */}
                <div className="card p-8">
                    <h2 className="font-serif text-xl text-charcoal mb-2 flex items-center gap-2">
                        💰 UPI Payment Gateway
                    </h2>
                    <p className="font-sans text-sm text-charcoal-muted mb-6">
                        Enter your UPI ID below. All customer payments will be sent directly to this UPI ID via Razorpay.
                    </p>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block font-sans text-xs font-bold text-charcoal-muted uppercase tracking-widest mb-2">
                                Your UPI ID *
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className={`input-field pl-10 pr-12 ${
                                        upiValid === true ? 'border-green-400 focus:ring-green-200' : 
                                        upiValid === false ? 'border-red-400 focus:ring-red-200' : ''
                                    }`}
                                    placeholder="yourname@upi"
                                    value={upiId}
                                    onChange={(e) => handleUpiChange(e.target.value.toLowerCase())}
                                    required
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted">
                                    <FiCreditCard className="w-4 h-4" />
                                </div>
                                {upiValid !== null && (
                                    <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${upiValid ? 'text-green-500' : 'text-red-500'}`}>
                                        {upiValid ? <FiCheckCircle className="w-5 h-5" /> : <FiAlertCircle className="w-5 h-5" />}
                                    </div>
                                )}
                            </div>
                            {upiValid === false && (
                                <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                                    <FiAlertCircle className="w-3 h-3" /> Invalid format. Use format: name@bankcode
                                </p>
                            )}
                        </div>

                        {/* UPI Examples */}
                        <div className="bg-cream-100 p-4 rounded-xl border border-cream-300">
                            <p className="font-sans text-xs font-bold text-charcoal-muted uppercase tracking-wider mb-2">
                                🔖 Valid UPI ID Examples:
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs font-sans text-charcoal">
                                <span className="bg-white px-2 py-1 rounded">yourname@upi</span>
                                <span className="bg-white px-2 py-1 rounded">name@okaxis</span>
                                <span className="bg-white px-2 py-1 rounded">name@ybl</span>
                                <span className="bg-white px-2 py-1 rounded">phone@paytm</span>
                            </div>
                        </div>

                        {/* Important Notice */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex gap-3">
                                <FiInfo className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-sans text-sm font-bold text-amber-800 mb-1">Important</p>
                                    <ul className="font-sans text-xs text-amber-700 space-y-1 list-disc list-inside">
                                        <li>All customer payments via UPI will go directly to this ID</li>
                                        <li>Razorpay processes the payment — money goes to YOU</li>
                                        <li>Ensure your UPI ID is correct and active</li>
                                        <li>Test with a small payment before going live</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Current UPI Preview */}
                        {upiId && upiValid && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                <p className="font-sans text-xs font-bold text-green-700 uppercase tracking-wider mb-2">
                                    ✅ Active Payment Destination
                                </p>
                                <p className="font-sans text-lg font-bold text-green-900">{upiId}</p>
                                <p className="font-sans text-xs text-green-700 mt-1">All customer payments will be sent here</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Delivery Charges Settings */}
                <div className="card p-8">
                    <h2 className="font-serif text-xl text-charcoal mb-2 flex items-center gap-2">
                        🚚 Delivery Charges
                    </h2>
                    <p className="font-sans text-sm text-charcoal-muted mb-6">
                        Set the delivery charges that will be added to all orders in real-time.
                    </p>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block font-sans text-xs font-bold text-charcoal-muted uppercase tracking-widest mb-2">
                                Delivery Charge (₹) *
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    className="input-field pl-10 pr-4"
                                    placeholder="0"
                                    value={deliveryCharges}
                                    onChange={(e) => setDeliveryCharges(Math.max(0, Number(e.target.value)))}
                                    min="0"
                                    step="1"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted">
                                    <FiTruck className="w-4 h-4" />
                                </div>
                            </div>
                        </div>

                        {/* Delivery Preview */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <p className="font-sans text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
                                ℹ️ Current Setting
                            </p>
                            <p className="font-sans text-lg font-bold text-blue-900">₹{Number(deliveryCharges).toFixed(2)}</p>
                            <p className="font-sans text-xs text-blue-700 mt-1">
                                {deliveryCharges === 0 ? 'Free delivery for all orders' : `This amount will be added to each order`}
                            </p>
                        </div>

                        {/* Important Notice */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex gap-3">
                                <FiInfo className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-sans text-sm font-bold text-amber-800 mb-1">Real-Time Updates</p>
                                    <ul className="font-sans text-xs text-amber-700 space-y-1 list-disc list-inside">
                                        <li>Changes take effect immediately for new orders</li>
                                        <li>Existing orders are not affected</li>
                                        <li>Delivery charges appear in cart total during checkout</li>
                                        <li>Set to 0 for free delivery</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Previous UPI Section */}
                <div className="card p-8">
                    <h2 className="font-serif text-xl text-charcoal mb-2 flex items-center gap-2">
                        💰 UPI Payment Gateway
                    </h2>
                    <p className="font-sans text-sm text-charcoal-muted mb-6">
                        Enter your UPI ID below. All customer payments will be sent directly to this UPI ID.
                    </p>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block font-sans text-xs font-bold text-charcoal-muted uppercase tracking-widest mb-2">
                                Your UPI ID *
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className={`input-field pl-10 pr-12 ${
                                        upiValid === true ? 'border-green-400 focus:ring-green-200' : 
                                        upiValid === false ? 'border-red-400 focus:ring-red-200' : ''
                                    }`}
                                    placeholder="yourname@upi"
                                    value={upiId}
                                    onChange={(e) => handleUpiChange(e.target.value.toLowerCase())}
                                    required
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted">
                                    <FiCreditCard className="w-4 h-4" />
                                </div>
                                {upiValid !== null && (
                                    <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${upiValid ? 'text-green-500' : 'text-red-500'}`}>
                                        {upiValid ? <FiCheckCircle className="w-5 h-5" /> : <FiAlertCircle className="w-5 h-5" />}
                                    </div>
                                )}
                            </div>
                            {upiValid === false && (
                                <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                                    <FiAlertCircle className="w-3 h-3" /> Invalid format. Use format: name@bankcode
                                </p>
                            )}
                        </div>

                        {/* UPI Examples */}
                        <div className="bg-cream-100 p-4 rounded-xl border border-cream-300">
                            <p className="font-sans text-xs font-bold text-charcoal-muted uppercase tracking-wider mb-2">
                                🔖 Valid UPI ID Examples:
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs font-sans text-charcoal">
                                <span className="bg-white px-2 py-1 rounded">yourname@upi</span>
                                <span className="bg-white px-2 py-1 rounded">name@okaxis</span>
                                <span className="bg-white px-2 py-1 rounded">name@ybl</span>
                                <span className="bg-white px-2 py-1 rounded">phone@paytm</span>
                            </div>
                        </div>

                        {/* Important Notice */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex gap-3">
                                <FiInfo className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-sans text-sm font-bold text-amber-800 mb-1">Important</p>
                                    <ul className="font-sans text-xs text-amber-700 space-y-1 list-disc list-inside">
                                        <li>All customer payments via UPI will go directly to this ID</li>
                                        <li>Money goes directly to YOU</li>
                                        <li>Ensure your UPI ID is correct and active</li>
                                        <li>Test with a small payment before going live</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Current UPI Preview */}
                        {upiId && upiValid && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                <p className="font-sans text-xs font-bold text-green-700 uppercase tracking-wider mb-2">
                                    ✅ Active Payment Destination
                                </p>
                                <p className="font-sans text-lg font-bold text-green-900">{upiId}</p>
                                <p className="font-sans text-xs text-green-700 mt-1">All customer payments will be sent here</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                    <button
                        type="submit"
                        disabled={saving || !upiValid}
                        className="btn-primary flex items-center gap-2 px-8 disabled:opacity-60"
                    >
                        {saving ? (
                            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                        ) : (
                            <FiSave className="w-4 h-4" />
                        )}
                        {saving ? 'Saving...' : 'Save All Settings'}
                    </button>
                </div>
            </form>
        </motion.div>
    );
}
