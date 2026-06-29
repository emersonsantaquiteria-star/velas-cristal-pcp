const express = require('express');
const { query, withTransaction } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const httpError = require('../../utils/httpError');

const router = express.Router();

router.get(
  '/',
  requireRoles('supervisor'),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT id, name, unit, barcode, unit_cost, current_stock, minimum_stock, status, created_at, updated_at
       FROM raw_materials
       ORDER BY name`
    );
    res.json(result.rows);
  })
);

router.post(
  '/',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const {
      name,
      unit,
      barcode,
      unitCost = 0,
      currentStock = 0,
      minimumStock = 0,
      status = 'ativo'
    } = req.body;
    if (!name || !unit) {
      throw httpError(400, 'Informe nome e unidade de medida.');
    }

    const result = await query(
      `INSERT INTO raw_materials (name, unit, barcode, unit_cost, current_stock, minimum_stock, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, unit, barcode, unit_cost, current_stock, minimum_stock, status, created_at, updated_at`,
      [name, unit, barcode || null, Number(unitCost || 0), Number(currentStock), Number(minimumStock), status]
    );

    res.status(201).json(result.rows[0]);
  })
);

router.patch(
  '/:id',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const { name, unit, barcode, unitCost, minimumStock, status } = req.body;
    const result = await query(
      `UPDATE raw_materials
       SET
         name = COALESCE($1, name),
         unit = COALESCE($2, unit),
         barcode = COALESCE($3, barcode),
         unit_cost = COALESCE($4, unit_cost),
         minimum_stock = COALESCE($5, minimum_stock),
         status = COALESCE($6, status)
       WHERE id = $7
       RETURNING id, name, unit, barcode, unit_cost, current_stock, minimum_stock, status, created_at, updated_at`,
      [name, unit, barcode, unitCost, minimumStock, status, req.params.id]
    );

    if (result.rowCount === 0) {
      throw httpError(404, 'Materia-prima nao encontrada.');
    }

    res.json(result.rows[0]);
  })
);

router.get(
  '/:id/movements',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT rmv.id, rmv.movement_type, rmv.quantity, rmv.reason, rmv.occurred_at, rmv.notes,
              e.name AS employee_name, pb.lot_number
       FROM raw_material_movements rmv
       LEFT JOIN employees e ON e.id = rmv.created_by_employee_id
       LEFT JOIN production_batches pb ON pb.id = rmv.production_batch_id
       WHERE rmv.raw_material_id = $1
       ORDER BY rmv.occurred_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  })
);

router.post(
  '/:id/movements',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const {
      movementType,
      quantity,
      reason = 'Movimento manual',
      employeeId,
      occurredAt,
      notes
    } = req.body;

    if (!['entrada', 'saida', 'ajuste'].includes(movementType)) {
      throw httpError(400, 'Tipo de movimento invalido.');
    }

    if (!Number(quantity) || Number(quantity) <= 0) {
      throw httpError(400, 'Informe uma quantidade maior que zero.');
    }

    const movement = await withTransaction(async (client) => {
      const materialResult = await client.query(
        'SELECT id, current_stock FROM raw_materials WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );

      if (materialResult.rowCount === 0) {
        throw httpError(404, 'Materia-prima nao encontrada.');
      }

      const signedQuantity = movementType === 'saida' ? -Number(quantity) : Number(quantity);
      const newStock =
        movementType === 'ajuste' ? Number(quantity) : Number(materialResult.rows[0].current_stock) + signedQuantity;

      if (newStock < 0) {
        throw httpError(400, 'Estoque insuficiente para esta saida.');
      }

      await client.query('UPDATE raw_materials SET current_stock = $1 WHERE id = $2', [
        newStock,
        req.params.id
      ]);

      const movementResult = await client.query(
        `INSERT INTO raw_material_movements
          (raw_material_id, movement_type, quantity, reason, created_by_employee_id, occurred_at, notes)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7)
         RETURNING id, raw_material_id, movement_type, quantity, reason, occurred_at, notes`,
        [req.params.id, movementType, Number(quantity), reason, employeeId || null, occurredAt || null, notes || null]
      );

      return movementResult.rows[0];
    });

    res.status(201).json(movement);
  })
);

module.exports = router;
