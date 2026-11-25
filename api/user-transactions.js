import clientPromise from '../utils/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const client = await clientPromise;
    const db = client.db('nexavault');
    const txnsCollection = db.collection('transactions');

    // userId is stored as a STRING in transactions (from user.id), so we match directly
    const txns = await txnsCollection
      .find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    // Map to clean objects the frontend expects
    const safeTxns = txns.map(t => ({
      id: t._id.toString(),
      userId: t.userId,
      type: t.type,
      amount: t.amount,
      status: t.status,
      method: t.method,
      reason: t.reason,
      planName: t.planName,
      date: t.createdAt || t.date || new Date().toISOString()
    }));

    return res.status(200).json(safeTxns);
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}