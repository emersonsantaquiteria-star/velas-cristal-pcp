const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('./pool');

const migrationsDir = path.resolve(__dirname, '../../migrations');

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await pool.query(
      'SELECT id FROM schema_migrations WHERE filename = $1',
      [file]
    );

    if (alreadyApplied.rowCount > 0) {
      console.log(`Migration ignorada: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });

    console.log(`Migration aplicada: ${file}`);
  }
}

runMigrations()
  .then(async () => {
    await pool.end();
    console.log('Banco atualizado.');
  })
  .catch(async (error) => {
    await pool.end();
    console.error('Erro ao aplicar migrations:', error);
    process.exit(1);
  });
