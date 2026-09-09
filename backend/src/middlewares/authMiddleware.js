const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { UUID_RE } = require('./validateParams');
const { isLegacyId } = require('../utils/legacyIdGrace');

// The projection got shorter, and not by relaxing anything.
//
// It used to have to name -photo -signature -webAuthnCredentials, because a Mongo user
// document CARRIED those: up to 700KB of base64 plus an embedded credential array, on
// every authenticated request, including the students' 15-second dashboard polls. They
// are separate tables now, so leaving them out is the default and no projection can
// accidentally pull them back in. Only the two real columns still need excluding.
const REQ_USER_EXCLUDE = ['password', 'currentChallenge'];

// The token subject is a uuid now. It was a MongoDB ObjectId until cutover, and those
// tokens live 30 more days — so an ObjectId subject is resolved through legacy_id rather
// than rejected, which is what keeps the whole campus from being logged out at once.
// See utils/legacyIdGrace.js; scanController resolves cached QR codes the same way.
//
// Anything that is neither shape resolves to null and gets a 401 without touching the
// database. That matters: findByPk on rubbish does not return empty in Postgres, it raises
// `invalid input syntax for type uuid`, which is a thrown error on every unauthenticated
// probe. Same reasoning as middlewares/validateParams.js.
const resolveTokenUser = (id) => {
  const key = String(id || '').trim();
  const options = { attributes: { exclude: REQ_USER_EXCLUDE } };

  if (UUID_RE.test(key)) return User.findByPk(key, options);
  if (isLegacyId(key)) return User.findOne({ where: { legacyId: key }, ...options });
  return Promise.resolve(null);
};

const protect = async (req, res, next) => {
  let token;

  // Bearer header first: cookies aren't tab-scoped, so cookie-priority would let a second-role login hijack other tabs. Cookie is the fallback for SSE (no custom headers).
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await resolveTokenUser(decoded.id);

      // The token verified but resolved to nobody — deleted staff, a student removed
      // between issuing and use, or a subject in no id format we recognise. Without this
      // the request continued with req.user === null and the first handler to read
      // req.user._id threw a TypeError, which every controller turns into a 500. A 401 is
      // both the honest answer and the one the client already knows how to handle: it
      // clears the session and re-logs in.
      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, account no longer exists' });
      }

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
