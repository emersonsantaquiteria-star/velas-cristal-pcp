const express = require('express');
const { query } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.get(
  '/logs',
  requireRoles('supervisor'),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT il.id, il.integration_name, il.action, il.status, il.payload, il.response,
              il.created_at, p.name AS product_name, pb.lot_number
       FROM integrations_logs il
       LEFT JOIN products p ON p.id = il.product_id
       LEFT JOIN production_batches pb ON pb.id = il.production_batch_id
       ORDER BY il.created_at DESC
       LIMIT 100`
    );

    res.json(result.rows);
  })
);

module.exports = router;
