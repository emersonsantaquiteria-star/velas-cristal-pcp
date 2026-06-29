const express = require('express');
const { query } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const httpError = require('../../utils/httpError');
const { getTimeClockReport } = require('./service');

const router = express.Router();

const EVENT_TYPES = ['entrada', 'inicio_intervalo', 'fim_intervalo', 'saida'];

router.post(
  '/',
  requireRoles('supervisor', 'funcionario'),
  asyncHandler(async (req, res) => {
    const { eventType, employeeId, occurredAt, notes } = req.body;

    if (!EVENT_TYPES.includes(eventType)) {
      throw httpError(400, 'Tipo de ponto invalido.');
    }

    const targetEmployeeId =
      req.user.role === 'funcionario' && req.user.employeeId ? req.user.employeeId : employeeId;

    if (!targetEmployeeId) {
      throw httpError(400, 'Informe o funcionario.');
    }

    const result = await query(
      `INSERT INTO time_clock_records (employee_id, event_type, occurred_at, notes)
       VALUES ($1, $2, COALESCE($3, NOW()), $4)
       RETURNING id, employee_id, event_type, occurred_at, notes`,
      [targetEmployeeId, eventType, occurredAt || null, notes || null]
    );

    res.status(201).json(result.rows[0]);
  })
);

router.get(
  '/records',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const { from, to, employeeId } = req.query;
    const params = [];
    const where = [];

    if (from) {
      params.push(from);
      where.push(`tcr.occurred_at >= $${params.length}`);
    }

    if (to) {
      params.push(to);
      where.push(`tcr.occurred_at <= $${params.length}`);
    }

    if (employeeId) {
      params.push(employeeId);
      where.push(`tcr.employee_id = $${params.length}`);
    }

    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(
      `SELECT tcr.id, tcr.employee_id, e.name AS employee_name, tcr.event_type, tcr.occurred_at, tcr.notes
       FROM time_clock_records tcr
       JOIN employees e ON e.id = tcr.employee_id
       ${sqlWhere}
       ORDER BY tcr.occurred_at DESC`,
      params
    );

    res.json(result.rows);
  })
);

router.get(
  '/report',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const report = await getTimeClockReport(req.query);
    res.json(report);
  })
);

module.exports = router;
