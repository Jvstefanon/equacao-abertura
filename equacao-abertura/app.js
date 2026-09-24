/* ============================================================
   HELPERS BÁSICOS
   ============================================================ */
const $ = (id) => document.getElementById(id);

// Data de hoje no fuso local (toISOString usaria UTC e viraria o dia às 21h em Brasília).
function todayISO(){
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function fmtBR(dateISO){
  const [y,m,d] = dateISO.split('-');
  return `${d}/${m}/${y}`;
}

function fmtPct(v){
  let s = v.toFixed(2);
  if (s.endsWith('0')) s = s.slice(0,-1);
  if (s.endsWith('.')) s = s.slice(0,-1);
  return s.replace('.', ',');
}

function signed(v){
  const f = fmtPct(Math.abs(v));
  return v < 0 ? `(-${f}%)` : `+${f}%`;
}

function num(id){ const v = parseFloat($(id).value); return isNaN(v) ? 0 : v; }


/* ============================================================
   ESTADO E VALORES PADRÃO
   ============================================================ */
let hasNews = false;
let dayResult = 'POSITIVA';

const DEFAULTS = {
  external: {vix:-4.1, fef2:-0.7, cl1:0.3},
  adr: {vale:-0.26, pbr:-1.9, itub:-0.85, bdory:-0.45, bbd:0.29, bolsy:-0.49}
};


/* ============================================================
   ALTERNÂNCIA "TEM NOTÍCIA 3★?" (externo vs. ADRs)
   ============================================================ */
function setToggle(val){
  hasNews = (val === 'SIM');
  document.querySelectorAll('#newsToggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.val === val);
  });
  $('externalGrid').style.display = hasNews ? 'none' : 'grid';
  $('adrGrid').style.display = hasNews ? 'grid' : 'none';
  $('subtitleText').textContent = hasNews
    ? 'Com notícia 3★ às 9h: ignora o externo — a intenção sai da soma das 6 ADRs em Nova York.'
    : 'Sem notícia 3★ às 9h: a intenção sai do externo — VIX inverte o sinal, FEF2! e CL1! mantêm.';
  $('equationText').innerHTML = hasNews
    ? '<span class="eq-label">EQUAÇÃO</span>VALE + PBR + ITUB + BDORY + BBD + BOLSY = Intenção'
    : '<span class="eq-label">EQUAÇÃO</span>( -VIX ) + FEF2! + CL1! = Intenção';
  compute();
}

function initToggleListeners(){
  document.querySelectorAll('#newsToggle button').forEach(b=>{
    b.addEventListener('click', ()=> setToggle(b.dataset.val));
  });
}


/* ============================================================
   RESULTADO DO DIA (POSITIVA / NEGATIVA) — vai junto no registro
   ============================================================ */
function setResultToggle(val){
  dayResult = val;
  document.querySelectorAll('#resultToggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.val === val);
  });
}

function initResultToggleListeners(){
  document.querySelectorAll('#resultToggle button').forEach(b=>{
    b.addEventListener('click', ()=> setResultToggle(b.dataset.val));
  });
}


/* ============================================================
   ENTRADAS NUMÉRICAS (steppers, aleatório, reset)
   ============================================================ */
function adjust(id, step){
  const v = num(id) + step;
  $(id).value = (Math.round(v*100)/100).toFixed(2);
  compute();
}

function currentValues(){
  if (hasNews){
    return {vale:num('in-vale'), pbr:num('in-pbr'), itub:num('in-itub'), bdory:num('in-bdory'), bbd:num('in-bbd'), bolsy:num('in-bolsy')};
  }
  return {vix:num('in-vix'), fef2:num('in-fef2'), cl1:num('in-cl1')};
}

function initInputListeners(){
  document.querySelectorAll('input[type=number]').forEach(inp=>{
    inp.addEventListener('input', compute);
  });

  $('randomBtn').addEventListener('click', ()=>{
    const rnd = (min,max) => (Math.round((Math.random()*(max-min)+min)*100)/100).toFixed(2);
    if (hasNews){
      $('in-vale').value = rnd(-3,3); $('in-pbr').value = rnd(-3,3); $('in-itub').value = rnd(-3,3);
      $('in-bdory').value = rnd(-3,3); $('in-bbd').value = rnd(-3,3); $('in-bolsy').value = rnd(-3,3);
    } else {
      $('in-vix').value = rnd(-6,6); $('in-fef2').value = rnd(-2,2); $('in-cl1').value = rnd(-2,2);
    }
    compute();
  });

  $('resetBtn').addEventListener('click', ()=>{
    if (hasNews){
      Object.entries(DEFAULTS.adr).forEach(([k,v])=> $('in-'+k).value = v.toFixed(2));
    } else {
      Object.entries(DEFAULTS.external).forEach(([k,v])=> $('in-'+k).value = v.toFixed(2));
    }
    compute();
  });
}


