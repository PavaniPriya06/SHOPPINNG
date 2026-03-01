import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiPackage, FiShoppingBag, FiUsers, FiX, FiUpload, FiLogOut, FiSettings, FiDownload, FiDollarSign, FiAlertTriangle, FiChevronLeft, FiChevronRight, FiMenu } from 'react-icons/fi';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import AdminSettings from './AdminSettings';

const CATEGORIES = ['Co-ord Sets', 'Tops', 'Bottoms', 'Dresses', 'New Arrivals', 'Sale'];
const GRADES = ['Premium', 'Export', 'Regular'];
const GENDERS = ['Men', 'Women', 'Kids', 'Unisex'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];
const ORDER_STATUSES = ['CREATED', 'PENDING', 'PAID', 'PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const ITEMS_PER_PAGE = 20;

const statusClass = {
    CREATED: 'bg-gray-100 text-gray-700',
    PENDING: 'bg-amber-100 text-amber-700', 
    PAID: 'bg-green-100 text-green-700',
    PLACED: 'bg-blue-100 text-blue-700',
    SHIPPED: 'bg-purple-100 text-purple-700', 
    DELIVERED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-red-100 text-red-700'
};

// ═══════════════════════════════════════════════════════════════════
// MEMOIZED PRODUCT CARD - Prevents unnecessary re-renders
// ═══════════════════════════════════════════════════════════════════
const ProductCard = memo(({ product, onEdit, onDelete }) => {
    const getMediaUrl = (path) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        // Use same hostname but backend port for images
        const hostname = window.location.hostname;
        const backendPort = 5000;
        return `http://${hostname}:${backendPort}${path}`;
    };
    
    return (
    <div className="card overflow-hidden group">
        <div className="aspect-[3/4] bg-cream-200 relative overflow-hidden">
            <img
                src={product.images?.[0] ? getMediaUrl(product.images[0]) : `https://placehold.co/300x400/F5F0E8/4A3728?text=${encodeURIComponent(product.name)}`}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { e.target.src = `https://placehold.co/300x400/F5F0E8/4A3728?text=${encodeURIComponent(product.name)}`; }}
            />
            {/* Desktop hover overlay */}
            <div className="hidden sm:flex absolute inset-0 bg-charcoal/60 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-3">
                <button onClick={() => onEdit(product)} className="w-10 h-10 bg-gold rounded-full flex items-center justify-center hover:bg-gold-dark transition-colors"><FiEdit2 className="w-4 h-4 text-charcoal" /></button>
                <button onClick={() => onDelete(product._id)} className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"><FiTrash2 className="w-4 h-4 text-white" /></button>
            </div>
        </div>
        <div className="p-3">
            <h3 className="font-serif text-charcoal text-sm mb-1 line-clamp-1">{product.name}</h3>
            <div className="flex items-center justify-between">
                <span className="font-sans font-semibold text-charcoal">₹{product.price.toLocaleString()}</span>
                <span className={`badge-${product.qualityGrade?.toLowerCase() === 'premium' ? 'premium' : 'standard'} text-xs`}>{product.qualityGrade}</span>
            </div>
            <p className="font-sans text-xs text-charcoal-muted mt-1">Stock: {product.stock}</p>
            {/* Mobile action buttons - always visible */}
            <div className="flex sm:hidden gap-2 mt-3 pt-3 border-t border-cream-200">
                <button onClick={() => onEdit(product)} className="flex-1 py-2 bg-gold text-charcoal rounded-xl text-xs font-semibold flex items-center justify-center gap-1"><FiEdit2 className="w-3 h-3" /> Edit</button>
                <button onClick={() => onDelete(product._id)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1"><FiTrash2 className="w-3 h-3" /> Delete</button>
            </div>
        </div>
    </div>
    );
}, (prev, next) => prev.product._id === next.product._id);

