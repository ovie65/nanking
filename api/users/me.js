import clientPromise from '../utils/db.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const client = await clientPromise;
    const db = client.db('nexavault');
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    let updatedUser = { ...user };
    let daysElapsed = 0;

    // FIX: If no date exists, pretend it was yesterday so math runs once
    let lastUpdate = user.lastProfitUpdate 
      ? new Date(user.lastProfitUpdate) 
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const diffTime = Math.abs(now - lastUpdate);
    daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (daysElapsed >= 1) {
      // 1. Calculate Personal Portfolio Value (Exclude Tesla & AI)
      let personalPortfolioValue = 0;
      if (user.portfolio && user.portfolio.length > 0) {
        user.portfolio.forEach(item => {
          if (item.type !== 'tesla_investment' && item.type !== 'ai_managed') {
            personalPortfolioValue += Number(item.investedAmount || 0);
          }
        });
      }

      // 2. Calculate AI Portfolio Value
      let aiPortfolioValue = Number(user.aiPortfolioBalance || 0);

      let personalNewProfit = 0;
      let aiNewProfit = 0;

      // --- CALCULATE PERSONAL PROFIT ---
      if (personalPortfolioValue > 0) {
        for (let i = 0; i < daysElapsed; i++) {
          const isWin = Math.random() > 0.15;
          let dailyPercent = isWin ? ((Math.random() * 1.3) + 0.2) : (((Math.random() * 0.3) + 0.1) * -1);
          personalNewProfit += personalPortfolioValue * (dailyPercent / 100);
        }
      }

      // --- CALCULATE AI PROFIT (Includes 10% Venture Drip) ---
      if (aiPortfolioValue >= 100) {
        for (let i = 0; i < daysElapsed; i++) {
          const isWin = Math.random() > 0.15;
          let dailyPercent = isWin ? ((Math.random() * 1.3) + 0.2) : (((Math.random() * 0.3) + 0.1) * -1);
          
          // Base trading profit
          let baseProfit = aiPortfolioValue * (dailyPercent / 100);
          
          // 10% of 1% daily venture growth (The "Drip")
          let ventureDrip = (aiPortfolioValue * 0.01 * 0.10); 
          
          aiNewProfit += (baseProfit + ventureDrip);
        }
      }

      // --- SAVE TO DATABASE ---
      const finalPersonalProfit = (Number(user.personalAccumulatedProfit || 0)) + personalNewProfit;
      const finalAiProfit = (Number(user.aiAccumulatedProfit || 0)) + aiNewProfit;

      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { 
          $set: { 
            personalAccumulatedProfit: finalPersonalProfit,
            aiAccumulatedProfit: finalAiProfit,
            lastProfitUpdate: now.toISOString()
          }
        }
      );

      updatedUser.personalAccumulatedProfit = finalPersonalProfit;
      updatedUser.aiAccumulatedProfit = finalAiProfit;
    }

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