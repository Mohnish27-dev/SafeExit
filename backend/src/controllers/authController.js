const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { name, email, password, role, studentId, roomNumber, department, year, phoneNumber } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name, email, password, role, studentId, roomNumber, department, year, phoneNumber
    });

    if (user) {
      const token = generateToken(res, user._id);
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        webAuthnRegistered: user.webAuthnRegistered,
        token
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      const token = generateToken(res, user._id);
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        webAuthnRegistered: user.webAuthnRegistered,
        token
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      roomNumber: user.roomNumber,
      department: user.department,
      year: user.year,
      phoneNumber: user.phoneNumber,
      webAuthnRegistered: user.webAuthnRegistered
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Public
const logoutUser = (req, res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: 'Logged out successfully' });
};

// --- WebAuthn Mock Connectors ---
// This aligns with your frontend passkey flow to simulate successful WebAuthn backend
const registerWebAuthn = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.webAuthnRegistered = true;
      await user.save();
      res.json({ message: 'WebAuthn registered successfully', webAuthnRegistered: true });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verifyWebAuthnLogin = async (req, res) => {
  // In a real app, you would verify the WebAuthn signature here.
  // For the frontend mock to work, we'll assume the frontend verified it 
  // and sent the email or user ID of the authenticated user.
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user && user.webAuthnRegistered) {
      const token = generateToken(res, user._id);
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        webAuthnRegistered: user.webAuthnRegistered,
        token
      });
    } else {
      res.status(401).json({ message: 'Biometric verification failed or not registered' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  authUser,
  getUserProfile,
  logoutUser,
  registerWebAuthn,
  verifyWebAuthnLogin
};
