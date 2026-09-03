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

async function run() {
  try {
    await client.connect();

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

    app.listen(port, () => {
      console.log(`StudyNook Server running on port ${port}`);
    });

  } catch (error) {
    console.error('Database connection error:', error);
  }
}

run().catch(console.dir);