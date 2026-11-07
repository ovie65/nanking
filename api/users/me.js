import clientPromise from '../utils/db.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the userId from the URL query (e.g., /api/users/me?userId=12345...)
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const client = await clientPromise;
    const db = client.db('nexavault');
    const usersCollection = db.collection('users');

    // Find the user in MongoDB
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Format the data for the frontend (hide sensitive info like passwords)
    const safeUser = {
      ...user,
      id: user._id.toString(),
      _id: undefined,
      password: undefined // Never send the password to the frontend!
    };

    return res.status(200).json(safeUser);

  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}