ProductCard.displayName = 'ProductCard';

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const [tab, setTab] = useState('products');
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [payments, setPayments] = useState([]);
    const [paymentStats, setPaymentStats] = useState({ total: 0, paid: 0, failed: 0, pending: 0, totalRevenue: 0 });
    const [stockAlerts, setStockAlerts] = useState({ outOfStock: [], criticalStock: [], lowStock: [] });
    const [stats, setStats] = useState({ products: 0, orders: 0, revenue: 0, payments: 0 });
    const [showProductForm, setShowProductForm] = useState(false);
    const [editProduct, setEditProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [downloadingInvoice, setDownloadingInvoice] = useState(null);
    const [tabLoading, setTabLoading] = useState(false);
    const [productPage, setProductPage] = useState(1);
    const [orderPage, setOrderPage] = useState(1);
    const fileInputRef = useRef();

    const emptyForm = { name: '', price: '', originalPrice: '', gender: 'Women', qualityGrade: 'Regular', description: '', category: 'Co-ord Sets', sizes: [], stock: 10, isFeatured: false, isNewArrival: true, images: [] };
    const [form, setForm] = useState(emptyForm);
    const [dataError, setDataError] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // ═══════════════════════════════════════════════════════════════════
    // PROGRESSIVE DATA LOADING - Prevent hanging with timeouts
    // ═══════════════════════════════════════════════════════════════════
    useEffect(() => {
        let isMounted = true;
        
        const loadInitialData = async () => {
            setTabLoading(true);
            
            // Create timeout promise for each request
            const withTimeout = (promise, ms = 8000) => 
                Promise.race([
                    promise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout')), ms)
                    )
                ]);
            
            try {
                // Load products first (most important)
                try {
                    const productsRes = await withTimeout(
                        api.get(`/products?page=1&limit=${ITEMS_PER_PAGE}`),
                        8000
                    );
                    if (isMounted) {
                        setProducts(productsRes.data.products || []);
                        setStats(s => ({ ...s, products: productsRes.data.total || 0 }));
                    }
                } catch (err) {
                    console.error('Products fetch failed:', err.message);
                    if (isMounted) setProducts([]);
                }
                
                // Load orders in parallel (non-blocking)
                try {
                    const ordersRes = await withTimeout(
                        api.get(`/orders?page=1&limit=${ITEMS_PER_PAGE}`),
                        8000
                    );
                    if (isMounted) {
                        setOrders(ordersRes.data.orders || []);
                        const revenue = (ordersRes.data.orders || []).reduce(
                            (sum, o) => sum + (o.paymentStatus === 'Paid' ? o.totalAmount : 0), 
                            0
                        );
                        setStats(s => ({ ...s, orders: ordersRes.data.total || 0, revenue }));
                    }
                } catch (err) {
                    console.error('Orders fetch failed:', err.message);
                    if (isMounted) setOrders([]);
                }
                
                // Load payments in parallel (non-blocking)
                try {
                    const paymentsRes = await withTimeout(
                        api.get('/payment/admin/all'),
                        8000
                    );
                    if (isMounted) {
                        setPayments(paymentsRes.data.payments || []);
                        setPaymentStats(paymentsRes.data.stats || {});
                        setStats(s => ({ ...s, payments: paymentsRes.data.total || 0 }));
                    }
                } catch (err) {
                    console.error('Payments fetch failed:', err.message);
                    if (isMounted) setPayments([]);
                }
                
                // Load alerts in parallel (non-blocking)
                try {
                    const alertsRes = await withTimeout(
                        api.get('/payment/admin/stock/alerts?threshold=10'),
                        5000
                    );
                    if (isMounted) {
                        setStockAlerts(alertsRes.data || {});
                    }
                } catch (err) {
                    console.error('Alerts fetch failed:', err.message);
                    if (isMounted) setStockAlerts({ outOfStock: [], criticalStock: [] });
                }
                
            } finally {
                if (isMounted) setTabLoading(false);
            }
        };
        
        loadInitialData();
        
        // ═══════════════════════════════════════════════════════════════════
        // AUTO-REFRESH - Keep admin in sync with real-time data (30 sec)
        // ═══════════════════════════════════════════════════════════════════
        const autoRefreshInterval = setInterval(() => {
            if (isMounted && !showProductForm) {
                // Silent refresh - don't show loading indicator
                api.get(`/products?page=${productPage}&limit=${ITEMS_PER_PAGE}`)
                    .then(res => isMounted && setProducts(res.data.products || []))
                    .catch(() => {});
                api.get(`/orders?page=${orderPage}&limit=${ITEMS_PER_PAGE}`)
                    .then(res => {
                        if (isMounted) {
                            setOrders(res.data.orders || []);
                            const revenue = (res.data.orders || []).reduce(
                                (sum, o) => sum + (o.paymentStatus === 'Paid' ? o.totalAmount : 0), 0
                            );
                            setStats(s => ({ ...s, orders: res.data.total || 0, revenue }));
                        }
                    })
                    .catch(() => {});
            }
        }, 30000); // Refresh every 30 seconds
        
        // Cleanup function to prevent state updates on unmounted component
        return () => { 
            isMounted = false;
            clearInterval(autoRefreshInterval);
        };
    }, [productPage, orderPage, showProductForm]);

    // ═══════════════════════════════════════════════════════════════════
    // OPTIMIZED FETCH FUNCTIONS - With timeout and error handling
    // ═══════════════════════════════════════════════════════════════════
    const withTimeout = useCallback((promise, ms = 8000) => 
        Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout - taking too long')), ms)
            )
        ]), 
    []);

    const fetchProducts = useCallback(async (page = 1) => {
        try {
            setDataError(null);
            const { data } = await withTimeout(
                api.get(`/products?page=${page}&limit=${ITEMS_PER_PAGE}`),
                8000
            );
            setProducts(data.products || []);
            setProductPage(page);
            setStats(s => ({ ...s, products: data.total || 0 }));
        } catch (err) {
            console.error('Failed to load products:', err.message);
            setDataError(`Products: ${err.message}`);
            toast.error('Failed to load products');
        }
    }, [withTimeout]);

    const fetchOrders = useCallback(async (page = 1) => {
        try {
            setDataError(null);
            const { data } = await withTimeout(
                api.get(`/orders?page=${page}&limit=${ITEMS_PER_PAGE}`),
                8000
            );
            setOrders(data.orders || []);
            setOrderPage(page);
            const revenue = (data.orders || []).reduce((s, o) => s + (o.paymentStatus === 'Paid' ? o.totalAmount : 0), 0);
            setStats(s => ({ ...s, orders: data.total || 0, revenue }));
        } catch (err) {
            console.error('Failed to load orders:', err.message);
            setDataError(`Orders: ${err.message}`);
            toast.error('Failed to load orders');
        }
    }, [withTimeout]);

    const fetchPayments = useCallback(async () => {
        try {
            setDataError(null);
            const { data } = await withTimeout(
                api.get('/payment/admin/all'),
                8000
            );
            setPayments(data.payments || []);
            setPaymentStats(data.stats || {});
            setStats(s => ({ ...s, payments: data.total || 0 }));
        } catch (err) {
            console.error('Failed to load payments:', err.message);
            setDataError(`Payments: ${err.message}`);
        }
    }, [withTimeout]);

    const fetchStockAlerts = useCallback(async () => {
        try {
            setDataError(null);
            const { data } = await withTimeout(
                api.get('/payment/admin/stock/alerts?threshold=10'),
                5000
            );
            setStockAlerts(data || {});
        } catch (err) {
            console.error('Failed to load alerts:', err.message);
            setStockAlerts({ outOfStock: [], criticalStock: [] });
        }
    }, [withTimeout]);

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        setForm(f => ({ ...f, images: files }));
        setImagePreviews(files.map(f => URL.createObjectURL(f)));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name || !form.price || !form.description) { 
            toast.error('Name, price & description required'); 
            return; 
        }
        setLoading(true);
        try {
            const fd = new FormData();
            fd.append('name', form.name);
            fd.append('price', form.price);
            if (form.originalPrice) fd.append('originalPrice', form.originalPrice);
            fd.append('gender', form.gender);
            fd.append('qualityGrade', form.qualityGrade);
            fd.append('description', form.description);
            fd.append('category', form.category);
            fd.append('stock', form.stock || 10);
            fd.append('isFeatured', form.isFeatured);
            fd.append('isNewArrival', form.isNewArrival);
            fd.append('sizes', JSON.stringify(form.sizes || []));
            
            if (form.images?.length) {
                form.images.forEach(img => { 
                    if (img instanceof File) fd.append('images', img); 
                });
            }
            
            if (editProduct) {
                const result = await api.put(`/products/${editProduct._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                console.log('✅ Product updated:', result.data);
                
                // Optimistic update - update local state immediately
                setProducts(prev => prev.map(p => p._id === editProduct._id ? result.data : p));
                toast.success('Product updated!');
            } else {
                const result = await api.post('/products', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                console.log('✅ Product created:', result.data);
                toast.success('Product added successfully!');
                
                // Close modal and reset form immediately for better UX
                setShowProductForm(false);
                setEditProduct(null);
                setForm(emptyForm);
                setImagePreviews([]);
                
                // Refetch products to sync with backend
                setTabLoading(true);
                await fetchProducts(1);
                setTabLoading(false);
                return; // Return early to prevent duplicate state resets
            }
            
            setShowProductForm(false);
            setEditProduct(null);
            setForm(emptyForm);
            setImagePreviews([]);
        } catch (err) {
            console.error('❌ Save error:', err);
            toast.error(err.response?.data?.message || 'Failed to save product');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = useCallback((product) => {
        setEditProduct(product);
        setForm({ ...product, images: [], sizes: product.sizes || [] });
        setImagePreviews([]);
        setShowProductForm(true);
    }, []);

    const handleDelete = useCallback(async (id) => {
        if (!confirm('Delete this product?')) return;
        try { 
            await api.delete(`/products/${id}`);
            // Optimistic update
            setProducts(prev => prev.filter(p => p._id !== id));
            setStats(s => ({ ...s, products: s.products - 1 }));
            toast.success('Deleted!');
        } catch { 
            toast.error('Delete failed');
        }
    }, []);

    const handleStatusUpdate = useCallback(async (orderId, status) => {
        try {
            const result = await api.put(`/orders/${orderId}/status`, { status });
            // Optimistic update
            setOrders(prev => prev.map(o => o._id === orderId ? result.data : o));
            toast.success(`Order marked as ${status}`);
        } catch { 
            toast.error('Update failed');
        }
    }, []);

    const handleDownloadInvoice = async (orderId, orderNumber) => {
        setDownloadingInvoice(orderId);
        try {
            const response = await api.get(`/orders/${orderId}/receipt`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `TCS-Invoice-${orderNumber}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Invoice downloaded!');
        } catch (err) {
            console.error('Download error:', err);
            toast.error('Failed to download invoice');
        } finally {
            setDownloadingInvoice(null);
        }
    };

    return (
        <div className="min-h-screen bg-cream-100">
            {/* Mobile Menu Button */}
            <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-charcoal text-white rounded-xl shadow-lg"
            >
                <FiMenu className="w-6 h-6" />
            </button>

            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className="flex">
                <div className={`w-64 min-h-screen bg-charcoal text-cream-100 flex flex-col fixed left-0 top-0 z-40 transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="p-6 border-b border-charcoal-light">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gold rounded-full flex items-center justify-center">
                                <span className="font-serif font-bold text-charcoal text-sm">TCS</span>
                            </div>
                            <div>
                                <p className="font-serif text-white text-sm">Admin Panel</p>
                                <p className="font-sans text-cream-400 text-xs truncate">{user?.email}</p>
                            </div>
                        </div>
                    </div>
                    <nav className="flex-1 p-4 space-y-2">
                        {[
                            { id: 'products', label: 'Products', icon: FiShoppingBag },
                            { id: 'orders', label: 'Orders', icon: FiPackage },
                            { id: 'payments', label: 'Payments', icon: FiDollarSign },
                            { id: 'settings', label: 'Settings', icon: FiSettings },
                        ].map(item => (
                            <button key={item.id} onClick={() => { setTab(item.id); setSidebarOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-sans text-sm transition-all ${tab === item.id ? 'bg-gold text-charcoal font-medium' : 'text-cream-300 hover:bg-charcoal-light hover:text-cream-100'}`}>
                                <item.icon className="w-5 h-5" />
                                {item.label}
                                {item.id === 'payments' && paymentStats.failed > 0 && (
                                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{paymentStats.failed}</span>
                                )}
                            </button>
                        ))}
                    </nav>
                    <div className="p-4 border-t border-charcoal-light">
                        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-sans text-sm text-cream-400 hover:text-red-400 hover:bg-charcoal-light transition-all">
                            <FiLogOut /> Sign Out
                        </button>
                    </div>
                </div>

                {/* Main */}
                <div className="flex-1 lg:ml-64 ml-0 min-h-screen">
                    {/* Stats bar */}
                    <div className="bg-white border-b border-cream-200 px-4 sm:px-8 py-6 pt-16 lg:pt-6">
                        <div className="flex items-center justify-between">
                            <h1 className="font-serif text-2xl text-charcoal">
                                {tab === 'products' ? 'Product Management' : tab === 'orders' ? 'Order Management' : tab === 'payments' ? 'Payment Management' : 'Store Settings'}
                            </h1>
                            {tab === 'products' && (
                                <button onClick={() => { setShowProductForm(true); setEditProduct(null); setForm(emptyForm); setImagePreviews([]); }}
                                    className="btn-primary flex items-center gap-2">
                                    <FiPlus /> Add Product
                                </button>
                            )}
                        </div>
                        
                        {/* Error Banner */}
                        {dataError && (
                            <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FiAlertTriangle className="w-5 h-5 text-red-600" />
                                    <p className="font-sans text-sm text-red-700">{dataError}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setDataError(null);
                                        setTabLoading(true);
                                        if (tab === 'products') fetchProducts(1);
                                        else if (tab === 'orders') fetchOrders(1);
                                        else if (tab === 'payments') fetchPayments();
                                    }}
                                    className="text-sm font-semibold text-red-600 hover:text-red-700 underline"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                        
                        {/* Dynamic stats based on tab */}
                        {tab === 'payments' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mt-6">
                                {[
                                    { label: 'Total Payments', value: paymentStats.total, icon: '💳', color: 'bg-blue-50' },
                                    { label: 'Paid', value: paymentStats.paid, icon: '✅', color: 'bg-green-50' },
                                    { label: 'Failed', value: paymentStats.failed, icon: '❌', color: 'bg-red-50' },
                                    { label: 'Total Revenue', value: `₹${paymentStats.totalRevenue?.toLocaleString()}`, icon: '💰', color: 'bg-amber-50' },
                                ].map(stat => (
                                    <div key={stat.label} className={`${stat.color} rounded-2xl p-3 sm:p-4`}>
                                        <p className="text-2xl mb-1">{stat.icon}</p>
                                        <p className="font-serif text-2xl text-charcoal">{stat.value}</p>
                                        <p className="font-sans text-xs text-charcoal-muted">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-6">
                                {[
                                    { label: 'Total Products', value: stats.products, icon: '👗' },
                                    { label: 'Total Orders', value: stats.orders, icon: '📦' },
                                    { label: 'Revenue (Paid)', value: `₹${stats.revenue.toLocaleString()}`, icon: '💰' },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-cream-100 rounded-2xl p-3 sm:p-4">
                                        <p className="text-2xl mb-1">{stat.icon}</p>
                                        <p className="font-serif text-2xl text-charcoal">{stat.value}</p>
                                        <p className="font-sans text-xs text-charcoal-muted">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* Stock Alerts Banner */}
                        {tab === 'products' && (stockAlerts.outOfStock?.length > 0 || stockAlerts.criticalStock?.length > 0) && (
                            <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
                                <div className="flex items-center gap-2 text-red-700 font-sans text-sm font-bold mb-2">
                                    <FiAlertTriangle className="w-5 h-5" />
                                    Stock Alerts
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {stockAlerts.outOfStock?.map(p => (
                                        <span key={p._id} className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full font-sans">
                                            {p.name}: OUT OF STOCK
                                        </span>
                                    ))}
                                    {stockAlerts.criticalStock?.map(p => (
                                        <span key={p._id} className="bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-sans">
                                            {p.name}: {p.stock} left
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-8">
                        {tab === 'settings' && <AdminSettings />}

                        {/* Products Tab */}
                        {tab === 'products' && (
                            <div>
                                {tabLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold"></div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-6">
                                            {products.length > 0 ? (
                                                products.map(product => (
                                                    <ProductCard 
                                                        key={product._id} 
                                                        product={product}
                                                        onEdit={handleEdit}
                                                        onDelete={handleDelete}
                                                    />
                                                ))
                                            ) : (
                                                <div className="col-span-full py-12 text-center">
                                                    <p className="font-sans text-charcoal-muted">📦 No products yet. Add your first product!</p>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Pagination Controls */}
                                        {stats.products > ITEMS_PER_PAGE && (
                                            <div className="flex items-center justify-center gap-4 mt-8 pb-8">
                                                <button
                                                    onClick={() => fetchProducts(productPage - 1)}
                                                    disabled={productPage === 1}
                                                    className="px-4 py-2 rounded-lg font-sans font-semibold border-2 border-gold text-gold hover:bg-gold hover:text-charcoal disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                >
                                                    <FiChevronLeft className="w-5 h-5" />
                                                </button>
                                                <span className="font-sans text-charcoal-muted">
                                                    Page {productPage} of {Math.ceil(stats.products / ITEMS_PER_PAGE)}
                                                </span>
                                                <button
                                                    onClick={() => fetchProducts(productPage + 1)}
                                                    disabled={productPage >= Math.ceil(stats.products / ITEMS_PER_PAGE)}
                                                    className="px-4 py-2 rounded-lg font-sans font-semibold border-2 border-gold text-gold hover:bg-gold hover:text-charcoal disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                >
                                                    <FiChevronRight className="w-5 h-5" />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Orders Tab */}
                        {tab === 'orders' && (
                            <div>
                                {tabLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold"></div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-4 mb-6">
                                            {orders.length > 0 ? orders.map(order => (
                                                <motion.div key={order._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                    className="card p-6 space-y-3 hover:shadow-soft transition-shadow">
                                                    {/* Header Row */}
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-cream-200">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <h3 className="font-serif text-lg text-charcoal font-bold">#{order.orderNumber}</h3>
                                                                <span className={`badge-${order.status.toLowerCase()} text-xs font-bold`}>{order.status}</span>
                                                                <span className={`font-sans text-xs px-3 py-1 rounded-full font-bold ${order.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' : order.paymentStatus === 'Failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                    {order.paymentStatus}
                                                                </span>
                                                            </div>
                                                            <p className="font-sans text-sm text-charcoal-muted">
                                                                {new Date(order.createdAt).toLocaleDateString('en-IN')} at {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                        <select
                                                            value={order.status}
                                                            onChange={e => handleStatusUpdate(order._id, e.target.value)}
                                                            className="input-field py-2 text-sm font-sans font-medium"
                                                        >
                                                            {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                    </div>

                                                    {/* User & Contact */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="font-sans text-xs text-charcoal-muted uppercase font-bold tracking-widest mb-1">Customer</p>
                                                            <p className="font-sans text-sm font-medium text-charcoal">{order.user?.name}</p>
                                                            <p className="font-sans text-xs text-charcoal-muted">{order.user?.email}</p>
                                                            <p className="font-sans text-xs text-charcoal-muted">{order.user?.phone}</p>
                                                        </div>
                                                        <div>
                                                            <p className="font-sans text-xs text-charcoal-muted uppercase font-bold tracking-widest mb-1">Contact</p>
                                                            <p className="font-sans text-sm font-medium text-charcoal">{order.shippingAddress?.phone}</p>
                                                            <p className="font-sans text-xs text-charcoal-muted">{order.shippingAddress?.fullName}</p>
                                                        </div>
                                                    </div>

                                                    {/* Shipping Address */}
                                                    <div>
                                                        <p className="font-sans text-xs text-charcoal-muted uppercase font-bold tracking-widest mb-2">📍 Delivery Address (Admin Action Required)</p>
                                                        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
                                                            <p className="font-sans text-sm text-charcoal font-bold mb-1">{order.shippingAddress?.fullName}</p>
                                                            <p className="font-sans text-sm text-charcoal font-medium">Phone: {order.shippingAddress?.phone}</p>
                                                            <p className="font-sans text-sm text-charcoal mt-2">
                                                                {order.shippingAddress?.houseNo}{order.shippingAddress?.street ? `, ${order.shippingAddress.street}` : ''}
                                                                {order.shippingAddress?.landmark && ` (near ${order.shippingAddress.landmark})`}
                                                            </p>
                                                            <p className="font-sans text-sm text-charcoal">
                                                                {order.shippingAddress?.city}, {order.shippingAddress?.state} — <span className="font-bold">{order.shippingAddress?.pincode}</span>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Items */}
                                                    <div>
                                                        <p className="font-sans text-xs text-charcoal-muted uppercase font-bold tracking-widest mb-2">Items ({order.items?.length})</p>
                                                        <div className="space-y-1">
                                                            {order.items?.map((item, i) => (
                                                                <div key={i} className="flex justify-between text-sm font-sans bg-cream-100 p-2 rounded">
                                                                    <span className="text-charcoal">
                                                                        <span className="font-medium">{item.name}</span>
                                                                        {item.size && <span className="text-charcoal-muted"> ({item.size})</span>}
                                                                        <span className="text-charcoal-muted"> × {item.quantity}</span>
                                                                    </span>
                                                                    <span className="text-charcoal font-medium">₹{(item.price * item.quantity).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Amount Breakdown & Download */}
                                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pt-2 border-t border-cream-200">
                                                        <div>
                                                            <p className="font-sans text-xs text-charcoal-muted">Payment Method</p>
                                                            <p className="font-sans text-sm font-medium text-charcoal">{order.paymentMethod}</p>
                                                        </div>
                                                        <div className="text-left sm:text-right flex-1">
                                                            <div className="flex justify-between gap-8 text-sm font-sans mb-1">
                                                                <span className="text-charcoal-muted">Subtotal:</span>
                                                                <span className="text-charcoal font-medium">₹{(order.totalAmount - order.shippingCharge).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between gap-8 text-sm font-sans mb-2">
                                                                <span className={`${order.shippingCharge === 0 ? 'text-green-600' : 'text-charcoal-muted'}`}>Shipping:</span>
                                                                <span className={`font-medium ${order.shippingCharge === 0 ? 'text-green-600' : 'text-charcoal'}`}>{order.shippingCharge === 0 ? 'FREE' : `₹${order.shippingCharge}`}</span>
                                                            </div>
                                                            <div className="flex justify-between gap-8 text-base font-sans border-t border-cream-300 pt-2">
                                                                <span className="font-serif text-charcoal">Total:</span>
                                                                <span className="font-serif text-lg text-charcoal font-bold">₹{order.totalAmount.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                        <motion.button
                                                            onClick={() => handleDownloadInvoice(order._id, order.orderNumber)}
                                                            disabled={downloadingInvoice === order._id}
                                                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-70 whitespace-nowrap"
                                                        >
                                                            {downloadingInvoice === order._id ? (
                                                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                                            ) : (
                                                                <FiDownload className="w-4 h-4" />
                                                            )}
                                                            {downloadingInvoice === order._id ? 'Downloading...' : 'Download Invoice'}
                                                        </motion.button>
                                                    </div>
                                                </motion.div>
                                            )) : (
                                                <div className="card p-8 text-center">
                                                    <p className="font-sans text-charcoal-muted">📦 No orders yet</p>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Pagination Controls */}
                                        {stats.orders > ITEMS_PER_PAGE && (
                                            <div className="flex items-center justify-center gap-4 mt-8 pb-8">
                                                <button
                                                    onClick={() => fetchOrders(orderPage - 1)}
                                                    disabled={orderPage === 1}
                                                    className="px-4 py-2 rounded-lg font-sans font-semibold border-2 border-gold text-gold hover:bg-gold hover:text-charcoal disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                >
                                                    <FiChevronLeft className="w-5 h-5" />
                                                </button>
                                                <span className="font-sans text-charcoal-muted">
                                                    Page {orderPage} of {Math.ceil(stats.orders / ITEMS_PER_PAGE)}
                                                </span>
                                                <button
                                                    onClick={() => fetchOrders(orderPage + 1)}
                                                    disabled={orderPage >= Math.ceil(stats.orders / ITEMS_PER_PAGE)}
                                                    className="px-4 py-2 rounded-lg font-sans font-semibold border-2 border-gold text-gold hover:bg-gold hover:text-charcoal disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                                >
                                                    <FiChevronRight className="w-5 h-5" />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Payments Tab */}
                        {tab === 'payments' && (
                            <div className="space-y-4">
                                {payments.length > 0 ? payments.map(payment => (
                                    <motion.div key={payment._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="card p-6 hover:shadow-soft transition-shadow">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                            {/* Payment Info */}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold font-sans ${
                                                        payment.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                                        payment.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                                                        'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {payment.status}
                                                    </span>
                                                    <span className="font-sans text-xs text-charcoal-muted bg-cream-100 px-2 py-1 rounded">
                                                        {payment.method}
                                                    </span>
                                                </div>
                                                <p className="font-mono text-xs text-charcoal-muted mb-1">
                                                    ID: {payment.razorpayPaymentId || 'N/A'}
                                                </p>
                                                <p className="font-sans text-sm text-charcoal">
                                                    {new Date(payment.createdAt).toLocaleDateString('en-IN')} at {new Date(payment.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>

                                            {/* Customer Info */}
                                            <div className="flex-1">
                                                <p className="font-sans text-xs text-charcoal-muted uppercase tracking-widest mb-1">Customer</p>
                                                <p className="font-sans text-sm font-medium text-charcoal">{payment.user?.name || payment.contact?.name || 'Unknown'}</p>
                                                <p className="font-sans text-xs text-charcoal-muted">{payment.user?.email || payment.contact?.email || ''}</p>
                                                <p className="font-sans text-xs text-charcoal-muted">{payment.user?.phone || payment.contact?.phone || ''}</p>
                                            </div>

                                            {/* Order Info */}
                                            <div className="flex-1">
                                                <p className="font-sans text-xs text-charcoal-muted uppercase tracking-widest mb-1">Order</p>
                                                {payment.order ? (
                                                    <>
                                                        <p className="font-serif text-sm font-bold text-charcoal">#{payment.order.orderNumber}</p>
                                                        <p className={`font-sans text-xs px-2 py-0.5 rounded inline-block mt-1 ${statusClass[payment.order.status] || 'bg-gray-100 text-gray-700'}`}>
                                                            {payment.order.status}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="font-sans text-xs text-charcoal-muted">No order linked</p>
                                                )}
                                            </div>

                                            {/* Amount */}
                                            <div className="text-right">
                                                <p className="font-sans text-xs text-charcoal-muted uppercase tracking-widest mb-1">Amount</p>
                                                <p className="font-serif text-2xl font-bold text-charcoal">₹{payment.amount?.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {/* UPI Details if available */}
                                        {payment.methodDetails?.upiId && (
                                            <div className="mt-4 pt-4 border-t border-cream-200">
                                                <p className="font-sans text-xs text-charcoal-muted">
                                                    <span className="font-bold">UPI ID:</span> {payment.methodDetails.upiId}
                                                    {payment.methodDetails.upiApp && ` via ${payment.methodDetails.upiApp}`}
                                                </p>
                                            </div>
                                        )}

                                        {/* Error details for failed payments */}
                                        {payment.status === 'FAILED' && payment.razorpayError?.description && (
                                            <div className="mt-4 pt-4 border-t border-red-200 bg-red-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
                                                <p className="font-sans text-xs text-red-700">
                                                    <span className="font-bold">Error:</span> {payment.razorpayError.description}
                                                </p>
                                            </div>
                                        )}
                                    </motion.div>
                                )) : (
                                    <div className="card p-8 text-center">
                                        <p className="font-sans text-charcoal-muted">💳 No payments recorded yet</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Product Form Modal */}
            <AnimatePresence>
                {showProductForm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-charcoal/50 flex items-center justify-center p-2 sm:p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-3xl sm:rounded-4xl shadow-strong w-full max-w-2xl max-h-[95vh] overflow-y-auto">
                            <div className="p-4 sm:p-6 border-b border-cream-200 flex items-center justify-between sticky top-0 bg-white z-10">
                                <h2 className="font-serif text-xl sm:text-2xl text-charcoal">{editProduct ? 'Edit Product' : 'Add New Product'}</h2>
                                <button onClick={() => setShowProductForm(false)} className="p-2 hover:bg-cream-200 rounded-full transition-colors"><FiX className="w-5 h-5 text-charcoal" /></button>
                            </div>
                            <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block font-sans text-sm text-charcoal-muted mb-1">Product Name *</label>
                                        <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Floral Co-ord Set" required />
                                    </div>
                                    <div>
                                        <label className="block font-sans text-sm text-charcoal-muted mb-1">Price (₹) *</label>
                                        <input className="input-field" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="1299" required />
                                    </div>
                                    <div>
                                        <label className="block font-sans text-sm text-charcoal-muted mb-1">Original Price (₹)</label>
                                        <input className="input-field" type="number" value={form.originalPrice} onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))} placeholder="1699 (optional)" />
                                    </div>
                                    <div>
                                        <label className="block font-sans text-sm text-charcoal-muted mb-1">Gender</label>
                                        <select className="input-field" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                                            {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-sans text-sm text-charcoal-muted mb-1">Quality Grade</label>
                                        <select className="input-field" value={form.qualityGrade} onChange={e => setForm(f => ({ ...f, qualityGrade: e.target.value }))}>
                                            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-sans text-sm text-charcoal-muted mb-1">Category</label>
                                        <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-sans text-sm text-charcoal-muted mb-1">Stock</label>
                                        <input className="input-field" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
                                    </div>
                                    <div className="flex items-center gap-6 pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer font-sans text-sm text-charcoal">
                                            <input type="checkbox" checked={form.isNewArrival} onChange={e => setForm(f => ({ ...f, isNewArrival: e.target.checked }))} className="accent-gold w-4 h-4" />
                                            New Arrival
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer font-sans text-sm text-charcoal">
                                            <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))} className="accent-gold w-4 h-4" />
                                            Featured
                                        </label>
                                    </div>
                                </div>

                                {/* Sizes */}
                                <div>
                                    <label className="block font-sans text-sm text-charcoal-muted mb-2">Sizes</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SIZES.map(size => (
                                            <button type="button" key={size}
                                                onClick={() => setForm(f => ({ ...f, sizes: f.sizes.includes(size) ? f.sizes.filter(s => s !== size) : [...f.sizes, size] }))}
                                                className={`px-4 py-1.5 rounded-full text-sm font-sans border-2 transition-all ${form.sizes.includes(size) ? 'bg-charcoal text-cream-100 border-charcoal' : 'border-cream-400 text-charcoal hover:border-charcoal'}`}>
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block font-sans text-sm text-charcoal-muted mb-1">Description *</label>
                                    <textarea className="input-field h-24 resize-none" value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the product..." required />
                                </div>

                                {/* Image Upload */}
                                <div>
                                    <label className="block font-sans text-sm text-charcoal-muted mb-2">Product Images (up to 8)</label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-cream-400 rounded-2xl p-6 text-center cursor-pointer hover:border-gold transition-colors"
                                    >
                                        <FiUpload className="w-8 h-8 text-charcoal-muted mx-auto mb-2" />
                                        <p className="font-sans text-sm text-charcoal-muted">Click to upload images</p>
                                        <p className="font-sans text-xs text-charcoal-muted mt-1">JPG, PNG, WebP — max 5MB each</p>
                                        <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*" onChange={handleImageChange} />
                                    </div>
                                    {imagePreviews.length > 0 && (
                                        <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-3 mt-3 flex-wrap">
                                            {imagePreviews.map((src, i) => (
                                                <div key={i} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-cream-200">
                                                    <img src={src} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {editProduct?.images?.length > 0 && imagePreviews.length === 0 && (
                                        <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-3 mt-3 flex-wrap">
                                            {editProduct.images.map((src, i) => (
                                                <div key={i} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-cream-200">
                                                    <img src={src.startsWith('http') ? src : src} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-4 pt-2">
                                    <button type="button" onClick={() => { setShowProductForm(false); setEditProduct(null); }}
                                        className="btn-secondary flex-1">Cancel</button>
                                    <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                        disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-70">
                                        {loading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-cream-100" /> : null}
                                        {editProduct ? 'Update Product' : 'Add Product'}
                                    </motion.button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
