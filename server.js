require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Gift pool API is running'
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI is not set; starting without a database connection.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
}

connectToDatabase();

app.listen(port, () => {
  console.log(`Gift pool API listening on port ${port}`);
});

module.exports = app;