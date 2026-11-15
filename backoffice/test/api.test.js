// Testes da API de login e registros. Rodam contra o banco de DATABASE_URL.
// Execute com: npm test
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { createApp, sequelize } from '../src/app.js';
import { User, Registro } from '../src/models.js';

const SENHA = 'Senha-Forte-123';
const EMAIL_DOMINIO = '@teste-api.com';
const emails = {
  admin: `admin${EMAIL_DOMINIO}`,
  operador: `operador${EMAIL_DOMINIO}`,
  visualizador: `visu${EMAIL_DOMINIO}`,
  inativo: `inativo${EMAIL_DOMINIO}`,
};

const servidores = [];

async function iniciar() {
  const { app } = await createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servidores.push(server);
  return `http://localhost:${server.address().port}`;
}

async function entrar(base, email, senha = SENHA) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  const setCookie = r.headers.get('set-cookie');
  return {
    status: r.status,
    body: await r.json(),
    cookie: setCookie ? setCookie.split(';')[0] : null,
  };
}

async function api(base, metodo, caminho, { cookie, corpo, origem } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (origem) headers.origin = origem;
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: r.status, body: json, headers: r.headers };
}

const registroValido = (data, extra = {}) => ({
  temNoticia: false,
  valores: { vix: -4.1, fef2: -0.7, cl1: 0.3 },
  total: -5.5,
  classificacao: 'NEGATIVA FORTE',
  resultadoDia: 'POSITIVA',
  observacoes: `teste ${data}`,
  ...extra,
});

before(async () => {
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
    throw new Error('Defina DATABASE_URL e SESSION_SECRET (ou use o .env).');
  }
  await sequelize.sync();
  await Registro.destroy({ where: {} });
  await User.destroy({ where: { email: { [Op.like]: `%${EMAIL_DOMINIO}` } } });
  const hash = await bcrypt.hash(SENHA, 12);
  await User.create({ name: 'Admin', email: emails.admin, passwordHash: hash, role: 'admin' });
  await User.create({ name: 'Operador', email: emails.operador, passwordHash: hash, role: 'operador' });
  await User.create({ name: 'Visu', email: emails.visualizador, passwordHash: hash, role: 'visualizador' });
  await User.create({ name: 'Inativo', email: emails.inativo, passwordHash: hash, role: 'operador', active: false });
});

after(async () => {
  for (const s of servidores) {
    s.closeAllConnections?.();
    await new Promise((r) => s.close(r));
  }
  await Registro.destroy({ where: {} });
  await User.destroy({ where: { email: { [Op.like]: `%${EMAIL_DOMINIO}` } } });
  await sequelize.close();
});

test('login com senha correta cria sessão e não expõe o hash', async () => {
  const base = await iniciar();
  const r = await entrar(base, emails.admin);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, emails.admin);
  assert.equal(r.body.user.role, 'admin');
  assert.equal(r.body.user.passwordHash, undefined);
  assert.ok(r.cookie, 'deve devolver o cookie de sessão');
});

test('senha errada recebe mensagem genérica', async () => {
  const base = await iniciar();
  const r = await entrar(base, emails.admin, 'errada');
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'E-mail ou senha incorretos.');
});

test('e-mail inexistente recebe a mesma mensagem genérica', async () => {
  const base = await iniciar();
  const r = await entrar(base, `ninguem${EMAIL_DOMINIO}`);
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'E-mail ou senha incorretos.');
});

test('usuário inativo não consegue entrar', async () => {
  const base = await iniciar();
  const r = await entrar(base, emails.inativo);
  assert.equal(r.status, 401);
});

test('GET /api/auth/me sem sessão retorna 401', async () => {
  const base = await iniciar();
  const r = await api(base, 'GET', '/api/auth/me');
  assert.equal(r.status, 401);
});

