const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();

// Import database config (production-grade)
const { connectDB, disconnectDB, getDBHealth } = require('./config/database');

// Import middleware
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sanitizeInputs, rateLimit } = require('./middleware/validation');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const upiRoutes = require('./routes/upi');
const settingsRoutes = require('./routes/settings');
const adminExportRoutes = require('./routes/adminExport');

// Import passport config
require('./config/passport');

const app = express();
const PORT = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════════════════
// KEEP SERVER STABLE - Prevent crashes from unhandled errors
// ═══════════════════════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
    logger.error('❌ Uncaught Exception (server continues)', { error: err.message, stack: err.stack });
    // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection (server continues)', { reason: String(reason) });
    // Don't exit - keep server running
});

// Graceful shutdown with proper cleanup
const gracefulShutdown = async (signal) => {
    logger.info(`📴 ${signal} received. Starting graceful shutdown...`);
    
    // Close server to stop accepting new connections
    if (global.server) {
        logger.info('Closing HTTP server...');
        global.server.close();
    }
    
    // Close database connection
    await disconnectDB();
    
    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Middleware
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile apps, UPI deep links, Postman, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:5000',
            process.env.CLIENT_URL
        ].filter(Boolean);
        
        // Allow any Vercel or Render domain, or localhost for dev
        if (origin.includes('vercel.app') || 
            origin.includes('onrender.com') || 
            origin.includes('localhost') ||
            allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        // Allow all origins in production for mobile browser compatibility
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 hours - cache preflight responses
}));

// Handle preflight requests explicitly for mobile browsers
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security & validation middleware
app.use(sanitizeInputs);                          // Sanitize all inputs
app.use(logger.requestLogger);                   // Log all requests

// Rate limiting - prevent abuse
app.use('/api/auth', rateLimit({ windowMs: 60000, max: 30, message: 'Too many auth requests' }));
app.use('/api/payment', rateLimit({ windowMs: 60000, max: 20, message: 'Too many payment requests' }));

app.use(session({
    secret: process.env.JWT_SECRET || 'tcs_session_secret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Static files (product images)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/upi', upiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin/export', adminExportRoutes);

// Health check with comprehensive MongoDB status
app.get('/api/health', (req, res) => {
    const dbHealth = getDBHealth();
    res.json({ 
        status: 'TCS Backend Running!', 
        time: new Date(),
        environment: process.env.NODE_ENV || 'development',
        database: {
            status: dbHealth.state,
            connected: dbHealth.connected,
            host: dbHealth.host,
            name: dbHealth.database
        },
        uptime: Math.floor(process.uptime()) + 's',
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// INITIALIZE DATABASE AND SEED ADMIN
// Uses production-grade MongoDB Atlas connection from config/database.js
// NO in-memory fallback - data persistence is MANDATORY
// ═══════════════════════════════════════════════════════════════════
const initializeDatabase = async () => {
    const connected = await connectDB();
    
    if (!connected) {
        logger.warn('Database not connected - some features will be unavailable');
        return;
    }
    
    // Seed admin user
    try {
        const User = require('./models/User');
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@tcs.com';
        const existing = await User.findOne({ email: adminEmail, isDeleted: { $ne: true } });
        if (!existing) {
            await User.create({
                name: 'TCS Admin',
                email: adminEmail,
                password: process.env.ADMIN_PASSWORD || 'Admin@123',
                role: 'admin'
            });
            logger.info(`Admin seeded: ${adminEmail}`);
        } else {
            logger.info(`Admin exists: ${adminEmail}`);
        }
    } catch (seedErr) {
        logger.warn('Could not seed admin:', { error: seedErr.message });
    }
};

initializeDatabase();

// Serve frontend static files (both development and production)
const frontendPath = path.join(__dirname, '../../frontend/dist');
try {
    app.use(express.static(frontendPath));
    
    // Handle React routing - serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
        if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
            res.sendFile(path.join(frontendPath, 'index.html'));
        } else {
            next();
        }
    });
    logger.info('Frontend dist folder served from:', frontendPath);
} catch (err) {
    logger.warn('Frontend dist not found. Run "npm run build" in frontend folder first.');
}

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLING - Must be AFTER all routes
// ═══════════════════════════════════════════════════════════════════
app.use(notFoundHandler);     // Handle 404 for undefined API routes
app.use(globalErrorHandler);  // Catch all errors and send proper response

// ═══════════════════════════════════════════════════════════════════
// START SERVER WITH ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════
const HOST = '0.0.0.0'; // Listen on all network interfaces for mobile access
const server = app.listen(PORT, HOST, () => {
    logger.info('═══════════════════════════════════════════════════════════════════');
    logger.info(`🚀 TCS Server running on http://localhost:${PORT}`);
    logger.info(`📱 Network: http://<your-ip>:${PORT} (for mobile testing)`);
    logger.info(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`♻️ Auto-reconnect enabled - server will stay connected`);
    logger.info(`💾 Data persistence: MongoDB Atlas (production-grade)`);
    logger.info('═══════════════════════════════════════════════════════════════════');
});

// Store server reference for graceful shutdown
global.server = server;

// Keep server alive - prevent idle timeout (especially on Render/Heroku)
server.keepAliveTimeout = 65000;  // 65 seconds
server.headersTimeout = 66000;   // Slightly more than keepAliveTimeout

// Handle server errors without crashing
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} already in use. Server running elsewhere?`);
    } else {
        logger.error('Server error', { error: err.message });
    }
});
