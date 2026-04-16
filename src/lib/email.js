/**
 * beaba — lib/email.js
 * Envoi de magic links via Resend.
 * En mode dev (sans RESEND_API_KEY), affiche le lien dans la console.
 */

'use strict';
const { Resend } = require('resend');

const FROM = process.env.RESEND_FROM || 'Beaba <noreply@450ppm.be>';

async function sendMagicLink(email, token, baseUrl) {
  const link = `${baseUrl}/auth/verify?token=${token}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Auth] Magic link pour ${email} :\n  ${link}`);
    return;
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Beaba — Lien de connexion',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1a1a1a;">Connexion a Beaba</h2>
        <p style="color: #555; line-height: 1.6;">
          Cliquez sur le bouton ci-dessous pour vous connecter. Ce lien est valable 15 minutes.
        </p>
        <a href="${link}"
           style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px;
                  border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">
          Se connecter
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">
          Si vous n'avez pas demande ce lien, ignorez cet email.
        </p>
      </div>
    `,
  });

  console.log(`[Auth] Magic link envoye a ${email}`);
}

module.exports = { sendMagicLink };
