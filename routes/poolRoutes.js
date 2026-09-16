const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const Pool = require('../models/Pool');
const Participant = require('../models/Participant');
const Payment = require('../models/Payment');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }
});

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

function roundAmount(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function nameDistance(first, second) {
  const distances = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let previous = distances[0];
    distances[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const current = distances[secondIndex];
      distances[secondIndex] = first[firstIndex - 1] === second[secondIndex - 1]
        ? previous
        : Math.min(previous + 1, distances[secondIndex] + 1, distances[secondIndex - 1] + 1);
      previous = current;
    }
  }
  return distances[second.length];
}

function findMatchingParticipant(name, participants) {
  const normalized = normalizeName(name);
  const exact = participants.find((participant) => normalizeName(participant.name) === normalized);
  if (exact) return { participant: exact, merged: false };

  const possibleMatches = participants.filter((participant) => {
    const candidate = normalizeName(participant.name);
    return normalized.length >= 4 && candidate.length >= 4
      && nameDistance(normalized, candidate) <= 1;
  });
  return possibleMatches.length === 1
    ? { participant: possibleMatches[0], merged: true }
    : { participant: null, merged: false };
}

function parseImportedAmount(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(/,/g, '').replace(/^₹\s*/u, '').replace(/^rs\.?\s*/i, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ''] = normalized.split('.');
  const paise = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function importedRowKey(participantId, amountPaise, note) {
  return `${participantId.toString()}|${amountPaise}|${normalizeName(note)}`;
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

router.post('/:poolId/import', upload.single('file'), async (req, res, next) => {
  try {
    const { poolId } = req.params;
    if (!isValidId(poolId)) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'A CSV file is required' });
    }

    let rows;
    try {
      rows = parse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: `CSV could not be parsed: ${error.message}`
      });
    }

    const participants = await Participant.find({ poolId }).sort({ createdAt: 1 });
    const report = {
      totalRowsProcessed: rows.length,
      importedRows: 0,
      duplicateRowsSkipped: 0,
      mergedNames: [],
      rejectedRows: []
    };
    const seenKeys = new Set();
    const existingImportedKeys = new Set(
      (await Payment.find({ poolId, importKey: { $exists: true } }).select('+importKey').lean())
        .map((payment) => payment.importKey)
    );
    const mergedKeys = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;
      const name = row.name || row.participant || row.participantName;
      const amountValue = row.amount || row.payment || row.contribution;
      const note = row.note || row.description || '';

      if (!String(name || '').trim()) {
        report.rejectedRows.push({ row: rowNumber, reason: 'Missing participant name' });
        continue;
      }
      const amountPaise = parseImportedAmount(amountValue);
      if (amountPaise === null) {
        report.rejectedRows.push({ row: rowNumber, name: String(name).trim(), reason: 'Invalid amount; expected a positive rupee amount' });
        continue;
      }

      let match = findMatchingParticipant(name, participants);
      if (!match.participant) {
        match = { participant: await Participant.create({ name: String(name).trim(), poolId }), merged: false };
        participants.push(match.participant);
      } else if (match.merged) {
        const mergeKey = `${normalizeName(name)}|${match.participant._id.toString()}`;
        if (!mergedKeys.has(mergeKey)) {
          report.mergedNames.push({ originalName: String(name).trim(), matchedParticipant: match.participant.name });
          mergedKeys.add(mergeKey);
        }
      }

      const importKey = importedRowKey(match.participant._id, amountPaise, note);
      if (seenKeys.has(importKey) || existingImportedKeys.has(importKey)) {
        report.duplicateRowsSkipped += 1;
        continue;
      }

      await Payment.create({
        poolId,
        participantId: match.participant._id,
        amount: amountPaise,
        note: String(note).trim() || undefined,
        importKey
      });
      seenKeys.add(importKey);
      existingImportedKeys.add(importKey);
      report.importedRows += 1;
    }

    return res.status(201).json({
      success: true,
      report: {
        ...report,
        mergedNameCount: report.mergedNames.length,
        rejectedRowCount: report.rejectedRows.length
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

router.get('/:poolId/settlements', async (req, res, next) => {
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

    const totalCollectedPaise = payments.reduce((total, payment) => total + payment.amount, 0);
    const collectionStatus = totalCollectedPaise < budgetPaise
      ? 'remaining'
      : totalCollectedPaise === budgetPaise
        ? 'complete'
        : 'surplus';
    const remainingPaise = collectionStatus === 'remaining'
      ? budgetPaise - totalCollectedPaise
      : 0;
    const surplusPaise = collectionStatus === 'surplus'
      ? totalCollectedPaise - budgetPaise
      : 0;
    const settlement = {
      pool: {
        id: pool._id,
        name: pool.name,
        budget: pool.budget,
        currency: pool.currency
      },
      settlementPossible: collectionStatus === 'complete',
      collectionStatus,
      totalCollected: fromPaise(totalCollectedPaise),
      remaining: fromPaise(remainingPaise),
      surplus: fromPaise(surplusPaise),
      transactions: []
    };

    if (collectionStatus !== 'complete') {
      return res.json({ success: true, settlement });
    }

    const debtors = [];
    const creditors = [];
    for (const participant of participants) {
      const totalPaidPaise = paidByParticipant.get(participant._id.toString()) || 0;
      const balancePaise = totalPaidPaise - fairSharePaise;
      if (balancePaise < 0) {
        debtors.push({ participant, amountPaise: -balancePaise });
      } else if (balancePaise > 0) {
        creditors.push({ participant, amountPaise: balancePaise });
      }
    }

    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const amountPaise = Math.min(debtor.amountPaise, creditor.amountPaise);

      if (amountPaise > 0) {
        settlement.transactions.push({
          from: {
            id: debtor.participant._id,
            name: debtor.participant.name
          },
          to: {
            id: creditor.participant._id,
            name: creditor.participant.name
          },
          amount: roundAmount(fromPaise(amountPaise))
        });
      }

      debtor.amountPaise -= amountPaise;
      creditor.amountPaise -= amountPaise;
      if (debtor.amountPaise <= 0.000001) debtorIndex += 1;
      if (creditor.amountPaise <= 0.000001) creditorIndex += 1;
    }

    return res.json({ success: true, settlement });
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