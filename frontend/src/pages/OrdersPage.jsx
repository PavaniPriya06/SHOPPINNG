import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiDownload, FiPackage, FiCheck, FiTruck, FiCreditCard, FiHome, FiClock, FiMapPin, FiRefreshCw } from 'react-icons/fi';
import api, { getMediaUrl } from '../utils/api';
import toast from 'react-hot-toast';

const statusClass = {
    CREATED: 'status-pending', PENDING: 'status-pending',
    PAID: 'status-confirmed', PLACED: 'status-processing',
    SHIPPED: 'status-shipped', DELIVERED: 'status-delivered',
    CANCELLED: 'status-cancelled'
};

const STATUS_STEPS = ['CREATED', 'PENDING', 'PAID', 'PLACED', 'SHIPPED', 'DELIVERED'];

// Status icons and descriptions for live tracking
const STATUS_INFO = {
    CREATED: { icon: '📝', label: 'Order Created', desc: 'Your order has been created', color: 'bg-gray-400' },
    PENDING: { icon: '⏳', label: 'Payment Pending', desc: 'Awaiting payment confirmation', color: 'bg-yellow-400' },
    PAID: { icon: '✅', label: 'Payment Confirmed', desc: 'Payment received successfully', color: 'bg-green-400' },
    PLACED: { icon: '📦', label: 'Order Placed', desc: 'Order confirmed & being prepared', color: 'bg-blue-400' },
    SHIPPED: { icon: '🚚', label: 'Out for Delivery', desc: 'Your order is on the way!', color: 'bg-purple-500' },
    DELIVERED: { icon: '🎉', label: 'Delivered', desc: 'Order delivered successfully', color: 'bg-green-500' },
    CANCELLED: { icon: '❌', label: 'Cancelled', desc: 'Order has been cancelled', color: 'bg-red-500' }
};

