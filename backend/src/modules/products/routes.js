const express = require('express');
const { query } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const httpError = require('../../utils/httpError');

const router = express.Router();

router.get(
  '/',
  requireRoles('supervisor', 'funcionario', 'comercial'),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT id, name, sku, color, weight, unit, units_per_package, packages_per_box,
              package_barcode, box_barcode, material_cost_per_unit, status,
              finished_stock_quantity, finished_stock_package_quantity,
              finished_stock_box_quantity, created_at, updated_at
       FROM products
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
      sku,
      color,
      weight = 0,
      unit = 'unidade',
      unitsPerPackage = 1,
      packagesPerBox = 1,
      packageBarcode,
      boxBarcode,
      materialCostPerUnit = 0,
      status = 'ativo'
    } = req.body;
    if (!name || !sku) {
      throw httpError(400, 'Informe nome e SKU do produto.');
    }

    const result = await query(
      `INSERT INTO products
        (name, sku, color, weight, unit, units_per_package, packages_per_box,
         package_barcode, box_barcode, material_cost_per_unit, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, name, sku, color, weight, unit, units_per_package, packages_per_box,
                 package_barcode, box_barcode, material_cost_per_unit, status,
                 finished_stock_quantity, finished_stock_package_quantity,
                 finished_stock_box_quantity, created_at, updated_at`,
      [
        name,
        sku,
        color || null,
        Number(weight || 0),
        unit,
        Number(unitsPerPackage || 1),
        Number(packagesPerBox || 1),
        packageBarcode || null,
        boxBarcode || null,
        Number(materialCostPerUnit || 0),
        status
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

router.patch(
  '/:id',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const {
      name,
      sku,
      color,
      weight,
      unit,
      unitsPerPackage,
      packagesPerBox,
      packageBarcode,
      boxBarcode,
      materialCostPerUnit,
      status
    } = req.body;
    const result = await query(
      `UPDATE products
       SET
         name = COALESCE($1, name),
         sku = COALESCE($2, sku),
         color = COALESCE($3, color),
         weight = COALESCE($4, weight),
         unit = COALESCE($5, unit),
         units_per_package = COALESCE($6, units_per_package),
         packages_per_box = COALESCE($7, packages_per_box),
         package_barcode = COALESCE($8, package_barcode),
         box_barcode = COALESCE($9, box_barcode),
         material_cost_per_unit = COALESCE($10, material_cost_per_unit),
         status = COALESCE($11, status)
       WHERE id = $12
       RETURNING id, name, sku, color, weight, unit, units_per_package, packages_per_box,
                 package_barcode, box_barcode, material_cost_per_unit, status,
                 finished_stock_quantity, finished_stock_package_quantity,
                 finished_stock_box_quantity, created_at, updated_at`,
      [
        name,
        sku,
        color,
        weight,
        unit,
        unitsPerPackage,
        packagesPerBox,
        packageBarcode,
        boxBarcode,
        materialCostPerUnit,
        status,
        req.params.id
      ]
    );

    if (result.rowCount === 0) {
      throw httpError(404, 'Produto nao encontrado.');
    }

    res.json(result.rows[0]);
  })
);

module.exports = router;
