const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('./pool');
const { atualizarEstoqueVhsys } = require('../modules/integrations/vhsysService');

async function insertReturningId(client, sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0].id;
}

async function seed() {
  await withTransaction(async (client) => {
    await client.query(`
      TRUNCATE
        integrations_logs,
        production_scan_movements,
        product_raw_materials,
        time_clock_records,
        finished_stock_movements,
        production_steps,
        raw_material_movements,
        production_batches,
        users,
        products,
        raw_materials,
        employees
      RESTART IDENTITY CASCADE
    `);

    const passwordHash = await bcrypt.hash('123456', 10);

    const adminEmployeeId = await insertReturningId(
      client,
      `INSERT INTO employees (name, position, barcode, daily_wage, shift_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Marina Cristal', 'Administradora', 'EMP-ADM-001', 90, 8]
    );
    const supervisorEmployeeId = await insertReturningId(
      client,
      `INSERT INTO employees (name, position, barcode, daily_wage, shift_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Carlos Silva', 'Supervisor de Producao', 'EMP-SUP-001', 75, 8]
    );
    const factoryEmployeeId = await insertReturningId(
      client,
      `INSERT INTO employees (name, position, barcode, daily_wage, shift_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Ana Paula', 'Operadora de Producao', 'EMP-ANA-001', 55, 8]
    );
    const commercialEmployeeId = await insertReturningId(
      client,
      `INSERT INTO employees (name, position, barcode, daily_wage, shift_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Rafael Costa', 'Comercial', 'EMP-COM-001', 65, 8]
    );

    await client.query(
      `INSERT INTO users (employee_id, name, email, password_hash, role)
       VALUES
        ($1, 'Marina Cristal', 'admin@velascristal.local', $5, 'administrador'),
        ($2, 'Carlos Silva', 'supervisor@velascristal.local', $5, 'supervisor'),
        ($3, 'Ana Paula', 'funcionario@velascristal.local', $5, 'funcionario'),
        ($4, 'Rafael Costa', 'comercial@velascristal.local', $5, 'comercial')`,
      [
        adminEmployeeId,
        supervisorEmployeeId,
        factoryEmployeeId,
        commercialEmployeeId,
        passwordHash
      ]
    );

    const productVela7DiasId = await insertReturningId(
      client,
      `INSERT INTO products
        (name, sku, color, weight, unit, units_per_package, packages_per_box,
         package_barcode, box_barcode, material_cost_per_unit, finished_stock_quantity,
         finished_stock_package_quantity, finished_stock_box_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      ['Vela 7 Dias Cristal', 'VC-7D-BR', 'Branca', 260, 'unidade', 1, 12, '7897000000711', '7897000000712', 1.35, 120, 120, 10]
    );
    const productAromaticaId = await insertReturningId(
      client,
      `INSERT INTO products
        (name, sku, color, weight, unit, units_per_package, packages_per_box,
         package_barcode, box_barcode, material_cost_per_unit, finished_stock_quantity,
         finished_stock_package_quantity, finished_stock_box_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      ['Vela Aromatica Lavanda', 'VC-ARO-LAV', 'Lilas', 180, 'unidade', 4, 16, '7897000001811', '7897000001812', 0.95, 80, 20, 1.25]
    );
    const productDecorativaId = await insertReturningId(
      client,
      `INSERT INTO products
        (name, sku, color, weight, unit, units_per_package, packages_per_box,
         package_barcode, box_barcode, material_cost_per_unit, finished_stock_quantity,
         finished_stock_package_quantity, finished_stock_box_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      ['Vela Decorativa Cristal', 'VC-DEC-CR', 'Cristal', 350, 'unidade', 8, 25, '7897000002811', '7897000002812', 1.1, 0, 0, 0]
    );
    const productVela2Id = await insertReturningId(
      client,
      `INSERT INTO products
        (name, sku, color, weight, unit, units_per_package, packages_per_box,
         package_barcode, box_barcode, material_cost_per_unit, finished_stock_quantity,
         finished_stock_package_quantity, finished_stock_box_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      ['Vela no 2 no plastico', 'VC-N2-PL', 'Branca', 90, 'unidade', 8, 25, '7897000000211', '7897000000212', 0.42, 0, 0, 0]
    );

    const parafinaId = await insertReturningId(
      client,
      `INSERT INTO raw_materials (name, unit, barcode, unit_cost, current_stock, minimum_stock)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Parafina', 'kg', 'MP-PARAFINA', 16.5, 48, 50]
    );
    const essenciaId = await insertReturningId(
      client,
      `INSERT INTO raw_materials (name, unit, barcode, unit_cost, current_stock, minimum_stock)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Essencia de Lavanda', 'litro', 'MP-ESS-LAV', 42, 15, 8]
    );
    const pavioId = await insertReturningId(
      client,
      `INSERT INTO raw_materials (name, unit, barcode, unit_cost, current_stock, minimum_stock)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Pavio Algodao 20cm', 'unidade', 'MP-PAVIO-20', 0.08, 550, 200]
    );
    const embalagemId = await insertReturningId(
      client,
      `INSERT INTO raw_materials (name, unit, barcode, unit_cost, current_stock, minimum_stock)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Caixa Individual', 'unidade', 'MP-CX-IND', 0.35, 80, 120]
    );

    await client.query(
      `INSERT INTO product_raw_materials
        (product_id, raw_material_id, quantity_per_unit, waste_percent)
       VALUES
        ($1, $5, 0.260, 2),
        ($1, $7, 1, 0),
        ($2, $5, 0.180, 2),
        ($2, $6, 0.005, 0),
        ($2, $7, 1, 0),
        ($3, $5, 0.350, 2),
        ($3, $7, 1, 0),
        ($3, $8, 1, 0),
        ($4, $5, 0.090, 2),
        ($4, $7, 1, 0),
        ($4, $8, 0.125, 0)`,
      [
        productVela7DiasId,
        productAromaticaId,
        productDecorativaId,
        productVela2Id,
        parafinaId,
        essenciaId,
        pavioId,
        embalagemId
      ]
    );

    for (const [rawMaterialId, quantity] of [
      [parafinaId, 60],
      [essenciaId, 15],
      [pavioId, 650],
      [embalagemId, 180]
    ]) {
      await client.query(
        `INSERT INTO raw_material_movements
          (raw_material_id, movement_type, quantity, reason, created_by_employee_id)
         VALUES ($1, 'entrada', $2, 'Carga inicial de teste', $3)`,
        [rawMaterialId, quantity, supervisorEmployeeId]
      );
    }

    const openBatchId = await insertReturningId(
      client,
      `INSERT INTO production_batches
        (lot_number, product_id, planned_quantity, responsible_employee_id, current_stage, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        'VC-20260627-001',
        productDecorativaId,
        100,
        supervisorEmployeeId,
        'empacotamento',
        'em_producao',
        'Lote piloto para conferencia do fluxo.'
      ]
    );

    await client.query(
      `INSERT INTO production_steps
        (production_batch_id, stage, employee_id, quantity_done, losses_quantity, observations)
       VALUES
        ($1, 'producao_inicial', $2, 98, 2, 'Base moldada.'),
        ($1, 'embalamento', $2, 95, 3, 'Aguardando empacotamento final.')`,
      [openBatchId, factoryEmployeeId]
    );

    for (const [rawMaterialId, quantity] of [
      [parafinaId, 12],
      [pavioId, 100],
      [embalagemId, 100]
    ]) {
      await client.query(
        `INSERT INTO raw_material_movements
          (raw_material_id, production_batch_id, movement_type, quantity, reason, created_by_employee_id)
         VALUES ($1, $2, 'saida', $3, 'Consumo em producao', $4)`,
        [rawMaterialId, openBatchId, quantity, supervisorEmployeeId]
      );
    }

    const closedBatchId = await insertReturningId(
      client,
      `INSERT INTO production_batches
        (lot_number, product_id, planned_quantity, responsible_employee_id, current_stage, status, stocked_quantity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        'VC-20260627-002',
        productAromaticaId,
        80,
        supervisorEmployeeId,
        'estocada',
        'concluido',
        80,
        'Lote finalizado para teste de estoque acabado.'
      ]
    );

    await client.query(
      `INSERT INTO production_steps
        (production_batch_id, stage, employee_id, quantity_done, losses_quantity, observations)
       VALUES
        ($1, 'producao_inicial', $2, 82, 0, 'Mistura preparada.'),
        ($1, 'embalamento', $2, 80, 2, 'Duas unidades quebradas.'),
        ($1, 'empacotamento', $2, 80, 0, 'Pacotes fechados.'),
        ($1, 'estocada', $2, 80, 0, 'Entrada em estoque acabado.')`,
      [closedBatchId, factoryEmployeeId]
    );

    await client.query(
      `INSERT INTO finished_stock_movements
        (product_id, production_batch_id, movement_type, quantity, package_quantity,
         box_quantity, unit_quantity, reason)
       VALUES ($1, $2, 'entrada', $3, $4, $5, $3, 'Lote finalizado em estocada')`,
      [productAromaticaId, closedBatchId, 80, 20, 1.25]
    );

    await atualizarEstoqueVhsys(
      client,
      { id: productAromaticaId, name: 'Vela Aromatica Lavanda', sku: 'VC-ARO-LAV' },
      80,
      { productionBatchId: closedBatchId, lotNumber: 'VC-20260627-002' }
    );

    await client.query(
      `INSERT INTO time_clock_records (employee_id, event_type, occurred_at)
       VALUES
        ($1, 'entrada', NOW() - INTERVAL '8 hours'),
        ($1, 'inicio_intervalo', NOW() - INTERVAL '4 hours'),
        ($1, 'fim_intervalo', NOW() - INTERVAL '3 hours 15 minutes'),
        ($1, 'saida', NOW() - INTERVAL '20 minutes')`,
      [factoryEmployeeId]
    );

    await client.query(
      `INSERT INTO finished_stock_movements
        (product_id, movement_type, quantity, package_quantity, box_quantity, unit_quantity, reason)
       VALUES ($1, 'entrada', 120, 120, 10, 120, 'Estoque inicial de teste')`,
      [productVela7DiasId]
    );
  });
}

seed()
  .then(async () => {
    await pool.end();
    console.log('Dados de exemplo criados. Senha dos usuarios: 123456');
  })
  .catch(async (error) => {
    await pool.end();
    console.error('Erro ao criar dados de exemplo:', error);
    process.exit(1);
  });
