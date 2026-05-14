/**
 * beaba — lib/email.js
 * Envoi de magic links via Resend.
 * En mode dev (sans RESEND_API_KEY), affiche le lien dans la console.
 */

'use strict';
const { Resend } = require('resend');

const FROM = process.env.RESEND_FROM || 'Beaba <noreply@450ppm.be>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://beaba.450ppm.be';
const LOGO_URL = process.env.EMAIL_LOGO_URL || `${FRONTEND_URL}/beaba_banner.png`;

function magicLinkHtml(link) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beaba — Connexion</title>
</head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#cbd5e1;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0d0d1a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;background:linear-gradient(180deg,#16161e,#0f0f1a);border:1px solid rgba(255,255,255,0.06);border-radius:18px;overflow:hidden;">
          <!-- Header / logo -->
          <tr>
            <td align="center" style="padding:36px 32px 8px;">
              <img src="${LOGO_URL}" alt="Beaba" width="220" style="display:block;height:auto;max-width:220px;"/>
            </td>
          </tr>
          <!-- Accent bar -->
          <tr>
            <td align="center" style="padding:8px 32px 24px;">
              <div style="width:60px;height:3px;background:linear-gradient(90deg,#f59e0b,#06b6d4);border-radius:2px;margin:0 auto;"></div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:0 36px 8px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#f1f5f9;letter-spacing:0.2px;">Bienvenue sur Beaba</h1>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#cbd5e1;">
                Cliquez sur le bouton ci-dessous pour acceder a votre tableau de bord.
                Ce lien est valable <strong style="color:#fbbf24;">15 minutes</strong> et ne peut etre utilise qu'une seule fois.
              </p>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td align="center" style="padding:8px 32px 8px;">
              <a href="${link}"
                 style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#0d0d1a;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 8px 24px -8px rgba(245,158,11,0.5);">
                Acceder a mon tableau de bord
              </a>
            </td>
          </tr>
          <!-- Fallback link -->
          <tr>
            <td style="padding:18px 36px 8px;">
              <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#06b6d4;word-break:break-all;line-height:1.5;">
                ${link}
              </p>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:24px 36px 8px;">
              <div style="height:1px;background:rgba(255,255,255,0.06);"></div>
            </td>
          </tr>
          <!-- Sub-info -->
          <tr>
            <td style="padding:8px 36px 24px;">
              <p style="margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.55;">
                Beaba est un kit de monitoring developpe avec
                <a href="https://450ppm.be" style="color:#06b6d4;text-decoration:none;">450ppm</a>
                pour rendre visible la consommation et le confort du logement.
              </p>
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.55;">
                Si vous n'avez pas demande ce lien, vous pouvez ignorer cet email — aucune action ne sera entreprise sur votre compte.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:0 32px 28px;">
              <p style="margin:0;font-size:11px;color:#475569;letter-spacing:0.5px;">
                Beaba &middot; comprendre son habitat &middot; <a href="${FRONTEND_URL}" style="color:#475569;text-decoration:none;">beaba.450ppm.be</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function magicLinkText(link) {
  return [
    'Bienvenue sur Beaba',
    '',
    'Pour acceder a votre tableau de bord, ouvrez le lien suivant',
    '(valable 15 minutes, utilisable une seule fois) :',
    '',
    link,
    '',
    'Si vous n\'avez pas demande ce lien, ignorez cet email.',
    '',
    '— Beaba (450ppm.be)',
  ].join('\n');
}

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
    subject: 'Beaba — Votre lien de connexion',
    html: magicLinkHtml(link),
    text: magicLinkText(link),
  });

  console.log(`[Auth] Magic link envoye a ${email}`);
}

module.exports = { sendMagicLink };
