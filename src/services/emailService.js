/**
 * emailService.js
 * ─────────────────────────────────────────────────────────────
 * Sends transactional emails via EmailJS (https://www.emailjs.com).
 * EmailJS works entirely from the browser — no backend required.
 *
 * ── Setup (one-time, ~5 minutes) ─────────────────────────────
 * 1. Sign up free at https://www.emailjs.com
 * 2. Add Gmail as an Email Service → copy the Service ID
 * 3. Create an Email Template with these variables:
 *      {{to_name}}   – recipient's full name
 *      {{to_email}}  – recipient's email address
 *      {{role}}      – "Student" or "Mentor"
 *      {{app_url}}   – link to the app
 *    Subject:  You're Approved! Welcome to ReadyUp 2.0 🎉
 *    Body:
 *      Hi {{to_name}},
 *
 *      Great news! Your application to join ReadyUp 2.0 as a {{role}}
 *      has been reviewed and approved by our admin team.
 *
 *      You can now sign in and access your dashboard at:
 *      {{app_url}}
 *
 *      Welcome to the ReadyUp 2.0 community — we're excited to have you!
 *
 *      — The ReadyUp 2.0 Team
 * 4. Copy the Template ID
 * 5. Go to Account → API Keys → copy your Public Key
 * 6. Add to your .env file:
 *      VITE_EMAILJS_SERVICE_ID=your_service_id
 *      VITE_EMAILJS_TEMPLATE_ID=your_template_id
 *      VITE_EMAILJS_PUBLIC_KEY=your_public_key
 * ─────────────────────────────────────────────────────────────
 */

import emailjs from '@emailjs/browser';

const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

const APP_URL = 'https://readyup2-0.vercel.app';

/**
 * Sends a welcome / approval email to a newly approved user.
 *
 * @param {object} params
 * @param {string} params.toEmail  – recipient's email address
 * @param {string} params.toName   – recipient's display name
 * @param {string} params.role     – 'student' | 'mentor'
 * @returns {Promise<void>}
 */
export async function sendApprovalEmail({ toEmail, toName, role }) {
  // Gracefully skip if EmailJS hasn't been configured yet
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn(
      '[emailService] EmailJS env vars not set — skipping approval email.\n' +
      'Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY to your .env file.'
    );
    return;
  }

  if (!toEmail) {
    console.warn('[emailService] No email address available for user — skipping.');
    return;
  }

  const templateParams = {
    user_name:  toName  || 'there',
    user_email: toEmail,
    role:     role === 'mentor' ? 'Mentor' : 'Student',
    app_url:  APP_URL,
  };

  try {
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, { publicKey: PUBLIC_KEY });
    console.info(`[emailService] Approval email sent to ${toEmail} ✓`);
  } catch (err) {
    // Log the error but do NOT re-throw — the approval itself should never fail
    // because of an email delivery issue.
    console.error('[emailService] Failed to send approval email:', err);
  }
}
