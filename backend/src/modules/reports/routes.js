const express = require('express');
const { query } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { getTimeClockReport } = require('../timeClock/service');

const router = express.Router();

function buildPeriodWhere(alias, params, { from, to }) {
  const where = [];

  if (from) {
    params.push(from);
    where.push(`${alias}.created_at >= $${params.length}`);
  }

  if (to) {
    params.push(to);
    where.push(`${alias}.created_at <= $${params.length}`);
  }

  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

router.get(
  '/production-by-employee',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const params = [];
    const where = buildPeriodWhere('ps', params, req.query);
    const result = await query(
      `SELECT e.id, e.name, ps.stage,
              COALESCE(SUM(ps.quantity_done), 0)::numeric AS quantity_done,
              COALESCE(SUM(ps.losses_quantity), 0)::numeric AS losses_quantity
       FROM production_steps ps
       JOIN employees e ON e.id = ps.employee_id
       ${where}
       GROUP BY e.id, e.name, ps.stage
       ORDER BY e.name, ps.stage`,
      params
    );

    res.json(result.rows);
  })
);

router.get(
  '/production-by-product',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const params = [];
    const where = buildPeriodWhere('ps', params, req.query);
    const result = await query(
      `SELECT p.id, p.name, p.sku,
              COALESCE(SUM(ps.quantity_done), 0)::numeric AS quantity_done,
              COALESCE(SUM(ps.losses_quantity), 0)::numeric AS losses_quantity
       FROM production_steps ps
       JOIN production_batches pb ON pb.id = ps.production_batch_id
       JOIN products p ON p.id = pb.product_id
       ${where}
       GROUP BY p.id, p.name, p.sku
       ORDER BY p.name`,
      params
    );

    res.json(result.rows);
  })
);

router.get(
  '/production-by-stage',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const params = [];
    const where = buildPeriodWhere('ps', params, req.query);
    const result = await query(
      `SELECT ps.stage,
              COUNT(*)::int AS records,
              COALESCE(SUM(ps.quantity_done), 0)::numeric AS quantity_done,
              COALESCE(SUM(ps.losses_quantity), 0)::numeric AS losses_quantity
       FROM production_steps ps
       ${where}
       GROUP BY ps.stage
       ORDER BY ps.stage`,
      params
    );

    res.json(result.rows);
  })
);

router.get(
  '/raw-material-consumption',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const params = ['saida'];
    const periodWhere = buildPeriodWhere('rmm', params, req.query);
    const where = periodWhere ? `${periodWhere} AND rmm.movement_type = $1` : 'WHERE rmm.movement_type = $1';
    const result = await query(
      `SELECT rm.id, rm.name, rm.unit,
              COALESCE(SUM(rmm.quantity), 0)::numeric AS consumed_quantity
       FROM raw_material_movements rmm
       JOIN raw_materials rm ON rm.id = rmm.raw_material_id
       ${where}
       GROUP BY rm.id, rm.name, rm.unit
       ORDER BY rm.name`,
      params
    );

    res.json(result.rows);
  })
);

router.get(
  '/inventory',
  requireRoles('supervisor'),
  asyncHandler(async (_req, res) => {
    const rawMaterials = await query(
      `SELECT id, name, unit, current_stock, minimum_stock,
              current_stock <= minimum_stock AS below_minimum
       FROM raw_materials
       ORDER BY name`
    );

    const products = await query(
      `SELECT id, name, sku, unit, units_per_package, packages_per_box,
              finished_stock_quantity, finished_stock_package_quantity,
              finished_stock_box_quantity
       FROM products
       ORDER BY name`
    );

    res.json({
      rawMaterials: rawMaterials.rows,
      products: products.rows
    });
  })
);

