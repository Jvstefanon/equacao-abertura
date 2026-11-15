import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import * as AdminJSSequelize from '@adminjs/sequelize';
import { sequelize, User, Registro } from './models.js';
import { createAuthRouter } from './auth.js';
import { createRegistrosRouter } from './registros.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Pasta do site (site/, ao lado de backoffice/). Só os arquivos listados abaixo são servidos.
const siteDir = path.resolve(here, '../../site');

AdminJS.registerAdapter({
  Database: AdminJSSequelize.Database,
  Resource: AdminJSSequelize.Resource,
});

const ROLES = ['admin', 'operador', 'visualizador'];

// ---------- Permissões do painel ----------
const isAdmin = ({ currentAdmin }) => currentAdmin?.role === 'admin';
const canEdit = ({ currentAdmin }) => ['admin', 'operador'].includes(currentAdmin?.role);

// ---------- Senha (painel) ----------
async function hashPasswordBefore(request) {
  if (request.payload && request.payload.password) {
    request.payload.passwordHash = await bcrypt.hash(request.payload.password, 12);
    delete request.payload.password;
  }
  return request;
}

async function requirePasswordOnCreate(request) {
  if (request.method === 'post' && !request.payload?.password) {
    throw new Error('Informe uma senha para o novo usuário.');
  }
  return hashPasswordBefore(request);
}

async function blockSelfDelete(request, context) {
  if (String(request.params.recordId) === String(context.currentAdmin.id)) {
    throw new Error('Você não pode excluir a sua própria conta.');
  }
  return request;
}

async function blockSelfDeactivate(request, context) {
  if (request.payload && request.payload.active === false
      && String(request.params.recordId) === String(context.currentAdmin.id)) {
    throw new Error('Você não pode desativar a sua própria conta.');
  }
  return hashPasswordBefore(request);
}

function setAuthorBefore(request, context) {
  request.payload = { ...request.payload, criadoPorId: context.currentAdmin.id };
  return request;
}

// Login do painel AdminJS: mesmas regras da API (usuário ativo e senha conferida)
async function authenticateAdmin(email, password) {
  const user = await User.findOne({
    where: { email: String(email || '').trim().toLowerCase() },
  });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function buildAdmin() {
  return new AdminJS({
    rootPath: '/admin',
    branding: {
      companyName: 'Equação da Abertura · Backoffice',
      withMadeWithLove: false,
    },
    databases: [sequelize],
    resources: [
      {
        resource: User,
        options: {
          navigation: { name: 'Acesso', icon: 'User' },
          listProperties: ['name', 'email', 'role', 'active'],
          editProperties: ['name', 'email', 'role', 'active', 'password'],
          showProperties: ['name', 'email', 'role', 'active', 'createdAt'],
          filterProperties: ['name', 'email', 'role', 'active'],
          properties: {
            passwordHash: { isVisible: false },
            password: {
              type: 'password',
              isVisible: { list: false, show: false, edit: true, filter: false },
              description: 'Deixe em branco para manter a senha atual.',
            },
            role: { availableValues: ROLES.map((r) => ({ value: r, label: r })) },
          },
          // Em AdminJS v7 a permissão é por ação.
          actions: {
            list: { isAccessible: isAdmin },
            show: { isAccessible: isAdmin },
            new: { before: requirePasswordOnCreate, isAccessible: isAdmin },
            edit: { before: blockSelfDeactivate, isAccessible: isAdmin },
            delete: { before: blockSelfDelete, isAccessible: isAdmin },
            bulkDelete: { isAccessible: false },
          },
        },
      },
      {
        resource: Registro,
        options: {
          navigation: { name: 'Operação', icon: 'Calendar' },
          listProperties: ['data', 'temNoticia', 'total', 'classificacao', 'resultadoDia', 'criadoPorId'],
          properties: {
            observacoes: { type: 'textarea' },
            imagem: { isVisible: false },
            criadoPorId: { isVisible: { list: true, show: true, edit: false, filter: true } },
          },
          actions: {
            list: { isAccessible: () => true },
            show: { isAccessible: () => true },
            new: { before: setAuthorBefore, isAccessible: canEdit },
            edit: { isAccessible: canEdit },
            delete: { isAccessible: isAdmin },
            bulkDelete: { isAccessible: isAdmin },
          },
        },
      },
    ],
  });
}

// Recusa gravações vindas de outro site (CSRF) e exige JSON nas rotas da API.
function protegeCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { host = ''; }
    if (host !== req.get('host')) {
      return res.status(403).json({ error: 'Origem não permitida.' });
    }
  }
  // Confere o cabeçalho direto: req.is() ignora requisições sem corpo (ex.: DELETE)
  if (!(req.get('content-type') || '').startsWith('application/json')) {
    return res.status(415).json({ error: 'Envie os dados em JSON.' });
  }
  return next();
}

function paginaProtegida(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/entrar');
}

export async function createApp({
  databaseUrl = process.env.DATABASE_URL,
  sessionSecret = process.env.SESSION_SECRET,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  if (!sessionSecret) throw new Error('Defina SESSION_SECRET no arquivo .env');

  const admin = buildAdmin();
  const PgStore = connectPgSimple(session);
  const store = new PgStore({ conString: databaseUrl, createTableIfMissing: true });
  const sessionMiddleware = session({
    store,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'connect.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: nodeEnv === 'production',
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
    },
  });

  const app = express();
  app.disable('x-powered-by');

  // Sessão única, compartilhada pela página e pelo painel AdminJS
  app.use(sessionMiddleware);

  // API
  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api', protegeCsrf);
  app.use('/api/auth', createAuthRouter());
  app.use('/api/registros', createRegistrosRouter());
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // Páginas do site (lista branca: nada do backoffice é servido)
  app.get(['/', '/index.html'], paginaProtegida, (req, res) => res.sendFile(path.join(siteDir, 'index.html')));
  app.get(['/entrar', '/login.html'], (req, res) => {
    if (req.session?.user) return res.redirect('/');
    return res.sendFile(path.join(siteDir, 'login.html'));
  });
  for (const arquivo of ['app.js', 'style.css', 'login.js', 'login.css', 'favicon.ico', 'favicon.svg']) {
    app.get(`/${arquivo}`, (req, res) => res.sendFile(path.join(siteDir, arquivo)));
  }

  // Painel AdminJS
  const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: authenticateAdmin,
      cookieName: 'equacao_admin',
      cookiePassword: sessionSecret,
    },
    express.Router(),
    { store, secret: sessionSecret, resave: false, saveUninitialized: false },
  );
  app.use(admin.options.rootPath, adminRouter);

  // Erros da API sempre em JSON, sem detalhes internos
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (req.path.startsWith('/api')) {
      return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
    }
    return res.status(500).send('Erro interno.');
  });

  return { app, admin };
}

export { sequelize };
