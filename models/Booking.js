const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  roomTitle: { type: String, required: true },
  userEmail: { type: String, required: true },
  userName: { type: String, required: true },
  date: { type: String, required: true },
  timeSlot: { type: String, required: true },
  price: { type: Number, required: true },
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);