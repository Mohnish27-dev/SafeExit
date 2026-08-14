const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const validateEnv = require('./config/validateEnv');
validateEnv();

const authRoutes = require('./routes/authRoutes');
const outingRoutes = require('./routes/outingRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const sosRoutes = require('./routes/sosRoutes');
const scanRoutes = require('./routes/scanRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pushRoutes = require('./routes/pushRoutes');
const caretakerRoutes = require('./routes/caretakerRoutes');
const chiefWardenRoutes = require('./routes/chiefWardenRoutes');
const delayNoticeRoutes = require('./routes/delayNoticeRoutes');
const eventRoutes = require('./routes/eventRoutes');

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// 2mb covers a base64 face photo on PATCH /auth/profile; controllers cap the photo field itself.
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/outing', outingRoutes);
app.use('/api/complaint', complaintRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/caretaker', caretakerRoutes);
app.use('/api/chief-warden', chiefWardenRoutes);
app.use('/api/delay', delayNoticeRoutes);
app.use('/api/events', eventRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

module.exports = app;
