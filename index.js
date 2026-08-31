const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.CLIENT_URL
  ],
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

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized access: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized access: Invalid or expired token' });
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

    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, photoURL, password } = req.body;

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: 'User already exists with this email' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
          name,
          email,
          photoURL,
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
        res.status(500).json({ message: 'Server error during registration', error: error.message });
      }
    });

    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password, isGoogleLogin, name, photoURL } = req.body;
        let user = await usersCollection.findOne({ email });

        if (isGoogleLogin) {
          if (!user) {
            const newUser = {
              name,
              email,
              photoURL,
              isGoogleUser: true,
              createdAt: new Date()
            };
            const result = await usersCollection.insertOne(newUser);
            user = { _id: result.insertedId, name, email, photoURL };
          }
        } else {
          if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
          }

          const isPasswordValid = await bcrypt.compare(password, user.password);
          if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid email or password' });
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
        res.status(500).json({ message: 'Server error during login', error: error.message });
      }
    });

    app.post('/api/auth/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      }).json({ success: true, message: 'Logged out successfully' });
    });

    app.get('/api/auth/me', verifyToken, async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { _id: new ObjectId(req.user.id) },
          { projection: { password: 0 } }
        );
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        res.json({ success: true, user });
      } catch (error) {
        res.status(500).json({ message: 'Failed to authenticate user', error: error.message });
      }
    });

    app.get('/api/rooms', async (req, res) => {
      try {
        const { search, category, sort } = req.query;
        let query = {};

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
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
        res.status(500).json({ message: 'Failed to fetch rooms', error: error.message });
      }
    });

    app.get('/api/rooms/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const room = await roomsCollection.findOne({ _id: new ObjectId(id) });

        if (!room) {
          return res.status(404).json({ message: 'Study room not found' });
        }

        res.json({ success: true, data: room });
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch room details', error: error.message });
      }
    });

    app.post('/api/rooms', verifyToken, async (req, res) => {
      try {
        const { title, description, category, pricePerHour, capacity, amenities, images, location } = req.body;

        const newRoom = {
          title,
          description,
          category,
          pricePerHour: Number(pricePerHour),
          capacity: Number(capacity),
          amenities: amenities || [],
          images: images || [],
          location,
          creatorEmail: req.user.email,
          createdAt: new Date()
        };

        const result = await roomsCollection.insertOne(newRoom);
        res.status(201).json({
          success: true,
          message: 'Study room added successfully',
          insertedId: result.insertedId
        });
      } catch (error) {
        res.status(500).json({ message: 'Failed to add study room', error: error.message });
      }
    });

    app.post('/api/bookings', verifyToken, async (req, res) => {
      try {
        const { roomId, roomTitle, startTime, endTime, totalPrice, date, timeSlot, price } = req.body;

        let newBooking;

        if (date && timeSlot) {
          newBooking = {
            roomId,
            roomTitle,
            userEmail: req.user.email,
            userName: req.body.userName || req.user.email,
            date,
            timeSlot,
            price: Number(price || 0),
            status: 'Pending',
            createdAt: new Date()
          };
        } else {
          const requestedStart = new Date(startTime);
          const requestedEnd = new Date(endTime);

          if (requestedStart >= requestedEnd) {
            return res.status(400).json({ message: 'End time must be after start time' });
          }

          const conflictingBooking = await bookingsCollection.findOne({
            roomId,
            status: 'confirmed',
            $or: [
              {
                startTime: { $lt: requestedEnd },
                endTime: { $gt: requestedStart }
              }
            ]
          });

          if (conflictingBooking) {
            return res.status(409).json({
              message: 'This study room is already booked for the selected time slot. Please choose another time.'
            });
          }

          newBooking = {
            roomId,
            roomTitle,
            userEmail: req.user.email,
            startTime: requestedStart,
            endTime: requestedEnd,
            totalPrice: Number(totalPrice),
            status: 'confirmed',
            createdAt: new Date()
          };
        }

        const result = await bookingsCollection.insertOne(newBooking);
        res.status(201).json({
          success: true,
          message: 'Room booked successfully!',
          bookingId: result.insertedId,
          ...newBooking
        });
      } catch (error) {
        res.status(500).json({ message: 'Failed to create booking', error: error.message });
      }
    });

    app.get('/api/bookings/my-bookings', verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const myBookings = await bookingsCollection
          .find({ userEmail })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({ success: true, count: myBookings.length, data: myBookings });
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch your bookings', error: error.message });
      }
    });

    app.patch('/api/bookings/:id/cancel', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email;

        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
          userEmail
        });

        if (!booking) {
          return res.status(404).json({ message: 'Booking not found or unauthorized' });
        }

        await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'cancelled', cancelledAt: new Date() } }
        );

        res.json({ success: true, message: 'Booking cancelled successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Failed to cancel booking', error: error.message });
      }
    });

    app.get('/', (req, res) => {
      res.send('StudyNook API Server is running smoothly.');
    });

    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);


// নতুন রুম যোগ করার পোস্ট রিকোয়েস্ট (এখানে বসবে)
app.post('/api/rooms', async (req, res) => {
  try {
    const roomData = req.body;
    roomData.createdAt = new Date();

    const result = await roomsCollection.insertOne(roomData);
    res.status(201).json({ success: true, insertedId: result.insertedId, message: 'Room added successfully' });
  } catch (error) {
    console.error('Error adding room:', error);
    res.status(500).json({ success: false, message: 'Failed to add room' });
  }
});



app.listen(port, () => {
  console.log(`StudyNook Server running on port ${port}`);
});