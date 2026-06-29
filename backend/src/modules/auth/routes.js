const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { query } = require('../../database/pool');
const { requireAuth } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const httpError = require('../../utils/httpError');

const router = express.Router();

function toPublicUser(user) {
  return {
    id: user.id,
    employeeId: user.employee_id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw httpError(400, 'Informe email e senha.');
    }

    const result = await query(
      `SELECT id, employee_id, name, email, password_hash, role, status
       FROM users
       WHERE email = $1`,
      [String(email).trim().toLowerCase()]
    );

    const user = result.rows[0];
    if (!user || user.status !== 'ativo') {
      throw httpError(401, 'Credenciais invalidas.');
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw httpError(401, 'Credenciais invalidas.');
    }

    const publicUser = toPublicUser(user);
    const token = jwt.sign(publicUser, env.jwtSecret, { expiresIn: '8h' });

    res.json({ user: publicUser, token });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
