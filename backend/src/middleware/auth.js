const jwt = require('jsonwebtoken');
const env = require('../config/env');
const httpError = require('../utils/httpError');

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(httpError(401, 'Login necessario.'));
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (_error) {
    return next(httpError(401, 'Sessao invalida ou expirada.'));
  }
}

function requireRoles(...roles) {
  return function roleMiddleware(req, _res, next) {
    if (req.user?.role === 'administrador' || roles.includes(req.user?.role)) {
      return next();
    }

    return next(httpError(403, 'Voce nao tem permissao para esta acao.'));
  };
}

module.exports = {
  requireAuth,
  requireRoles
};
