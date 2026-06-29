const express = require('express');
const { query } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.get(
  '/',
  requireRoles('supervisor'),
  asyncHandler(async (_req, res) => {
    const [
      batchesInProduction,
      batchesByStage,
      readyStock,
      lowMaterials,
      productionByEmployee,
      productionByPeriod
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM production_batches WHERE status <> 'concluido'`),
      query(
        `SELECT current_stage, COUNT(*)::int AS total
         FROM production_batches
         WHERE status <> 'concluido'
         GROUP BY current_stage
         ORDER BY current_stage`
      ),
      query(
        `SELECT COALESCE(SUM(finished_stock_quantity), 0)::numeric AS total
         FROM products
         WHERE status = 'ativo'`
      ),
      query(
        `SELECT id, name, unit, current_stock, minimum_stock
         FROM raw_materials
         WHERE status = 'ativo' AND current_stock <= minimum_stock
         ORDER BY name`
      ),
      query(
        `SELECT e.id, e.name, COALESCE(SUM(ps.quantity_done), 0)::numeric AS quantity_done
         FROM production_steps ps
         JOIN employees e ON e.id = ps.employee_id
         WHERE ps.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY e.id, e.name
         ORDER BY quantity_done DESC
         LIMIT 8`
      ),
      query(
        `SELECT DATE_TRUNC('day', ps.created_at)::date AS day,
                COALESCE(SUM(ps.quantity_done), 0)::numeric AS quantity_done
         FROM production_steps ps
         WHERE ps.created_at >= NOW() - INTERVAL '14 days'
         GROUP BY day
         ORDER BY day`
      )
    ]);

    res.json({
      batchesInProduction: batchesInProduction.rows[0].total,
      batchesByStage: batchesByStage.rows,
      readyStock: readyStock.rows[0].total,
      lowMaterials: lowMaterials.rows,
      productionByEmployee: productionByEmployee.rows,
      productionByPeriod: productionByPeriod.rows
    });
  })
);

module.exports = router;
