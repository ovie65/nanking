import clientPromise from './utils/db.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db('nexavault');
  const transactionsCollection = db.collection('transactions');

  // ============ CREATE TRANSACTION (POST) ============
  if (req.method === 'POST') {
    try {
      const { userId, userName, userEmail, amount, method, reason, type, bonus, lockUntil } = req.body;

      const newTxn = {
        userId,
        userName,
        userEmail,
        amount: Number(amount),
        method: method || 'Unknown',
        reason: reason || '',
        type: type || 'funding_request',
        bonus: bonus ? Number(bonus) : 0,
        lockUntil: lockUntil || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        reviewedAt: null
      };

      const result = await transactionsCollection.insertOne(newTxn);
      return res.status(201).json({ 
        message: 'Transaction created successfully', 
        id: result.insertedId.toString() 
      });

    } catch (error) {
      console.error('Create transaction error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ============ FETCH TRANSACTIONS (GET) ============
  if (req.method === 'GET') {
    try {
      const { userId, status } = req.query;
      
      // Build query based on filters
      const query = {};
      if (userId) query.userId = userId;
      if (status) query.status = status;

      // Fetch and sort by newest first
      const txns = await transactionsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      // Convert ObjectId to string for frontend
      const formattedTxns = txns.map(t => ({
        ...t,
        id: t._id.toString(),
        _id: undefined
      }));

      return res.status(200).json(formattedTxns);

    } catch (error) {
      console.error('Fetch transactions error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}