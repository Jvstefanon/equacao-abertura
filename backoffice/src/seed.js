import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { sequelize, User } from './models.js';

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const name = process.env.ADMIN_NAME || 'Administrador';

if (!email || !password) {
  console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env');
  process.exit(1);
}

await sequelize.sync();

const [user, created] = await User.findOrCreate({
  where: { email },
  defaults: {
    name,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'admin',
    active: true,
  },
});

console.log(
  created
    ? `Administrador criado: ${user.email}`
    : `Já existe um usuário com o e-mail ${user.email}. Nada foi alterado.`,
);

await sequelize.close();
