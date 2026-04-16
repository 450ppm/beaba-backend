/**
 * beaba — lib/jwt.js
 * Helpers JWT pour l'authentification.
 */

'use strict';
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'beaba-dev-secret-change-me';
const EXPIRES_IN = '7d';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function verify(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
