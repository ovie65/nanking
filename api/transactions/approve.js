import clientPromise from '../utils/db.js';
import { ObjectId } from 'mongodb';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const TEST_EMAIL = 'scminkofficial5@gmail.com'; 
const formatMoney = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Beta AI Agent Crypto List
const AI_BETA_CRYPTOS = [
  { symbol: 'BTC', name: 'Bitcoin', price: 67000 },
  { symbol: 'ETH', name: 'Ethereum', price: 3500 },
  { symbol: 'SOL', name: 'Solana', price: 170 },
  { symbol: 'ADA', name: 'Cardano', price: 0.65 },
  { symbol: 'DOT', name: 'Polkadot', price: 8.50 },
  { symbol: 'LINK', name: 'Chainlink', price: 18.00 },
  { symbol: 'AVAX', name: 'Avalanche', price: 40.00 }
];

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

        if (txn.type === 'tesla_investment') {
          const totalLocked = Number(txn.amount) + Number(txn.bonus || 0);
          updateData = {
            $inc: { lockedBalance: totalLocked },
            $set: { lockedUntil: txn.lockedUntil },
            $push: { 
              portfolio: {
                type: 'ai_managed', symbol: 'TSLA-BONUS', name: 'Tesla Roadster Program',
                investedAmount: Number(txn.amount), quantity: 1, status: 'locked', dateAdded: new Date().toISOString()
              }
            }
          };
        } else if (txn.type === 'funding_request' || txn.type === 'manual_fund') {
          updateData = { $inc: { balance: Number(txn.amount) } };
        } else if (txn.type === 'asset_purchase') {
          // Calculate exact quantity of crypto/stock bought
          const price = Number(txn.assetPrice || 1); 
          const quantity = Number(txn.amount) / price;
          
          updateData = { 
            $inc: { balance: -Number(txn.amount) },
            $push: {
              portfolio: {
                type: 'manual', symbol: txn.assetSymbol || 'UNKNOWN', name: txn.assetName || 'Unknown Asset',
                investedAmount: Number(txn.amount), quantity: quantity, status: 'active', dateAdded: new Date().toISOString()
              }
            }
          };
        } else if (txn.type === 'ai_subscription') {
          // 1. Activate AI Agent
          updateData.$set = { aiAgentActive: true, aiAgentPlan: txn.planName || '1 Year' };
          
          // 2. Auto-assign 7 random cryptos for Beta
          const aiHoldings = AI_BETA_CRYPTOS.map(coin => {
            const investAmount = 1000; // Beta dummy amount per coin
            return {
              type: 'ai_managed',
              symbol: coin.symbol,
              name: coin.name,
              investedAmount: investAmount,
              quantity: investAmount / coin.price,
              status: 'active',
              dateAdded: new Date().toISOString()
            };
          });
          updateData.$push = { portfolio: { $each: aiHoldings } };
        }

        await usersCollection.updateOne({ _id: new ObjectId(txn.userId) }, updateData);

        // Send Email
        try {
          let emailSubject = '';
          let emailHtml = '';
          if (txn.type === 'funding_request') {
            emailSubject = `✅ Payment Confirmed: ${formatMoney(txn.amount)} Added`;
            emailHtml = `<div style="font-family: sans-serif; padding: 20px;"><h2 style="color: #22c55e;">Payment Confirmed!</h2><p>Hello ${txn.userName}, $${formatMoney(txn.amount)} has been added to your balance.</p></div>`;
          } else if (txn.type === 'asset_purchase') {
            emailSubject = `✅ Purchase Confirmed: ${txn.assetName}`;
            emailHtml = `<div style="font-family: sans-serif; padding: 20px;"><h2 style="color: #22c55e;">Purchase Confirmed!</h2><p>Hello ${txn.userName}, you successfully bought ${txn.assetName}.</p></div>`;
          } else if (txn.type === 'ai_subscription') {
            emailSubject = `🤖 AI Agent Activated!`;
            emailHtml = `<div style="font-family: sans-serif; padding: 20px;"><h2 style="color: #7c5cff;">Welcome to AI Full Control!</h2><p>Hello ${txn.userName}, your AI Agent is now managing your portfolio.</p></div>`;
          }

          if (emailSubject) {
            await resend.emails.send({ from: 'NexaVault <onboarding@resend.dev>', to: TEST_EMAIL, subject: emailSubject, html: emailHtml });
          }
        } catch (e) { console.error('Email failed:', e); }
      }
    }
    return res.status(200).json({ message: `Transaction ${action} successfully` });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}