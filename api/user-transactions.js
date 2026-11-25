import clientPromise from './utils/db.js';   // <-- FIXED: was '../utils/db.js'

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

    const txns = await txnsCollection
      .find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const safeTxns = txns.map(t => ({
      id: t._id.toString(),
      userId: t.userId,
      type: t.type || 'unknown',
      amount: t.amount || 0,
      status: t.status || 'pending',
      method: t.method || 'unknown',
      reason: t.reason || '',
      date: t.createdAt || t.date || new Date().toISOString()
    }));

    return res.status(200).json(safeTxns);
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    return res.status(500).json({ error: error.message });
  }
}