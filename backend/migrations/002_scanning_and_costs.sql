ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS daily_wage NUMERIC(14, 2) NOT NULL DEFAULT 55,
  ADD COLUMN IF NOT EXISTS shift_hours NUMERIC(8, 2) NOT NULL DEFAULT 8;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS units_per_package NUMERIC(14, 3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packages_per_box NUMERIC(14, 3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS package_barcode VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS box_barcode VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS material_cost_per_unit NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_stock_package_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_stock_box_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0;

ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0;

ALTER TABLE finished_stock_movements
  ADD COLUMN IF NOT EXISTS package_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS product_raw_materials (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
  quantity_per_unit NUMERIC(14, 6) NOT NULL DEFAULT 0,
  waste_percent NUMERIC(8, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, raw_material_id)
);

CREATE TABLE IF NOT EXISTS production_scan_movements (
  id SERIAL PRIMARY KEY,
  scanned_code VARCHAR(180) NOT NULL,
  code_type VARCHAR(40) NOT NULL,
  scanned_by_employee_id INTEGER REFERENCES employees(id),
  produced_by_employee_id INTEGER REFERENCES employees(id),
  wrapped_by_employee_id INTEGER REFERENCES employees(id),
  packed_by_employee_id INTEGER REFERENCES employees(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  production_batch_id INTEGER REFERENCES production_batches(id) ON DELETE SET NULL,
  package_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  box_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  previous_stage VARCHAR(60) NOT NULL,
  new_stage VARCHAR(60) NOT NULL,
  production_hours NUMERIC(10, 3) NOT NULL DEFAULT 0,
  packages_per_hour NUMERIC(14, 4) NOT NULL DEFAULT 0,
  cost_per_hour NUMERIC(14, 4) NOT NULL DEFAULT 0,
  cost_per_package NUMERIC(14, 4) NOT NULL DEFAULT 0,
  cost_per_box NUMERIC(14, 4) NOT NULL DEFAULT 0,
  minutes_per_package NUMERIC(14, 4) NOT NULL DEFAULT 0,
  minutes_per_box NUMERIC(14, 4) NOT NULL DEFAULT 0,
  material_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  raw_materials_consumed JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_barcode ON employees(barcode);
CREATE INDEX IF NOT EXISTS idx_products_package_barcode ON products(package_barcode);
CREATE INDEX IF NOT EXISTS idx_products_box_barcode ON products(box_barcode);
CREATE INDEX IF NOT EXISTS idx_raw_materials_barcode ON raw_materials(barcode);
CREATE INDEX IF NOT EXISTS idx_product_raw_materials_product ON product_raw_materials(product_id);
CREATE INDEX IF NOT EXISTS idx_scan_movements_product_date ON production_scan_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scan_movements_batch ON production_scan_movements(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_scan_movements_scanned_code ON production_scan_movements(scanned_code);

DROP TRIGGER IF EXISTS product_raw_materials_updated_at ON product_raw_materials;
CREATE TRIGGER product_raw_materials_updated_at
BEFORE UPDATE ON product_raw_materials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
