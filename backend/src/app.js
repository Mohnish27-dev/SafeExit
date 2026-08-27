const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const validateEnv = require('./config/validateEnv');
validateEnv();

const authRoutes = require('./routes/authRoutes');
const outingRoutes = require('./routes/outingRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const sosRoutes = require('./routes/sosRoutes');
const scanRoutes = require('./routes/scanRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pushRoutes = require('./routes/pushRoutes');
const caretakerRoutes = require('./routes/caretakerRoutes');
const chiefWardenRoutes = require('./routes/chiefWardenRoutes');
const delayNoticeRoutes = require('./routes/delayNoticeRoutes');
const eventRoutes = require('./routes/eventRoutes');
const diagRoutes = require('./routes/diagRoutes');
const { PAGE_HEADERS } = require('./utils/pagination');
const { sseSafeFilter } = require('./middlewares/compressionConfig');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    // No HTML is served from this origin, so a document CSP protects nothing here and
    // its default `img-src 'self'` would only get in the way of the frontend embedding
    // photos served by this API.
    contentSecurityPolicy: false,
    // helmet defaults this to 'same-origin', which blocks the frontend origin from
    // embedding anything this API serves — including GET /api/admin/users/:id/photo.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Opt-in, and off by default, because HSTS is a one-way door: once a browser caches
    // it, that host is HTTPS-only in that browser for a year. On an on-prem deployment
    // reached over plain HTTP, a single accidental HTTPS hit would make the gate station
    // unable to load the app at all. Set ENABLE_HSTS=1 once TLS is actually terminated.
    hsts: process.env.ENABLE_HSTS === '1',
  })
);

app.use(
  compression({
    // SSE must never be compressed — see middlewares/compressionConfig.js for why a
    // gzipped event stream is worse than an uncompressed one.
    filter: sseSafeFilter,
  })
);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  // Without this, the pagination headers are invisible to fetch() cross-origin: the
  // browser receives them and refuses to hand them to JS. A caller could not tell a
  // complete list from a truncated one.
  exposedHeaders: PAGE_HEADERS,
}));

// 2mb covers a base64 face photo on PATCH /auth/profile; controllers cap the photo field itself.
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/outing', outingRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/caretaker', caretakerRoutes);
app.use('/api/chief-warden', chiefWardenRoutes);
app.use('/api/delay', delayNoticeRoutes);
app.use('/api/events', eventRoutes);
// 404s unless DIAG_TOOLS=1. Used to measure what req.ip really is on the deployment
// before re-keying the last IP-keyed limiter; see routes/diagRoutes.js.
app.use('/api/_diag', diagRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Keep these last, and in this order.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
