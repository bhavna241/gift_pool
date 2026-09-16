const mongoose = require('mongoose');

const poolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    budget: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pool', poolSchema);