import clientPromise from '../utils/db.js';
import { ObjectId } from 'mongodb';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const TEST_EMAIL = 'scminkofficial5@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transactionId, action } = req.body; // action should be 'approved' or 'rejected'

    if (!transactionId || !['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Invalid transaction ID or action' });
    }

    const client = await clientPromise;
    const db = client.db('nexavault');
    const txnsCollection = db.collection('transactions');
    const usersCollection = db.collection('users');

    // 1. Find the transaction
    const txn = await txnsCollection.findOne({ _id: new ObjectId(transactionId) });
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 2. Update transaction status
    await txnsCollection.updateOne(
      { _id: new ObjectId(transactionId) },
      { $set: { status: action, reviewedAt: new Date().toISOString() } }
    );

    // 3. If approved, update the user's balance in MongoDB
    if (action === 'approved') {
      const user = await usersCollection.findOne({ _id: new ObjectId(txn.userId) });
      
      if (user) {
        let updateData = {};

        if (txn.type === 'tesla_investment') {
          // Tesla: Add investment + bonus to locked balance
          const totalLocked = Number(txn.amount) + Number(txn.bonus || 0);
          updateData = {
            $inc: { lockedBalance: totalLocked },
            $set: { lockedUntil: txn.lockUntil }
          };
          
          // Also add to user's bonus history array
          await usersCollection.updateOne(
            { _id: new ObjectId(txn.userId) },
            { 
              $push: { 
                bonuses: {
                  id: 'BNS-' + Date.now().toString().slice(-8),
                  amount: Number(txn.bonus || 0),
                  reason: 'Tesla Roadster Investment Bonus',
                  grantedAt: new Date().toISOString(),
                  grantedBy: 'admin',
                  lockedUntil: txn.lockUntil,
                  lockMonths: 12
                } 
              }
            }
          );
        } else if (txn.type === 'funding_request' || txn.type === 'manual_fund') {
          // Regular funding: Add to available balance
          updateData = { $inc: { balance: Number(txn.amount) } };
        } else if (txn.type === 'asset_purchase') {
          // Asset purchase: Deduct from available balance
          updateData = { $inc: { balance: -Number(txn.amount) } };
        }

        // Apply the balance update
        await usersCollection.updateOne(
          { _id: new ObjectId(txn.userId) },
          updateData
        );
      }
    }

    // 4. Send Email Notification (to your test email for now)
    try {
      await resend.emails.send({
        from: 'NexaVault <onboarding@resend.dev>',
        to: TEST_EMAIL,
        subject: `Transaction ${action === 'approved' ? 'Approved' : 'Rejected'}: ${txn.type}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: ${action === 'approved' ? '#22c55e' : '#ef4444'};">Transaction ${action === 'approved' ? 'Approved' : 'Rejected'}</h2>
            <p>User: ${txn.userName} (${txn.userEmail})</p>
            <p>Amount: $${Number(txn.amount).toLocaleString()}</p>
            <p>Type: ${txn.type}</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Resend email failed:', emailError);
    }

    return res.status(200).json({ message: `Transaction ${action} successfully` });

  } catch (error) {
    console.error('Update transaction error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}