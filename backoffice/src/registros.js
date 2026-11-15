import express from 'express';
import { Registro, User } from './models.js';
import { requireAuth, requireRole } from './auth.js';

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESULTADOS = ['POSITIVA', 'NEGATIVA'];
const MAX_IMAGEM = 600_000; // caracteres da data URL (~450 KB)

// Confere se AAAA-MM-DD é uma data real (ex.: 2026-02-30 é inválida).
export function isDataValida(data) {
  if (typeof data !== 'string' || !DATA_RE.test(data)) return false;
  const [y, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Valida o corpo do PUT. Devolve { erro } ou { dados } já limpos.
export function validarRegistro(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return { erro: 'O corpo da requisição deve ser um objeto.' };
  }
  const { temNoticia = false, valores, total, classificacao, resultadoDia = 'POSITIVA', observacoes = '', imagem = null } = corpo;

  if (typeof temNoticia !== 'boolean') return { erro: 'temNoticia deve ser verdadeiro ou falso.' };
  if (!valores || typeof valores !== 'object' || Array.isArray(valores)) {
    return { erro: 'valores deve ser um objeto.' };
  }
  if (typeof total !== 'number' || !Number.isFinite(total)) {
    return { erro: 'total deve ser um número.' };
  }
  if (typeof classificacao !== 'string' || !classificacao.trim() || classificacao.length > 60) {
    return { erro: 'classificacao deve ser um texto de até 60 caracteres.' };
  }
  if (!RESULTADOS.includes(resultadoDia)) {
    return { erro: 'resultadoDia deve ser POSITIVA ou NEGATIVA.' };
  }
  if (typeof observacoes !== 'string' || observacoes.length > 2000) {
    return { erro: 'observacoes deve ser um texto de até 2000 caracteres.' };
  }
  if (imagem !== null && (typeof imagem !== 'string' || !imagem.startsWith('data:image/') || imagem.length > MAX_IMAGEM)) {
    return { erro: 'imagem deve ser uma imagem válida de até 450 KB.' };
  }

  return {
    dados: {
      temNoticia,
      valores,
      total: Math.round(total * 100) / 100,
      classificacao: classificacao.trim(),
      resultadoDia,
      observacoes: observacoes.trim(),
      imagem,
    },
  };
}

// Formato enviado para o navegador (total como número, autor com nome).
function paraApi(registro) {
  const r = registro.toJSON ? registro.toJSON() : registro;
  return {
    data: r.data,
    temNoticia: r.temNoticia,
    valores: r.valores,
    total: Number(r.total),
    classificacao: r.classificacao,
    resultadoDia: r.resultadoDia,
    observacoes: r.observacoes || '',
    imagem: r.imagem || null,
    criadoPor: r.criadoPor ? { id: r.criadoPor.id, name: r.criadoPor.name } : null,
    updatedAt: r.updatedAt,
  };
}

const incluiAutor = { model: User, as: 'criadoPor', attributes: ['id', 'name'] };

export function createRegistrosRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // Qualquer papel logado consulta
  router.get('/', async (req, res, next) => {
    try {
      const registros = await Registro.findAll({
        include: [incluiAutor],
        order: [['data', 'DESC']],
      });
      res.json({ registros: registros.map(paraApi) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:data', async (req, res, next) => {
    try {
      if (!isDataValida(req.params.data)) {
        return res.status(400).json({ error: 'Use a data no formato AAAA-MM-DD.' });
      }
      const registro = await Registro.findOne({ where: { data: req.params.data }, include: [incluiAutor] });
      if (!registro) return res.status(404).json({ error: 'Nenhum registro nesta data.' });
      return res.json({ registro: paraApi(registro) });
    } catch (err) {
      return next(err);
    }
  });

  // admin e operador criam ou atualizam
  router.put('/:data', requireRole('admin', 'operador'), async (req, res, next) => {
    try {
      if (!isDataValida(req.params.data)) {
        return res.status(400).json({ error: 'Use a data no formato AAAA-MM-DD.' });
      }
      const { erro, dados } = validarRegistro(req.body);
      if (erro) return res.status(400).json({ error: erro });

      const existente = await Registro.findOne({ where: { data: req.params.data } });
      if (existente) {
        await existente.update(dados);
      } else {
        // Autor vem da sessão, nunca do corpo da requisição
        await Registro.create({ ...dados, data: req.params.data, criadoPorId: req.user.id });
      }
      const salvo = await Registro.findOne({ where: { data: req.params.data }, include: [incluiAutor] });
      return res.status(existente ? 200 : 201).json({ registro: paraApi(salvo) });
    } catch (err) {
      return next(err);
    }
  });

  // Só admin exclui
  router.delete('/:data', requireRole('admin'), async (req, res, next) => {
    try {
      if (!isDataValida(req.params.data)) {
        return res.status(400).json({ error: 'Use a data no formato AAAA-MM-DD.' });
      }
      const apagados = await Registro.destroy({ where: { data: req.params.data } });
      if (!apagados) return res.status(404).json({ error: 'Nenhum registro nesta data.' });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
