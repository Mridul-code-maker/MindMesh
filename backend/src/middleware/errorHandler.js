function errorHandler(err, req, res, next) {
  console.error('Unhandled Server Error:', err.stack || err.message);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

module.exports = errorHandler;
