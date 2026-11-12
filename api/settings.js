import clientPromise from '../utils/db.js';

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db('nexavault');
    const settingsCollection = db.collection('settings');

    if (req.method === 'GET') {
      const settings = await settingsCollection.findOne({ type: 'global' });
      if (!settings) {
        return res.status(200).json({ payments: null, siteContent: null });
      }
      return res.status(200).json(settings);
    }

    if (req.method === 'POST') {
      const { payments, siteContent } = req.body;
      
      const result = await settingsCollection.updateOne(
        { type: 'global' },
        { 
          $set: { 
            payments: payments || {}, 
            siteContent: siteContent || {},
            updatedAt: new Date().toISOString()
          } 
        },
        { upsert: true }
      );
      
      return res.status(200).json({ 
        message: 'Settings saved successfully',
        modifiedCount: result.modifiedCount 
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}