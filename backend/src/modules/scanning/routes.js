const express = require('express');
const { query, withTransaction } = require('../../database/pool');
const { requireRoles } = require('../../middleware/auth');
const { atualizarEstoqueVhsys } = require('../integrations/vhsysService');
const { STAGE_IDS } = require('../production/constants');
const { generateLotNumber } = require('../production/lotNumber');
const asyncHandler = require('../../utils/asyncHandler');
const httpError = require('../../utils/httpError');

const router = express.Router();

const stageCodeMap = {
  PRODUCAO_INICIAL: 'producao_inicial',
  PRODUCAO: 'producao_inicial',
  INICIAL: 'producao_inicial',
  EMBALAMENTO: 'embalamento',
  EMBALAR: 'embalamento',
  EMPACOTAMENTO: 'empacotamento',
  EMPACOTAR: 'empacotamento',
  ESTOCADA: 'estocada',
  ESTOQUE: 'estocada'
};

function toNumber(value) {
  return Number(value || 0);
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeCode(code) {
  return String(code || '').trim();
}

function normalizeStageCode(code) {
  return normalizeCode(code)
    .toUpperCase()
    .replace(/^ETAPA[:\-_ ]?/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function publicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    unitsPerPackage: Number(product.units_per_package),
    packagesPerBox: Number(product.packages_per_box),
    packageBarcode: product.package_barcode,
    boxBarcode: product.box_barcode,
    materialCostPerUnit: Number(product.material_cost_per_unit)
  };
}

function getEmployeeCodeId(code) {
  const match = normalizeCode(code).toUpperCase().match(/^(EMP|FUNC|FUNCIONARIO)[:\-_ ]?(\d+)$/);
  return match ? Number(match[2]) : null;
}

async function identifyCode(db, rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) {
    throw httpError(400, 'Informe um codigo.');
  }

  const stageId = stageCodeMap[normalizeStageCode(code)] || (STAGE_IDS.includes(code) ? code : null);
  if (stageId) {
    return {
      type: 'etapa',
      codeType: 'etapa',
      entity: { id: stageId, name: stageId },
      suggested: { newStage: stageId }
    };
  }

  const productResult = await db.query(
    `SELECT id, name, sku, unit, units_per_package, packages_per_box,
            package_barcode, box_barcode, material_cost_per_unit,
            CASE
              WHEN LOWER(package_barcode) = LOWER($1) THEN 'pacote'
              WHEN LOWER(box_barcode) = LOWER($1) THEN 'caixa'
              ELSE 'produto'
            END AS code_type
     FROM products
     WHERE status = 'ativo'
       AND (
         LOWER(sku) = LOWER($1)
         OR LOWER(package_barcode) = LOWER($1)
         OR LOWER(box_barcode) = LOWER($1)
       )
     LIMIT 1`,
    [code]
  );

  if (productResult.rowCount > 0) {
    const product = productResult.rows[0];
    const type = product.code_type;
    const suggestedPackageQuantity =
      type === 'caixa' ? Number(product.packages_per_box) : type === 'pacote' ? 1 : null;

    return {
      type,
      codeType: type,
      entity: publicProduct(product),
      suggested: {
        productId: product.id,
        packageQuantity: suggestedPackageQuantity,
        currentStage: 'empacotamento',
        newStage: 'estocada'
      }
    };
  }

  const batchResult = await db.query(
    `SELECT pb.id, pb.lot_number, pb.current_stage, pb.status,
            p.id AS product_id, p.name, p.sku, p.unit,
            p.units_per_package, p.packages_per_box, p.package_barcode,
            p.box_barcode, p.material_cost_per_unit
     FROM production_batches pb
     JOIN products p ON p.id = pb.product_id
     WHERE LOWER(pb.lot_number) = LOWER($1)
     LIMIT 1`,
    [code]
  );

  if (batchResult.rowCount > 0) {
    const batch = batchResult.rows[0];
    return {
      type: 'lote',
      codeType: 'lote',
      entity: {
        id: batch.id,
        lotNumber: batch.lot_number,
        currentStage: batch.current_stage,
        status: batch.status,
        product: publicProduct({
          id: batch.product_id,
          name: batch.name,
          sku: batch.sku,
          unit: batch.unit,
          units_per_package: batch.units_per_package,
          packages_per_box: batch.packages_per_box,
          package_barcode: batch.package_barcode,
          box_barcode: batch.box_barcode,
          material_cost_per_unit: batch.material_cost_per_unit
        })
      },
      suggested: {
        batchId: batch.id,
        productId: batch.product_id,
        currentStage: batch.current_stage,
        newStage: 'estocada'
      }
    };
  }

  const employeeCodeId = getEmployeeCodeId(code);
  const employeeResult = await db.query(
    `SELECT id, name, position, barcode, daily_wage, shift_hours
     FROM employees
     WHERE status = 'ativo'
       AND (
         LOWER(barcode) = LOWER($1)
         OR id = COALESCE($2, -1)
       )
     LIMIT 1`,
    [code, employeeCodeId]
  );

  if (employeeResult.rowCount > 0) {
    const employee = employeeResult.rows[0];
    return {
      type: 'funcionario',
      codeType: 'funcionario',
      entity: {
        id: employee.id,
        name: employee.name,
        position: employee.position,
        barcode: employee.barcode,
        dailyWage: Number(employee.daily_wage),
        shiftHours: Number(employee.shift_hours)
      },
      suggested: { employeeId: employee.id }
    };
  }

  throw httpError(404, 'Codigo nao identificado.');
}

