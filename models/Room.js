const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price_per_hour: { type: Number, required: true },
  floor: { type: String, required: true },
  capacity: { type: String, required: true },
  size: { type: String, required: true },
  image: { type: String, required: true },
  amenities: { type: [String], default: [] },
  isAvailable: { type: Boolean, default: true },
  bookingStatus: { type: String, default: 'Available Now' },
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);