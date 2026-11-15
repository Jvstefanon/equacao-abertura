import 'dotenv/config';
import { createApp, sequelize } from './app.js';

async function start() {
  await sequelize.authenticate();
  await sequelize.sync();

  const { app, admin } = await createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Site e login: http://localhost:${port}/entrar`);
    console.log(`Backoffice:   http://localhost:${port}${admin.options.rootPath}`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err.message);
  process.exit(1);
});