// Calculate estimated delivery date (3-5 days from order date)
const getEstimatedDelivery = (orderDate, status) => {
    if (status === 'DELIVERED') return 'Delivered';
    if (status === 'CANCELLED') return 'Cancelled';
    
    const date = new Date(orderDate);
    const minDays = status === 'SHIPPED' ? 1 : 3;
    const maxDays = status === 'SHIPPED' ? 2 : 5;
    
    const minDate = new Date(date);
    minDate.setDate(minDate.getDate() + minDays);
    const maxDate = new Date(date);
    maxDate.setDate(maxDate.getDate() + maxDays);
    
    const formatDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${formatDate(minDate)} - ${formatDate(maxDate)}`;
};

// Get days remaining for delivery
const getDaysRemaining = (orderDate, status) => {
    if (status === 'DELIVERED' || status === 'CANCELLED') return null;
    
    const date = new Date(orderDate);
    const deliveryDate = new Date(date);
    deliveryDate.setDate(deliveryDate.getDate() + (status === 'SHIPPED' ? 2 : 5));
    
    const today = new Date();
    const diffTime = deliveryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
};

export default function OrdersPage() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    // Fetch orders function
    const fetchOrders = async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const { data } = await api.get('/orders/my');
            setOrders(data.orders);
            setLastUpdated(new Date());
        } catch (err) {
            if (!showRefresh) toast.error('Could not load orders');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        
        // Auto-refresh every 30 seconds for live tracking
        const interval = setInterval(() => fetchOrders(false), 30000);
        return () => clearInterval(interval);
    }, []);

    const downloadReceipt = async (orderId, orderNumber) => {
        try {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile) {
                // Open PDF in new tab for mobile
                window.open(`/api/orders/${orderId}/receipt`, '_blank');
            } else {
                const res = await api.get(`/orders/${orderId}/receipt`, { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                const a = document.createElement('a');
                a.href = url; a.download = `TCS-Receipt-${orderNumber}.pdf`; a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch {
            toast.error('Could not download receipt');
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center pt-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gold"></div>
        </div>
    );

    if (orders.length === 0) return (
        <div className="min-h-screen flex flex-col items-center justify-center pt-20 bg-cream-100">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <div className="w-32 h-32 bg-cream-200 rounded-full flex items-center justify-center mx-auto mb-8">
                    <FiPackage className="w-16 h-16 text-charcoal-muted" />
                </div>
                <h2 className="font-serif text-4xl text-charcoal mb-4">No Orders Yet</h2>
                <p className="font-sans text-charcoal-muted mb-8">Start shopping to see your orders here.</p>
                <a href="/" className="btn-primary">Explore Collection</a>
            </motion.div>
        </div>
    );

    return (
        <div className="min-h-screen pt-20 bg-cream-100">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header with refresh */}
                <div className="flex items-center justify-between mb-8">
                    <h1 className="font-serif text-4xl text-charcoal">My Orders</h1>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-charcoal-muted hidden sm:block">
                            Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button 
                            onClick={() => fetchOrders(true)}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-3 py-2 rounded-full bg-cream-200 hover:bg-cream-300 transition-colors text-sm font-sans"
                        >
                            <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Updating...' : 'Refresh'}
                        </button>
                    </div>
                </div>
                
                <div className="space-y-6">
                    {orders.map((order, i) => {
                        const stepIdx = STATUS_STEPS.indexOf(order.status);
                        const statusInfo = STATUS_INFO[order.status] || STATUS_INFO.CREATED;
                        const estimatedDelivery = getEstimatedDelivery(order.createdAt, order.status);
                        const daysRemaining = getDaysRemaining(order.createdAt, order.status);
                        
                        return (
                            <motion.div key={order._id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                                className="card overflow-hidden">
                                {/* Live Status Banner */}
                                {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                                    <div className={`${statusInfo.color} px-5 py-3 flex items-center justify-between`}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl animate-pulse">{statusInfo.icon}</span>
                                            <div>
                                                <p className="font-sans font-bold text-white text-sm">{statusInfo.label}</p>
                                                <p className="font-sans text-white/80 text-xs">{statusInfo.desc}</p>
                                            </div>
                                        </div>
                                        {daysRemaining !== null && (
                                            <div className="text-right">
                                                <p className="font-sans font-bold text-white text-lg">{daysRemaining}</p>
                                                <p className="font-sans text-white/80 text-xs">days left</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {order.status === 'DELIVERED' && (
                                    <div className="bg-green-500 px-5 py-3 flex items-center gap-3">
                                        <span className="text-2xl">🎉</span>
                                        <div>
                                            <p className="font-sans font-bold text-white text-sm">Delivered Successfully!</p>
                                            <p className="font-sans text-white/80 text-xs">Thank you for shopping with us</p>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Header */}
                                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="font-serif text-lg text-charcoal">#{order.orderNumber}</h3>
                                            <span className={statusClass[order.status] || 'status-pending'}>{order.status}</span>
                                        </div>
                                        <p className="font-sans text-sm text-charcoal-muted">
                                            {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            {' • '}{order.items?.length} item(s)
                                            {' • '}₹{order.totalAmount?.toLocaleString()}
                                        </p>
                                        {/* Estimated Delivery */}
                                        {order.status !== 'CANCELLED' && (
                                            <p className="font-sans text-sm text-charcoal mt-1 flex items-center gap-2">
                                                <FiClock className="w-4 h-4 text-gold" />
                                                <span className="font-semibold">Est. Delivery:</span> {estimatedDelivery}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={e => { e.stopPropagation(); downloadReceipt(order._id, order.orderNumber); }}
                                            className="flex items-center gap-2 px-4 py-2 rounded-full border border-cream-400 text-sm font-sans text-charcoal hover:bg-cream-200 transition-colors"
                                        >
                                            <FiDownload className="w-4 h-4" /> Receipt
                                        </button>
                                    </div>
                                </div>

                                {/* Live Tracking Progress */}
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t border-cream-200 p-3 sm:p-5 overflow-x-auto">
                                        {/* Visual Order Tracking Progress Bar */}
                                        {order.status !== 'CANCELLED' && (
                                            <div className="mb-6">
                                                <h3 className="font-sans text-sm font-bold text-charcoal mb-4 flex items-center gap-2">
                                                    <FiTruck className="w-4 h-4" /> Live Order Tracking
                                                </h3>
                                                <div className="flex items-center justify-between w-full mb-2 min-w-[500px] sm:min-w-0">
                                                    {STATUS_STEPS.map((s, idx) => {
                                                        const info = STATUS_INFO[s];
                                                        const isActive = idx === stepIdx;
                                                        const isComplete = idx < stepIdx;
                                                        const isPending = idx > stepIdx;
                                                        
                                                        return (
                                                            <div key={s} className="flex flex-col items-center flex-1 last:flex-none relative">
                                                                <motion.div 
                                                                    animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                                                                    transition={{ repeat: isActive ? Infinity : 0, duration: 2 }}
                                                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all mb-2 shadow-md ${
                                                                        isComplete ? 'bg-green-500 text-white' : 
                                                                        isActive ? 'bg-gold text-charcoal ring-4 ring-gold/30' : 
                                                                        'bg-cream-200 text-charcoal-muted border-2 border-cream-400'
                                                                    }`}
                                                                >
                                                                    {isComplete ? <FiCheck className="w-5 h-5" /> : info.icon}
                                                                </motion.div>
                                                                <span className={`text-xs font-sans text-center ${
                                                                    isComplete ? 'text-green-600 font-bold' :
                                                                    isActive ? 'text-charcoal font-bold' : 
                                                                    'text-charcoal-muted'
                                                                }`}>
                                                                    {info.label}
                                                                </span>
                                                                {isActive && (
                                                                    <motion.span 
                                                                        initial={{ opacity: 0 }}
                                                                        animate={{ opacity: 1 }}
                                                                        className="text-[10px] text-gold font-semibold mt-1"
                                                                    >
                                                                        Current
                                                                    </motion.span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {/* Progress line */}
                                                <div className="flex items-center w-full min-w-[500px] sm:min-w-0 -mt-14 mb-10 px-5">
                                                    {STATUS_STEPS.map((s, idx) => idx < STATUS_STEPS.length - 1 && (
                                                        <div key={s} className="flex-1 h-1 mx-1 rounded-full relative overflow-hidden bg-cream-300">
                                                            <motion.div 
                                                                initial={{ width: 0 }}
                                                                animate={{ width: idx < stepIdx ? '100%' : idx === stepIdx ? '50%' : '0%' }}
                                                                transition={{ duration: 0.5, delay: idx * 0.1 }}
                                                                className="absolute left-0 top-0 h-full bg-green-500"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Detailed Tracking Timeline */}
                                        {order.statusHistory && order.statusHistory.length > 0 && (
                                            <div className="mb-6 bg-cream-50 rounded-2xl p-4">
                                                <h3 className="font-sans text-sm font-bold text-charcoal mb-4 flex items-center gap-2">
                                                    <FiMapPin className="w-4 h-4" /> Tracking Timeline
                                                </h3>
                                                <div className="relative">
                                                    {/* Timeline line */}
                                                    <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-cream-300"></div>
                                                    
                                                    <ul className="space-y-4">
                                                        {[...order.statusHistory].reverse().map((entry, idx) => {
                                                            const entryInfo = STATUS_INFO[entry.status] || STATUS_INFO.CREATED;
                                                            const isLatest = idx === 0;
                                                            return (
                                                                <motion.li 
                                                                    key={idx}
                                                                    initial={{ opacity: 0, x: -10 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{ delay: idx * 0.1 }}
                                                                    className="flex items-start gap-4 relative"
                                                                >
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm z-10 ${isLatest ? 'bg-gold text-charcoal' : 'bg-cream-200'}`}>
                                                                        {entryInfo.icon}
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <p className={`font-sans text-sm ${isLatest ? 'font-bold text-charcoal' : 'text-charcoal-muted'}`}>
                                                                            {entry.status}
                                                                        </p>
                                                                        <p className="font-sans text-xs text-charcoal-muted">{entry.note}</p>
                                                                        <p className="font-sans text-[10px] text-charcoal-muted mt-1">
                                                                            {new Date(entry.timestamp).toLocaleString('en-IN', { 
                                                                                day: 'numeric', month: 'short', year: 'numeric',
                                                                                hour: '2-digit', minute: '2-digit'
                                                                            })}
                                                                        </p>
                                                                    </div>
                                                                    {isLatest && (
                                                                        <span className="px-2 py-0.5 bg-gold/20 text-gold text-[10px] font-bold rounded-full">
                                                                            Latest
                                                                        </span>
                                                                    )}
                                                                </motion.li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* No tracking updates message */}
                                        {(!order.statusHistory || order.statusHistory.length === 0) && (
                                            <div className="mb-6 bg-cream-50 rounded-2xl p-4 text-center">
                                                <FiClock className="w-8 h-8 text-charcoal-muted mx-auto mb-2" />
                                                <p className="font-sans text-sm text-charcoal-muted">
                                                    No tracking updates yet. Your order is being processed.
                                                </p>
                                            </div>
                                        )}
                                        {/* Order Cancellation Button for eligible orders */}
                                        {['CREATED', 'PENDING', 'PLACED'].includes(order.status) && order.status !== 'CANCELLED' && (
                                            <div className="mb-4 flex flex-col items-center">
                                                <button
                                                    onClick={async () => {
                                                        if (window.confirm('Are you sure you want to cancel this order?')) {
                                                            try {
                                                                await api.put(`/orders/${order._id}/cancel`);
                                                                toast.success('Order cancelled successfully');
                                                                fetchOrders();
                                                            } catch (err) {
                                                                toast.error(err.response?.data?.message || 'Could not cancel order');
                                                            }
                                                        }
                                                    }}
                                                    className="btn-danger w-full max-w-xs flex items-center justify-center gap-2 py-3 text-base"
                                                >
                                                    <span role="img" aria-label="Cancel">❌</span> Cancel Order
                                                </button>
                                                <span className="text-xs text-charcoal-muted">You can cancel before shipping.</span>
                                            </div>
                                        )}
                                        {/* Direct UPI/PhonePe Payment Button */}
                                        {(order.status === 'CREATED' || order.status === 'PENDING') && (
                                            <div className="mb-4 flex flex-col items-center">
                                                <button
                                                    onClick={() => window.location.href = `/pay?orderId=${order._id}`}
                                                    className="btn-primary w-full max-w-xs flex items-center justify-center gap-2 py-3 text-base mb-2"
                                                >
                                                    <span role="img" aria-label="UPI">📲</span> Pay via UPI/PhonePe
                                                </button>
                                                <span className="text-xs text-charcoal-muted">Pay securely with real UPI apps</span>
                                            </div>
                                        )}
                                        {/* Receipt Download Always Visible */}
                                        <div className="mb-4 flex flex-col items-center">
                                            <button
                                                onClick={() => downloadReceipt(order._id, order.orderNumber)}
                                                className="btn-secondary w-full max-w-xs flex items-center justify-center gap-2 py-3 text-base"
                                            >
                                                <FiDownload className="w-5 h-5" /> Download Receipt
                                            </button>
                                        </div>

                                        {/* Items */}
                                        <div className="space-y-3">
                                            {order.items?.map((item, j) => (
                                                <div key={j} className="flex items-center gap-3 bg-cream-100 rounded-2xl p-3">
                                                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-cream-300 flex-shrink-0">
                                                        <img src={item.image ? getMediaUrl(item.image) : `https://placehold.co/56x64/F5F0E8/4A3728?text=${encodeURIComponent(item.name || 'Item')}`}
                                                            alt={item.name} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="font-serif text-charcoal">{item.name}</p>
                                                        <p className="font-sans text-xs text-charcoal-muted">Size: {item.size} | Qty: {item.quantity}</p>
                                                    </div>
                                                    <p className="font-sans font-semibold text-charcoal">₹{(item.price * item.quantity).toLocaleString()}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Shipping address */}
                                        {order.shippingAddress && (
                                            <div className="mt-4 p-4 bg-cream-100 rounded-2xl">
                                                <p className="font-sans text-xs text-charcoal-muted uppercase tracking-wide mb-1">Delivered to</p>
                                                <p className="font-sans text-sm text-charcoal">
                                                    {order.shippingAddress.fullName || order.shippingAddress.name}, {order.shippingAddress.houseNo}, {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}
                                                </p>
                                            </div>
                                        )}
                                    </motion.div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
