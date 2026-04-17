/**
 * beaba — api/auth.js
 * Authentification par magic link.
 */

'use strict';
const { Router } = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { sign } = require('../lib/jwt');
const { sendMagicLink } = require('../lib/email');
const { requireAuth } = require('./middleware');

const router = Router();

// POST /login — envoyer un magic link
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user) return res.status(404).json({ error: 'Email non reconnu' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

  // Le lien pointe vers l'API (backend), pas le frontend
  const apiBase = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}/api`;
  try {
    await sendMagicLink(email, token, apiBase);
  } catch (err) {
    console.error('[Auth] Erreur envoi email :', err.message);
    return res.status(500).json({ error: 'Erreur envoi email' });
  }

  res.json({ ok: true, message: 'Lien envoye' });
});

// GET /verify — verifier le token et creer la session
router.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/login?error=expired');

  const db = getDb();
  const row = db.prepare(`
    SELECT at.*, u.email, u.name, u.role
    FROM auth_tokens at
    JOIN users u ON u.id = at.user_id
    WHERE at.token = ? AND at.used = 0 AND at.expires_at > datetime('now') AND u.active = 1
  `).get(token);

  if (!row) return res.redirect('/login?error=expired');

  db.prepare('UPDATE auth_tokens SET used = 1 WHERE token = ?').run(token);

  const jwt = sign({ id: row.user_id, email: row.email, name: row.name, role: row.role });

  // Cookie cross-domain si COOKIE_DOMAIN defini (ex: .450ppm.be)
  const cookieOpts = {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
  if (process.env.COOKIE_DOMAIN) {
    cookieOpts.domain = process.env.COOKIE_DOMAIN;
    cookieOpts.sameSite = 'none';
    cookieOpts.secure = true;
  } else {
    cookieOpts.sameSite = 'lax';
  }
  res.cookie('beaba_token', jwt, cookieOpts);

  const frontendUrl = process.env.FRONTEND_URL || '';
  res.redirect(`${frontendUrl}/app`);
});

// POST /logout — supprimer le cookie
router.post('/logout', (req, res) => {
  const opts = { path: '/' };
  if (process.env.COOKIE_DOMAIN) {
    opts.domain = process.env.COOKIE_DOMAIN;
    opts.sameSite = 'none';
    opts.secure = true;
  }
  res.clearCookie('beaba_token', opts);
  res.json({ ok: true });
});

// GET /me — utilisateur connecte
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
