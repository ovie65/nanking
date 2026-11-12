import clientPromise from '../utils/db.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const client = await clientPromise;
    const db = client.db('nexavault');
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ==========================================
    // FIXED: Daily Profit Persistence Logic
    // ==========================================
    const now = new Date();
    let updatedUser = { ...user };
    let daysElapsed = 0;

    // FIX: If lastProfitUpdate doesn't exist, we pretend it was 24 hours ago 
    // so the math runs immediately for the first time.
    let lastUpdate = user.lastProfitUpdate 
      ? new Date(user.lastProfitUpdate) 
      : new Date(Date.now() - 24 * 60 * 60 * 1000); 

    const diffTime = Math.abs(now - lastUpdate);
    daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 

    // Only run the math if at least 1 day has passed AND they have investments
    if (daysElapsed >= 1) {
      let eligiblePortfolioValue = 0;

      // 1. Add Manual Stocks/Crypto (Exclude Tesla)
      if (user.portfolio && user.portfolio.length > 0) {
        user.portfolio.forEach(item => {
          if (item.type !== 'tesla_investment') {
            eligiblePortfolioValue += Number(item.investedAmount || 0);
          }
        });
      }

      // 2. Add AI Portfolio if funded
      if (user.aiPortfolioBalance >= 100) {
        eligiblePortfolioValue += Number(user.aiPortfolioBalance);
      }

      if (eligiblePortfolioValue > 0) {
        let totalNewProfit = 0;

        // Simulate the daily roll for each day elapsed
        for (let i = 0; i < daysElapsed; i++) {
          const isWin = Math.random() > 0.15;
          let dailyPercent;
          
          if (isWin) {
            dailyPercent = (Math.random() * 1.3) + 0.2; 
          } else {
            dailyPercent = ((Math.random() * 0.3) + 0.1) * -1; 
          }
          
          totalNewProfit += eligiblePortfolioValue * (dailyPercent / 100);
        }

        // Add the 10% AI Venture Profit drip
        const aiVentureDrip = (eligiblePortfolioValue * 0.01 * 0.10) * daysElapsed;
        
        const finalProfitToAdd = totalNewProfit + aiVentureDrip;

        // Update the user object
        updatedUser.accumulatedProfit = (Number(user.accumulatedProfit || 0)) + finalProfitToAdd;
        updatedUser.lastProfitUpdate = now.toISOString();

        // Save to Database
        await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { 
            $set: { 
              accumulatedProfit: updatedUser.accumulatedProfit,
              lastProfitUpdate: updatedUser.lastProfitUpdate
            }
          }
        );
      }
    }
    // ==========================================

    // Format the data for the frontend
    const safeUser = {
      ...updatedUser,
      id: updatedUser._id.toString(),
      _id: undefined,
      password: undefined
    };

    return res.status(200).json(safeUser);

  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}