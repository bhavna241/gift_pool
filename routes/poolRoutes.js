const express = require('express');
const mongoose = require('mongoose');
const Pool = require('../models/Pool');
const Participant = require('../models/Participant');
const Payment = require('../models/Payment');

const router = express.Router();

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toPaise(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const amountPaise = Math.round(amount * 100);
  return Number.isSafeInteger(amountPaise) && amountPaise > 0 ? amountPaise : null;
}

function fromPaise(amountPaise) {
  return amountPaise / 100;
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

router.post('/:poolId/payments', async (req, res, next) => {
  try {
    const { poolId } = req.params;
    const { participantId, amount, note } = req.body;

    if (!isValidId(poolId)) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    if (!isValidId(participantId)) {
      return res.status(400).json({
        success: false,
        error: 'A valid participantId is required'
      });
    }

    const participant = await Participant.findOne({ _id: participantId, poolId });
    if (!participant) {
      return res.status(404).json({
        success: false,
        error: 'Participant not found in pool'
      });
    }

    const amountPaise = toPaise(amount);
    if (amountPaise === null) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a number greater than 0'
      });
    }

    const payment = await Payment.create({
      poolId,
      participantId,
      amount: amountPaise,
      note
    });

    return res.status(201).json({
      success: true,
      payment: {
        ...payment.toObject(),
        amount: fromPaise(payment.amount)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:poolId/summary', async (req, res, next) => {
  try {
    const { poolId } = req.params;
    if (!isValidId(poolId)) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const pool = await Pool.findById(poolId).lean();
    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const participants = await Participant.find({ poolId }).sort({ createdAt: 1 }).lean();
    const payments = await Payment.find({ poolId }).lean();
    const budgetPaise = Math.round(pool.budget * 100);
    const fairSharePaise = participants.length ? budgetPaise / participants.length : 0;
    const paidByParticipant = new Map();

    for (const payment of payments) {
      const participantKey = payment.participantId.toString();
      paidByParticipant.set(
        participantKey,
        (paidByParticipant.get(participantKey) || 0) + payment.amount
      );
    }

    const participantSummaries = participants.map((participant) => {
      const totalPaidPaise = paidByParticipant.get(participant._id.toString()) || 0;
      return {
        id: participant._id,
        name: participant.name,
        totalPaid: fromPaise(totalPaidPaise),
        fairShare: fromPaise(fairSharePaise),
        balance: fromPaise(totalPaidPaise - fairSharePaise)
      };
    });

    const totalCollectedPaise = payments.reduce((total, payment) => total + payment.amount, 0);
    const collectionStatus = totalCollectedPaise < budgetPaise
      ? 'remaining'
      : totalCollectedPaise === budgetPaise
        ? 'complete'
        : 'surplus';

    return res.json({
      success: true,
      summary: {
        poolName: pool.name,
        budget: pool.budget,
        participantCount: participants.length,
        fairShare: fromPaise(fairSharePaise),
        totalCollected: fromPaise(totalCollectedPaise),
        remaining: collectionStatus === 'remaining'
          ? fromPaise(budgetPaise - totalCollectedPaise)
          : 0,
        surplus: collectionStatus === 'surplus'
          ? fromPaise(totalCollectedPaise - budgetPaise)
          : 0,
        collectionStatus,
        participants: participantSummaries
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:poolId/payments/:paymentId', async (req, res, next) => {
  try {
    const { poolId, paymentId } = req.params;
    if (!isValidId(poolId)) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }
    if (!isValidId(paymentId)) {
      return res.status(400).json({ success: false, error: 'Invalid payment ID' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const payment = await Payment.findOneAndDelete({ _id: paymentId, poolId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found in pool'
      });
    }

    return res.json({ success: true, message: 'Payment removed' });
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