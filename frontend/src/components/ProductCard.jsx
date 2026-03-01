import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiHeart, FiShoppingBag, FiStar, FiZap } from 'react-icons/fi';
import { useCart } from '../context/CartContext';
import { getMediaUrl } from '../utils/api';

const gradeClass = {
    Premium: 'badge-premium',
    Export: 'badge-export',
    Regular: 'badge-regular',
};

export default function ProductCard({ product, index = 0 }) {
    const { addToCart } = useCart();
    const navigate = useNavigate();
    const [liked, setLiked] = useState(false);
    const [imgIdx, setImgIdx] = useState(0);
    const [adding, setAdding] = useState(false);

    const img = product.images?.[imgIdx]
        ? getMediaUrl(product.images[imgIdx])
        : `https://placehold.co/400x500/F5F0E8/2C1810?text=${encodeURIComponent(product.name || 'TCS')}`;

    const discount = product.originalPrice
        ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
        : 0;

    const handleAddToCart = (e) => {
        e.preventDefault();
        setAdding(true);
        addToCart(product);
        setTimeout(() => setAdding(false), 800);
    };

    const handleBuyNow = (e) => {
        e.preventDefault();
        // Clear cart first? Or just add. Let's just add and go.
        addToCart(product);
        navigate('/cart');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.08 }}
            className="group relative"
        >
            <Link to={`/product/${product._id}`} className="block">
                {/* Image Container with Arch Shape */}
                <div className="relative overflow-hidden bg-cream-300 rounded-t-[50%] rounded-b-2xl aspect-[3/4] mb-4">
                    <img
                        src={img}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onMouseEnter={() => product.images?.length > 1 && setImgIdx(1)}
                        onMouseLeave={() => setImgIdx(0)}
                    />

                    {/* Quality badge (top left overlay) */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                        {discount > 0 && (
                            <div className="bg-charcoal text-cream-100 text-[10px] font-bold px-2 py-1 rounded-full font-sans uppercase tracking-tighter">
                                -{discount}%
                            </div>
                        )}
                        <div className={gradeClass[product.qualityGrade] || 'badge-regular'}>
                            {product.qualityGrade || 'Regular'}
                        </div>
                    </div>

                    {/* New arrival badge */}
                    {product.isNewArrival && (
                        <div className="absolute top-4 right-4 bg-gold text-charcoal text-[10px] font-bold px-2 py-1 rounded-full font-sans uppercase">
                            New
                        </div>
                    )}

                    {/* Actions Overlay */}
                    <div className="absolute inset-x-0 bottom-4 flex flex-col gap-2 px-4 transition-all duration-300 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0">
                        <motion.button
                            onClick={handleBuyNow}
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            className="w-full flex items-center justify-center gap-2 bg-charcoal text-cream-100 py-2.5 rounded-full font-sans text-xs font-bold uppercase tracking-wider"
                        >
                            <FiZap className="w-4 h-4 text-gold fill-gold" />
                            Buy Now
                        </motion.button>
                        <motion.button
                            onClick={handleAddToCart}
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-full font-sans text-xs font-bold uppercase tracking-wider border-2 ${adding ? 'bg-green-500 border-green-500 text-white' : 'bg-white/80 backdrop-blur-sm border-charcoal/10 text-charcoal'}`}
                        >
                            <FiShoppingBag className="w-4 h-4" />
                            {adding ? 'Added!' : 'Add to Cart'}
                        </motion.button>
                    </div>
                </div>

                {/* Info */}
                <div className="px-1 text-center lg:text-left">
                    <div className="flex items-center justify-center lg:justify-between mb-1">
                        <h3 className="font-serif text-charcoal text-base leading-tight line-clamp-1">{product.name}</h3>
                        <button
                            onClick={e => { e.preventDefault(); setLiked(!liked); }}
                            className="hidden lg:block ml-2 p-1 text-charcoal-muted hover:text-red-400 transition-colors"
                        >
                            <FiHeart className={`w-4 h-4 ${liked ? 'fill-red-400 text-red-400' : ''}`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-center lg:justify-start gap-2 mb-2">
                        <span className="font-sans font-bold text-charcoal text-lg">₹{product.price.toLocaleString()}</span>
                        {product.originalPrice && (
                            <span className="font-sans text-charcoal-muted text-sm line-through pt-0.5">₹{product.originalPrice.toLocaleString()}</span>
                        )}
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
