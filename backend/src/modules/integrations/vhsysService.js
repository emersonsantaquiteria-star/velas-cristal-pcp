async function atualizarEstoqueVhsys(db, produto, quantidade, options = {}) {
  const payload = {
    produto: {
      id: produto.id,
      sku: produto.sku,
      nome: produto.name
    },
    quantidade: Number(quantidade),
    lote: options.lotNumber || null,
    origem: 'production_step_estocada'
  };

  const response = {
    mock: true,
    message: 'Integracao VHSYS preparada. Nenhuma chamada externa foi feita nesta versao.'
  };

  await db.query(
    `INSERT INTO integrations_logs
      (integration_name, action, status, payload, response, production_batch_id, product_id)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
    [
      'vhsys',
      'atualizar_estoque',
      'mockado',
      JSON.stringify(payload),
      JSON.stringify(response),
      options.productionBatchId || null,
      produto.id
    ]
  );

  return response;
}

module.exports = {
  atualizarEstoqueVhsys
};
