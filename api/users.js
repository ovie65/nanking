import clientPromise from './utils/db.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db('nexavault');
  const usersCollection = db.collection('users');

  // ============ GET ALL USERS ============
  if (req.method === 'GET') {
    try {
      const users = await usersCollection.find({}).toArray();
      
      // Format for frontend (hide passwords and convert IDs)
      const formattedUsers = users.map(u => ({
        ...u,
        id: u._id.toString(),
        _id: undefined,
        password: undefined 
      }));
      
      return res.status(200).json(formattedUsers);
    } catch (error) {
      console.error('Fetch users error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ============ UPDATE USER (Manual Fund / Grant Bonus / Delete) ============
  if (req.method === 'PATCH') {
    try {
      const { userId, action, amount, reason, lockMonths } = req.body;
      
      if (!userId || !action) {
        return res.status(400).json({ error: 'Missing userId or action' });
      }

      const objectId = new ObjectId(userId);

      // Handle Delete
      if (action === 'delete') {
        await usersCollection.deleteOne({ _id: objectId });
        return res.status(200).json({ message: 'User deleted' });
      }

      // Handle Manual Fund (Adds to available balance)
      if (action === 'manual_fund') {
        await usersCollection.updateOne(
          { _id: objectId },
          { $inc: { balance: Number(amount) } }
        );
        return res.status(200).json({ message: 'Funds added successfully' });
      }

      // Handle Grant Bonus
      if (action === 'grant_bonus') {
        const months = Number(lockMonths) || 0;
        const lockUntil = months > 0 
          ? new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString() 
          : null;

        const bonusEntry = {
          id: 'BNS-' + Date.now().toString().slice(-8),
          amount: Number(amount),
          reason: reason || 'Admin Bonus',
          grantedAt: new Date().toISOString(),
          grantedBy: 'ovie65',
          lockedUntil: lockUntil,
          lockMonths: months
        };

        let updateQuery;
        if (months > 0) {
          // Locked bonus: Add to lockedBalance and set lock date
          updateQuery = { 
            $inc: { lockedBalance: Number(amount) },
            $set: { lockedUntil: lockUntil },
            $push: { bonuses: bonusEntry }
          };
        } else {
          // Unlocked bonus: Add to available balance
          updateQuery = { 
            $inc: { balance: Number(amount) },
            $push: { bonuses: bonusEntry }
          };
        }

        await usersCollection.updateOne({ _id: objectId }, updateQuery);
        return res.status(200).json({ message: 'Bonus granted successfully' });
      }

      return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
      console.error('Update user error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}