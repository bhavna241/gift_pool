const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: true
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Participant',
      required: true
    },
    // Amounts are stored as integer paise and exposed as rupees by the API.
    amount: {
      type: Number,
      required: true,
      min: 1
    },
    note: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);