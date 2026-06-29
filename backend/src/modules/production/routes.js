const express = require('express');
const { query, withTransaction } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const { atualizarEstoqueVhsys } = require('../integrations/vhsysService');
const { PRODUCTION_STAGES, STAGE_IDS } = require('./constants');
const { generateLotNumber } = require('./lotNumber');
const asyncHandler = require('../../utils/asyncHandler');
const httpError = require('../../utils/httpError');

const router = express.Router();

function toNumber(value) {
  return Number(value || 0);
}

router.get('/stages', (_req, res) => {
  res.json(PRODUCTION_STAGES);
});

router.get(
  '/batches',
  requireRoles('supervisor', 'funcionario'),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT pb.id, pb.lot_number, pb.product_id, p.name AS product_name, p.sku AS product_sku,
              pb.planned_quantity, pb.current_stage, pb.status, pb.stocked_quantity,
              pb.started_at, pb.notes, e.name AS responsible_employee_name,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', ps.id,
                    'stage', ps.stage,
                    'employeeName', step_employee.name,
                    'quantityDone', ps.quantity_done,
                    'lossesQuantity', ps.losses_quantity,
                    'startedAt', ps.started_at,
                    'finishedAt', ps.finished_at,
                    'observations', ps.observations
                  )
                  ORDER BY ps.created_at
                ) FILTER (WHERE ps.id IS NOT NULL),
                '[]'
              ) AS steps
       FROM production_batches pb
       JOIN products p ON p.id = pb.product_id
       LEFT JOIN employees e ON e.id = pb.responsible_employee_id
       LEFT JOIN production_steps ps ON ps.production_batch_id = pb.id
       LEFT JOIN employees step_employee ON step_employee.id = ps.employee_id
       GROUP BY pb.id, p.id, e.id
       ORDER BY pb.created_at DESC`
    );

    res.json(result.rows);
  })
);

router.post(
  '/batches',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const {
      productId,
      plannedQuantity,
      rawMaterialsUsed,
      employeeId,
      startedAt,
      notes
    } = req.body;

    if (!productId || toNumber(plannedQuantity) <= 0 || !employeeId) {
      throw httpError(400, 'Informe produto, quantidade planejada e responsavel.');
    }

    if (!Array.isArray(rawMaterialsUsed) || rawMaterialsUsed.length === 0) {
      throw httpError(400, 'Informe a materia-prima utilizada.');
    }

    const batch = await withTransaction(async (client) => {
      const productResult = await client.query('SELECT id FROM products WHERE id = $1 AND status = $2', [
        productId,
        'ativo'
      ]);

      if (productResult.rowCount === 0) {
        throw httpError(404, 'Produto ativo nao encontrado.');
      }

      const lotNumber = await generateLotNumber(client, startedAt ? new Date(startedAt) : new Date());
      const batchResult = await client.query(
        `INSERT INTO production_batches
          (lot_number, product_id, planned_quantity, responsible_employee_id, started_at, notes)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6)
         RETURNING id, lot_number, product_id, planned_quantity, current_stage, status, started_at, notes`,
        [lotNumber, productId, toNumber(plannedQuantity), employeeId, startedAt || null, notes || null]
      );

      for (const item of rawMaterialsUsed) {
        const rawMaterialId = item.rawMaterialId || item.id;
        const quantity = toNumber(item.quantity);

        if (!rawMaterialId || quantity <= 0) {
          continue;
        }

        const materialResult = await client.query(
          `SELECT id, name, current_stock
           FROM raw_materials
           WHERE id = $1 AND status = $2
           FOR UPDATE`,
          [rawMaterialId, 'ativo']
        );

        if (materialResult.rowCount === 0) {
          throw httpError(404, 'Materia-prima ativa nao encontrada.');
        }

        const material = materialResult.rows[0];
        if (Number(material.current_stock) < quantity) {
          throw httpError(400, `Estoque insuficiente de ${material.name}.`);
        }

        await client.query(
          `UPDATE raw_materials
           SET current_stock = current_stock - $1
           WHERE id = $2`,
          [quantity, rawMaterialId]
        );

        await client.query(
          `INSERT INTO raw_material_movements
            (raw_material_id, production_batch_id, movement_type, quantity, reason, created_by_employee_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            rawMaterialId,
            batchResult.rows[0].id,
            'saida',
            quantity,
            'Consumo em producao',
            employeeId,
            `Lote ${lotNumber}`
          ]
        );
      }

      return batchResult.rows[0];
    });

    res.status(201).json(batch);
  })
);

