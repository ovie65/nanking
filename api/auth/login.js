import clientPromise from '../utils/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const client = await clientPromise;
    const db = client.db('nexavault');
    const usersCollection = db.collection('users');

    // Find user by email (case-insensitive)
    const user = await usersCollection.findOne({ email: email.toLowerCase() });

    // Check if user exists and password matches
    // Note: For this beta, we are using plain text passwords. 
    // In a real production app, you would use bcrypt to compare hashes.
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Return success (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    
    // Convert ObjectId to string for the frontend
    const finalUser = { ...userWithoutPassword, id: user._id.toString() };

    return res.status(200).json({ 
      message: 'Login successful', 
      user: finalUser 
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}