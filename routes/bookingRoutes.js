const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');

// POST: Create a new booking
router.post('/', async (req, res) => {
  try {
    const newBooking = new Booking(req.body);
    const savedBooking = await newBooking.save();
    res.status(201).json(savedBooking);
  } catch (error) {
    res.status(500).json({ message: 'Error saving booking', error: error.message });
  }
});

module.exports = router;