import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiShoppingBag, FiHeart, FiChevronLeft, FiChevronRight, FiZap } from 'react-icons/fi';
import api from '../utils/api';
import { getMediaUrl } from '../utils/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import AddressModal from '../components/AddressModal';
import PaymentModal from '../components/PaymentModal';

const gradeClass = { Premium: 'badge-premium', Standard: 'badge-standard', Economy: 'badge-economy' };

export default function ProductPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart } = useCart();
    const { user } = useAuth();
    const [product, setProduct] = useState(null);
    const [selectedImg, setSelectedImg] = useState(0);
    const [selectedSize, setSelectedSize] = useState('');
    const [qty, setQty] = useState(1);
    const [loading, setLoading] = useState(true);

    // Buy Now flow state
    const [showAddress, setShowAddress] = useState(false);
    const [showPayment, setShowPayment] = useState(false);
    const [pendingOrder, setPendingOrder] = useState(null);
    const [buyNowAddress, setBuyNowAddress] = useState(null);
    const [orderLoading, setOrderLoading] = useState(false);

    useEffect(() => {
        if (id.startsWith('demo-')) {
            const names = ['Floral Co-ord Set', 'Block Print Kurta', 'Boho Palazzo Set', 'Wavy Crop Top'];
            const idx = parseInt(id.split('-')[1]);
            setProduct({
                _id: id, name: names[idx % 4] || 'TCS Product', price: 1299, originalPrice: 1699,
                qualityGrade: 'Premium', description: 'A beautifully crafted piece from our local studio. Made with premium fabric, this design is perfect for everyday wear or special occasions. Each piece is quality-checked and handcrafted with love.',
                images: [], category: 'Co-ord Sets', sizes: ['S', 'M', 'L', 'XL'],
                colors: ['Beige', 'Charcoal', 'Sage'], stock: 10, isNewArrival: true,
                ratings: { average: 4.5, count: 42 }
            });
            setLoading(false);
            return;
        }
        api.get(`/products/${id}`).then(({ data }) => { setProduct(data); setLoading(false); })
            .catch(() => { navigate('/'); });
    }, [id]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center pt-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gold"></div>
        </div>
    );
    if (!product) return null;

    const images = product.images?.length > 0
        ? product.images.map(img => getMediaUrl(img))
        : [`https://placehold.co/600x800/F5F0E8/2C1810?text=${encodeURIComponent(product.name)}`];

    const handleAddToCart = () => {
        if (!user) { navigate('/auth'); return; }
        addToCart(product, selectedSize || product.sizes?.[0] || 'Free Size');
    };

    const handleBuyNow = () => {
        if (!user) { navigate('/auth'); return; }
        setShowAddress(true);
    };

    const handleAddressSubmit = async (address) => {
        setBuyNowAddress(address);
        setShowAddress(false);
        setOrderLoading(true);

        try {
            const size = selectedSize || product.sizes?.[0] || 'Free Size';
            const items = [{
                product: product._id,
                name: product.name,
                price: product.price,
                image: product.images?.[0] || '',
                quantity: qty,
                size
            }];

            // Create order with address and location data (payment pending)
            const { data: order } = await api.post('/orders', {
                items,
                shippingAddress: {
                    fullName: address.fullName,
                    phone: address.phone,
                    houseNo: address.houseNo,
                    street: address.street,
                    landmark: address.landmark,
                    city: address.city,
                    state: address.state,
                    pincode: address.pincode
                },
                // Location data from AddressModal
                location: {
                    lat: address.lat,
                    lng: address.lng,
                    accuracy: address.accuracy,
                    locationSource: address.locationSource,
                    ipAddress: address.ipAddress,
                    ipCity: address.ipCity,
                    ipRegion: address.ipRegion,
                    ipCountry: address.ipCountry
                },
                paymentMethod: 'Pending',  // Will be set after payment
                saveAddress: true  // Save address to user profile
            });

            setPendingOrder(order);
            setShowPayment(true);
            import('react-hot-toast').then(({ default: toast }) => {
                toast.success('Address saved! Now complete payment.');
            });
        } catch (err) {
            import('react-hot-toast').then(({ default: toast }) => {
                toast.error(err.response?.data?.message || 'Could not create order');
            });
        } finally {
            setOrderLoading(false);
        }
    };

    const handlePaymentSuccess = (orderId) => {
        setShowPayment(false);
        navigate(`/order-success/${orderId}`);
    };

    const grandTotal = (product.price * qty) + ((product.price * qty) > 999 ? 0 : 49);

    return (
        <div className="min-h-screen pt-20 bg-cream-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Breadcrumb */}
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-charcoal-muted font-sans text-sm mb-8 hover:text-charcoal transition-colors">
                    <FiChevronLeft /> Back
                </button>

                <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
                    {/* Image Gallery */}
                    <div className="space-y-4">
                        <motion.div
                            key={selectedImg} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="relative overflow-hidden bg-cream-300 rounded-4xl aspect-[4/5]"
                        >
                            <img src={images[selectedImg]} alt={product.name} className="w-full h-full object-cover" />
                            {images.length > 1 && (
                                <>
                                    <button onClick={() => setSelectedImg(p => (p - 1 + images.length) % images.length)}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-soft">
                                        <FiChevronLeft />
                                    </button>
                                    <button onClick={() => setSelectedImg(p => (p + 1) % images.length)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-soft">
                                        <FiChevronRight />
                                    </button>
                                </>
                            )}
                            {product.isNewArrival && <div className="absolute top-4 left-4 bg-gold text-charcoal text-xs font-bold px-3 py-1 rounded-full font-sans">New Arrival</div>}
                        </motion.div>
                        {images.length > 1 && (
                            <div className="flex gap-3 overflow-x-auto">
                                {images.map((img, i) => (
                                    <button key={i} onClick={() => setSelectedImg(i)}
                                        className={`w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 border-2 transition-all ${selectedImg === i ? 'border-gold' : 'border-transparent'}`}>
                                        <img src={img} alt="" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="pt-4">
                        <p className="font-sans text-gold text-sm font-medium tracking-widest uppercase mb-3">{product.category}</p>
                        <h1 className="font-serif text-4xl md:text-5xl text-charcoal mb-4">{product.name}</h1>

                        <div className="flex items-center gap-4 mb-6">
                            <span className="font-sans text-3xl font-semibold text-charcoal">₹{product.price.toLocaleString()}</span>
                            {product.originalPrice && (
                                <>
                                    <span className="font-sans text-lg text-charcoal-muted line-through">₹{product.originalPrice.toLocaleString()}</span>
                                    <span className="badge-premium">{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% off</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-3 mb-8">
                            {product.qualityGrade && <span className={gradeClass[product.qualityGrade] || 'badge-standard'}>{product.qualityGrade} Grade</span>}
                            <span className={`font-sans text-sm ${product.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {product.stock > 0 ? `✓ In Stock (${product.stock} left)` : '✗ Out of Stock'}
                            </span>
                        </div>

                        {/* Size Selector */}
                        {product.sizes?.length > 0 && (
                            <div className="mb-6">
                                <p className="font-sans font-medium text-charcoal mb-3">Select Size</p>
                                <div className="flex gap-2 flex-wrap">
                                    {product.sizes.map(size => (
                                        <button key={size} onClick={() => setSelectedSize(size)}
                                            className={`w-12 h-12 rounded-xl font-sans text-sm font-medium border-2 transition-all duration-200 ${selectedSize === size ? 'bg-charcoal text-cream-100 border-charcoal' : 'border-cream-400 text-charcoal hover:border-charcoal'}`}>
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quantity */}
                        <div className="flex items-center gap-4 mb-8">
                            <p className="font-sans font-medium text-charcoal">Quantity</p>
                            <div className="flex items-center gap-3 bg-cream-200 rounded-full px-2 py-1">
                                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-cream-300 transition-colors font-bold">-</button>
                                <span className="font-sans font-medium text-charcoal w-8 text-center">{qty}</span>
                                <button onClick={() => setQty(q => Math.min(product.stock, q + 1))} className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-cream-300 transition-colors font-bold">+</button>
                            </div>
                        </div>

                        {/* CTA Buttons */}
                        <div className="flex gap-3 mb-8">
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={handleAddToCart} disabled={product.stock === 0}
                                className="btn-secondary flex-1 flex items-center justify-center gap-2 text-base disabled:opacity-50">
                                <FiShoppingBag />
                                Add to Cart
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={handleBuyNow} disabled={product.stock === 0 || orderLoading}
                                className="btn-primary flex-1 flex items-center justify-center gap-2 text-base disabled:opacity-50 relative">
                                {orderLoading
                                    ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                    : <FiZap />}
                                {orderLoading ? 'Processing...' : 'Buy Now'}
                            </motion.button>
                            <button className="btn-secondary px-5">
                                <FiHeart />
                            </button>
                        </div>

                        {/* Shipping hint */}
                        <div className="bg-gold/10 border border-gold/20 rounded-2xl px-4 py-3 mb-6">
                            <p className="font-sans text-sm text-charcoal">
                                🚚 <strong>{grandTotal > 999 ? 'FREE' : '₹49'} Shipping</strong>
                                {grandTotal <= 999 ? ' — Add more to get free shipping!' : ' — Enjoy free shipping on this order!'}
                            </p>
                        </div>

                        {/* Description */}
                        <div className="border-t border-cream-300 pt-8">
                            <h3 className="font-serif text-xl text-charcoal mb-3">Description</h3>
                            <p className="font-sans text-charcoal-muted leading-relaxed">{product.description}</p>
                        </div>

                        {/* Features */}
                        <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-cream-300">
                            {[['🚚', 'Free Shipping', '>₹999'], ['↩', 'Easy Returns', '7 days'], ['🛡️', 'Secure', 'Payment']].map(([icon, label, sub]) => (
                                <div key={label} className="text-center">
                                    <p className="text-2xl mb-1">{icon}</p>
                                    <p className="font-sans text-xs font-medium text-charcoal">{label}</p>
                                    <p className="font-sans text-xs text-charcoal-muted">{sub}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Address Modal */}
            <AddressModal
                isOpen={showAddress}
                onClose={() => setShowAddress(false)}
                onSubmit={handleAddressSubmit}
                initialData={{ name: user?.name, phone: user?.phone }}
            />

            {/* Payment Modal */}
            <PaymentModal
                isOpen={showPayment}
                onClose={() => setShowPayment(false)}
                onSuccess={handlePaymentSuccess}
                order={pendingOrder}
                amount={pendingOrder?.totalAmount || grandTotal}
            />
        </div>
    );
}