/* ============================================================
   CLASSIFICAÇÃO E ESCALA VISUAL
   ============================================================ */
function classify(v){
  if (v < -4.5) return {sign:'NEGATIVA', intensity:'FORTE', tone:'down', phrase:'busca regiões vendedoras acima da abertura.'};
  if (v < -2.5) return {sign:'NEGATIVA', intensity:'MODERADA', tone:'down', phrase:'busca regiões vendedoras acima da abertura.'};
  if (v < -1.5) return {sign:'NEGATIVA', intensity:'FRACA', tone:'down', phrase:'busca regiões vendedoras acima da abertura.'};
  if (v <= 1.5) return {sign:'LATERAL', intensity:'', tone:'flat', phrase:'sem viés definido, aguarda confirmação de direção.'};
  if (v <= 2.5) return {sign:'POSITIVA', intensity:'FRACA', tone:'up', phrase:'busca regiões compradoras abaixo da abertura.'};
  if (v <= 4.5) return {sign:'POSITIVA', intensity:'MODERADA', tone:'up', phrase:'busca regiões compradoras abaixo da abertura.'};
  return {sign:'POSITIVA', intensity:'FORTE', tone:'up', phrase:'busca regiões compradoras abaixo da abertura.'};
}

function toneColorClass(tone){
  return tone === 'up' ? 'up-color' : tone === 'down' ? 'down-color' : 'flat-color';
}

const ZONE_BOUNDS = [
  [0, 12.5],      // forte negativa
  [12.5, 29.17],  // moderada negativa
  [29.17, 37.5],  // fraca negativa
  [37.5, 62.5],   // lateral
  [62.5, 70.83],  // fraca positiva
  [70.83, 87.5],  // moderada positiva
  [87.5, 100],    // forte positiva
];

function zoneIndex(v){
  if (v < -4.5) return 0;
  if (v < -2.5) return 1;
  if (v < -1.5) return 2;
  if (v <= 1.5) return 3;
  if (v <= 2.5) return 4;
  if (v <= 4.5) return 5;
  return 6;
}

function renderScale(total){
  const clamped = Math.max(-6, Math.min(6, total));
  const pct = ((clamped + 6) / 12) * 100;
  $('pointer').style.left = pct + '%';
  const c = classify(total);
  $('pointer').style.color = c.tone==='up' ? 'var(--green)' : c.tone==='down' ? 'var(--red)' : 'var(--orange)';
  $('pointerValue').textContent = (total>=0?'+':'') + fmtPct(total) + '%';
  const [zs, ze] = ZONE_BOUNDS[zoneIndex(total)];
  const zone = $('activeZone');
  zone.style.left = zs + '%';
  zone.style.width = (ze - zs) + '%';
}


/* ============================================================
   CÁLCULO PRINCIPAL (equação + atualização da UI)
   ============================================================ */
function compute(){
  const v = currentValues();
  let total, calcParts;
  if (hasNews){
    total = v.vale + v.pbr + v.itub + v.bdory + v.bbd + v.bolsy;
    calcParts = [v.vale, v.pbr, v.itub, v.bdory, v.bbd, v.bolsy];
  } else {
    total = (-v.vix) + v.fef2 + v.cl1;
    calcParts = [-v.vix, v.fef2, v.cl1];
  }

  let html = '<span class="lbl">CÁLCULO</span>';
  calcParts.forEach((p, i) => {
    if (i > 0) html += '<span class="eq"> + </span>';
    html += `<span class="${p<0?'down':'up'}">${signed(p)}</span>`;
  });
  const c = classify(total);
  html += `<span class="eq"> = </span><span class="${c.tone==='up'?'up':c.tone==='down'?'down':'eq'}">${(total>=0?'+':'')+fmtPct(total)}%</span>`;
  $('calcPill').innerHTML = html;

  renderScale(total);

  $('rv').textContent = (total>=0?'+':'') + fmtPct(total) + '%';
  $('rv').className = 'rv ' + toneColorClass(c.tone);
  $('rc').textContent = c.sign === 'LATERAL' ? 'ABERTURA LATERAL' : `ABERTURA ${c.sign} ${c.intensity}`;
  $('rc').className = 'rc ' + toneColorClass(c.tone);
  $('rp').textContent = c.phrase;

  const classification = (c.intensity ? c.intensity + ' ' : '') + c.sign;
  return {total, classification};
}


