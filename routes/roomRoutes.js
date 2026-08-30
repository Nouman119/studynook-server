const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

// GET all rooms (with optional limit for homepage)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 0;
    const rooms = await Room.find({}).limit(limit);
    res.status(200).json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// GET single room by ID
router.get('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

module.exports = router;