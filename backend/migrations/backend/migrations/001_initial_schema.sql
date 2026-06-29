CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('administrador', 'supervisor', 'funcionario', 'comercial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE record_status AS ENUM ('ativo', 'inativo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE stock_movement_type AS ENUM ('entrada', 'saida', 'ajuste');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  position VARCHAR(120) NOT NULL,
  status record_status NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  status record_status NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  sku VARCHAR(80) NOT NULL UNIQUE,
  color VARCHAR(80),
  weight NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit VARCHAR(40) NOT NULL DEFAULT 'unidade',
  status record_status NOT NULL DEFAULT 'ativo',
  finished_stock_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_materials (
  id SERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
  minimum_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
  status record_status NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_batches (
  id SERIAL PRIMARY KEY,
  lot_number VARCHAR(40) NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  planned_quantity NUMERIC(14, 3) NOT NULL,
  responsible_employee_id INTEGER REFERENCES employees(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_stage VARCHAR(60) NOT NULL DEFAULT 'producao_inicial',
  status VARCHAR(40) NOT NULL DEFAULT 'em_producao',
  stocked_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_material_movements (
  id SERIAL PRIMARY KEY,
  raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
  production_batch_id INTEGER REFERENCES production_batches(id) ON DELETE SET NULL,
  movement_type stock_movement_type NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  reason VARCHAR(160) NOT NULL,
  created_by_employee_id INTEGER REFERENCES employees(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_steps (
  id SERIAL PRIMARY KEY,
  production_batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  stage VARCHAR(60) NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  quantity_done NUMERIC(14, 3) NOT NULL DEFAULT 0,
  losses_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finished_stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  production_batch_id INTEGER REFERENCES production_batches(id) ON DELETE SET NULL,
  movement_type stock_movement_type NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  reason VARCHAR(160) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_clock_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations_logs (
  id SERIAL PRIMARY KEY,
  integration_name VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB,
  production_batch_id INTEGER REFERENCES production_batches(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_raw_materials_minimum ON raw_materials(current_stock, minimum_stock);
CREATE INDEX IF NOT EXISTS idx_batches_stage ON production_batches(current_stage);
CREATE INDEX IF NOT EXISTS idx_batches_status ON production_batches(status);
CREATE INDEX IF NOT EXISTS idx_steps_batch ON production_steps(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_clock_employee_date ON time_clock_records(employee_id, occurred_at);

DROP TRIGGER IF EXISTS employees_updated_at ON employees;
CREATE TRIGGER employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS raw_materials_updated_at ON raw_materials;
CREATE TRIGGER raw_materials_updated_at
BEFORE UPDATE ON raw_materials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS batches_updated_at ON production_batches;
CREATE TRIGGER batches_updated_at
BEFORE UPDATE ON production_batches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
