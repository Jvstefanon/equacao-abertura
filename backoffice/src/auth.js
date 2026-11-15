import express from 'express';
import bcrypt from 'bcryptjs';
import { User } from './models.js';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Limite de tentativas por IP, em memória (por instância do app).
export function createLoginLimiter({ now = () => Date.now() } = {}) {
  const attempts = new Map();

  function entry(ip) {
    const current = attempts.get(ip);
    if (!current || now() - current.firstAt > WINDOW_MS) {
      const fresh = { count: 0, firstAt: now() };
      attempts.set(ip, fresh);
      return fresh;
    }
    return current;
  }

  return {
    isBlocked(ip) {
      return entry(ip).count >= MAX_FAILURES;
    },
    registerFailure(ip) {
      entry(ip).count += 1;
    },
    reset(ip) {
      attempts.delete(ip);
    },
  };
}

// Dados que podem sair da API: nunca o hash da senha.
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Carrega o usuário a cada requisição: desativação e mudança de papel valem na hora.
export async function requireAuth(req, res, next) {
  const sessionUser = req.session?.user;
  if (!sessionUser) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  const user = await User.findByPk(sessionUser.id);
  if (!user || !user.active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  req.user = publicUser(user);
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Seu acesso não permite esta ação.' });
    }
    return next();
  };
}

export function createAuthRouter() {
  const router = express.Router();
  const limiter = createLoginLimiter();

  router.post('/login', async (req, res, next) => {
    try {
      const ip = req.ip;
      if (limiter.isBlocked(ip)) {
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }

      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const user = email && password
        ? await User.findOne({ where: { email } })
        : null;

      // Mesma resposta para e-mail inexistente, senha errada ou usuário inativo.
      const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
      if (!ok) {
        limiter.registerFailure(ip);
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      limiter.reset(ip);
      await new Promise((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve())),
      );
      req.session.user = { id: user.id };
      return res.json({ user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/logout', (req, res, next) => {
    if (!req.session) return res.json({ ok: true });
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      return res.json({ ok: true });
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
