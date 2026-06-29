const express = require('express');
const { query } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.get(
  '/summary',
  requireRoles('supervisor', 'funcionario', 'comercial'),
  asyncHandler(async (req, res) => {
    const products = await query(
      `SELECT id, name, sku, color, unit, units_per_package, packages_per_box,
              finished_stock_quantity, finished_stock_package_quantity, finished_stock_box_quantity
       FROM products
       WHERE status = 'ativo'
       ORDER BY name`
    );

    if (req.user.role === 'comercial') {
      return res.json({
        saleableProducts: products.rows.filter((product) => Number(product.finished_stock_quantity) > 0)
      });
    }

    const rawMaterials = await query(
      `SELECT id, name, unit, unit_cost, current_stock, minimum_stock,
              current_stock <= minimum_stock AS below_minimum
       FROM raw_materials
       WHERE status = 'ativo'
       ORDER BY name`
    );

    const batches = await query(
      `SELECT pb.id, pb.lot_number, pb.current_stage, pb.status, pb.planned_quantity,
              pb.stocked_quantity, p.name AS product_name
       FROM production_batches pb
       JOIN products p ON p.id = pb.product_id
       WHERE pb.status <> 'concluido'
       ORDER BY pb.started_at DESC`
    );

    res.json({
      rawMaterials: rawMaterials.rows,
      batchesInProduction: batches.rows,
      saleableProducts: products.rows
    });
  })
);

router.get(
  '/saleable',
  requireRoles('supervisor', 'funcionario', 'comercial'),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT id, name, sku, color, unit, units_per_package, packages_per_box,
              finished_stock_quantity, finished_stock_package_quantity, finished_stock_box_quantity
       FROM products
       WHERE status = 'ativo' AND finished_stock_quantity > 0
       ORDER BY name`
    );
    res.json(result.rows);
  })
);

module.exports = router;
