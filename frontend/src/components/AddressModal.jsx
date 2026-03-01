import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiMapPin, FiUser, FiPhone, FiChevronDown, FiNavigation } from 'react-icons/fi';

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
    'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
    'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
    'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

const FIELD_CONFIG = [
    { key: 'fullName', label: 'Full Name', placeholder: 'First and last name', icon: FiUser, col: 'full' },
    { key: 'phone', label: 'Mobile Number', placeholder: '10-digit mobile number', icon: FiPhone, type: 'tel', col: 'half' },
    { key: 'pincode', label: 'Pincode', placeholder: '6-digit pincode', type: 'text', col: 'half', maxLength: 6 },
    { key: 'houseNo', label: 'House No / Flat No / Building', placeholder: 'e.g. Flat 4B, Sunshine Apartments', col: 'full' },
    { key: 'street', label: 'Street / Area / Sector / Village', placeholder: 'e.g. MG Road, Banjara Hills', col: 'full' },
    { key: 'landmark', label: 'Landmark (Optional)', placeholder: 'e.g. Near Apollo Hospital', col: 'full', optional: true },
    { key: 'city', label: 'City / Town', placeholder: 'e.g. Hyderabad', col: 'half' },
];

export default function AddressModal({ isOpen, onClose, onSubmit, initialData = {} }) {
    const [form, setForm] = useState({
        fullName: initialData.name || '',
        phone: initialData.phone || '',
        pincode: '',
        houseNo: '',
        street: '',
        landmark: '',
        city: '',
        state: '',
        // Location data
        lat: null,
        lng: null,
        accuracy: null,
        locationSource: 'Unknown',
        ipAddress: '',
        ipCity: '',
        ipRegion: '',
        ipCountry: '',
        ...initialData
    });
    const [errors, setErrors] = useState({});
    const [locationStatus, setLocationStatus] = useState('idle'); // idle, loading, success, denied

    // ══════════════════════════════════════════════════════════════════════════
    // LOCATION CAPTURE - Browser GPS + IP fallback
    // ══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!isOpen) return;
        
        // Start with IP-based location (always works, no permission needed)
        fetchIPLocation();
        
        // Then try browser geolocation (with permission)
        requestBrowserLocation();
    }, [isOpen]);

        // Reverse geocode when lat/lng is set
        useEffect(() => {
            if (form.lat && form.lng) {
                fetchReverseGeocode(form.lat, form.lng);
            }
        }, [form.lat, form.lng]);

            // Autofill city/state when pincode changes
            useEffect(() => {
                const fetchPincodeDetails = async (pincode) => {
                    try {
                        const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
                        const data = await response.json();
                        if (data[0].Status === 'Success' && data[0].PostOffice && data[0].PostOffice.length > 0) {
                            const po = data[0].PostOffice[0];
                            setForm(f => ({
                                ...f,
                                city: f.city || po.District || '',
                                state: f.state || po.State || ''
                            }));
                        }
                    } catch (err) {
                        console.log('Pincode lookup failed:', err.message);
                    }
                };
                if (/^\d{6}$/.test(form.pincode)) {
                    fetchPincodeDetails(form.pincode);
                }
            }, [form.pincode]);

        const fetchReverseGeocode = async (lat, lng) => {
            try {
                // Using OpenStreetMap Nominatim API (no key required, but rate limited)
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.address) {
                        setForm(f => ({
                            ...f,
                            houseNo: f.houseNo || data.address.house_number || '',
                            street: f.street || data.address.road || data.address.neighbourhood || '',
                            city: f.city || data.address.city || data.address.town || data.address.village || '',
                            state: f.state || data.address.state || '',
                            pincode: f.pincode || data.address.postcode || '',
                            landmark: f.landmark || data.address.suburb || '',
                            locationSource: 'GPS+ReverseGeocode'
                        }));
                    }
                }
            } catch (err) {
                console.log('Reverse geocode failed:', err.message);
            }
        };

    const fetchIPLocation = async () => {
        try {
            // Using free IP geolocation API
            const response = await fetch('https://ipapi.co/json/');
            if (response.ok) {
                const data = await response.json();
                setForm(f => ({
                    ...f,
                    ipAddress: data.ip || '',
                    ipCity: data.city || '',
                    ipRegion: data.region || '',
                    ipCountry: data.country_name || '',
                    // Auto-fill city and state if empty
                    city: f.city || data.city || '',
                    state: f.state || data.region || '',
                    locationSource: f.lat ? f.locationSource : 'IP'
                }));
            }
        } catch (err) {
            console.log('IP location fetch failed:', err.message);
        }
    };

    const requestBrowserLocation = () => {
        if (!navigator.geolocation) {
            setLocationStatus('denied');
            return;
        }

        setLocationStatus('loading');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setForm(f => ({
                    ...f,
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    locationSource: 'GPS'
                }));
                setLocationStatus('success');
            },
            (error) => {
                console.log('Geolocation error:', error.message);
                setLocationStatus('denied');
                // IP location will be used as fallback
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes cache
            }
        );
    };

    const validate = () => {
        const e = {};
        if (!form.fullName.trim()) e.fullName = 'Full name is required';
        if (!/^\d{10}$/.test(form.phone)) e.phone = 'Enter a valid 10-digit mobile number';
        if (!/^\d{6}$/.test(form.pincode)) e.pincode = 'Enter a valid 6-digit pincode';
        if (!form.houseNo.trim()) e.houseNo = 'House/Flat number is required';
        if (!form.street.trim()) e.street = 'Street/Area is required';
        if (!form.city.trim()) e.city = 'City is required';
        if (!form.state) e.state = 'Please select a state';
        return e;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const e2 = validate();
        if (Object.keys(e2).length > 0) { setErrors(e2); return; }
        setErrors({});
        onSubmit(form);
    };

    const set = (key, val) => {
        setForm(f => ({ ...f, [key]: val }));
        if (errors[key]) setErrors(e => { const x = { ...e }; delete x[key]; return x; });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 25 }}
                    className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-8 py-6 border-b border-cream-200 rounded-t-[2rem]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gold/10 rounded-2xl flex items-center justify-center">
                                <FiMapPin className="w-5 h-5 text-gold" />
                            </div>
                            <div>
                                <h2 className="font-serif text-2xl text-charcoal">Delivery Address</h2>
                                <p className="font-sans text-xs text-charcoal-muted">Step 1 of 2 — Where should we deliver?</p>
                            </div>
                        </div>
                        <button onClick={onClose}
                            className="w-9 h-9 bg-cream-100 hover:bg-cream-200 rounded-full flex items-center justify-center transition-colors">
                            <FiX className="w-4 h-4 text-charcoal" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-5">
                        {/* Location Status Indicator */}
                        <div className={`flex items-center gap-3 p-3 rounded-xl text-sm font-sans ${
                            locationStatus === 'success' ? 'bg-green-50 text-green-700' :
                            locationStatus === 'loading' ? 'bg-blue-50 text-blue-700' :
                            locationStatus === 'denied' ? 'bg-amber-50 text-amber-700' :
                            'bg-gray-50 text-gray-600'
                        }`}>
                            <FiNavigation className={`w-4 h-4 ${locationStatus === 'loading' ? 'animate-pulse' : ''}`} />
                            <span>
                                {locationStatus === 'success' && '📍 GPS location captured for faster delivery'}
                                {locationStatus === 'loading' && '📡 Getting your location...'}
                                {locationStatus === 'denied' && `📌 Using IP location: ${form.ipCity || 'Unknown'}, ${form.ipRegion || 'India'}`}
                                {locationStatus === 'idle' && '🔄 Initializing location services...'}
                            </span>
                            {locationStatus === 'denied' && (
                                <button 
                                    type="button"
                                    onClick={requestBrowserLocation}
                                    className="ml-auto text-xs underline hover:no-underline"
                                >
                                    Retry GPS
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {FIELD_CONFIG.map(({ key, label, placeholder, icon: Icon, type = 'text', col, optional, maxLength }) => (
                                <div key={key} className={col === 'full' ? 'md:col-span-2' : ''}>
                                    <label className="block font-sans text-[11px] font-bold text-charcoal-muted uppercase tracking-widest mb-1.5">
                                        {label}
                                    </label>
                                    <div className="relative">
                                        {Icon && (
                                            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-muted" />
                                        )}
                                        <input
                                            type={type}
                                            value={form[key]}
                                            onChange={e => set(key, e.target.value)}
                                            placeholder={placeholder}
                                            maxLength={maxLength}
                                            className={`input-field ${Icon ? 'pl-10' : ''} ${errors[key] ? 'border-red-400 focus:ring-red-200' : ''}`}
                                        />
                                    </div>
                                    {errors[key] && (
                                        <p className="text-red-500 text-xs mt-1.5 font-sans">{errors[key]}</p>
                                    )}
                                </div>
                            ))}

                            {/* State Dropdown */}
                            <div className="md:col-span-2">
                                <label className="block font-sans text-[11px] font-bold text-charcoal-muted uppercase tracking-widest mb-1.5">
                                    State
                                </label>
                                <div className="relative">
                                    <select
                                        value={form.state}
                                        onChange={e => set('state', e.target.value)}
                                        className={`input-field appearance-none pr-10 ${errors.state ? 'border-red-400' : ''}`}
                                    >
                                        <option value="">Choose your state</option>
                                        {INDIAN_STATES.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-muted pointer-events-none" />
                                </div>
                                {errors.state && <p className="text-red-500 text-xs mt-1.5 font-sans">{errors.state}</p>}
                            </div>
                        </div>

                        {/* Address Preview */}
                        {form.houseNo && form.city && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="bg-green-50 border border-green-200 rounded-2xl p-4"
                            >
                                <p className="font-sans text-xs font-bold text-green-700 uppercase tracking-widest mb-1">📍 Delivery To</p>
                                <p className="font-sans text-sm text-green-800">
                                    {form.houseNo}, {form.street && `${form.street},`} {form.landmark && `near ${form.landmark},`} {form.city}, {form.state} — {form.pincode}
                                </p>
                            </motion.div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose}
                                className="btn-secondary flex-1">Cancel</button>
                            <motion.button
                                type="submit"
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                            >
                                Proceed to Payment →
                            </motion.button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
