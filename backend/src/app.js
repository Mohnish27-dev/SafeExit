const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

// Refuse to boot if required secrets are missing, so failures surface here with
// a clear message instead of as opaque 500s on the first auth/DB request.
const validateEnv = require('./config/validateEnv');
validateEnv();

const authRoutes = require('./routes/authRoutes');
const outingRoutes = require('./routes/outingRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const sosRoutes = require('./routes/sosRoutes');
const scanRoutes = require('./routes/scanRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/outing', outingRoutes);
app.use('/api/complaint', complaintRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/admin', adminRoutes);

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

module.exports = app;