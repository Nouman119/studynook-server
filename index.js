const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.CLIENT_URL
  ].filter(Boolean),
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware to verify JWT token from HttpOnly cookie or Authorization header
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized access: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, message: 'Unauthorized access: Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();

    const db = client.db('studynookDB');
    const usersCollection = db.collection('users');
    const roomsCollection = db.collection('rooms');
    const bookingsCollection = db.collection('bookings');

    // 1. User Registration
    app.post('/api/auth/register', async (req, res) => {
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

    // 2. User Login & Google OAuth handling
    app.post('/api/auth/login', async (req, res) => {
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
          { id: user._id.toString(), email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000
        }).json({
          success: true,
          message: 'Login successful',
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

    // 3. Logout Route
    app.post('/api/auth/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      }).json({ success: true, message: 'Logged out successfully' });
    });

    // 4. Current User Session Check
    app.get('/api/auth/me', verifyToken, async (req, res) => {
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

    // 5. Featured Rooms (MongoDB sort & limit: 6)
    app.get('/api/featured-rooms', async (req, res) => {
      try {
        const rooms = await roomsCollection
          .find({})
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        res.json({ success: true, count: rooms.length, data: rooms });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Failed to fetch featured rooms',
          error: error.message
        });
      }
    });

    // 6. Get All Rooms (with search, category, sort)
    app.get('/api/rooms', async (req, res) => {
      try {
        const { search, category, sort } = req.query;
        let query = {};

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
          ];
        }

        if (category && category !== 'All') {
          query.category = category;
        }

        let sortOption = {};
        if (sort === 'price-asc') sortOption = { pricePerHour: 1 };
        if (sort === 'price-desc') sortOption = { pricePerHour: -1 };

        const rooms = await roomsCollection.find(query).sort(sortOption).toArray();
        res.json({ success: true, count: rooms.length, data: rooms });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch rooms', error: error.message });
      }
    });

    // 7. User's Created Listings (Robust Filter)
    app.get('/api/my-rooms', verifyToken, async (req, res) => {
      try {
        const userId = req.user.id;
        const userEmail = req.user.email;

        const myRooms = await roomsCollection
          .find({
            $or: [
              { owner: userId },
              { ownerEmail: userEmail },
              { creatorEmail: userEmail }
            ]
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({ success: true, count: myRooms.length, data: myRooms });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch your listings', error: error.message });
      }
    });

    // 8. Get Single Room Details
    app.get('/api/rooms/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const room = await roomsCollection.findOne({ _id: new ObjectId(id) });

        if (!room) {
          return res.status(404).json({ success: false, message: 'Study room not found' });
        }

        res.json({ success: true, data: room });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch room details', error: error.message });
      }
    });

    // 9. Create a New Room Listing
    app.post('/api/rooms', verifyToken, async (req, res) => {
      try {
        const { title, description, floor, pricePerHour, capacity, amenities, image, images } = req.body;

        const newRoom = {
          title,
          description,
          floor: floor || '1st Floor',
          pricePerHour: Number(pricePerHour),
          capacity: Number(capacity),
          amenities: Array.isArray(amenities) ? amenities : [],
          image: image || (images?.[0] || ''),
          images: images?.length ? images : (image ? [image] : []),
          owner: req.user.id,
          ownerEmail: req.user.email,
          createdAt: new Date()
        };

        const result = await roomsCollection.insertOne(newRoom);
        res.status(201).json({
          success: true,
          message: 'Room added successfully',
          insertedId: result.insertedId
        });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to add study room', error: error.message });
      }
    });

    // 10. Update Room Listing
    app.patch('/api/rooms/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const userEmail = req.user.email;
        const updatedData = req.body;

        const room = await roomsCollection.findOne({ _id: new ObjectId(id) });
        if (!room) {
          return res.status(404).json({ success: false, message: 'Room not found' });
        }

        if (room.owner !== userId && room.ownerEmail !== userEmail) {
          return res.status(403).json({ success: false, message: 'Unauthorized: You can only edit your own rooms' });
        }

        const updateDoc = {
          $set: {
            title: updatedData.title || room.title,
            description: updatedData.description || room.description,
            floor: updatedData.floor || room.floor,
            pricePerHour: updatedData.pricePerHour ? Number(updatedData.pricePerHour) : room.pricePerHour,
            capacity: updatedData.capacity ? Number(updatedData.capacity) : room.capacity,
            amenities: updatedData.amenities || room.amenities,
            image: updatedData.image || room.image,
            images: updatedData.images || room.images,
            updatedAt: new Date()
          }
        };

        const result = await roomsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
        res.json({ success: true, message: 'Room updated successfully', result });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update room', error: error.message });
      }
    });

    // 11. Delete Room Listing
    app.delete('/api/rooms/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const userEmail = req.user.email;

        const room = await roomsCollection.findOne({ _id: new ObjectId(id) });
        if (!room) {
          return res.status(404).json({ success: false, message: 'Room not found' });
        }

        if (room.owner !== userId && room.ownerEmail !== userEmail) {
          return res.status(403).json({ success: false, message: 'Unauthorized: You can only delete your own rooms' });
        }

        const result = await roomsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ success: true, message: 'Room deleted successfully', result });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete room', error: error.message });
      }
    });

    // 12. Booking Creation
    app.post('/api/bookings', verifyToken, async (req, res) => {
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
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid booking date or time details.' 
          });
        }

        if (bookingStart >= bookingEnd) {
          return res.status(400).json({ 
            success: false, 
            message: 'End time must be after start time.' 
          });
        }

        // Conflict Check
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

        // Increments bookingCount for room
        await roomsCollection.updateOne(
          { _id: new ObjectId(roomId) },
          { $inc: { bookingCount: 1 } }
        );

        res.status(201).json({
          success: true,
          message: 'Room booked successfully!',
          bookingId: result.insertedId,
          booking: newBooking
        });
      } catch (error) {
        console.error('Booking creation error:', error);
        res.status(500).json({ 
          success: false, 
          message: 'Failed to create booking', 
          error: error.message 
        });
      }
    });

    // 13. Get User's Own Bookings (Populated with room details via $lookup)
    app.get('/api/bookings/my-bookings', verifyToken, async (req, res) => {
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
        console.error('Fetch my bookings error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch your bookings', error: error.message });
      }
    });

// 14. Cancel a Booking (Server verifies ownership, updates status, $pull from user, and decrements room bookingCount)
    app.patch('/api/bookings/:id/cancel', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email;
        const userId = req.user.id;

        // ১. ভেরিফিকেশন: বুকিংটি আসলেই এই ইউজারের কি না
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

        // ২. বুকিং স্ট্যাটাস "cancelled" করা
        await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'cancelled', cancelledAt: new Date() } }
        );

        // ৩. Requirement 5.3: Uses $pull to remove the booking ID from the user’s bookings array
        await usersCollection.updateOne(
          { $or: [{ email: userEmail }, { _id: new ObjectId(userId) }] },
          { $pull: { bookings: new ObjectId(id) } }
        );

        // ৪. (Recommended/Optional): রুমের bookingCount ১ কমানো
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
        console.error('Cancel booking error:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel booking', error: error.message });
      }
    });

    // Root check
    app.get('/', (req, res) => {
      res.send('StudyNook API Server is running smoothly.');
    });

    console.log('Successfully connected to MongoDB!');

    app.listen(port, () => {
      console.log(`StudyNook Server running on port ${port}`);
    });

  } catch (error) {
    console.error('Database connection error:', error);
  }
}

run().catch(console.dir);