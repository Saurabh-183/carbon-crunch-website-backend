import nodemailer  from 'nodemailer';
import bcrypt  from 'bcrypt';
import jwt  from 'jsonwebtoken';
import User  from '../models/User.js';
import Otp  from '../models/Otp.js';
import posthogClient from '../config/posthog.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendOtp = async (req, res) => {
  try {
    const { firstName, email } = req.body;
    if (!email || !firstName) return res.status(400).json({ error: 'First Name and Email are required' });

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save or update OTP
    await Otp.findOneAndDelete({ email });
    await Otp.create({ email, otp });

    // Send Email with beautiful UI
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Welcome to GHG-Calculator — Your Access Is Ready',
      html: `
        <div style="background-color: #f3f5f8; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; line-height: 1.5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;">
            
            <!-- Header -->
            <div style="background-color: #d65c10ff; padding: 32px 20px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">SustainOS</h1>
              <p style="color: #be8513ff; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin: 8px 0 0 0;">
                GHG Management Platform
              </p>
            </div>
            
            <!-- Body -->
            <div style="padding: 40px;">
              <h2 style="color: #0f172a; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">
                Welcome aboard! 🎉
              </h2>
              
              <p style="font-size: 16px; margin-bottom: 24px; color: #475569;">
                Hi <strong>${firstName}</strong>,<br/><br/>
                Your account has been created on SustainOS. You now have access to explore our sustainability and compliance tools, starting with our GHG Calculator. Here is your verification code:
              </p>
              
              <!-- OTP Box (matching the light green credentials box) -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border: none;">
                  <tr>
                    <td width="35%" style="font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px; padding-bottom: 12px;">Verification Code</td>
                    <td width="65%" style="font-size: 28px; font-weight: 700; color: #0f172a; letter-spacing: 4px; padding-bottom: 12px;">${otp}</td>
                  </tr>
                </table>
              </div>

              <!-- 3 Day Features -->
              <div style="margin-bottom: 32px;">
                <p style="margin-top: 0; font-weight: 600; color: #0f172a; font-size: 16px;">For the next 3 days, you can:</p>
                <ul style="padding-left: 20px; margin-bottom: 8px; color: #475569;">
                  <li style="margin-bottom: 8px;">Calculate your Scope 1 and Scope 2 emissions</li>
                  <li style="margin-bottom: 8px;">Access Scope 3-level calculations for value-chain emissions</li>
                  <li>Explore how SustainOS supports organisation-wide GHG management</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="background-color: #ce7536ff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
                  Sign In to SustainOS &rarr;
                </a>
              </div>
              
              <!-- Security Tip -->
              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-top: 32px; text-align: center;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  🔒 <strong>Security tip:</strong> Keep this verification code private and safe.
                </p>
              </div>

            </div>
          </div>
        </div>
      `,
    });

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

export const verifyOtpAndRegister = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, password, organization, city, otp } = req.body;

    const record = await Otp.findOne({ email });
    if (!record || record.otp !== otp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      firstName,
      lastName,
      phone,
      email,
      password: hashedPassword,
      organization,
      city
    });

    await user.save();
    await Otp.deleteOne({ email });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.status(201).json({
      message: 'Registration successful. Trial started.',
      token,
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        trialStatus: user.trialStatus,
        trialExpiresAt: user.trialExpiresAt
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Send direct email alert for EVERY login attempt
    transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.SECURITY_ALERT_EMAIL_USER ,
      subject: `🚨 Login Attempt Alert: ${email}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #d65c10;">SustainOS Security Alert</h2>
          <p>A user has just attempted to log in to your software.</p>
          <p><strong>Email used:</strong> ${email}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `
    }).catch(err => console.error("Failed to send login alert email:", err));

    const user = await User.findOne({ email });
    
    if (!user) {
      // Fire PostHog event for security monitoring
      if (posthogClient) {
        posthogClient.capture({
          distinctId: email,
          event: 'failed_login_attempt',
          properties: {
            reason: 'user_not_found',
            email: email
          }
        });
      }

      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Check trial expiration
    if (user.trialStatus === 'active' && new Date() > new Date(user.trialExpiresAt)) {
      user.trialStatus = 'expired';
      await user.save();
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        trialStatus: user.trialStatus,
        trialExpiresAt: user.trialExpiresAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
};
