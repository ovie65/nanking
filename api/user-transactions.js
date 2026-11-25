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

    // Find transactions for this specific user, sorted by newest first
    const txns = await txnsCollection.find({ userId: userId }).sort({ createdAt: -1 }).toArray();

    // Format them for the frontend
    const formattedTxns = txns.map(t => ({
      id: t._id.toString(),
      type: t.type,
      amount: t.amount,
      status: t.status,
      date: t.createdAt,
      method: t.method,
      reason: t.reason
    }));

    return res.status(200).json(formattedTxns);
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}