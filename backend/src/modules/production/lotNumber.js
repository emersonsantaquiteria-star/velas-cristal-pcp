function getProductionDateCode(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function generateLotNumber(client, date = new Date()) {
  const dateCode = getProductionDateCode(date);
  const prefix = `VC-${dateCode}-`;
  const result = await client.query(
    `SELECT lot_number
     FROM production_batches
     WHERE lot_number LIKE $1
     ORDER BY lot_number DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  const lastSequence = result.rows[0]?.lot_number
    ? Number(result.rows[0].lot_number.split('-').pop())
    : 0;
  const nextSequence = String(lastSequence + 1).padStart(3, '0');

  return `${prefix}${nextSequence}`;
}

module.exports = {
  generateLotNumber
};