router.get(
  '/batches',
  requireRoles('supervisor'),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT pb.id, pb.lot_number, p.name AS product_name, pb.planned_quantity,
              pb.current_stage, pb.status, pb.stocked_quantity, pb.started_at,
              COUNT(ps.id)::int AS step_count
       FROM production_batches pb
       JOIN products p ON p.id = pb.product_id
       LEFT JOIN production_steps ps ON ps.production_batch_id = pb.id
       GROUP BY pb.id, p.name
       ORDER BY pb.started_at DESC`
    );

    res.json(result.rows);
  })
);

router.get(
  '/time-clock',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const report = await getTimeClockReport(req.query);
    res.json(report);
  })
);

router.get(
  '/productivity-costs',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const params = [];
    const where = buildPeriodWhere('psm', params, req.query);
    const result = await query(
      `WITH role_rows AS (
        SELECT produced_by_employee_id AS employee_id, 'producao_inicial' AS stage,
               package_quantity, box_quantity, unit_quantity, production_hours
        FROM production_scan_movements psm
        ${where}
        UNION ALL
        SELECT wrapped_by_employee_id AS employee_id, 'embalamento' AS stage,
               package_quantity, box_quantity, unit_quantity, production_hours
        FROM production_scan_movements psm
        ${where}
        UNION ALL
        SELECT packed_by_employee_id AS employee_id, 'empacotamento' AS stage,
               package_quantity, box_quantity, unit_quantity, production_hours
        FROM production_scan_movements psm
        ${where}
      )
      SELECT e.id, e.name, rr.stage,
             COALESCE(SUM(rr.package_quantity), 0)::numeric AS packages,
             COALESCE(SUM(rr.box_quantity), 0)::numeric AS boxes,
             COALESCE(SUM(rr.unit_quantity), 0)::numeric AS units,
             COALESCE(SUM(rr.production_hours), 0)::numeric AS hours,
             COALESCE(SUM(rr.package_quantity) / NULLIF(SUM(rr.production_hours), 0), 0)::numeric AS packages_per_hour,
             (e.daily_wage / NULLIF(e.shift_hours, 0))::numeric AS cost_per_hour,
             COALESCE(
               SUM((e.daily_wage / NULLIF(e.shift_hours, 0)) * rr.production_hours)
               / NULLIF(SUM(rr.package_quantity), 0),
               0
             )::numeric AS labor_cost_per_package,
             COALESCE(
               SUM((e.daily_wage / NULLIF(e.shift_hours, 0)) * rr.production_hours)
               / NULLIF(SUM(rr.box_quantity), 0),
               0
             )::numeric AS labor_cost_per_box,
             COALESCE(SUM(rr.production_hours * 60) / NULLIF(SUM(rr.package_quantity), 0), 0)::numeric AS minutes_per_package,
             COALESCE(SUM(rr.production_hours * 60) / NULLIF(SUM(rr.box_quantity), 0), 0)::numeric AS minutes_per_box
      FROM role_rows rr
      JOIN employees e ON e.id = rr.employee_id
      WHERE rr.employee_id IS NOT NULL
      GROUP BY e.id, e.name, e.daily_wage, e.shift_hours, rr.stage
      ORDER BY e.name, rr.stage`,
      params
    );

    res.json(result.rows);
  })
);

router.get(
  '/daily-production',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const params = [];
    const where = buildPeriodWhere('psm', params, req.query);
    const result = await query(
      `SELECT DATE_TRUNC('day', psm.created_at)::date AS day,
              COALESCE(SUM(psm.package_quantity), 0)::numeric AS packages,
              COALESCE(SUM(psm.box_quantity), 0)::numeric AS boxes,
              COALESCE(SUM(psm.unit_quantity), 0)::numeric AS units,
              COALESCE(SUM(psm.material_cost), 0)::numeric AS material_cost,
              COALESCE(SUM(psm.labor_cost), 0)::numeric AS labor_cost,
              COALESCE(SUM(psm.total_cost), 0)::numeric AS total_cost
       FROM production_scan_movements psm
       ${where}
       GROUP BY day
       ORDER BY day DESC`,
      params
    );

    res.json(result.rows);
  })
);

router.get(
  '/scan-movements',
  requireRoles('supervisor'),
  asyncHandler(async (req, res) => {
    const params = [];
    const where = buildPeriodWhere('psm', params, req.query);
    const result = await query(
      `SELECT psm.id, psm.created_at, psm.scanned_code, psm.code_type,
              p.name AS product_name, p.sku, pb.lot_number,
              scanned.name AS scanned_by,
              produced.name AS produced_by,
              wrapped.name AS wrapped_by,
              packed.name AS packed_by,
              psm.package_quantity, psm.box_quantity, psm.unit_quantity,
              psm.previous_stage, psm.new_stage,
              psm.material_cost, psm.labor_cost, psm.total_cost,
              psm.cost_per_package, psm.cost_per_box,
              psm.raw_materials_consumed
       FROM production_scan_movements psm
       JOIN products p ON p.id = psm.product_id
       LEFT JOIN production_batches pb ON pb.id = psm.production_batch_id
       LEFT JOIN employees scanned ON scanned.id = psm.scanned_by_employee_id
       LEFT JOIN employees produced ON produced.id = psm.produced_by_employee_id
       LEFT JOIN employees wrapped ON wrapped.id = psm.wrapped_by_employee_id
       LEFT JOIN employees packed ON packed.id = psm.packed_by_employee_id
       ${where}
       ORDER BY psm.created_at DESC
       LIMIT 200`,
      params
    );

    res.json(result.rows);
  })
);

module.exports = router;
