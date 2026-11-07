import clientPromise from '../utils/db.js';
import { ObjectId } from 'mongodb';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const TEST_EMAIL = 'scminkofficial5@gmail.com'; 
const formatMoney = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transactionId, action } = req.body; 
    if (!transactionId || !['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Invalid transaction ID or action' });
    }

    const client = await clientPromise;
    const db = client.db('nexavault');
    const txnsCollection = db.collection('transactions');
    const usersCollection = db.collection('users');

    const txn = await txnsCollection.findOne({ _id: new ObjectId(transactionId) });
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    await txnsCollection.updateOne(
      { _id: new ObjectId(transactionId) },
      { $set: { status: action, reviewedAt: new Date().toISOString() } }
    );

    if (action === 'approved') {
      const user = await usersCollection.findOne({ _id: new ObjectId(txn.userId) });
      if (user) {
        let updateData = {};

        // 1. AI SUBSCRIPTION FEE ($150 or $1050) -> Unlocks the feature
        if (txn.type === 'ai_subscription') {
          const fee = Number(txn.amount);
          if (user.balance < fee) return res.status(400).json({ error: 'Insufficient funds for subscription' });

          updateData = {
            $inc: { balance: -fee },
            $set: { aiAgentActive: true, aiAgentPlan: txn.planName || '1 Year' }
          };
        } 
        // 2. AI INVESTMENT ALLOCATION -> Moves money to AI Portfolio
        else if (txn.type === 'ai_investment') {
          const investAmount = Number(txn.amount);
          if (user.balance < investAmount) return res.status(400).json({ error: 'Insufficient funds' });

          updateData = {
            $inc: { 
              balance: -investAmount, 
              aiPortfolioBalance: investAmount 
            },
            $push: {
              portfolio: {
                type: 'ai_managed',
                symbol: 'AI-BUNDLE',
                name: 'AI Agent Managed Fund',
                investedAmount: investAmount,
                quantity: 1,
                status: 'active',
                dateAdded: new Date().toISOString()
              }
            }
          };
        } 
        // 3. TESLA INVESTMENT -> Moves money to Locked Balance & Portfolio
        else if (txn.type === 'tesla_investment') {
          const investAmount = Number(txn.amount);
          const bonus = Number(txn.bonus || 0);
          const totalLocked = investAmount + bonus;
          
          if (user.balance < investAmount) return res.status(400).json({ error: 'Insufficient funds' });

          updateData = {
            $inc: { 
              balance: -investAmount, // <--- FIX: Deduct from main balance
              lockedBalance: totalLocked // Add to locked balance
            },
            $set: { lockedUntil: txn.lockedUntil },
            $push: {
              portfolio: {
                type: 'tesla_investment', // <--- FIX: Label as tesla_investment so it shows in Personal Holdings
                symbol: 'TSLA',
                name: 'Tesla Roadster Program',
                investedAmount: investAmount,
                bonusAmount: bonus,
                quantity: 1,
                status: 'locked',
                dateAdded: new Date().toISOString()
              }
            }
          };
        }
        // 4. MANUAL PURCHASE (Stocks/Crypto)
        else if (txn.type === 'asset_purchase') {
          const price = Number(txn.assetPrice || 1); 
          const quantity = Number(txn.amount) / price;
          updateData = { 
            $inc: { balance: -Number(txn.amount) },
            $push: {
              portfolio: {
                type: 'manual', 
                symbol: txn.assetSymbol || 'UNKNOWN', 
                name: txn.assetName || 'Unknown Asset',
                investedAmount: Number(txn.amount), 
                quantity: quantity, 
                status: 'active', 
                dateAdded: new Date().toISOString()
              }
            }
          };
        } 
        // 5. FUNDING
        else if (txn.type === 'funding_request' || txn.type === 'manual_fund') {
          updateData = { $inc: { balance: Number(txn.amount) } };
        }

        await usersCollection.updateOne({ _id: new ObjectId(txn.userId) }, updateData);
      }
    }
    return res.status(200).json({ message: `Transaction ${action} successfully` });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}