// This path is correct because settings.js and utils folder are both inside 'api'
import clientPromise from './utils/db.js'; 

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db('nexavault');
    const settingsCollection = db.collection('settings');

    // 1. HANDLE GET REQUEST (Loading settings)
    if (req.method === 'GET') {
      const settings = await settingsCollection.findOne({ type: 'global' });
      
      // If no settings exist yet, return empty structure
      if (!settings) {
        return res.status(200).json({ payments: null, siteContent: null, siteName: 'NexaVault' });
      }
      
      // Ensure siteName has a default if missing
      if (!settings.siteName) settings.siteName = 'NexaVault';
      
      return res.status(200).json(settings);
    }

    // 2. HANDLE POST REQUEST (Saving settings)
    if (req.method === 'POST') {
      const { payments, siteContent, siteName } = req.body;
      
      // Save to database (create if doesn't exist)
      await settingsCollection.updateOne(
        { type: 'global' },
        { 
          $set: { 
            payments: payments, 
            siteContent: siteContent,
            siteName: siteName || 'NexaVault',
            updatedAt: new Date().toISOString()
          } 
        },
        { upsert: true }
      );
      
      return res.status(200).json({ message: 'Settings saved successfully' });
    }

    // 3. HANDLE OTHER METHODS
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error("SETTINGS API ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}