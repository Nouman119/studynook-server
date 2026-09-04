const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const roomsRoutes = require('./routes/rooms');
const bookingsRoutes = require('./routes/bookings');

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:3000',
  'https://studynook-client-kappa.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

// CORS মিডলওয়্যার ও প্রি-ফ্লাইট হ্যান্ডলার
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
  })
);

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

async function run() {
  try {
    await client.connect();
    console.log('Connected to MongoDB successfully');

    const db = client.db('studynookDB');
    const usersCollection = db.collection('users');
    const roomsCollection = db.collection('rooms');
    const bookingsCollection = db.collection('bookings');

    app.use('/api/auth', authRoutes(usersCollection));
    app.use('/api/rooms', roomsRoutes(roomsCollection));
    app.use('/api/bookings', bookingsRoutes(bookingsCollection, roomsCollection, usersCollection));

    app.get('/', (req, res) => {
      res.send('StudyNook API Server is running smoothly.');
    });

  } catch (error) {
    console.error('Database connection error:', error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`StudyNook Server running on port ${port}`);
});