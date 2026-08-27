const express = require('express');
const router = express.Router();

// Commissioning-only diagnostics. Mirrors the SCANNER_TOOLS convention used by the
// frontend's /scanner-check page: the routes simply do not exist unless the flag is on,
// so nothing has to be un-deployed afterwards.
//
// WHY THIS EXISTS: the rate limiters in middlewares/rateLimit.js had to be re-keyed off IP
// because it is not knowable from this repo what req.ip resolves to in the real
// deployment. The Next rewrite does not set X-Forwarded-For, so any XFF must come from a
// host nginx that this repo carries no config for. Before anyone re-keys the remaining
// IP-keyed limiter (authLimiter on login), hit this from a student device on the real
// deployment, over the same path the app uses (/api/backend/_diag/ip), and compare:
//
//   * different students on campus wifi -> DIFFERENT ip  => XFF works, IP keying is viable
//   * every student -> the SAME ip                       => XFF is missing or NAT collapses
//                                                           them; IP keying locks out campus
//
// If they collapse, either fix the nginx hop (proxy_set_header X-Forwarded-For) or leave
// login's limiter as the coarse backstop it is and raise its ceiling.
const enabled = () => process.env.DIAG_TOOLS === '1';

router.use((req, res, next) => {
  if (!enabled()) return res.status(404).json({ message: 'Not found' });
  next();
});

// GET /api/_diag/ip — what this backend actually believes about the caller.
router.get('/ip', (req, res) => {
  res.json({
    // What express-rate-limit's default key generator would use.
    ip: req.ip,
    // Populated only when 'trust proxy' is on AND a proxy actually set XFF.
    ips: req.ips,
    trustProxy: req.app.get('trust proxy'),
    // The raw hop chain. null here with a non-null req.ip means nothing upstream set it,
    // so req.ip is just the last hop -- the Next container, not the student.
    xForwardedFor: req.headers['x-forwarded-for'] ?? null,
    // The Next rewrite sets this one and only this one, which is how we know it proxies
    // without identifying the client.
    xForwardedHost: req.headers['x-forwarded-host'] ?? null,
    xRealIp: req.headers['x-real-ip'] ?? null,
    // Unaffected by 'trust proxy' — always the socket peer.
    socketRemoteAddress: req.socket?.remoteAddress ?? null,
  });
});

module.exports = router;