/* ============================================================
   COLETA AUTOMÁTICA
   Fontes: Twelve Data (ADRs) e Cloudflare Worker (VIX, FEF2!, CL1!) —
   cotação AO VIVO, só serve para "hoje".
   Datas passadas não têm fonte grátis automática aqui, então
   ficam sempre para preenchimento manual.
   ============================================================ */
const API_KEY_STORAGE = 'equacaoAbertura.twelveDataKey';

// Chave fixa: cole a sua aqui entre as aspas para não precisar
// digitá-la no navegador. Uma chave salva pelo campo da página
// tem prioridade sobre esta.
const DEFAULT_API_KEY = '54c2ccad079b48b2b3d24a501e84edaa';

// VIX, FEF2! e CL1! não existem na Twelve Data; vêm do Cloudflare
// Worker em worker/vix-worker.js (TradingView/Yahoo, com CORS liberado).
const VIX_WORKER_URL = 'https://vix.jvstefanon.workers.dev';

// Retorna { vix, fef2, cl1 } com a variação % do dia; o que falhar vira null.
async function fetchExternalFromWorker(){
  const result = { vix:null, fef2:null, cl1:null };
  const res = await fetch(VIX_WORKER_URL);
  if (!res.ok) return result;
  const data = await res.json();
  Object.keys(result).forEach(k => {
    const pc = parseFloat(data[k] && data[k].percent_change);
    result[k] = isNaN(pc) ? null : pc;
  });
  return result;
}

function getApiKey(){
  let saved = '';
  try { saved = localStorage.getItem(API_KEY_STORAGE) || ''; } catch(e) {}
  return (saved.trim() || DEFAULT_API_KEY).trim();
}

function saveApiKey(){
  const key = $('apiKeyInput').value.trim();
  localStorage.setItem(API_KEY_STORAGE, key);
  const el = $('apiKeyStatus');
  el.textContent = key ? 'Chave salva neste navegador.' : 'Chave removida.';
  el.className = 'fetch-status ok';
}

function loadApiKeyIntoInput(){
  $('apiKeyInput').value = getApiKey();
}

function setFetchStatus(msg, kind){
  const el = $('fetchStatus');
  el.textContent = msg;
  el.className = 'fetch-status' + (kind ? ' '+kind : '');
}

// Busca cotações "ao vivo" na Twelve Data. Retorna um objeto
// { SIMBOLO: percentChange|null }. Símbolos que falharem viram null,
// nunca lançam erro individualmente (para não travar o resto).
async function fetchTwelveDataQuotes(symbols){
  const key = getApiKey();
  const result = {};
  symbols.forEach(s => result[s] = null);
  if (!key) return result;

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = await res.json();

  // Twelve Data retorna um objeto plano quando é 1 símbolo,
  // e um objeto { SIMBOLO: {...} } quando são vários.
  if (symbols.length === 1){
    const pc = parseFloat(data.percent_change);
    result[symbols[0]] = isNaN(pc) ? null : pc;
  } else {
    symbols.forEach(s => {
      const entry = data[s];
      if (entry && entry.percent_change != null){
        const pc = parseFloat(entry.percent_change);
        result[s] = isNaN(pc) ? null : pc;
      }
    });
  }
  return result;
}

function applyValues(values){
  Object.entries(values).forEach(([field, val]) => {
    if (val == null) return;
    const el = $('in-' + field);
    if (el) el.value = Number(val).toFixed(2);
  });
}