test('GET /api/auth/me com sessão retorna o usuário', async () => {
  const base = await iniciar();
  const login = await entrar(base, emails.operador);
  const r = await api(base, 'GET', '/api/auth/me', { cookie: login.cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'operador');
});

test('usuário desativado depois do login perde o acesso na hora', async () => {
  const base = await iniciar();
  const login = await entrar(base, emails.visualizador);
  await User.update({ active: false }, { where: { email: emails.visualizador } });
  const r = await api(base, 'GET', '/api/auth/me', { cookie: login.cookie });
  assert.equal(r.status, 401);
  await User.update({ active: true }, { where: { email: emails.visualizador } });
});

test('visualizador consulta, mas não grava (403)', async () => {
  const base = await iniciar();
  const login = await entrar(base, emails.visualizador);
  const lista = await api(base, 'GET', '/api/registros', { cookie: login.cookie });
  assert.equal(lista.status, 200);
  const put = await api(base, 'PUT', '/api/registros/2030-01-05', {
    cookie: login.cookie,
    corpo: registroValido('2030-01-05'),
  });
  assert.equal(put.status, 403);
});

test('operador grava e a data fica igual à enviada (sem deslocamento de fuso)', async () => {
  const base = await iniciar();
  const login = await entrar(base, emails.operador);
  const put = await api(base, 'PUT', '/api/registros/2030-01-10', {
    cookie: login.cookie,
    corpo: registroValido('2030-01-10'),
  });
  assert.equal(put.status, 201);
  assert.equal(put.body.registro.data, '2030-01-10');

  const get = await api(base, 'GET', '/api/registros/2030-01-10', { cookie: login.cookie });
  assert.equal(get.status, 200);
  assert.equal(get.body.registro.data, '2030-01-10');
  assert.equal(get.body.registro.criadoPor.name, 'Operador');
});

test('data inválida é recusada com 400', async () => {
  const base = await iniciar();
  const login = await entrar(base, emails.admin);
  const put = await api(base, 'PUT', '/api/registros/2030-02-30', {
    cookie: login.cookie,
    corpo: registroValido('2030-02-30'),
  });
  assert.equal(put.status, 400);
});

test('corpo inválido recebe mensagem clara', async () => {
  const base = await iniciar();
  const login = await entrar(base, emails.admin);
  const put = await api(base, 'PUT', '/api/registros/2030-01-11', {
    cookie: login.cookie,
    corpo: registroValido('2030-01-11', { resultadoDia: 'TALVEZ' }),
  });
  assert.equal(put.status, 400);
  assert.match(put.body.error, /resultadoDia/);
});

test('gravação vinda de outro site é bloqueada (CSRF)', async () => {
  const base = await iniciar();
  const login = await entrar(base, emails.admin);
  const put = await api(base, 'PUT', '/api/registros/2030-01-12', {
    cookie: login.cookie,
    origem: 'https://site-malicioso.example',
    corpo: registroValido('2030-01-12'),
  });
  assert.equal(put.status, 403);
});

test('apenas admin exclui registro', async () => {
  const base = await iniciar();
  const operador = await entrar(base, emails.operador);
  const negado = await api(base, 'DELETE', '/api/registros/2030-01-10', { cookie: operador.cookie });
  assert.equal(negado.status, 403);

  const admin = await entrar(base, emails.admin);
  const ok = await api(base, 'DELETE', '/api/registros/2030-01-10', { cookie: admin.cookie });
  assert.equal(ok.status, 200);
});

test('muitas tentativas erradas bloqueiam o IP (429), mesmo com a senha certa', async () => {
  const base = await iniciar(); // instância nova, com contador zerado
  for (let i = 0; i < 5; i++) {
    const r = await entrar(base, emails.admin, 'errada');
    assert.equal(r.status, 401);
  }
  const bloqueado = await entrar(base, emails.admin);
  assert.equal(bloqueado.status, 429);
});

test('página principal exige sessão e a lista branca não expõe o backoffice', async () => {
  const base = await iniciar();
  const semSessao = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(semSessao.status, 302);
  assert.equal(semSessao.headers.get('location'), '/entrar');

  const interno = await fetch(`${base}/package.json`);
  assert.equal(interno.status, 404);
  const codigo = await fetch(`${base}/src/app.js`);
  assert.equal(codigo.status, 404);
});
