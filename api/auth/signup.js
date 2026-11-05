import clientPromise from '../utils/db.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// The email we are allowed to send to during Resend free trial
const TEST_EMAIL = 'scminkofficial5@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone, age, password } = req.body;

    // Basic validation
    if (!name || !email || !phone || !age || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (age < 18) {
      return res.status(400).json({ error: 'You must be 18 or older' });
    }

    const client = await clientPromise;
    const db = client.db('nexavault');
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Create new user document
    const newUser = {
      name,
      email: email.toLowerCase(),
      phone,
      age: parseInt(age),
      password, // Note: In production, hash this with bcrypt! For beta, plain text is okay.
      balance: 0,
      lockedBalance: 0,
      lockedUntil: null,
      bonuses: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const result = await usersCollection.insertOne(newUser);

    // Send Welcome Email via Resend (to the allowed test email)
    try {
      await resend.emails.send({
        from: 'NexaVault <onboarding@resend.dev>', // Resend's default free sender
        to: TEST_EMAIL,
        subject: `🚀 New User Signup: ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #7c5cff;">Welcome to NexaVault!</h2>
            <p>A new user has successfully created an account.</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Age:</strong> ${age}</p>
            </div>
            <p>The user's account is now active and ready to be funded.</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Resend email failed:', emailError);
      // We don't fail the signup if the email fails, we just log it
    }

    // Return success (excluding password)
    const { password: _, ...userWithoutPassword } = newUser;
    
    return res.status(201).json({ 
      message: 'Account created successfully', 
      user: { ...userWithoutPassword, id: result.insertedId.toString() } 
    });

  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}