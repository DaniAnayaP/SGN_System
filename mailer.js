// Outbound transactional email (client admin credentials, for now) --------
// SiteGround-hosted mailbox, configured entirely via env vars set in
// Railway -- SMTP_PASS in particular is never checked into the repo or
// typed anywhere Claude can see it. No transporter is built at all (every
// send just no-ops to false) until SMTP_HOST/SMTP_USER/SMTP_PASS are all
// set, so a fresh/local checkout with no mail configured keeps working
// exactly as before this file existed.
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS)
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    : null;

// Never throws -- a delivery failure (bad credentials, mailbox down,
// invalid recipient) must never break client creation/activation. Callers
// treat a false return as "fall back to showing the password on screen",
// same as no SMTP being configured at all.
async function sendMail({ to, subject, text }) {
    if (!transporter || !to) return false;
    try {
        await transporter.sendMail({ from: SMTP_USER, to, subject, text });
        return true;
    } catch (err) {
        console.error('sendMail failed:', err.message);
        return false;
    }
}

module.exports = { sendMail };