async function calculateMaterialConsumption(client, product, unitQuantity, batchId, employeeId) {
  const recipeResult = await client.query(
    `SELECT prm.raw_material_id, prm.quantity_per_unit, prm.waste_percent,
            rm.name, rm.unit, rm.current_stock, rm.unit_cost
     FROM product_raw_materials prm
     JOIN raw_materials rm ON rm.id = prm.raw_material_id
     WHERE prm.product_id = $1
     FOR UPDATE OF rm`,
    [product.id]
  );

  if (recipeResult.rowCount === 0) {
    const fallbackCost = round(toNumber(product.material_cost_per_unit) * unitQuantity);
    return {
      materialCost: fallbackCost,
      consumed: fallbackCost > 0
        ? [
            {
              name: 'Custo padrao do produto',
              unit: product.unit,
              quantity: unitQuantity,
              unitCost: toNumber(product.material_cost_per_unit),
              totalCost: fallbackCost
            }
          ]
        : []
    };
  }

  const consumed = [];
  let materialCost = 0;

  for (const item of recipeResult.rows) {
    const quantity =
      toNumber(item.quantity_per_unit) *
      unitQuantity *
      (1 + toNumber(item.waste_percent) / 100);

    if (quantity <= 0) {
      continue;
    }

    if (toNumber(item.current_stock) < quantity) {
      throw httpError(400, `Estoque insuficiente de ${item.name}.`);
    }

    const itemCost = quantity * toNumber(item.unit_cost);
    materialCost += itemCost;

    await client.query(
      `UPDATE raw_materials
       SET current_stock = current_stock - $1
       WHERE id = $2`,
      [quantity, item.raw_material_id]
    );

    await client.query(
      `INSERT INTO raw_material_movements
        (raw_material_id, production_batch_id, movement_type, quantity, reason, created_by_employee_id, notes)
       VALUES ($1, $2, 'saida', $3, 'Consumo por bipagem de producao', $4, $5)`,
      [item.raw_material_id, batchId, quantity, employeeId || null, `Produto ${product.sku}`]
    );

    consumed.push({
      rawMaterialId: item.raw_material_id,
      name: item.name,
      unit: item.unit,
      quantity: round(quantity, 6),
      unitCost: toNumber(item.unit_cost),
      totalCost: round(itemCost)
    });
  }

  return {
    materialCost: round(materialCost),
    consumed
  };
}

async function calculateLaborCost(client, employeeIds, productionHours) {
  const ids = [...new Set(employeeIds.filter(Boolean).map(Number))];
  if (ids.length === 0) {
    return { laborCost: 0, employees: [] };
  }

  const employeesResult = await client.query(
    `SELECT id, name, daily_wage, shift_hours
     FROM employees
     WHERE id = ANY($1::int[])`,
    [ids]
  );

  let laborCost = 0;
  const employees = employeesResult.rows.map((employee) => {
    const hourlyCost = toNumber(employee.daily_wage) / Math.max(toNumber(employee.shift_hours), 1);
    const cost = hourlyCost * productionHours;
    laborCost += cost;

    return {
      id: employee.id,
      name: employee.name,
      hourlyCost: round(hourlyCost),
      cost: round(cost)
    };
  });

  return { laborCost: round(laborCost), employees };
}

