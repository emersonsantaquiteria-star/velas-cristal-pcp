const express = require('express');
const { query } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const httpError = require('../../utils/httpError');

const router = express.Router();

router.get(
  '/',
  requireRoles('supervisor', 'funcionario'),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT id, name, position, barcode, daily_wage, shift_hours, status, created_at, updated_at
       FROM employees
       ORDER BY name`
    );
    res.json(result.rows);
  })
);

router.post(
  '/',
  requireRoles(),
  asyncHandler(async (req, res) => {
    const {
      name,
      position,
      barcode,
      dailyWage = 55,
      shiftHours = 8,
      status = 'ativo'
    } = req.body;
    if (!name || !position) {
      throw httpError(400, 'Informe nome e funcao do funcionario.');
    }

    const result = await query(
      `INSERT INTO employees (name, position, barcode, daily_wage, shift_hours, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, position, barcode, daily_wage, shift_hours, status, created_at, updated_at`,
      [name, position, barcode || null, Number(dailyWage || 0), Number(shiftHours || 8), status]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.patch(
  '/:id',
  requireRoles(),
  asyncHandler(async (req, res) => {
    const { name, position, barcode, dailyWage, shiftHours, status } = req.body;
    const result = await query(
      `UPDATE employees
       SET
         name = COALESCE($1, name),
         position = COALESCE($2, position),
         barcode = COALESCE($3, barcode),
         daily_wage = COALESCE($4, daily_wage),
         shift_hours = COALESCE($5, shift_hours),
         status = COALESCE($6, status)
       WHERE id = $7
       RETURNING id, name, position, barcode, daily_wage, shift_hours, status, created_at, updated_at`,
      [name, position, barcode, dailyWage, shiftHours, status, req.params.id]
    );

    if (result.rowCount === 0) {
      throw httpError(404, 'Funcionario nao encontrado.');
    }

    res.json(result.rows[0]);
  })
);

module.exports = router;
