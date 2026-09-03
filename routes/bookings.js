const express = require('express');
const { ObjectId } = require('mongodb');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

module.exports = function(bookingsCollection, roomsCollection, usersCollection) {

  router.post('/', verifyToken, async (req, res) => {
    try {
      const { 
        roomId, 
        roomTitle, 
        startTime, 
        endTime, 
        totalPrice, 
        date, 
        rawDate,
        timeSlot, 
        price,
        specialNote
      } = req.body;

      let bookingStart;
      let bookingEnd;
      let finalPrice = Number(totalPrice || price || 0);

      if (startTime && endTime) {
        bookingStart = new Date(startTime);
        bookingEnd = new Date(endTime);
      } else if (date && timeSlot) {
        const parts = timeSlot.split('-');
        if (parts.length === 2) {
          bookingStart = new Date(`${date} ${parts[0].trim()}`);
          bookingEnd = new Date(`${date} ${parts[1].trim()}`);
        } else {
          bookingStart = new Date(date);
          bookingEnd = new Date(new Date(date).getTime() + 60 * 60 * 1000);
        }
      } else {
        return res.status(400).json({ success: false, message: 'Invalid booking date or time details.' });
      }

      if (bookingStart >= bookingEnd) {
        return res.status(400).json({ success: false, message: 'End time must be after start time.' });
      }

      const conflictingBooking = await bookingsCollection.findOne({
        roomId: roomId,
        status: 'confirmed',
        $and: [
          { startTime: { $lte: bookingEnd } },
          { endTime: { $gte: bookingStart } }
        ]
      });

      if (conflictingBooking) {
        return res.status(409).json({
          success: false,
          message: 'This study room is already booked for the selected time slot. Please choose another time.'
        });
      }

      const newBooking = {
        roomId,
        roomTitle,
        userEmail: req.user.email,
        userId: req.user.id,
        userName: req.body.userName || req.user.email,
        date: req.body.date,
        rawDate: rawDate || (date && date.includes('-') ? date : bookingStart.toISOString().split('T')[0]),
        timeSlot: req.body.timeSlot,
        startTime: bookingStart,
        endTime: bookingEnd,
        price: finalPrice,
        totalPrice: finalPrice,
        specialNote: req.body.specialNote || specialNote || '',
        status: 'confirmed',
        createdAt: new Date()
      };

      const result = await bookingsCollection.insertOne(newBooking);

      await roomsCollection.updateOne(
        { _id: new ObjectId(roomId) },
        { $inc: { bookingCount: 1 } }
      );

      await usersCollection.updateOne(
        { _id: new ObjectId(req.user.id) },
        { $push: { bookings: result.insertedId } }
      );

      res.status(201).json({
        success: true,
        message: 'Room booked successfully!',
        bookingId: result.insertedId,
        booking: newBooking
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to create booking', error: error.message });
    }
  });

  router.get('/my-bookings', verifyToken, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const userId = req.user.id;

      const myBookings = await bookingsCollection
        .aggregate([
          {
            $match: {
              $or: [{ userEmail: userEmail }, { userId: userId }]
            }
          },
          {
            $addFields: {
              convertedRoomId: {
                $convert: { input: "$roomId", to: "objectId", onError: null, onNull: null }
              }
            }
          },
          {
            $lookup: {
              from: 'rooms',
              localField: 'convertedRoomId',
              foreignField: '_id',
              as: 'roomDetails'
            }
          },
          {
            $unwind: {
              path: '$roomDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 1,
              roomId: 1,
              roomTitle: { $ifNull: ["$roomTitle", "$roomDetails.title"] },
              roomImage: {
                $ifNull: [
                  "$roomImage",
                  { $ifNull: ["$roomDetails.image", { $arrayElemAt: ["$roomDetails.images", 0] }] }
                ]
              },
              date: 1,
              rawDate: 1,
              timeSlot: 1,
              startTime: 1,
              endTime: 1,
              price: 1,
              totalPrice: 1,
              status: 1,
              specialNote: 1,
              createdAt: 1
            }
          },
          { $sort: { createdAt: -1 } }
        ])
        .toArray();

      res.json({ success: true, count: myBookings.length, data: myBookings });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch your bookings', error: error.message });
    }
  });

  router.patch('/:id/cancel', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.email;
      const userId = req.user.id;

      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
        $or: [{ userEmail }, { userId }]
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found or unauthorized' });
      }

      if (booking.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
      }

      await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'cancelled', cancelledAt: new Date() } }
      );

      await usersCollection.updateOne(
        { $or: [{ email: userEmail }, { _id: new ObjectId(userId) }] },
        { $pull: { bookings: new ObjectId(id) } }
      );

      if (booking.roomId) {
        try {
          await roomsCollection.updateOne(
            { _id: new ObjectId(booking.roomId), bookingCount: { $gt: 0 } },
            { $inc: { bookingCount: -1 } }
          );
        } catch (err) {
          console.error('Room count decrement error:', err);
        }
      }

      res.json({ success: true, message: 'Booking cancelled' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to cancel booking', error: error.message });
    }
  });

  return router;
};