async function getOrCreateBatch(client, { batchId, productId, unitQuantity, employeeId, previousStage }) {
  if (batchId) {
    const batchResult = await client.query(
      `SELECT id, lot_number, current_stage, status
       FROM production_batches
       WHERE id = $1
       FOR UPDATE`,
      [batchId]
    );

    if (batchResult.rowCount === 0) {
      throw httpError(404, 'Lote nao encontrado.');
    }

    return {
      ...batchResult.rows[0],
      created: false
    };
  }

  const lotNumber = await generateLotNumber(client);
  const batchResult = await client.query(
    `INSERT INTO production_batches
      (lot_number, product_id, planned_quantity, responsible_employee_id, current_stage, status, notes)
     VALUES ($1, $2, $3, $4, $5, 'em_producao', $6)
     RETURNING id, lot_number, current_stage, status`,
    [
      lotNumber,
      productId,
      unitQuantity,
      employeeId || null,
      previousStage,
      'Lote criado automaticamente pela bipagem de producao.'
    ]
  );

  return {
    ...batchResult.rows[0],
    created: true
  };
}

router.get(
  '/identify',
  requireRoles('supervisor', 'funcionario'),
  asyncHandler(async (req, res) => {
    const identified = await identifyCode({ query }, req.query.code);
    res.json(identified);
  })
);

