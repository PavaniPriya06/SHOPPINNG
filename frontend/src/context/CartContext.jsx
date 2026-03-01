import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const CartContext = createContext(null);

export function CartProvider({ children }) {
    const [items, setItems] = useState(() => {
        try { return JSON.parse(localStorage.getItem('tcs_cart')) || []; } catch { return []; }
    });
    
    const [deliveryCharges, setDeliveryCharges] = useState(0);
    const [stockValidation, setStockValidation] = useState({});

    // ═════════════════════════════════════════════════════════════════════
    // FETCH DELIVERY CHARGES IN REAL-TIME
    // ═════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const fetchDeliveryCharges = async () => {
            try {
                const { data } = await api.get('/settings/deliveryCharges').catch(() => ({ data: { value: 0 } }));
                const charges = Number(data.value) || 0;
                setDeliveryCharges(charges);
                console.log(`📦 Delivery Charges Updated: ₹${charges}`);
            } catch (err) {
                console.log('Could not fetch delivery charges, using default');
                setDeliveryCharges(0);
            }
        };

        // Fetch on mount
        fetchDeliveryCharges();

        // Refresh every 30 seconds to reflect admin changes
        const interval = setInterval(fetchDeliveryCharges, 30000);
        return () => clearInterval(interval);
    }, []);

    // ═════════════════════════════════════════════════════════════════════
    // VALIDATE STOCK - Ensure cart items are still available
    // ═════════════════════════════════════════════════════════════════════
    const validateStock = useCallback(async () => {
        if (items.length === 0) return { valid: true, issues: [] };
        
        const productIds = [...new Set(items.map(i => i.product))].filter(Boolean);
        if (productIds.length === 0) return { valid: true, issues: [] };
        
        try {
            const { data } = await api.get(`/products?ids=${productIds.join(',')}&limit=100`);
            const productMap = {};
            (data.products || []).forEach(p => { productMap[p._id] = p; });
            
            const issues = [];
            const validation = {};
            
            items.forEach(item => {
                const product = productMap[item.product];
                if (!product) {
                    issues.push({ key: item.key, name: item.name, issue: 'Product no longer available' });
                    validation[item.key] = { valid: false, stock: 0 };
                } else if (product.stock < item.quantity) {
                    if (product.stock === 0) {
                        issues.push({ key: item.key, name: item.name, issue: 'Out of stock' });
                    } else {
                        issues.push({ key: item.key, name: item.name, issue: `Only ${product.stock} available` });
                    }
                    validation[item.key] = { valid: false, stock: product.stock };
                } else {
                    validation[item.key] = { valid: true, stock: product.stock };
                }
            });
            
            setStockValidation(validation);
            return { valid: issues.length === 0, issues };
        } catch (err) {
            console.error('Stock validation failed:', err);
            return { valid: true, issues: [] }; // Allow checkout if validation fails
        }
    }, [items]);

    useEffect(() => {
        localStorage.setItem('tcs_cart', JSON.stringify(items));
    }, [items]);

    const addToCart = (product, size = 'Free Size', color = '', quantity = 1) => {
        // Check stock before adding
        if (product.stock !== undefined && product.stock < quantity) {
            toast.error(product.stock === 0 ? 'Product is out of stock!' : `Only ${product.stock} items available`);
            return;
        }
        
        setItems(prev => {
            const key = `${product._id}-${size}-${color}`;
            const existing = prev.find(i => i.key === key);
            if (existing) {
                const newQty = existing.quantity + quantity;
                if (product.stock !== undefined && newQty > product.stock) {
                    toast.error(`Only ${product.stock} items available`);
                    return prev;
                }
                toast.success('Quantity updated!');
                return prev.map(i => i.key === key ? { ...i, quantity: newQty } : i);
            }
            toast.success(`${product.name} added to cart!`);
            return [...prev, {
                key,
                product: product._id,
                name: product.name,
                price: product.price,
                image: product.images?.[0] || '',
                size,
                color,
                quantity,
                maxStock: product.stock
            }];
        });
    };

    const removeFromCart = (key) => {
        setItems(prev => prev.filter(i => i.key !== key));
        toast('Item removed from cart', { icon: '🗑️' });
    };

    const updateQuantity = (key, qty) => {
        if (qty < 1) return removeFromCart(key);
        const item = items.find(i => i.key === key);
        if (item?.maxStock !== undefined && qty > item.maxStock) {
            toast.error(`Only ${item.maxStock} items available`);
            return;
        }
        setItems(prev => prev.map(i => i.key === key ? { ...i, quantity: qty } : i));
    };

    const clearCart = () => {
        setItems([]);
        setStockValidation({});
    };

    const totalItems = items.reduce((s, i) => s + i.quantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.price * i.quantity, 0);
    
    // ✅ USE DYNAMIC DELIVERY CHARGES FROM ADMIN SETTINGS (REAL-TIME)
    const shippingCharge = deliveryCharges;
    const grandTotal = totalAmount + shippingCharge;

    return (
        <CartContext.Provider value={{ 
            items, 
            addToCart, 
            removeFromCart, 
            updateQuantity, 
            clearCart, 
            totalItems, 
            totalAmount, 
            shippingCharge, 
            grandTotal,
            validateStock,
            stockValidation
        }}>
            {children}
        </CartContext.Provider>
    );
}

export const useCart = () => useContext(CartContext);
