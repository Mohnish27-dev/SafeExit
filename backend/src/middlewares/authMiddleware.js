const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Prefer the Authorization header: it comes from the browser tab's own
  // sessionStorage, so it reflects whichever role is actually logged in on
  // THIS tab. The 'jwt' cookie is shared across every tab of the browser
  // (cookies aren't tab-scoped), so if it took priority, logging into a
  // second role in another tab would silently hijack every other open tab's
  // identity. The cookie is kept only as a fallback for requests that can't
  // attach custom headers, like the warden/guard SSE stream.
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };
