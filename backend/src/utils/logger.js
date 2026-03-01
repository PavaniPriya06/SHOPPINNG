// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTION LOGGER - Structured Logging for Debugging & Monitoring
// ══════════════════════════════════════════════════════════════════════════════
// Consistent log format with timestamps, levels, and context
// Logs to console (and can be extended to files/services)

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const COLORS = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[36m',  // Cyan
    DEBUG: '\x1b[35m', // Magenta
    RESET: '\x1b[0m'
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.DEBUG;

const formatTimestamp = () => {
    const now = new Date();
    return now.toISOString();
};

const formatMessage = (level, message, data = null) => {
    const timestamp = formatTimestamp();
    const color = COLORS[level] || COLORS.INFO;
    const reset = COLORS.RESET;
    
    let output = `${color}[${timestamp}] [${level}]${reset} ${message}`;
    
    if (data) {
        if (typeof data === 'object') {
            output += ` ${JSON.stringify(data, null, process.env.NODE_ENV === 'development' ? 2 : 0)}`;
        } else {
            output += ` ${data}`;
        }
    }
    
    return output;
};

const log = (level, message, data = null) => {
    if (LOG_LEVELS[level] <= currentLevel) {
        const formattedMessage = formatMessage(level, message, data);
        
        switch (level) {
            case 'ERROR':
                console.error(formattedMessage);
                break;
            case 'WARN':
                console.warn(formattedMessage);
                break;
            default:
                console.log(formattedMessage);
        }
    }
};

// Specific log level functions
const error = (message, data = null) => log('ERROR', message, data);
const warn = (message, data = null) => log('WARN', message, data);
const info = (message, data = null) => log('INFO', message, data);
const debug = (message, data = null) => log('DEBUG', message, data);

// Request logger middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log request start
    debug(`→ ${req.method} ${req.originalUrl}`, {
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent')?.substring(0, 50)
    });
    
    // Log response on finish
    res.on('finish', () => {
        const duration = Date.now() - start;
        const statusColor = res.statusCode >= 400 ? 'WARN' : 'INFO';
        
        log(statusColor, `← ${req.method} ${req.originalUrl} ${res.statusCode}`, {
            duration: `${duration}ms`,
            size: res.get('content-length') || 0
        });
    });
    
    next();
};

// API activity logger for important operations
const logActivity = (action, userId, details = {}) => {
    info(`📝 ${action}`, {
        userId,
        ...details,
        timestamp: formatTimestamp()
    });
};

// Database operation logger
const logDB = (operation, collection, details = {}) => {
    debug(`🗃️ DB: ${operation} on ${collection}`, details);
};

// Performance logger
const logPerformance = (operation, duration, threshold = 1000) => {
    if (duration > threshold) {
        warn(`⚠️ Slow operation: ${operation}`, { duration: `${duration}ms` });
    } else {
        debug(`⏱️ ${operation}`, { duration: `${duration}ms` });
    }
};

module.exports = {
    error,
    warn,
    info,
    debug,
    requestLogger,
    logActivity,
    logDB,
    logPerformance
};
