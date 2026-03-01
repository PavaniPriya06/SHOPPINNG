// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER - Production-Ready Error Management
// ══════════════════════════════════════════════════════════════════════════════
// This middleware catches ALL errors and sends consistent JSON responses
// Server NEVER crashes - errors are logged and handled gracefully

const logger = require('../utils/logger');

// Custom error class for operational errors
class AppError extends Error {
    constructor(message, statusCode, errorCode = 'ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = true;
        this.timestamp = new Date().toISOString();
        Error.captureStackTrace(this, this.constructor);
    }
}

// MongoDB duplicate key error handler
const handleDuplicateKeyError = (err) => {
    const field = Object.keys(err.keyValue)[0];
    return new AppError(
        `Duplicate value for field: ${field}. Please use a different value.`,
        400,
        'DUPLICATE_KEY'
    );
};

// MongoDB validation error handler
const handleValidationError = (err) => {
    const errors = Object.values(err.errors).map(el => el.message);
    return new AppError(
        `Validation failed: ${errors.join('. ')}`,
        400,
        'VALIDATION_ERROR'
    );
};

// MongoDB cast error (invalid ObjectId)
const handleCastError = (err) => {
    return new AppError(
        `Invalid ${err.path}: ${err.value}`,
        400,
        'INVALID_ID'
    );
};

// JWT errors
const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401, 'INVALID_TOKEN');
const handleJWTExpiredError = () => new AppError('Token expired. Please log in again.', 401, 'TOKEN_EXPIRED');

// Multer (file upload) errors
const handleMulterError = (err) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return new AppError('File too large. Maximum size is 5MB.', 400, 'FILE_TOO_LARGE');
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
        return new AppError('Too many files. Maximum is 8 files.', 400, 'TOO_MANY_FILES');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return new AppError('Unexpected file field.', 400, 'UNEXPECTED_FILE');
    }
    return new AppError('File upload error.', 400, 'UPLOAD_ERROR');
};

// Send detailed error in development
const sendErrorDev = (err, req, res) => {
    logger.error('DEV ERROR', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method
    });
    
    res.status(err.statusCode || 500).json({
        success: false,
        error: err,
        errorCode: err.errorCode || 'ERROR',
        message: err.message,
        stack: err.stack
    });
};

// Send minimal error in production
const sendErrorProd = (err, req, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        logger.warn('Operational Error', {
            errorCode: err.errorCode,
            message: err.message,
            url: req.originalUrl
        });
        
        res.status(err.statusCode).json({
            success: false,
            errorCode: err.errorCode,
            message: err.message
        });
    } else {
        // Programming or unknown error: don't leak details
        logger.error('CRITICAL ERROR', {
            error: err.message,
            stack: err.stack,
            url: req.originalUrl
        });
        
        res.status(500).json({
            success: false,
            errorCode: 'INTERNAL_ERROR',
            message: 'Something went wrong. Please try again later.'
        });
    }
};

// Main error handling middleware
const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    
    // Clone error for processing
    let error = { ...err, message: err.message, name: err.name };
    
    // Handle specific error types
    if (err.code === 11000) error = handleDuplicateKeyError(err);
    if (err.name === 'ValidationError') error = handleValidationError(err);
    if (err.name === 'CastError') error = handleCastError(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
    if (err.name === 'MulterError') error = handleMulterError(err);
    
    // Send response based on environment
    if (process.env.NODE_ENV === 'production') {
        sendErrorProd(error, req, res);
    } else {
        sendErrorDev(err, req, res);
    }
};

// Async wrapper to catch errors in async route handlers
const catchAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
    const err = new AppError(`Route ${req.originalUrl} not found`, 404, 'NOT_FOUND');
    next(err);
};

module.exports = {
    AppError,
    globalErrorHandler,
    catchAsync,
    notFoundHandler
};
