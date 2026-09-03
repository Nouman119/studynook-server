const express = require('express');
const { ObjectId } = require('mongodb');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

module.exports = function(roomsCollection) {

  router.get('/featured-rooms', async (req, res) => {
    try {
      const rooms = await roomsCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

      res.json({ success: true, count: rooms.length, data: rooms });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch featured rooms', error: error.message });
    }
  });

  // GET /api/rooms
  router.get('/', async (req, res) => {
    try {
      const { search, category, amenities, minPrice, maxPrice, sort } = req.query;
      let query = {};

      if (search) {
        query.title = { $regex: search, $options: 'i' };
      }

      if (category && category !== 'All') {
        query.category = category;
      }

      if (amenities) {
        const amenitiesArray = Array.isArray(amenities)
          ? amenities
          : amenities.split(',').map((a) => a.trim()).filter(Boolean);

        if (amenitiesArray.length > 0) {
          query.amenities = { $in: amenitiesArray };
        }
      }

      if (minPrice || maxPrice) {
        query.pricePerHour = {};
        if (minPrice) query.pricePerHour.$gte = Number(minPrice);
        if (maxPrice) query.pricePerHour.$lte = Number(maxPrice);
      }

      let sortOption = { createdAt: -1 };
      if (sort === 'low-high') sortOption = { pricePerHour: 1 };
      if (sort === 'high-low') sortOption = { pricePerHour: -1 };

      const rooms = await roomsCollection.find(query).sort(sortOption).toArray();
      res.json({ success: true, count: rooms.length, data: rooms });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch rooms', error: error.message });
    }
  });

  // GET /api/rooms/my-rooms (Updated to match prefix properly)
  router.get('/my-rooms', verifyToken, async (req, res) => {
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

  // GET /api/rooms/:id
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid room ID format' });
      }
      const room = await roomsCollection.findOne({ _id: new ObjectId(id) });

      if (!room) {
        return res.status(404).json({ success: false, message: 'Study room not found' });
      }

      res.json({ success: true, data: room });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch room details', error: error.message });
    }
  });

  // POST /api/rooms
  router.post('/', verifyToken, async (req, res) => {
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

  // PATCH /api/rooms/:id
  router.patch('/:id', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid room ID format' });
      }
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

  // DELETE /api/rooms/:id
  router.delete('/:id', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid room ID format' });
      }
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

  return router;
};