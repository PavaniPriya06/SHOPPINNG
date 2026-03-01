// ══════════════════════════════════════════════════════════════════════════════
// API VALIDATION MIDDLEWARE - Request Validation & Sanitization
// ══════════════════════════════════════════════════════════════════════════════
// Validates incoming requests to prevent bad data from reaching database

const { AppError } = require('./errorHandler');

// Sanitize string inputs (prevent XSS, trim whitespace)
const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/javascript:/gi, '')                                       // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '');                                        // Remove inline event handlers
};

// Sanitize object recursively
const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

// Middleware to sanitize all request inputs
const sanitizeInputs = (req, res, next) => {
    if (req.body) req.body = sanitizeObject(req.body);
    if (req.query) req.query = sanitizeObject(req.query);
    if (req.params) req.params = sanitizeObject(req.params);
    next();
};

// Validate MongoDB ObjectId
const validateObjectId = (paramName = 'id') => (req, res, next) => {
    const id = req.params[paramName];
    if (!id) return next();
    
    // MongoDB ObjectId is 24 hex characters
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
        return next(new AppError(`Invalid ${paramName}: ${id}`, 400, 'INVALID_ID'));
    }
    next();
};

// Validate required fields
const validateRequired = (fields) => (req, res, next) => {
    const missing = fields.filter(field => {
        const value = req.body[field];
        return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
        return next(new AppError(
            `Missing required fields: ${missing.join(', ')}`,
            400,
            'MISSING_FIELDS'
        ));
    }
    next();
};

// Validate numeric fields
const validateNumeric = (fields) => (req, res, next) => {
    for (const field of fields) {
        const value = req.body[field];
        if (value !== undefined && value !== null) {
            const num = Number(value);
            if (isNaN(num)) {
                return next(new AppError(
                    `Field '${field}' must be a number`,
                    400,
                    'INVALID_NUMBER'
                ));
            }
            req.body[field] = num; // Convert to number
        }
    }
    next();
};

// Validate email format
const validateEmail = (field = 'email') => (req, res, next) => {
    const email = req.body[field];
    if (!email) return next();
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return next(new AppError('Invalid email format', 400, 'INVALID_EMAIL'));
    }
    next();
};

// Validate phone number (Indian format)
const validatePhone = (field = 'phone') => (req, res, next) => {
    const phone = req.body[field] || req.body.shippingAddress?.[field];
    if (!phone) return next();
    
    // Indian phone: 10 digits, optionally with +91
    const cleaned = phone.replace(/[\s\-+]/g, '');
    const phoneRegex = /^(91)?[6-9]\d{9}$/;
    
    if (!phoneRegex.test(cleaned)) {
        return next(new AppError('Invalid phone number', 400, 'INVALID_PHONE'));
    }
    next();
};

// Validate enum values
const validateEnum = (field, allowedValues) => (req, res, next) => {
    const value = req.body[field];
    if (!value) return next();
    
    if (!allowedValues.includes(value)) {
        return next(new AppError(
            `Invalid ${field}. Allowed values: ${allowedValues.join(', ')}`,
            400,
            'INVALID_ENUM'
        ));
    }
    next();
};

// Validate array fields
const validateArray = (field, options = {}) => (req, res, next) => {
    const value = req.body[field];
    if (!value) return next();
    
    let arr = value;
    if (typeof value === 'string') {
        try {
            arr = JSON.parse(value);
        } catch (e) {
            return next(new AppError(`Field '${field}' must be a valid JSON array`, 400, 'INVALID_ARRAY'));
        }
    }
    
    if (!Array.isArray(arr)) {
        return next(new AppError(`Field '${field}' must be an array`, 400, 'INVALID_ARRAY'));
    }
    
    if (options.minLength && arr.length < options.minLength) {
        return next(new AppError(`Field '${field}' must have at least ${options.minLength} items`, 400, 'ARRAY_TOO_SHORT'));
    }
    
    if (options.maxLength && arr.length > options.maxLength) {
        return next(new AppError(`Field '${field}' must have at most ${options.maxLength} items`, 400, 'ARRAY_TOO_LONG'));
    }
    
    req.body[field] = arr;
    next();
};

// Rate limiting helper (simple in-memory, use Redis in production)
const rateLimitStore = new Map();

const rateLimit = (options = {}) => {
    const { windowMs = 60000, max = 100, message = 'Too many requests' } = options;
    
    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }
        
        const record = rateLimitStore.get(key);
        
        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
            return next();
        }
        
        record.count++;
        
        if (record.count > max) {
            return next(new AppError(message, 429, 'RATE_LIMITED'));
        }
        
        next();
    };
};

// Clean up old rate limit records periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore) {
        if (now > record.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 60000);

module.exports = {
    sanitizeInputs,
    sanitizeString,
    sanitizeObject,
    validateObjectId,
    validateRequired,
    validateNumeric,
    validateEmail,
    validatePhone,
    validateEnum,
    validateArray,
    rateLimit
};