router.post(
  '/production',
  requireRoles('supervisor', 'funcionario'),
  asyncHandler(async (req, res) => {
    const {
      scannedCode,
      productId,
      batchId,
      packageQuantity,
      producedByEmployeeId,
      wrappedByEmployeeId,
      packedByEmployeeId,
      scannedByEmployeeId,
      previousStage,
      newStage = 'estocada',
      productionHours
    } = req.body;

    if (!scannedCode) {
      throw httpError(400, 'Informe ou bipe um codigo.');
    }

    if (!STAGE_IDS.includes(newStage)) {
      throw httpError(400, 'Nova etapa invalida.');
    }

    const packageCount = toNumber(packageQuantity);
    if (packageCount <= 0) {
      throw httpError(400, 'Informe a quantidade de pacotes.');
    }

    const result = await withTransaction(async (client) => {
      const identified = await identifyCode(client, scannedCode);
      let resolvedProductId = Number(productId || identified.suggested?.productId);
      const resolvedBatchId = Number(batchId || identified.suggested?.batchId) || null;

      if (identified.type === 'lote' && identified.entity?.product?.id) {
        resolvedProductId = identified.entity.product.id;
      }

      if (!resolvedProductId) {
        throw httpError(400, 'O codigo precisa identificar um produto, pacote, caixa ou lote.');
      }

      const productResult = await client.query(
        `SELECT id, name, sku, unit, units_per_package, packages_per_box,
                package_barcode, box_barcode, material_cost_per_unit
         FROM products
         WHERE id = $1 AND status = 'ativo'
         FOR UPDATE`,
        [resolvedProductId]
      );

      if (productResult.rowCount === 0) {
        throw httpError(404, 'Produto ativo nao encontrado.');
      }

      const product = productResult.rows[0];
      const unitsPerPackage = Math.max(toNumber(product.units_per_package), 1);
      const packagesPerBox = Math.max(toNumber(product.packages_per_box), 1);
      const boxCount = packageCount / packagesPerBox;
      const unitQuantity = packageCount * unitsPerPackage;
      const resolvedPreviousStage =
        previousStage || identified.suggested?.currentStage || 'empacotamento';
      const scannerId =
        req.user.role === 'funcionario' && req.user.employeeId
          ? req.user.employeeId
          : scannedByEmployeeId || req.user.employeeId || packedByEmployeeId || null;
      const packingEmployeeId =
        req.user.role === 'funcionario' && req.user.employeeId
          ? req.user.employeeId
          : packedByEmployeeId || scannerId;

      if (!packingEmployeeId) {
        throw httpError(400, 'Informe o funcionario que esta empacotando.');
      }

      const hours =
        toNumber(productionHours) ||
        Math.max(
          1,
          toNumber(
            (
              await client.query('SELECT shift_hours FROM employees WHERE id = $1', [
                packingEmployeeId
              ])
            ).rows[0]?.shift_hours || 8
          )
        );

      const batch = await getOrCreateBatch(client, {
        batchId: resolvedBatchId,
        productId: product.id,
        unitQuantity,
        employeeId: packingEmployeeId,
        previousStage: resolvedPreviousStage
      });

      const { materialCost, consumed } = await calculateMaterialConsumption(
        client,
        product,
        unitQuantity,
        batch.id,
        scannerId
      );
      const { laborCost, employees: laborEmployees } = await calculateLaborCost(
        client,
        [producedByEmployeeId, wrappedByEmployeeId, packingEmployeeId],
        hours
      );
      const totalCost = round(materialCost + laborCost);
      const packagesPerHour = round(packageCount / hours);
      const costPerHour = round(laborCost / hours);
      const costPerPackage = round(totalCost / packageCount);
      const costPerBox = round(boxCount > 0 ? totalCost / boxCount : 0);
      const minutesPerPackage = round((hours * 60) / packageCount);
      const minutesPerBox = round(boxCount > 0 ? (hours * 60) / boxCount : 0);

      await client.query(
        `INSERT INTO production_steps
          (production_batch_id, stage, employee_id, quantity_done, losses_quantity, observations)
         VALUES ($1, $2, $3, $4, 0, $5)`,
        [
          batch.id,
          newStage,
          packingEmployeeId,
          unitQuantity,
          `Registro por bipagem: ${packageCount} pacotes, ${round(boxCount, 3)} caixas.`
        ]
      );

      const status = newStage === 'estocada' ? 'concluido' : 'em_producao';
      await client.query(
        `UPDATE production_batches
         SET current_stage = $1,
             status = $2,
             stocked_quantity = stocked_quantity + $3
         WHERE id = $4`,
        [newStage, status, newStage === 'estocada' ? unitQuantity : 0, batch.id]
      );

      if (newStage === 'estocada') {
        await client.query(
          `UPDATE products
           SET finished_stock_quantity = finished_stock_quantity + $1,
               finished_stock_package_quantity = finished_stock_package_quantity + $2,
               finished_stock_box_quantity = finished_stock_box_quantity + $3
           WHERE id = $4`,
          [unitQuantity, packageCount, boxCount, product.id]
        );

        await client.query(
          `INSERT INTO finished_stock_movements
            (product_id, production_batch_id, movement_type, quantity, package_quantity,
             box_quantity, unit_quantity, reason)
           VALUES ($1, $2, 'entrada', $3, $4, $5, $6, $7)`,
          [
            product.id,
            batch.id,
            unitQuantity,
            packageCount,
            boxCount,
            unitQuantity,
            'Entrada por bipagem de producao'
          ]
        );

        await atualizarEstoqueVhsys(
          client,
          { id: product.id, name: product.name, sku: product.sku },
          unitQuantity,
          { productionBatchId: batch.id, lotNumber: batch.lot_number }
        );
      }

      const movementResult = await client.query(
        `INSERT INTO production_scan_movements
          (scanned_code, code_type, scanned_by_employee_id, produced_by_employee_id,
           wrapped_by_employee_id, packed_by_employee_id, product_id, production_batch_id,
           package_quantity, box_quantity, unit_quantity, previous_stage, new_stage,
           production_hours, packages_per_hour, cost_per_hour, cost_per_package,
           cost_per_box, minutes_per_package, minutes_per_box, material_cost,
           labor_cost, total_cost, raw_materials_consumed)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb)
         RETURNING *`,
        [
          scannedCode,
          identified.codeType,
          scannerId,
          producedByEmployeeId || null,
          wrappedByEmployeeId || null,
          packingEmployeeId,
          product.id,
          batch.id,
          packageCount,
          boxCount,
          unitQuantity,
          resolvedPreviousStage,
          newStage,
          hours,
          packagesPerHour,
          costPerHour,
          costPerPackage,
          costPerBox,
          minutesPerPackage,
          minutesPerBox,
          materialCost,
          laborCost,
          totalCost,
          JSON.stringify(consumed)
        ]
      );

      return {
        movement: movementResult.rows[0],
        identified,
        batch: {
          id: batch.id,
          lotNumber: batch.lot_number,
          created: batch.created
        },
        product: publicProduct(product),
        totals: {
          packages: round(packageCount, 3),
          boxes: round(boxCount, 3),
          units: round(unitQuantity, 3),
          materialCost,
          laborCost,
          totalCost,
          packagesPerHour,
          costPerHour,
          costPerPackage,
          costPerBox,
          minutesPerPackage,
          minutesPerBox
        },
        materialsConsumed: consumed,
        laborEmployees
      };
    });

    res.status(201).json(result);
  })
);

module.exports = router;
