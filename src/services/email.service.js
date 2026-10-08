/**
 * Email Service
 * Handles all outgoing emails via Nodemailer (Gmail SMTP)
 */

import nodemailer from "nodemailer";

class EmailService {
  constructor() {
    this.transporter = null;
  }

  /**
   * Lazy-init the transporter so env is loaded first
   */
  _getTransporter() {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: false, // STARTTLS
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
    return this.transporter;
  }

  /**
   * Send an email
   */
  async _send(to, subject, html) {
    try {
      const transport = this._getTransporter();
      const info = await transport.sendMail({
        from: process.env.SMTP_FROM || '"CarbonOS" <sriyanshucc@gmail.com>',
        to,
        subject,
        html,
      });
      console.log(`📧 Email sent to ${to}: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error(`❌ Email failed to ${to}:`, error.message);
      // Don't throw — email failure shouldn't break user creation
    }
  }

  // ─── WELCOME EMAIL ──────────────────────────────────────────────

  async sendWelcomeEmail(user, plainPassword) {
    const loginUrl = `${process.env.FRONTEND_URL || "http://localhost:5174"}/login`;
    const roleName = this._getRoleName(user.role);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background-color:#059669;padding:40px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Carbon<span style="color:#a7f3d0;">OS</span></h1>
      <p style="margin:8px 0 0;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">GHG Management Platform</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Welcome aboard! 🎉</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
        Your <strong style="color:#059669;">${roleName}</strong> account has been created on CarbonOS. Here are your login credentials:
      </p>

      <!-- Credentials Card -->
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:100px;">Username</td>
            <td style="padding:6px 0;color:#111827;font-size:15px;font-weight:600;">${user.username}</td>
          </tr>
          ${
            user.organizationId
              ? `
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Organization ID</td>
            <td style="padding:6px 0;color:#111827;font-size:15px;font-weight:600;">${user.organizationId._id || user.organizationId}</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Password</td>
            <td style="padding:6px 0;color:#111827;font-size:15px;font-weight:700;font-family:monospace;letter-spacing:1px;">${plainPassword}</td>
          </tr>
        </table>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${loginUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;">Sign In to CarbonOS →</a>
      </div>

      <!-- Security Note -->
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
          🔒 <strong>Security tip:</strong> Keep these credentials private and safe
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">© ${new Date().getFullYear()} Carbon Crunch · CarbonOS</p>
    </div>
  </div>
</body>
</html>`;

    return this._send(
      user.email,
      `Welcome to CarbonOS — Your ${roleName} Account`,
      html
    );
  }

  // ─── PASSWORD RESET EMAIL ───────────────────────────────────────

  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5174"}/reset-password?token=${resetToken}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background-color:#1e293b;padding:40px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Carbon<span style="color:#34d399;">OS</span></h1>
      <p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Password Reset</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Reset your password</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
        We received a request to reset the password for <strong>${user.username || user.email}</strong>. Click the button below to set a new password.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${resetUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;">Reset Password →</a>
      </div>

      <!-- Expiry Note -->
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:16px;">
        <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.5;">
          ⏳ This link expires in <strong>30 minutes</strong>. If you didn't request this, you can safely ignore this email.
        </p>
      </div>

      <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
        If the button doesn't work, copy and paste this link:<br>
        <a href="${resetUrl}" style="color:#059669;word-break:break-all;font-size:11px;">${resetUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">© ${new Date().getFullYear()} Carbon Crunch · CarbonOS</p>
    </div>
  </div>
</body>
</html>`;

    return this._send(user.email, "CarbonOS — Reset Your Password", html);
  }

  // ─── HELPDESK QUERY EMAILS ──────────────────────────────────────────────

  async sendQueryAcknowledgementEmail(user, query) {
    const portalUrl = `${process.env.FRONTEND_URL || "http://localhost:5174"}/helpdesk/${query._id}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background-color:#059669;padding:40px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;">Helpdesk Support</h1>
      <p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Query Received</p>
    </div>
    <div style="padding:36px 32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Hello ${user.username},</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
        We have received your support request regarding <strong>${query.title}</strong>. Our experts are currently reviewing it.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:14px;"><strong>Ticket ID:</strong> ${query._id}</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Category:</strong> ${query.category}</p>
        <p style="margin:0;font-size:14px;"><strong>Priority:</strong> ${query.priority}</p>
      </div>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${portalUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:bold;">Track Query Status →</a>
      </div>
    </div>
  </div>
</body>
</html>`;
    return this._send(user.email, `Support Request Received: ${query.title}`, html);
  }

  async sendQueryResponseEmail(user, query, responseMessage) {
    const portalUrl = `${process.env.FRONTEND_URL || "http://localhost:5174"}/helpdesk/${query._id}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background-color:#1e293b;padding:40px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;">Helpdesk Update</h1>
      <p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">New Expert Response</p>
    </div>
    <div style="padding:36px 32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Update on: ${query.title}</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
        An expert has responded to your support request.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="margin:0;color:#065f46;font-size:14px;white-space:pre-wrap;">${responseMessage}</p>
      </div>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${portalUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:bold;">View Full Details & Reply →</a>
      </div>
    </div>
  </div>
</body>
</html>`;
    return this._send(user.email, `Update on Support Request: ${query.title}`, html);
  }

  // ─── HELPERS ────────────────────────────────────────────────────

  _getRoleName(role) {
    const names = {
      GOD_MODE: "God Mode",
      PLATFORM_ADMIN: "Platform Admin",
      HEAD: "Head",
      ORG_ADMIN: "Organization Admin",
      PLANT_ADMIN: "Facility Admin",
      ENERGY_MANAGER: "Energy Manager",
      AUDITOR: "Auditor",
      MAINTAINER: "Maintainer",
    };
    return names[role] || role;
  }

  /**
   * Generate a random password (8 chars: uppercase, lowercase, digit, special)
   */
  generatePassword(length = 10) {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const digits = "23456789";
    const special = "@#$&!";
    const all = upper + lower + digits + special;

    // Guarantee at least one of each type
    let password = "";
    password += upper[Math.floor(Math.random() * upper.length)];
    password += lower[Math.floor(Math.random() * lower.length)];
    password += digits[Math.floor(Math.random() * digits.length)];
    password += special[Math.floor(Math.random() * special.length)];

    for (let i = password.length; i < length; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }
}

export default new EmailService();
