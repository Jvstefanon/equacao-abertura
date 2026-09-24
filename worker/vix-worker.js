// Cloudflare Worker: devolve a variação do VIX do dia, com CORS liberado,
// para a página conseguir ler direto do navegador.
// Resposta: { "percent_change": 6.83, "price": 15.18, "previous_close": 14.21, "time": 1790194501 }

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=60',
};

async function fetchVix() {
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(`https://${host}/v8/finance/chart/%5EVIX?range=1d&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const prev = meta?.chartPreviousClose ?? meta?.previousClose;
      if (typeof price !== 'number' || typeof prev !== 'number' || !prev) continue;
      return {
        percent_change: ((price - prev) / prev) * 100,
        price,
        previous_close: prev,
        time: meta.regularMarketTime ?? null,
      };
    } catch (e) {
      // tenta o próximo host
    }
  }
  return null;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const vix = await fetchVix();
    if (!vix) {
      return new Response(JSON.stringify({ error: 'Não consegui obter o VIX agora.' }), { status: 502, headers: CORS });
    }
    return new Response(JSON.stringify(vix), { headers: CORS });
  },
};