router.post(
  '/steps',
  requireRoles('supervisor', 'funcionario'),
  asyncHandler(async (req, res) => {
    const {
      batchId,
      stage,
      employeeId,
      quantityDone = 0,
      lossesQuantity = 0,
      startedAt,
      finishedAt,
      observations
    } = req.body;

    if (!batchId || !stage || !STAGE_IDS.includes(stage)) {
      throw httpError(400, 'Informe lote e etapa validos.');
    }

    const executionEmployeeId =
      req.user.role === 'funcionario' && req.user.employeeId ? req.user.employeeId : employeeId;

    if (!executionEmployeeId) {
      throw httpError(400, 'Informe o funcionario que executou a etapa.');
    }

    if (toNumber(quantityDone) < 0 || toNumber(lossesQuantity) < 0) {
      throw httpError(400, 'Quantidades nao podem ser negativas.');
    }

    const step = await withTransaction(async (client) => {
      const batchResult = await client.query(
        `SELECT pb.id, pb.lot_number, pb.product_id, pb.status,
                p.name, p.sku, p.units_per_package, p.packages_per_box
         FROM production_batches pb
         JOIN products p ON p.id = pb.product_id
         WHERE pb.id = $1
         FOR UPDATE OF pb`,
        [batchId]
      );

      if (batchResult.rowCount === 0) {
        throw httpError(404, 'Lote nao encontrado.');
      }

      const batch = batchResult.rows[0];
      const stepResult = await client.query(
        `INSERT INTO production_steps
          (production_batch_id, stage, employee_id, quantity_done, losses_quantity, started_at, finished_at, observations)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), COALESCE($7, NOW()), $8)
         RETURNING id, production_batch_id, stage, employee_id, quantity_done, losses_quantity, started_at, finished_at, observations`,
        [
          batchId,
          stage,
          executionEmployeeId,
          toNumber(quantityDone),
          toNumber(lossesQuantity),
          startedAt || null,
          finishedAt || null,
          observations || null
        ]
      );

      const newStatus = stage === 'estocada' ? 'concluido' : 'em_producao';
      await client.query(
        `UPDATE production_batches
         SET current_stage = $1,
             status = $2,
             stocked_quantity = stocked_quantity + $3
         WHERE id = $4`,
        [stage, newStatus, stage === 'estocada' ? toNumber(quantityDone) : 0, batchId]
      );

      if (stage === 'estocada' && toNumber(quantityDone) > 0) {
        const packageQuantity =
          toNumber(quantityDone) / Math.max(toNumber(batch.units_per_package), 1);
        const boxQuantity = packageQuantity / Math.max(toNumber(batch.packages_per_box), 1);

        await client.query(
          `UPDATE products
           SET finished_stock_quantity = finished_stock_quantity + $1,
               finished_stock_package_quantity = finished_stock_package_quantity + $2,
               finished_stock_box_quantity = finished_stock_box_quantity + $3
           WHERE id = $4`,
          [toNumber(quantityDone), packageQuantity, boxQuantity, batch.product_id]
        );

        await client.query(
          `INSERT INTO finished_stock_movements
            (product_id, production_batch_id, movement_type, quantity, package_quantity,
             box_quantity, unit_quantity, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            batch.product_id,
            batchId,
            'entrada',
            toNumber(quantityDone),
            packageQuantity,
            boxQuantity,
            toNumber(quantityDone),
            'Lote finalizado em estocada'
          ]
        );

        await atualizarEstoqueVhsys(
          client,
          { id: batch.product_id, name: batch.name, sku: batch.sku },
          toNumber(quantityDone),
          { productionBatchId: batchId, lotNumber: batch.lot_number }
        );
      }

      return stepResult.rows[0];
    });

    res.status(201).json(step);
  })
);

module.exports = router;
