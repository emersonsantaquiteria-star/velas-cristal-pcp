const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const { requireAuth } = require('./middleware/auth');

const authRoutes = require('./modules/auth/routes');
const dashboardRoutes = require('./modules/dashboard/routes');
const employeeRoutes = require('./modules/employees/routes');
const integrationRoutes = require('./modules/integrations/routes');
const inventoryRoutes = require('./modules/inventory/routes');
const productRoutes = require('./modules/products/routes');
const productionRoutes = require('./modules/production/routes');
const rawMaterialRoutes = require('./modules/rawMaterials/routes');
const reportRoutes = require('./modules/reports/routes');
const scanningRoutes = require('./modules/scanning/routes');
const timeClockRoutes = require('./modules/timeClock/routes');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.frontendUrls.includes('*') || env.frontendUrls.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origem nao permitida pelo CORS.'));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Velas Cristal' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/employees', requireAuth, employeeRoutes);
app.use('/api/integrations', requireAuth, integrationRoutes);
app.use('/api/inventory', requireAuth, inventoryRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/production', requireAuth, productionRoutes);
app.use('/api/raw-materials', requireAuth, rawMaterialRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/scanning', requireAuth, scanningRoutes);
app.use('/api/time-clock', requireAuth, timeClockRoutes);

app.use((_req, _res, next) => {
  const error = new Error('Rota nao encontrada.');
  error.status = 404;
  next(error);
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || 'Erro interno.',
    status
  });
});

module.exports = app;
