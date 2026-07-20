const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mindmesh_secret_token_key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Authorization token missing.'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired authorization token.'
      });
    }

    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.userName = decoded.name;
    next();
  });
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: `Action forbidden. Requires roles: [${roles.join(', ')}]`
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRoles,
  JWT_SECRET
};
