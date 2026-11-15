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
  compute();
}

function initToggleListeners(){
  document.querySelectorAll('#newsToggle button').forEach(b=>{
    b.addEventListener('click', ()=>{ setToggle(b.dataset.val); autoFetch(); });
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
  if (v < -4.5) return {sign:'NEGATIVA', intensity:'FORTE', tone:'down', phrase:'Busca regiões vendedoras acima da abertura.'};
  if (v < -2.5) return {sign:'NEGATIVA', intensity:'MODERADA', tone:'down', phrase:'Busca regiões vendedoras acima da abertura.'};
  if (v < -1.5) return {sign:'NEGATIVA', intensity:'FRACA', tone:'down', phrase:'Busca regiões vendedoras acima da abertura.'};
  if (v <= 1.5) return {sign:'LATERAL', intensity:'', tone:'flat', phrase:'Sem direção definida; aguarda confirmação.'};
  if (v <= 2.5) return {sign:'POSITIVA', intensity:'FRACA', tone:'up', phrase:'Busca regiões compradoras abaixo da abertura.'};
  if (v <= 4.5) return {sign:'POSITIVA', intensity:'MODERADA', tone:'up', phrase:'Busca regiões compradoras abaixo da abertura.'};
  return {sign:'POSITIVA', intensity:'FORTE', tone:'up', phrase:'Busca regiões compradoras abaixo da abertura.'};
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
  $('pointer').style.color = c.tone==='up' ? 'var(--buy)' : c.tone==='down' ? 'var(--sell)' : 'var(--neutral)';
  $('pointerValue').textContent = (total>=0?'+':'') + fmtPct(total) + '%';
  const [zs, ze] = ZONE_BOUNDS[zoneIndex(total)];
  const zone = $('activeZone');
  zone.style.left = zs + '%';
  zone.style.width = (ze - zs) + '%';
}


/* ============================================================
   LEITURA DO DIA (cálculo e atualização da tela)
   ============================================================ */
function compute(){
  const v = currentValues();
  const total = hasNews
    ? v.vale + v.pbr + v.itub + v.bdory + v.bbd + v.bolsy
    : (-v.vix) + v.fef2 + v.cl1;
  const c = classify(total);

  renderScale(total);

  $('rv').textContent = (total>=0?'+':'') + fmtPct(total) + '%';
  $('rv').className = 'rv ' + toneColorClass(c.tone);
  $('rc').textContent = c.sign === 'LATERAL'
    ? 'Abertura lateral'
    : `Abertura ${c.sign.toLowerCase()}${c.intensity ? ' ' + c.intensity.toLowerCase() : ''}`;
  $('rc').className = 'rc ' + toneColorClass(c.tone);
  $('rp').textContent = c.phrase;
  $('rp').className = 'rp ' + toneColorClass(c.tone);

  const classification = (c.intensity ? c.intensity + ' ' : '') + c.sign;
  return {total, classification};
}


/* ============================================================
   COLETA AUTOMÁTICA
   Cotações ao vivo, válidas só para hoje. Datas passadas
   ficam para preenchimento manual.
   ============================================================ */
const QUOTES_WORKER_URL = 'https://vix.jvstefanon.workers.dev';

const EXTERNAL_FIELDS = { vix:'VIX', fef2:'FEF2!', cl1:'CL1!' };
const ADR_FIELDS = { vale:'VALE', pbr:'PBR', itub:'ITUB', bdory:'BDORY', bbd:'BBD', bolsy:'BOLSY' };

function setFetchStatus(msg, kind){
  const el = $('fetchStatus');
  el.textContent = msg;
  el.className = 'fetch-status' + (kind ? ' '+kind : '');
}

// Retorna { campo: variação % do dia } para os campos pedidos;
// o que falhar vira null.
async function fetchFromWorker(fields){
  const result = {};
  fields.forEach(k => result[k] = null);
  const res = await fetch(QUOTES_WORKER_URL);
  if (!res.ok) return result;
  const data = await res.json();
  fields.forEach(k => {
    const pc = parseFloat(data[k] && data[k].percent_change);
    result[k] = isNaN(pc) ? null : pc;
  });
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
  if (date !== todayISO()){
    setFetchStatus('Coleta automática só funciona para a data de hoje (cotação ao vivo). Para datas passadas, preencha manualmente.', 'error');
    return;
  }

  const btn = $('fetchBtn');
  btn.disabled = true;
  const names = hasNews ? ADR_FIELDS : EXTERNAL_FIELDS;
  const fields = Object.keys(names);

  try{
    setFetchStatus(`Buscando ${Object.values(names).join(', ')} ao vivo…`, '');
    const values = await fetchFromWorker(fields);
    applyValues(values);
    compute();

    const missing = fields.filter(k => values[k] == null).map(k => names[k]);
    if (missing.length === fields.length){
      setFetchStatus('Não consegui obter as cotações agora. Preencha manualmente.', 'warn');
    } else if (missing.length){
      setFetchStatus(`Cotações aplicadas, exceto ${missing.join(', ')}. Preencha esses manualmente.`, 'warn');
    } else {
      setFetchStatus('Cotações ao vivo aplicadas. Confira antes de salvar.', 'ok');
    }
  }catch(e){
    setFetchStatus('Não consegui buscar agora: ' + e.message, 'error');
  }finally{
    btn.disabled = false;
  }
}

// Atualização automática: busca ao abrir e depois a cada 1 minuto.
// Só roda quando a data escolhida é hoje; senão fica quieto.
const AUTO_REFRESH_MS = 60 * 1000;

function autoFetch(){
  if ($('dateInput').value !== todayISO()) return;
  if ($('fetchBtn').disabled) return; // já tem uma busca em andamento
  fetchAuto();
}

function initFetchListener(){
  $('fetchBtn').addEventListener('click', fetchAuto);
  autoFetch();
  setInterval(autoFetch, AUTO_REFRESH_MS);
}


/* ============================================================
   SESSÃO E REGISTROS (guardados no servidor, no banco)
   A página exige login. O papel do usuário define o que pode
   gravar, excluir ou importar. O navegador não guarda registros.
   ============================================================ */
let currentUser = null;
let recordsCache = {}; // data (AAAA-MM-DD) -> registro, da última leitura

const ROLE_LABELS = { admin: 'Administrador', operador: 'Operador', visualizador: 'Consulta' };
const canWrite = () => ['admin', 'operador'].includes(currentUser?.role);
const canDelete = () => currentUser?.role === 'admin';

// Chamada à API. Sessão expirada manda para a tela de entrada.
async function api(metodo, caminho, corpo){
  const opts = { method: metodo, headers: { 'Content-Type': 'application/json' } };
  if (corpo !== undefined) opts.body = JSON.stringify(corpo);
  const res = await fetch(caminho, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (res.status === 401){
    window.location.href = '/entrar';
    throw new Error('Sua sessão expirou. Entre de novo.');
  }
  if (!res.ok) throw new Error((data && data.error) || `erro ${res.status}`);
  return data;
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
   pesar demais no envio ao servidor.
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
  const rec = recordsCache[date];
  if (!rec || !rec.imagem) return;
  $('lightboxImg').src = rec.imagem;
  $('imageLightbox').style.display = 'flex';
}

function closeImageLightbox(){
  $('imageLightbox').style.display = 'none';
}


async function saveRecord(){
  if (!canWrite()){
    showStatus('Seu acesso é só de consulta.', true);
    return;
  }
  const date = $('dateInput').value;
  if (!date){ showStatus('Escolha uma data antes de salvar.', true); return; }
  const result = compute();
  const corpo = {
    temNoticia: hasNews,
    valores: currentValues(),
    total: result.total,
    classificacao: result.classification,
    resultadoDia: dayResult,
    observacoes: $('descInput').value.trim(),
    imagem: currentImage
  };
  const btn = $('saveBtn');
  btn.disabled = true;
  try{
    await api('PUT', `/api/registros/${date}`, corpo);
    $('descInput').value = '';
    clearImageField();
    showStatus(`Registro de ${fmtBR(date)} salvo.`, false);
    await loadHistory();
  }catch(e){
    // Os dados continuam na tela para tentar de novo
    showStatus('Não foi possível salvar: ' + e.message, true);
  }finally{
    btn.disabled = !canWrite();
  }
}

async function loadHistory(){
  const wrap = $('historyWrap');
  try{
    const { registros } = await api('GET', '/api/registros');
    recordsCache = Object.fromEntries(registros.map(r => [r.data, r]));
    if (registros.length === 0){
      wrap.innerHTML = '<div class="empty-state">Nenhum registro salvo ainda.</div>';
      return;
    }
    let html = '<table><thead><tr><th>Data</th><th>Base</th><th>Leitura</th><th>Classificação</th><th>Resultado</th><th>Autor</th><th>Descrição</th><th>Img</th><th></th></tr></thead><tbody>';
    for (const r of registros){
      const total = Number(r.total);
      const tone = total < -1.5 ? 'down-color' : total > 1.5 ? 'up-color' : 'flat-color';
      const resultTone = r.resultadoDia === 'NEGATIVA' ? 'down-color' : 'up-color';
      const desc = r.observacoes || '';
      const descShort = desc.length > 40 ? desc.slice(0, 40) + '…' : desc;
      const imgCell = r.imagem
        ? `<img src="${r.imagem}" alt="Print do gráfico de ${fmtBR(r.data)}" onclick="openImageLightbox('${r.data}')" style="width:36px;height:36px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid var(--rule);">`
        : '<span class="empty-state" style="padding:0;">—</span>';
      const excluir = canDelete() ? `<button onclick="deleteRecord('${r.data}')">excluir</button>` : '';
      html += `<tr>
        <td class="date">${fmtBR(r.data)}</td>
        <td>${r.temNoticia ? 'ADRs' : 'Externo'}</td>
        <td class="pct ${tone}">${total >= 0 ? '+' : ''}${fmtPct(total)}%</td>
        <td>${escapeHtml(r.classificacao)}</td>
        <td class="${resultTone}" style="font-weight:700;font-size:11px;">${r.resultadoDia}</td>
        <td>${escapeHtml(r.criadoPor ? r.criadoPor.name : '—')}</td>
        <td title="${escapeHtml(desc)}">${escapeHtml(descShort) || '<span class="empty-state" style="padding:0;">—</span>'}</td>
        <td>${imgCell}</td>
        <td class="row-actions">
          <button onclick="loadIntoForm('${r.data}')">abrir</button>
          ${excluir}
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }catch(e){
    wrap.innerHTML = '<div class="empty-state">Não foi possível carregar o histórico: ' + escapeHtml(e.message) + '</div>';
  }
}

async function loadIntoForm(date){
  try{
    let rec = recordsCache[date];
    if (!rec){
      const resposta = await api('GET', `/api/registros/${date}`);
      rec = resposta.registro;
    }
    if (!rec) return;
    $('dateInput').value = rec.data;
    setToggle(rec.temNoticia ? 'SIM' : 'NÃO');
    if (rec.temNoticia){
      $('in-vale').value = Number(rec.valores.vale).toFixed(2); $('in-pbr').value = Number(rec.valores.pbr).toFixed(2); $('in-itub').value = Number(rec.valores.itub).toFixed(2);
      $('in-bdory').value = Number(rec.valores.bdory).toFixed(2); $('in-bbd').value = Number(rec.valores.bbd).toFixed(2); $('in-bolsy').value = Number(rec.valores.bolsy).toFixed(2);
    } else {
      $('in-vix').value = Number(rec.valores.vix).toFixed(2); $('in-fef2').value = Number(rec.valores.fef2).toFixed(2); $('in-cl1').value = Number(rec.valores.cl1).toFixed(2);
    }
    setResultToggle(rec.resultadoDia === 'NEGATIVA' ? 'NEGATIVA' : 'POSITIVA');
    $('descInput').value = rec.observacoes || '';
    setImagePreview(rec.imagem || null);
    $('imageInput').value = '';
    $('imageStatus').textContent = rec.imagem ? 'Imagem deste registro carregada.' : '';
    $('imageStatus').className = 'fetch-status' + (rec.imagem ? ' ok' : '');
    compute();
    showStatus(`Registro de ${fmtBR(date)} carregado.`, false);
    window.scrollTo({top:0, behavior:'smooth'});
  }catch(e){
    showStatus('Erro ao abrir registro: ' + e.message, true);
  }
}

async function deleteRecord(date){
  if (!canDelete()) return;
  if (!confirm(`Excluir o registro de ${fmtBR(date)}? Essa ação não pode ser desfeita.`)) return;
  try{
    await api('DELETE', `/api/registros/${date}`);
    showStatus(`Registro de ${fmtBR(date)} excluído.`, false);
    await loadHistory();
  }catch(e){
    showStatus('Erro ao excluir registro: ' + e.message, true);
  }
}

function initSaveListener(){
  $('saveBtn').addEventListener('click', saveRecord);
}


/* ============================================================
   EXPORTAR / IMPORTAR HISTÓRICO (backup em JSON)
   Útil para guardar uma cópia do histórico ou levá-lo para outro
   banco. Aceita o arquivo gerado pela exportação.
   ============================================================ */
function setHistoryIoStatus(msg, kind){
  const el = $('historyIoStatus');
  el.textContent = msg;
  el.className = 'fetch-status' + (kind ? ' '+kind : '');
}

async function exportHistory(){
  try{
    const { registros } = await api('GET', '/api/registros');
    if (registros.length === 0){
      setHistoryIoStatus('Não há registros para exportar.', 'warn');
      return;
    }
    const dataStr = JSON.stringify(registros, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equacao-abertura-historico-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setHistoryIoStatus(`${registros.length} registro(s) exportado(s).`, 'ok');
  }catch(e){
    setHistoryIoStatus('Erro ao exportar: ' + e.message, 'error');
  }
}

// Aceita o formato novo (lista) e o antigo (objeto por data, exportado pelo navegador)
function importHistoryFile(file){
  const reader = new FileReader();
  reader.onload = async (e) => {
    try{
      const parsed = JSON.parse(e.target.result);
      const lista = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === 'object' ? Object.values(parsed) : null);
      if (!lista) throw new Error('o arquivo não tem o formato esperado');
      if (lista.length === 0){
        setHistoryIoStatus('O arquivo não contém registros.', 'warn');
        return;
      }
      let importados = 0;
      let falhas = 0;
      for (const item of lista){
        try{
          const data = item.data || item.date;
          await api('PUT', `/api/registros/${data}`, {
            temNoticia: item.temNoticia ?? item.hasNews ?? false,
            valores: item.valores ?? item.values,
            total: Number(item.total),
            classificacao: item.classificacao ?? item.classification,
            resultadoDia: item.resultadoDia ?? item.dayResult ?? 'POSITIVA',
            observacoes: item.observacoes ?? item.description ?? '',
            imagem: item.imagem ?? item.image ?? null
          });
          importados++;
        }catch(err){
          falhas++;
        }
      }
      await loadHistory();
      setHistoryIoStatus(
        `${importados} registro(s) importado(s)${falhas ? `, ${falhas} com erro` : ''}.`,
        falhas ? 'warn' : 'ok'
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
async function init(){
  $('dateInput').value = todayISO();
  try{
    const { user } = await api('GET', '/api/auth/me');
    currentUser = user;
  }catch(e){
    // Sessão expirada já redirecionou para a entrada
    setFetchStatus('Não foi possível confirmar seu acesso: ' + e.message, 'error');
    return;
  }
  $('userName').textContent = currentUser.name;
  $('userRole').textContent = ROLE_LABELS[currentUser.role] || currentUser.role;
  $('userBox').hidden = false;
  $('logoutBtn').addEventListener('click', logout);
  applyRolePermissions();

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

function applyRolePermissions(){
  const gravar = canWrite();
  $('saveBtn').disabled = !gravar;
  $('importHistoryBtn').disabled = !gravar;
  $('roleHint').hidden = gravar;
}

async function logout(){
  try{
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  } finally {
    window.location.href = '/entrar';
  }
}


document.addEventListener('DOMContentLoaded', init);