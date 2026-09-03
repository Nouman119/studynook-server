const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized access: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, message: 'Unauthorized access: Invalid or expired token' });
    }
    const resolvedId = decoded.userId || decoded.id;
    req.user = {
      id: resolvedId,
      userId: resolvedId,
      email: decoded.email
    };
    next();
  });
};

module.exports = verifyToken;