const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

module.exports = function (usersCollection) {

  router.post('/register', async (req, res) => {
    try {
      const { name, email, photoURL, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Missing required registration fields' });
      }

      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'User already exists with this email' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = {
        name,
        email,
        photoURL: photoURL || '',
        password: hashedPassword,
        createdAt: new Date()
      };

      const result = await usersCollection.insertOne(newUser);
      res.status(201).json({
        success: true,
        message: 'Registration successful! Please login.',
        insertedId: result.insertedId
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error during registration', error: error.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { email, password, isGoogleLogin, name, photoURL } = req.body;
      let user = await usersCollection.findOne({ email });

      if (isGoogleLogin) {
        if (!user) {
          const newUser = {
            name: name || 'Google User',
            email,
            photoURL: photoURL || '',
            isGoogleUser: true,
            createdAt: new Date()
          };
          const result = await usersCollection.insertOne(newUser);
          user = { _id: result.insertedId, name: newUser.name, email, photoURL: newUser.photoURL };
        }
      } else {
        if (!user) {
          return res.status(400).json({ success: false, message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(400).json({ success: false, message: 'Invalid email or password' });
        }
      }

      const token = jwt.sign(
        { userId: user._id.toString(), id: user._id.toString(), email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('token', token, cookieOptions).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error during login', error: error.message });
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('token', cookieOptions).json({ success: true, message: 'Logged out successfully' });
  });

  router.get('/me', verifyToken, async (req, res) => {
    try {
      const user = await usersCollection.findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { password: 0 } }
      );
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      res.json({ success: true, user });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to authenticate user', error: error.message });
    }
  });

  return router;
};