async function fetchAuto(){
  const date = $('dateInput').value;
  if (!date){ setFetchStatus('Escolha uma data primeiro.', 'error'); return; }
  const btn = $('fetchBtn');
  btn.disabled = true;

  const isToday = date === todayISO();
  const hasKey = !!getApiKey();

  try{
    if (!hasKey){
      setFetchStatus('Cole e salve sua chave da Twelve Data acima para usar a coleta automática.', 'error');
      return;
    }
    if (!isToday){
      setFetchStatus('Coleta automática só funciona para a data de hoje (cotação ao vivo). Para datas passadas, preencha manualmente.', 'error');
      return;
    }

    if (hasNews){
      const symbols = ['vale','pbr','itub','bdory','bbd','bolsy'];
      const tdMap = { vale:'VALE', pbr:'PBR', itub:'ITUB', bdory:'BDORY', bbd:'BBD', bolsy:'BOLSY' };

      setFetchStatus('Buscando cotações ao vivo (Twelve Data)…', '');
      const tdSymbols = symbols.map(s => tdMap[s]);
      const tdResult = await fetchTwelveDataQuotes(tdSymbols);
      const values = {};
      symbols.forEach(s => values[s] = tdResult[tdMap[s]]);
      applyValues(values);
      compute();

      const missing = symbols.filter(s => values[s] == null);
      if (missing.length){
        setFetchStatus(`Twelve Data não cobriu: ${missing.join(', ').toUpperCase()}. Preencha esses manualmente.`, 'warn');
      } else {
        setFetchStatus('Cotações ao vivo aplicadas via Twelve Data. Confira antes de salvar.', 'ok');
      }

    } else {
      setFetchStatus('Buscando VIX, FEF2! e CL1! ao vivo…', '');
      const values = await fetchExternalFromWorker();
      applyValues(values);
      compute();

      const names = { vix:'VIX', fef2:'FEF2!', cl1:'CL1!' };
      const missing = Object.keys(values).filter(k => values[k] == null).map(k => names[k]);
      if (missing.length === 3){
        setFetchStatus('Não consegui obter VIX, FEF2! e CL1! agora. Preencha manualmente.', 'warn');
      } else if (missing.length){
        setFetchStatus(`Cotações aplicadas, exceto ${missing.join(', ')}. Preencha esses manualmente.`, 'warn');
      } else {
        setFetchStatus('VIX, FEF2! e CL1! ao vivo aplicados. Confira antes de salvar.', 'ok');
      }
    }
  }catch(e){
    setFetchStatus('Não consegui buscar agora: ' + e.message, 'error');
  }finally{
    btn.disabled = false;
  }
}

// Atualização automática: busca ao abrir e depois a cada 5 minutos.
// Só roda quando a data escolhida é hoje e há chave; senão fica quieto.
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function autoFetch(){
  if (!getApiKey()) return;
  if ($('dateInput').value !== todayISO()) return;
  if ($('fetchBtn').disabled) return; // já tem uma busca em andamento
  fetchAuto();
}

function initFetchListener(){
  $('fetchBtn').addEventListener('click', fetchAuto);
  $('saveApiKeyBtn').addEventListener('click', saveApiKey);
  loadApiKeyIntoInput();
  autoFetch();
  setInterval(autoFetch, AUTO_REFRESH_MS);
}


/* ============================================================
   REGISTRO / HISTÓRICO (localStorage — salvo no próprio navegador)
   Os dados ficam gravados no navegador que você está usando, na
   pasta/perfil dele. Persistem entre sessões, mas não são
   compartilhados entre navegadores/computadores diferentes.
   ============================================================ */
const STORAGE_KEY = 'equacaoAbertura.registros';

function readAllRecords(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    console.error('Erro ao ler localStorage:', e);
    return {};
  }
}

