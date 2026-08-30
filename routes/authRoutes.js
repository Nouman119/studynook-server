const express = require('express');
const router = express.Router();
const User = require('../models/User');

// REGISTER API Route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // চেক করা ইউজার ইতিমধ্যে আছে কি না
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    // নতুন ইউজার তৈরি (পাসওয়ার্ড এনক্রিপ্ট বা সাধারণ টেক্সট হিসেবে রাখা, পরবর্তীতে bcrypt যোগ করা যাবে)
    const newUser = new User({
      name,
      email,
      password // চাইলে এখানে bcrypt দিয়ে হ্যাশ করে নিতে পারেন
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// LOGIN API Route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.password !== password) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

module.exports = router;