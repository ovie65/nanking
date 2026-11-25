import clientPromise from '../utils/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;
    console.log('🔍 API: Fetching transactions for userId:', userId);
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId in query' });
    }

    const client = await clientPromise;
    const db = client.db('nexavault');
    const txnsCollection = db.collection('transactions');

    // Query by userId (stored as string from frontend)
    const query = { userId: String(userId) };
    
    const txns = await txnsCollection.find(query).sort({ createdAt: -1 }).limit(100).toArray();
    console.log('✅ API: Found', txns.length, 'transactions');

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
    console.error('❌ CRITICAL ERROR in user-transactions API:', error);
    return res.status(500).json({ error: error.message });
  }
}