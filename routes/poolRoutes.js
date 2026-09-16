const express = require('express');
const mongoose = require('mongoose');
const Pool = require('../models/Pool');
const Participant = require('../models/Participant');

const router = express.Router();

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

router.post('/', async (req, res, next) => {
  try {
    const { name, budget, currency } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Pool name is required' });
    }

    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Budget must be a number greater than 0'
      });
    }

    const pool = await Pool.create({ name: name.trim(), budget, currency });
    return res.status(201).json({ success: true, pool });
  } catch (error) {
    return next(error);
  }
});

router.get('/:poolId', async (req, res, next) => {
  try {
    if (!isValidId(req.params.poolId)) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const pool = await Pool.findById(req.params.poolId).lean();
    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const participants = await Participant.find({ poolId: pool._id })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      success: true,
      pool: {
        ...pool,
        fairShare: participants.length ? pool.budget / participants.length : 0,
        participants
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:poolId/participants', async (req, res, next) => {
  try {
    if (!isValidId(req.params.poolId)) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const pool = await Pool.findById(req.params.poolId);
    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Participant name is required'
      });
    }

    const participant = await Participant.create({
      name: name.trim(),
      poolId: pool._id
    });
    return res.status(201).json({ success: true, participant });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:poolId/participants/:participantId', async (req, res, next) => {
  try {
    const { poolId, participantId } = req.params;
    if (!isValidId(poolId) || !isValidId(participantId)) {
      return res.status(404).json({ success: false, error: 'Participant not found in pool' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const participant = await Participant.findOneAndDelete({
      _id: participantId,
      poolId
    });
    if (!participant) {
      return res.status(404).json({
        success: false,
        error: 'Participant not found in pool'
      });
    }

    return res.json({ success: true, message: 'Participant removed' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;