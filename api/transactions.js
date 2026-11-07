import clientPromise from './utils/db.js';

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db('nexavault');
  const txnsCollection = db.collection('transactions');

  // ============ GET ALL TRANSACTIONS ============
  if (req.method === 'GET') {
    try {
      const txns = await txnsCollection.find({}).sort({ createdAt: -1 }).toArray();
      const formattedTxns = txns.map(t => ({
        ...t,
        id: t._id.toString(),
        _id: undefined
      }));
      return res.status(200).json(formattedTxns);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ============ CREATE TRANSACTION (User Request) ============
  if (req.method === 'POST') {
    try {
      const { userId, userName, userEmail, amount, method, reason, type, assetSymbol, assetName, assetPrice, bonus, lockUntil } = req.body;
      
      if (!userId || !amount || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const newTxn = {
        userId,
        userName,
        userEmail,
        amount: Number(amount),
        method: method || 'unknown',
        reason: reason || '',
        type,
        status: 'pending',
        createdAt: new Date().toISOString(),
        // Save asset details if it's a purchase
        assetSymbol: assetSymbol || null,
        assetName: assetName || null,
        assetPrice: assetPrice || null,
        // Save Tesla details if it's Tesla
        bonus: bonus || null,
        lockUntil: lockUntil || null
      };

      const result = await txnsCollection.insertOne(newTxn);
      return res.status(201).json({ message: 'Transaction created', id: result.insertedId });

    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ============ DELETE ALL TRANSACTIONS (Admin Clear) ============
  if (req.method === 'DELETE') {
    try {
      await txnsCollection.deleteMany({});
      return res.status(200).json({ message: 'All transactions deleted' });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}