const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`API Velas Cristal rodando na porta ${env.port}`);
});
