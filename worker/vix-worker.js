// Cloudflare Worker: devolve a variação do dia de VIX, FEF2! e CL1!,
// com CORS liberado, para a página conseguir ler direto do navegador.
// Resposta:
// { "vix":  { "percent_change": 6.83,  "price": 15.18, "symbol": "CBOE:VIX" },
//   "fef2": { "percent_change": 0.16,  "price": 95.95, "symbol": "SGX:FEFV2026" },
//   "cl1":  { "percent_change": -0.65, "price": 91.56, "symbol": "NYMEX:CL1!" } }
// Ativo que falhar vem como null.
//
// Fonte principal: scanner do TradingView (mesmos números do gráfico, ~10 min de atraso).
// Reserva para VIX e CL1!: Yahoo Finance.

const SCANNER_URL = 'https://scanner.tradingview.com/global/scan';
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=60',
};

const MONTH_CODES = 'FGHJKMNQUVXZ';

// O scanner não aceita o contínuo FEF2!, então pede os contratos mensais
// dos próximos meses; o FEF2! é o 2º que ainda não venceu.
function ironOreCandidates() {
  const now = new Date();
  const tickers = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    tickers.push(`SGX:FEF${MONTH_CODES[d.getUTCMonth()]}${d.getUTCFullYear()}`);
  }
  return tickers;
}

function todayNumber() {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function fetchFromTradingView() {
  const out = { vix: null, fef2: null, cl1: null };
  const ironOre = ironOreCandidates();
  const res = await fetch(SCANNER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: ['CBOE:VIX', 'NYMEX:CL1!', ...ironOre] },
      columns: ['close', 'change', 'expiration'],
    }),
  });
  if (!res.ok) return out;
  const rows = (await res.json())?.data || [];

  const entry = (row) => {
    const [price, change] = row.d;
    return typeof change === 'number' ? { percent_change: change, price, symbol: row.s } : null;
  };

  for (const row of rows) {
    if (row.s === 'CBOE:VIX') out.vix = entry(row);
    if (row.s === 'NYMEX:CL1!') out.cl1 = entry(row);
  }

  const today = todayNumber();
  const active = rows
    .filter(r => ironOre.includes(r.s) && typeof r.d[2] === 'number' && r.d[2] >= today)
    .sort((a, b) => a.d[2] - b.d[2]);
  if (active[1]) out.fef2 = entry(active[1]);

  return out;
}

async function fetchFromYahoo(symbol) {
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const prev = meta?.chartPreviousClose ?? meta?.previousClose;
      if (typeof price !== 'number' || typeof prev !== 'number' || !prev) continue;
      return { percent_change: ((price - prev) / prev) * 100, price, symbol: `YAHOO:${symbol}` };
    } catch (e) {
      // tenta o próximo host
    }
  }
  return null;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    let data = { vix: null, fef2: null, cl1: null };
    try {
      data = await fetchFromTradingView();
    } catch (e) {
      // segue para a reserva
    }
    if (!data.vix) data.vix = await fetchFromYahoo('^VIX');
    if (!data.cl1) data.cl1 = await fetchFromYahoo('CL=F');

    const status = data.vix || data.fef2 || data.cl1 ? 200 : 502;
    return new Response(JSON.stringify(data), { status, headers: CORS });
  },
};
// vim: set ts=2 sw=2 et: