// Cloudflare Worker: devolve a variação do dia de VIX, FEF2!, CL1! e das
// 6 ADRs, com CORS liberado, para a página conseguir ler direto do navegador.
// Resposta (um objeto por ativo; o que falhar vem como null):
// { "vix":  { "percent_change": 6.83,  "price": 15.18, "symbol": "CBOE:VIX" },
//   "fef2": { "percent_change": 0.16,  "price": 95.95, "symbol": "SGX:FEFV2026" },
//   "cl1":  { ... }, "vale": { ... }, "pbr": { ... }, "itub": { ... },
//   "bdory": { ... }, "bbd": { ... }, "bolsy": { ... } }
//
// Fonte principal: scanner do TradingView (mesmos números do gráfico, ~10 min de atraso).
// Reserva: Yahoo Finance (todos, menos o FEF2!).

const SCANNER_URL = 'https://scanner.tradingview.com/global/scan';
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

// campo da página → símbolo no TradingView e na Yahoo
const TICKERS = {
  vix:   { tv: 'CBOE:VIX',   yahoo: '^VIX' },
  cl1:   { tv: 'NYMEX:CL1!', yahoo: 'CL=F' },
  vale:  { tv: 'NYSE:VALE',  yahoo: 'VALE' },
  pbr:   { tv: 'NYSE:PBR',   yahoo: 'PBR' },
  itub:  { tv: 'NYSE:ITUB',  yahoo: 'ITUB' },
  bdory: { tv: 'OTC:BDORY',  yahoo: 'BDORY' },
  bbd:   { tv: 'NYSE:BBD',   yahoo: 'BBD' },
  bolsy: { tv: 'OTC:BOLSY',  yahoo: 'BOLSY' },
};

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

function emptyResult() {
  const out = { fef2: null };
  for (const key of Object.keys(TICKERS)) out[key] = null;
  return out;
}

async function fetchFromTradingView() {
  const out = emptyResult();
  const ironOre = ironOreCandidates();
  const res = await fetch(SCANNER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: [...Object.values(TICKERS).map(t => t.tv), ...ironOre] },
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
    for (const [key, t] of Object.entries(TICKERS)) {
      if (row.s === t.tv) out[key] = entry(row);
    }
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

    let data = emptyResult();
    try {
      data = await fetchFromTradingView();
    } catch (e) {
      // segue para a reserva
    }

    const missing = Object.keys(TICKERS).filter(key => !data[key]);
    const fallback = await Promise.all(missing.map(key => fetchFromYahoo(TICKERS[key].yahoo)));
    missing.forEach((key, i) => { data[key] = fallback[i]; });

    const status = Object.values(data).some(Boolean) ? 200 : 502;
    return new Response(JSON.stringify(data), { status, headers: CORS });
  },
};
