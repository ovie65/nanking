import clientPromise from '../utils/db.js';

export default async function handler(req, res) {
  const client = await clientPromise;
  const db = client.db('nexavault');
  const settingsCollection = db.collection('settings');

  // GET: Load settings from DB
  if (req.method === 'GET') {
    try {
      let settings = await settingsCollection.findOne({ type: 'global' });
      if (!settings) {
        return res.status(200).json({ payments: null, siteContent: null });
      }
      return res.status(200).json(settings);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST: Save settings to DB
  if (req.method === 'POST') {
    try {
      const { payments, siteContent } = req.body;
      
      await settingsCollection.updateOne(
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
      
      return res.status(200).json({ message: 'Settings saved successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}