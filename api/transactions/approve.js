import clientPromise from '../utils/db.js';
import { ObjectId } from 'mongodb';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
// Remember: During beta, emails only go to your verified email. 
// Later, change this to: txn.userEmail
const TEST_EMAIL = 'scminkofficial5@gmail.com'; 

// Helper to format money for emails
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
          const totalLocked = Number(txn.amount) + Number(txn.bonus || 0);
          updateData = {
            $inc: { lockedBalance: totalLocked },
            $set: { lockedUntil: txn.lockedUntil }
          };
          
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
                  lockedUntil: txn.lockedUntil,
                  lockMonths: 12
                } 
              }
            }
          );
        } else if (txn.type === 'funding_request' || txn.type === 'manual_fund') {
          updateData = { $inc: { balance: Number(txn.amount) } };
        } else if (txn.type === 'asset_purchase') {
          updateData = { $inc: { balance: -Number(txn.amount) } };
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(txn.userId) },
          updateData
        );

        // 4. SEND USER NOTIFICATION EMAIL
        try {
          let emailSubject = '';
          let emailHtml = '';

          if (txn.type === 'funding_request' || txn.type === 'manual_fund') {
            emailSubject = `✅ Payment Confirmed: ${formatMoney(txn.amount)} Added to Your Account`;
            emailHtml = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff; color: #111827;">
                <h2 style="color: #22c55e; margin-top: 0;">Payment Confirmed!</h2>
                <p>Hello ${txn.userName},</p>
                <p>We are pleased to inform you that your funding request has been approved and confirmed by our team.</p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <p style="margin: 0 0 8px 0;"><strong>Amount Added:</strong> $${formatMoney(txn.amount)}</p>
                  <p style="margin: 0;"><strong>Status:</strong> Successfully added to your available balance.</p>
                </div>
                <p>You can now log in to your dashboard and use these funds to explore our investment markets.</p>
                <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Best regards,<br/>The NexaVault Team</p>
              </div>
            `;
          } else if (txn.type === 'asset_purchase') {
            emailSubject = `✅ Purchase Confirmed: $${formatMoney(txn.amount)} Added to Portfolio`;
            emailHtml = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff; color: #111827;">
                <h2 style="color: #22c55e; margin-top: 0;">Purchase Confirmed!</h2>
                <p>Hello ${txn.userName},</p>
                <p>Your purchase request has been successfully processed and confirmed.</p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <p style="margin: 0 0 8px 0;"><strong>Amount Invested:</strong> $${formatMoney(txn.amount)}</p>
                  <p style="margin: 0;"><strong>Status:</strong> Successfully added to your portfolio.</p>
                </div>
                <p>Thank you for investing with NexaVault. Your AI agent is now monitoring this asset.</p>
                <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Best regards,<br/>The NexaVault Team</p>
              </div>
            `;
          } else if (txn.type === 'tesla_investment') {
            emailSubject = `✅ Tesla Investment Confirmed: $${formatMoney(txn.amount)}`;
            emailHtml = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff; color: #111827;">
                <h2 style="color: #e82127; margin-top: 0;">Tesla Program Investment Confirmed!</h2>
                <p>Hello ${txn.userName},</p>
                <p>Welcome to the exclusive Tesla Roadster Investment Program. Your investment has been confirmed.</p>
                <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <p style="margin: 0 0 8px 0;"><strong>Amount Invested:</strong> $${formatMoney(txn.amount)}</p>
                  <p style="margin: 0 0 8px 0;"><strong>Bonus Profit (Locked):</strong> $${formatMoney(txn.bonus || 0)}</p>
                  <p style="margin: 0;"><strong>Lock Period:</strong> 1 Year</p>
                </div>
                <p>Your bonus profit is now locked and will be available for withdrawal after the 1-year period.</p>
                <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">Best regards,<br/>The NexaVault Team</p>
              </div>
            `;
          }

          // Send the email if we generated a subject for this transaction type
          if (emailSubject) {
            await resend.emails.send({
              from: 'NexaVault <onboarding@resend.dev>', 
              to: TEST_EMAIL, // CHANGE THIS TO txn.userEmail WHEN YOU GET YOUR DOMAIN!
              subject: emailSubject,
              html: emailHtml
            });
            console.log(`User notification email sent for ${txn.type}`);
          }
        } catch (emailError) {
          console.error('User notification email failed:', emailError);
          // We don't fail the approval if the email fails, we just log it.
        }
      }
    }

    // 5. Send Admin Notification Email (The one we already had)
    try {
      await resend.emails.send({
        from: 'NexaVault <onboarding@resend.dev>',
        to: TEST_EMAIL,
        subject: `Admin Alert: Transaction ${action === 'approved' ? 'Approved' : 'Rejected'}: ${txn.type}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: ${action === 'approved' ? '#22c55e' : '#ef4444'};">Transaction ${action === 'approved' ? 'Approved' : 'Rejected'}</h2>
            <p>User: ${txn.userName} (${txn.userEmail})</p>
            <p>Amount: $${formatMoney(txn.amount)}</p>
            <p>Type: ${txn.type}</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Admin email failed:', emailError);
    }

    return res.status(200).json({ message: `Transaction ${action} successfully` });

  } catch (error) {
    console.error('Update transaction error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}