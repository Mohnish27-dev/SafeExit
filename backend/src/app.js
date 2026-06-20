const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const outingRoutes = require('./routes/outingRoutes');
const complaintRoutes = require('./routes/complaintRoutes');

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

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

module.exports = app;