function writeAllRecords(records){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function showStatus(msg, isError){
  const el = $('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg' + (isError ? ' error' : '');
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}


/* ============================================================
   IMAGEM ANEXADA AO REGISTRO
   Comprimida no navegador (canvas) antes de virar base64, para não
   pesar demais no localStorage (que tem limite de poucos MB).
   ============================================================ */
let currentImage = null;

function compressImage(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 900;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('não foi possível ler a imagem'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

function setImagePreview(dataUrl){
  currentImage = dataUrl || null;
  const img = $('imagePreview');
  const removeBtn = $('removeImageBtn');
  if (currentImage){
    img.src = currentImage;
    img.style.display = 'block';
    removeBtn.style.display = 'inline-block';
  } else {
    img.src = '';
    img.style.display = 'none';
    removeBtn.style.display = 'none';
  }
}

async function handleImageSelect(e){
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = $('imageStatus');
  statusEl.textContent = 'Processando imagem…';
  statusEl.className = 'fetch-status';
  try{
    const dataUrl = await compressImage(file);
    setImagePreview(dataUrl);
    const kb = Math.round(dataUrl.length * 0.75 / 1024);
    statusEl.textContent = `Imagem pronta (~${kb} KB).`;
    statusEl.className = 'fetch-status ok';
  }catch(err){
    statusEl.textContent = 'Erro ao processar imagem: ' + err.message;
    statusEl.className = 'fetch-status error';
  }
}

function clearImageField(){
  setImagePreview(null);
  $('imageInput').value = '';
  $('imageStatus').textContent = '';
  $('imageStatus').className = 'fetch-status';
}

function initImageListener(){
  $('imageInput').addEventListener('change', handleImageSelect);
  $('removeImageBtn').addEventListener('click', clearImageField);
}

function openImageLightbox(date){
  const rec = readAllRecords()[date];
  if (!rec || !rec.image) return;
  $('lightboxImg').src = rec.image;
  $('imageLightbox').style.display = 'flex';
}

function closeImageLightbox(){
  $('imageLightbox').style.display = 'none';
}


function saveRecord(){
  const date = $('dateInput').value;
  if (!date){ showStatus('Escolha uma data antes de salvar.', true); return; }
  const result = compute();
  const record = {
    date, hasNews, values: currentValues(),
    total: result.total, classification: result.classification,
    dayResult, description: $('descInput').value.trim(),
    image: currentImage,
    savedAt: new Date().toISOString()
  };
  try{
    const records = readAllRecords();
    records[date] = record;
    writeAllRecords(records);
    $('descInput').value = '';
    clearImageField();
    showStatus(`Registro de ${fmtBR(date)} salvo.`, false);
    loadHistory();
  }catch(e){
    const msg = (e.name === 'QuotaExceededError')
      ? 'Espaço do navegador cheio (localStorage). Tente remover imagens de registros antigos.'
      : 'Erro ao salvar: ' + e.message;
    showStatus(msg, true);
  }
}

function loadHistory(){
  const wrap = $('historyWrap');
  try{
    const records = Object.values(readAllRecords()).sort((a,b)=> b.date.localeCompare(a.date));
    if (records.length === 0){
      wrap.innerHTML = '<div class="empty-state">Nenhum registro salvo ainda.</div>';
      return;
    }
    let html = '<table><thead><tr><th>Data</th><th>Base</th><th>Intenção</th><th>Classificação</th><th>Resultado</th><th>Descrição</th><th>Img</th><th></th></tr></thead><tbody>';
    for (const r of records){
      const tone = r.total < -1.5 ? 'down-color' : r.total > 1.5 ? 'up-color' : 'flat-color';
      const resultTone = r.dayResult === 'NEGATIVA' ? 'down-color' : 'up-color';
      const resultLabel = r.dayResult === 'NEGATIVA' ? 'NEGATIVA' : 'POSITIVA';
      const desc = r.description || '';
      const descShort = desc.length > 40 ? desc.slice(0, 40) + '…' : desc;
      const imgCell = r.image
        ? `<img src="${r.image}" onclick="openImageLightbox('${r.date}')" style="width:36px;height:36px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid var(--border);">`
        : '<span class="empty-state" style="padding:0;">—</span>';
      html += `<tr>
        <td class="date">${fmtBR(r.date)}</td>
        <td>${r.hasNews ? 'ADRs' : 'Externo'}</td>
        <td class="pct ${tone}">${r.total >= 0 ? '+' : ''}${fmtPct(r.total)}%</td>
        <td>${r.classification}</td>
        <td class="${resultTone}" style="font-weight:700;font-size:11px;">${resultLabel}</td>
        <td title="${escapeHtml(desc)}">${escapeHtml(descShort) || '<span class="empty-state" style="padding:0;">—</span>'}</td>
        <td>${imgCell}</td>
        <td class="row-actions">
          <button onclick="loadIntoForm('${r.date}')">abrir</button>
          <button onclick="deleteRecord('${r.date}')">excluir</button>
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }catch(e){
    wrap.innerHTML = '<div class="empty-state">Erro ao carregar histórico: ' + e.message + '</div>';
  }
}

function loadIntoForm(date){
  try{
    const records = readAllRecords();
    const rec = records[date];
    if (!rec) return;
    $('dateInput').value = rec.date;
    setToggle(rec.hasNews ? 'SIM' : 'NÃO');
    if (rec.hasNews){
      $('in-vale').value = Number(rec.values.vale).toFixed(2); $('in-pbr').value = Number(rec.values.pbr).toFixed(2); $('in-itub').value = Number(rec.values.itub).toFixed(2);
      $('in-bdory').value = Number(rec.values.bdory).toFixed(2); $('in-bbd').value = Number(rec.values.bbd).toFixed(2); $('in-bolsy').value = Number(rec.values.bolsy).toFixed(2);
    } else {
      $('in-vix').value = Number(rec.values.vix).toFixed(2); $('in-fef2').value = Number(rec.values.fef2).toFixed(2); $('in-cl1').value = Number(rec.values.cl1).toFixed(2);
    }
    setResultToggle(rec.dayResult === 'NEGATIVA' ? 'NEGATIVA' : 'POSITIVA');
    $('descInput').value = rec.description || '';
    setImagePreview(rec.image || null);
    $('imageInput').value = '';
    $('imageStatus').textContent = rec.image ? 'Imagem deste registro carregada.' : '';
    $('imageStatus').className = 'fetch-status' + (rec.image ? ' ok' : '');
    compute();
    showStatus(`Registro de ${fmtBR(date)} carregado.`, false);
    window.scrollTo({top:0, behavior:'smooth'});
  }catch(e){
    showStatus('Erro ao abrir registro: ' + e.message, true);
  }
}

function deleteRecord(date){
  try{
    const records = readAllRecords();
    delete records[date];
    writeAllRecords(records);
    loadHistory();
  }catch(e){
    showStatus('Erro ao excluir registro: ' + e.message, true);
  }
}

function initSaveListener(){
  $('saveBtn').addEventListener('click', saveRecord);
}


/* ============================================================
   EXPORTAR / IMPORTAR HISTÓRICO (backup em JSON)
   Útil para levar o histórico de um navegador/dispositivo para
   outro, já que os dados ficam presos ao localStorage local.
   ============================================================ */
function setHistoryIoStatus(msg, kind){
  const el = $('historyIoStatus');
  el.textContent = msg;
  el.className = 'fetch-status' + (kind ? ' '+kind : '');
}

function exportHistory(){
  try{
    const records = readAllRecords();
    const count = Object.keys(records).length;
    if (count === 0){
      setHistoryIoStatus('Não há registros para exportar.', 'warn');
      return;
    }
    const dataStr = JSON.stringify(records, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equacao-abertura-historico-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setHistoryIoStatus(`${count} registro(s) exportado(s).`, 'ok');
  }catch(e){
    setHistoryIoStatus('Erro ao exportar: ' + e.message, 'error');
  }
}

function importHistoryFile(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const imported = JSON.parse(e.target.result);
      if (typeof imported !== 'object' || imported === null || Array.isArray(imported)){
        throw new Error('o arquivo não tem o formato esperado');
      }
      const keys = Object.keys(imported);
      if (keys.length === 0){
        setHistoryIoStatus('O arquivo não contém registros.', 'warn');
        return;
      }
      const existing = readAllRecords();
      const overwritten = keys.filter(k => existing[k]).length;
      const merged = { ...existing, ...imported };
      writeAllRecords(merged);
      loadHistory();
      setHistoryIoStatus(
        `${keys.length} registro(s) importado(s)${overwritten ? ` (${overwritten} substituído(s))` : ''}.`,
        'ok'
      );
    }catch(err){
      setHistoryIoStatus('Erro ao importar: arquivo inválido — ' + err.message, 'error');
    }
  };
  reader.onerror = () => setHistoryIoStatus('Erro ao ler o arquivo.', 'error');
  reader.readAsText(file);
}

function initHistoryIoListeners(){
  $('exportHistoryBtn').addEventListener('click', exportHistory);
  $('importHistoryBtn').addEventListener('click', () => $('importFileInput').click());
  $('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importHistoryFile(file);
    e.target.value = '';
  });
}


/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
function init(){
  $('dateInput').value = todayISO();
  initToggleListeners();
  initResultToggleListeners();
  initImageListener();
  initInputListeners();
  initFetchListener();
  initSaveListener();
  initHistoryIoListeners();
  setToggle('NÃO');
  setResultToggle('POSITIVA');
  loadHistory();
}


document.addEventListener('DOMContentLoaded', init);