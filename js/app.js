'use strict';
/* Controle de Diárias — app do encarregado.
   Dados ficam no celular (localStorage) e vão para o Supabase por uma fila de envio.
   Sem internet, tudo continua funcionando; a fila é enviada quando o sinal volta. */

/* ===================== utilidades ===================== */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const weekStart = s => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const today = () => iso(new Date());
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DOWL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ddmm = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
const dmy = s => s ? ddmm(s) + '/' + s.slice(0, 4) : '';
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => { const p = String(n).trim().split(/\s+/); return ((p[0] || '')[0] || '').concat(p.length > 1 ? p[p.length - 1][0] : '').toUpperCase(); };
const fmtN = n => Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
const nDias = n => fmtN(n) + (n === 1 ? ' diária' : ' diárias');
const hora = ts => { const d = new Date(ts); return `${dmy(iso(d))} às ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const TIPO = { 1: 'Inteira', 0.5: 'Meia', 0: 'Falta' };
const TCLS = { 1: 't1', 0.5: 'th', 0: 't0' };
const FUNCOES = ['Mestre de obras', 'Encarregado', 'Pedreiro', 'Servente', 'Ajudante', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor', 'Gesseiro', 'Azulejista'];
const CATS = ['Almoço', 'Combustível', 'Material', 'Transporte', 'Ferramenta', 'Outro'];
const CAT_PH = { 'Almoço': 'Ex.: 7 marmitas', 'Combustível': 'Ex.: gasolina da caminhonete', 'Material': 'Ex.: 10 sacos de cimento', 'Transporte': 'Ex.: frete da areia', 'Ferramenta': 'Ex.: disco de corte', 'Outro': 'Descreva o custo' };
const MOTIVOS = ['Chuva', 'Feriado', 'Falta de material', 'Outro'];
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function parseMoney(s) { s = String(s).trim().replace(/[R$\s]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = Number(s); return isFinite(n) && s !== '' ? Math.round(n * 100) / 100 : NaN; }
function extenso(v) {
  const u = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const cs = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = n => { if (n === 100) return 'cem'; const p = [], h = Math.floor(n / 100), r = n % 100; if (h) p.push(cs[h]); if (r) { if (r < 20) p.push(u[r]); else { const t = Math.floor(r / 10), o = r % 10; p.push(o ? dz[t] + ' e ' + u[o] : dz[t]); } } return p.join(' e '); };
  const liga = g => g < 100 || g % 100 === 0 ? ' e ' : ' ';
  const inteiro = n => {
    const g = [Math.floor(n / 1e6), Math.floor(n % 1e6 / 1000), n % 1000], parts = [];
    if (g[0]) parts.push([g[0] === 1 ? 'um milhão' : ate999(g[0]) + ' milhões', g[0]]);
    if (g[1]) parts.push([g[1] === 1 ? 'mil' : ate999(g[1]) + ' mil', g[1]]);
    if (g[2]) parts.push([ate999(g[2]), g[2]]);
    let s = parts[0][0]; for (let i = 1; i < parts.length; i++) s += (i === parts.length - 1 ? liga(parts[i][1]) : ', ') + parts[i][0];
    return s;
  };
  const cents = Math.round(v * 100), r = Math.floor(cents / 100), c = cents % 100;
  let out = '';
  if (r) out = inteiro(r) + (r === 1 ? ' real' : (r % 1e6 === 0 ? ' de reais' : ' reais'));
  if (c) out += (r ? ' e ' : '') + ate999(c) + (c === 1 ? ' centavo' : ' centavos');
  return out || 'zero real';
}

/* ===================== dados locais + fila de envio ===================== */
const CFG = window.DIARIAS_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL || /[?&]demo\b/.test(location.search);
const sb = !DEMO && window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'diarias-auth' },
}) : null;

const TABLES = ['obras', 'pessoas', 'presencas', 'dias_obra', 'extras', 'pagamentos', 'vales', 'fechamentos'];
const COLS = {
  obras: ['id', 'nome', 'apagado', 'criado_em'],
  pessoas: ['id', 'obra_id', 'nome', 'funcao', 'diaria', 'ativo', 'pago_ate', 'criado_em'],
  presencas: ['obra_id', 'pessoa_id', 'data', 'tipo', 'diaria'],
  dias_obra: ['obra_id', 'data', 'parado_motivo'],
  extras: ['id', 'obra_id', 'data', 'categoria', 'descricao', 'valor', 'apagado', 'criado_em'],
  pagamentos: ['id', 'obra_id', 'pessoa_id', 'bruto', 'vales', 'valor', 'dias', 'de', 'ate', 'data', 'criado_em'],
  vales: ['id', 'obra_id', 'pessoa_id', 'data', 'valor', 'obs', 'pagamento_id', 'apagado', 'criado_em'],
  fechamentos: ['id', 'obra_id', 'inicio', 'fim', 'fechado_em'],
};
const CONFLICT = { presencas: 'pessoa_id,data', dias_obra: 'obra_id,data' };
const NUMS = ['diaria', 'tipo', 'valor', 'bruto', 'vales', 'dias'];
const keyOf = (t, r) => t === 'presencas' ? r.pessoa_id + '|' + r.data : t === 'dias_obra' ? r.obra_id + '|' + r.data : r.id;
const L = {}; TABLES.forEach(t => L[t] = new Map());
let USER = null, outbox = [], lastPull = {}, MODE = 'boot', NEEDS_LOGIN = false;
const sync = { running: false, last: null, error: '', timer: null, retry: null };

function norm(r) { const o = { ...r }; NUMS.forEach(c => { if (o[c] != null) o[c] = Number(o[c]); }); return o; }
const skey = s => 'diarias:' + (USER ? USER.id : 'demo') + ':' + s;
function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function persist() {
  const ok = lsSet(skey('db'), Object.fromEntries(TABLES.map(t => [t, [...L[t].values()]])))
    && lsSet(skey('outbox'), outbox) && lsSet(skey('pull'), lastPull);
  if (!ok) toast('A memória do celular está cheia. Libere espaço para continuar salvando.', true);
}
function loadLocal() {
  const db = lsGet(skey('db'), {});
  TABLES.forEach(t => { L[t].clear(); (db[t] || []).forEach(r => L[t].set(keyOf(t, r), r)); });
  outbox = lsGet(skey('outbox'), []); lastPull = lsGet(skey('pull'), {});
}
function put(t, row) {
  const k = keyOf(t, row), full = norm({ ...(L[t].get(k) || {}), ...row });
  L[t].set(k, full);
  const payload = {}; COLS[t].forEach(c => { if (full[c] !== undefined) payload[c] = full[c]; });
  if (!DEMO) outbox.push({ t, op: t === 'fechamentos' ? 'insert' : 'upsert', row: payload });
  persist();
}
function commit() { render(); scheduleSync(300); }
function scheduleSync(ms) { if (DEMO) return; clearTimeout(sync.timer); sync.timer = setTimeout(runSync, ms); }

const isNetErr = e => !e || !e.code || /fetch|network|Load failed|timeout/i.test(e.message || '');
const isAuthErr = e => e && (e.code === 'PGRST301' || e.code === 'PGRST302' || /JWT|jwt/.test(e.message || ''));
function msgServidor(e) {
  const m = (e && (e.message || '')) + ' ' + (e && e.hint || '');
  if (/semana_fechada/.test(m)) return 'Uma alteração foi recusada porque a semana já estava fechada.';
  if (/dia_pago/.test(m)) return 'Uma alteração foi recusada porque o dia já estava pago.';
  if (/semana_futura/.test(m)) return 'Não dá para fechar uma semana que ainda não começou.';
  return 'Uma alteração foi recusada pelo servidor e foi desfeita.';
}
async function pullTable(t, full) {
  const page = 1000; let from = 0, maxU = full ? null : (lastPull[t] || null);
  for (;;) {
    let q = sb.from(t).select('*').order('updated_at', { ascending: true }).range(from, from + page - 1);
    if (!full && lastPull[t]) q = q.gte('updated_at', new Date(Date.parse(lastPull[t]) - 120000).toISOString());
    const { data, error } = await q;
    if (error) throw error;
    for (const r of data) { L[t].set(keyOf(t, r), norm(r)); if (!maxU || r.updated_at > maxU) maxU = r.updated_at; }
    if (data.length < page) break;
    from += page;
  }
  lastPull[t] = maxU;
}
function reaplicarFila() { for (const op of outbox) { const k = keyOf(op.t, op.row); L[op.t].set(k, norm({ ...(L[op.t].get(k) || {}), ...op.row })); } }
async function runSync() {
  if (DEMO || !sb || !USER || NEEDS_LOGIN || sync.running) return;
  if (!navigator.onLine) { sync.error = ''; renderStatus(); return; }
  sync.running = true; renderStatus();
  let resync = false;
  try {
    while (outbox.length) {
      const op = outbox[0];
      const res = op.op === 'insert'
        ? await sb.from(op.t).insert(op.row)
        : await sb.from(op.t).upsert(op.row, { onConflict: CONFLICT[op.t] || 'id' });
      const e = res.error;
      if (e) {
        if (op.op === 'insert' && e.code === '23505') { /* já enviado antes */ }
        else if (isAuthErr(e)) {
          const r = await sb.auth.refreshSession();
          if (r.error) { if (!isNetErr(r.error)) { NEEDS_LOGIN = true; render(); } throw r.error; }
          continue;
        }
        else if (isNetErr(e)) throw e;
        else { toast(msgServidor(e), true); resync = true; console.warn('Recusado', op, e); }
      }
      outbox.shift(); persist(); renderStatus();
    }
    if (resync) TABLES.forEach(t => L[t].clear());
    for (const t of TABLES) await pullTable(t, resync || !lastPull[t]);
    reaplicarFila();
    persist();
    sync.last = Date.now(); sync.error = '';
    clearTimeout(sync.retry);
  } catch (e) {
    sync.error = isNetErr(e) ? 'rede' : (e.message || 'erro');
    clearTimeout(sync.retry); sync.retry = setTimeout(runSync, 30000);
  } finally {
    sync.running = false;
    render();
    if (outbox.length && !sync.error) scheduleSync(500);
  }
}
window.addEventListener('online', () => { renderStatus(); scheduleSync(200); });
window.addEventListener('offline', () => renderStatus());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (today() !== lastToday) { if (ui.day === lastToday) ui.day = today(); lastToday = today(); }
  render(); scheduleSync(200);
});
let lastToday = today();

/* ===================== consultas ===================== */
const ui = { tab: 'chamada', obra: null, day: today(), form: null, confirm: null, open: null, newObra: false, err: '', per: 'semana', de: '', ate: '', copy: null, extra: null, parar: null, vale: null, vf: null, recibo: null, fechar: null, auth: 'entrar', authMsg: '', authErr: '', busy: false };
const rememberUi = () => { lsSet(skey('ui'), { tab: ui.tab, obra: ui.obra }); };
const obras = () => [...L.obras.values()].filter(o => !o.apagado).sort((a, b) => (a.criado_em || '') < (b.criado_em || '') ? -1 : 1);
const pessoas = (ativos = true) => [...L.pessoas.values()].filter(p => p.obra_id === ui.obra && (ativos ? p.ativo !== false : p.ativo === false)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const markOf = (d, pid) => { const r = L.presencas.get(pid + '|' + d); return r && r.tipo != null ? { v: r.tipo, d: r.diaria } : null; };
const paradoDe = d => L.dias_obra.get(ui.obra + '|' + d)?.parado_motivo || null;
const extrasDe = d => [...L.extras.values()].filter(x => x.obra_id === ui.obra && x.data === d && !x.apagado).sort((a, b) => (a.criado_em || '') < (b.criado_em || '') ? -1 : 1);
const fechamentoDe = ws => [...L.fechamentos.values()].find(f => f.obra_id === ui.obra && f.inicio === ws);
const fechada = d => [...L.fechamentos.values()].some(f => f.obra_id === ui.obra && d >= f.inicio && d <= f.fim);
function ensureObra() { const os = obras(); if (!os.find(o => o.id === ui.obra)) ui.obra = os[0]?.id || null; }
function aberto(p) {
  const linhas = [];
  for (const r of L.presencas.values()) if (r.pessoa_id === p.id && r.tipo != null && r.data > (p.pago_ate || '')) linhas.push({ d: r.data, v: r.tipo, valor: r.tipo * r.diaria });
  linhas.sort((a, b) => a.d < b.d ? -1 : 1);
  const vales = [...L.vales.values()].filter(x => x.pessoa_id === p.id && !x.pagamento_id && !x.apagado).sort((a, b) => a.data < b.data ? -1 : 1);
  const bruto = linhas.reduce((s, l) => s + l.valor, 0), tv = vales.reduce((s, x) => s + x.valor, 0);
  return { linhas, dias: linhas.reduce((s, l) => s + l.v, 0), bruto, vales, tv, valor: Math.round((bruto - tv) * 100) / 100 };
}
function periodo() {
  const t = today(), ws = weekStart(t), d = parse(t);
  const cap = x => x[0].toUpperCase() + x.slice(1);
  const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  switch (ui.per) {
    case 'semana': return [ws, addDays(ws, 6), 'Esta semana'];
    case 'semanaant': return [addDays(ws, -7), addDays(ws, -1), 'Semana passada'];
    case 'mes': return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, t, `${cap(MES[d.getMonth()])} até hoje`];
    case 'mesant': return [iso(pm), iso(new Date(d.getFullYear(), d.getMonth(), 0)), cap(MES[pm.getMonth()])];
    default: { const de = ui.de || ws, ate = ui.ate || t; return de <= ate ? [de, ate, 'Período escolhido'] : [ate, de, 'Período escolhido']; }
  }
}
function relatorio(de, ate, nome) {
  if (!de) [de, ate, nome] = periodo();
  const byP = {}, byD = {}, cat = {}, parados = [];
  const dia = d => byD[d] || (byD[d] = { pres: 0, mo: 0, ex: 0 });
  for (const r of L.presencas.values()) {
    if (r.obra_id !== ui.obra || r.tipo == null || r.data < de || r.data > ate) continue;
    const p = L.pessoas.get(r.pessoa_id); if (!p) continue;
    const b = byP[p.id] || (byP[p.id] = { p, i: 0, m: 0, f: 0, dias: 0, valor: 0 });
    const val = r.tipo * r.diaria;
    if (r.tipo === 1) b.i++; else if (r.tipo === 0.5) b.m++; else b.f++;
    b.dias += r.tipo; b.valor += val;
    const dd = dia(r.data); if (r.tipo > 0) dd.pres++; dd.mo += val;
  }
  for (const x of L.dias_obra.values()) if (x.obra_id === ui.obra && x.parado_motivo && x.data >= de && x.data <= ate) parados.push({ d: x.data, motivo: x.parado_motivo });
  for (const x of L.extras.values()) if (x.obra_id === ui.obra && !x.apagado && x.data >= de && x.data <= ate) { cat[x.categoria] = (cat[x.categoria] || 0) + x.valor; dia(x.data).ex += x.valor; }
  parados.sort((a, b) => a.d < b.d ? -1 : 1);
  const linhas = Object.values(byP).sort((a, b) => b.valor - a.valor || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  const dias = Object.keys(byD).sort().map(d => ({ d, ...byD[d] }));
  const tot = linhas.reduce((s, r) => ({ i: s.i + r.i, m: s.m + r.m, f: s.f + r.f, dias: s.dias + r.dias, valor: s.valor + r.valor }), { i: 0, m: 0, f: 0, dias: 0, valor: 0 });
  const extras = Object.entries(cat).map(([c, v]) => ({ c, v })).sort((a, b) => b.v - a.v), totEx = extras.reduce((s, x) => s + x.v, 0);
  const pago = [...L.pagamentos.values()].filter(x => x.obra_id === ui.obra && x.data >= de && x.data <= ate).reduce((s, x) => s + x.valor, 0);
  const vales = [...L.vales.values()].filter(x => x.obra_id === ui.obra && !x.apagado && x.data >= de && x.data <= ate).reduce((s, x) => s + x.valor, 0);
  return { de, ate, nome, linhas, dias, tot, extras, totEx, parados, pago, vales };
}
function pendenciasSemana(ws) {
  const ps = pessoas(), t = today(), out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i); if (d > t) break;
    if (paradoDe(d)) continue;
    const n = ps.filter(p => !markOf(d, p.id)).length;
    if (n && n < ps.length) out.push(`${DOW[parse(d).getDay()]} ${ddmm(d)}: ${n} sem marcação`);
    else if (n && parse(d).getDay() >= 1 && parse(d).getDay() <= 5) out.push(`${DOW[parse(d).getDay()]} ${ddmm(d)}: chamada não feita`);
  }
  return out;
}

/* ===================== telas ===================== */
const $app = document.getElementById('app'), $top = document.getElementById('top'), $tabs = document.getElementById('tabs'), $status = document.getElementById('status');
let ENTER = true;
const enter = () => ENTER ? ' enter' : '';
function render() {
  if (MODE === 'boot') return;
  const prevFocus = document.activeElement?.dataset?.k;
  if (MODE === 'login' || NEEDS_LOGIN) { renderLogin(); restore(prevFocus); return; }
  ensureObra();
  const os = obras();
  $top.innerHTML = `<span class="brand"><i></i>Diárias</span>${os.length ? `<select class="sel" id="obra-sel" data-k="obra" aria-label="Obra">${os.map(o => `<option value="${o.id}"${o.id === ui.obra ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}</select><button class="iconbtn" data-act="newobra" data-k="newobra" aria-label="Nova obra">+</button>` : ''}`;
  let html = '';
  if (DEMO) html += `<div class="banner">Modo demonstração: os dados ficam só neste aparelho e não vão para o servidor.</div>`;
  if (MODE === 'loading') html += `<div class="card empty"><h2>Baixando seus dados…</h2><p>Só na primeira vez. Depois o app abre na hora, mesmo sem internet.</p></div>`;
  else if (!os.length || ui.newObra) html += vNovaObra(!os.length);
  else html += ui.tab === 'equipe' ? vEquipe() : ui.tab === 'pagar' ? vPagar() : ui.tab === 'relatorio' ? vRelatorio() : vChamada();
  $app.innerHTML = html;
  const temAberto = os.length && pessoas(true).concat(pessoas(false)).some(p => aberto(p).valor > 0);
  $tabs.innerHTML = os.length && MODE !== 'loading' ? [
    ['chamada', 'Chamada', '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>'],
    ['equipe', 'Equipe', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2"/>'],
    ['pagar', 'A pagar', '<rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M2.5 10.5h19M6.5 15h4"/>'],
    ['relatorio', 'Relatório', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ].map(([k, l, ic]) => `<button data-act="tab" data-tab="${k}" data-k="tab-${k}"${ui.tab === k && !ui.newObra ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${l}${k === 'pagar' && temAberto ? '<span class="badge"></span>' : ''}</button>`).join('') : '';
  renderStatus();
  ENTER = false;
  restore(prevFocus);
}
function restore(k) { if (k) { const el = document.querySelector(`[data-k="${k}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); } }
function renderStatus() {
  if (!$status) return;
  if (DEMO || MODE !== 'app' || NEEDS_LOGIN) { $status.hidden = true; return; }
  const n = outbox.length, on = navigator.onLine;
  let cls = 'ok', txt = '';
  if (!on) { cls = 'off'; txt = n ? `Sem internet · ${n} ${n === 1 ? 'alteração guardada' : 'alterações guardadas'} no celular` : 'Sem internet · tudo que você marcar fica guardado no celular'; }
  else if (sync.running) { cls = 'run'; txt = n ? `Enviando ${n} ${n === 1 ? 'alteração' : 'alterações'}…` : 'Sincronizando…'; }
  else if (sync.error) { cls = 'off'; txt = n ? `${n} ${n === 1 ? 'alteração aguardando' : 'alterações aguardando'} envio · tentando de novo` : 'Não foi possível sincronizar · tentando de novo'; }
  else if (n) { cls = 'run'; txt = `${n} ${n === 1 ? 'alteração' : 'alterações'} para enviar`; }
  if (!txt) { $status.hidden = true; return; }
  $status.hidden = false;
  $status.innerHTML = `<div class="wrap"><i class="dot ${cls}"></i><span>${txt}</span></div>`;
}

function renderLogin() {
  $top.innerHTML = `<span class="brand"><i></i>Diárias</span>`; $tabs.innerHTML = ''; if ($status) $status.hidden = true;
  const a = ui.auth, last = lsGet('diarias:lastUser', null);
  const email = ui.email ?? (last?.email || '');
  const titulo = a === 'criar' ? 'Criar conta' : a === 'esqueci' ? 'Recuperar senha' : a === 'nova' ? 'Escolha uma nova senha' : 'Entrar';
  $app.innerHTML = `<section class="card form login enter" aria-label="${titulo}">
    <div><div class="eyebrow">Controle de Diárias</div><h1 style="font-size:34px;line-height:1">${titulo}</h1>
    ${NEEDS_LOGIN ? `<p class="muted" style="margin:6px 0 0">Sua sessão expirou. Entre de novo para enviar o que ficou guardado no celular${outbox.length ? ` (${outbox.length} ${outbox.length === 1 ? 'alteração' : 'alterações'})` : ''}.</p>` : a === 'criar' ? `<p class="muted" style="margin:6px 0 0">Conta do encarregado responsável pela obra.</p>` : ''}</div>
    ${a !== 'nova' ? `<div class="field"><label for="l-email">E-mail</label><input id="l-email" data-k="l-email" type="email" autocomplete="email" inputmode="email" value="${esc(email)}"></div>` : ''}
    ${a !== 'esqueci' ? `<div class="field"><label for="l-senha">${a === 'nova' ? 'Nova senha' : 'Senha'}</label><input id="l-senha" data-k="l-senha" type="password" autocomplete="${a === 'entrar' ? 'current-password' : 'new-password'}">${a !== 'entrar' ? '<span class="hint">Pelo menos 8 caracteres.</span>' : ''}</div>` : ''}
    ${a === 'criar' || a === 'nova' ? `<div class="field"><label for="l-senha2">Repita a senha</label><input id="l-senha2" data-k="l-senha2" type="password" autocomplete="new-password"></div>` : ''}
    ${ui.authErr ? `<div class="err" role="alert">${esc(ui.authErr)}</div>` : ''}
    ${ui.authMsg ? `<div class="okmsg" role="status">${esc(ui.authMsg)}</div>` : ''}
    <button class="btn btn-primary btn-block" data-act="auth-go" data-k="auth-go"${ui.busy ? ' disabled' : ''}>${ui.busy ? 'Aguarde…' : a === 'criar' ? 'Criar conta' : a === 'esqueci' ? 'Enviar link por e-mail' : a === 'nova' ? 'Salvar nova senha' : 'Entrar'}</button>
    ${a === 'entrar' ? `<div class="row" style="justify-content:space-between"><button class="link" data-act="auth-mode" data-m="esqueci" data-k="am-esq">Esqueci a senha</button><button class="link" data-act="auth-mode" data-m="criar" data-k="am-criar">Criar conta</button></div>` : a !== 'nova' ? `<button class="link" data-act="auth-mode" data-m="entrar" data-k="am-entrar" style="justify-self:start">‹ Voltar para entrar</button>` : ''}
    ${!navigator.onLine ? `<p class="banner" style="margin:0">Sem internet. Entrar precisa de conexão; depois o app funciona offline.</p>` : ''}
  </section>`;
}

function vNovaObra(first) {
  const outras = obras().map(o => ({ o, n: [...L.pessoas.values()].filter(p => p.obra_id === o.id && p.ativo !== false).length })).filter(x => x.n);
  return `<section class="card form${enter()}" aria-label="Nova obra">
    ${first ? `<div><div class="eyebrow">Primeiro passo</div><h1 style="font-size:32px;line-height:1">Cadastre sua obra</h1><p class="muted" style="margin:6px 0 0">Depois você adiciona a equipe e marca as diárias de cada dia.</p></div>` : `<h2 style="font-size:26px">Nova obra</h2>`}
    <div class="field"><label for="obra-nome">Nome da obra</label><input id="obra-nome" data-k="obra-nome" placeholder="Ex.: Residencial Ipê, Bloco B" autocomplete="off" maxlength="80"></div>
    ${!first && outras.length ? `<div class="field"><label for="obra-equipe">Equipe inicial</label><select class="sel" id="obra-equipe">${outras.map(x => `<option value="${x.o.id}"${x.o.id === ui.obra ? ' selected' : ''}>Copiar equipe de ${esc(x.o.nome)} (${x.n} ${x.n === 1 ? 'pessoa' : 'pessoas'})</option>`).join('')}<option value="">Começar sem equipe</option></select><span class="hint">A obra já abre com essas pessoas e os mesmos valores de diária.</span></div>` : ''}
    ${ui.err ? `<div class="err" role="alert">${esc(ui.err)}</div>` : ''}
    <div class="row end">${first ? '' : '<button class="btn btn-ghost" data-act="cancelobra" data-k="cancelobra">Cancelar</button>'}<button class="btn btn-primary" data-act="saveobra" data-k="saveobra">Criar obra</button></div>
    ${first && DEMO ? `<button class="btn btn-block" data-act="exemplo" data-k="exemplo">Testar com uma obra e equipe de exemplo</button>` : ''}
  </section>`;
}

const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
function vSemana(ws) {
  const f = fechamentoDe(ws), t = today(), fim = addDays(ws, 6);
  if (f) return `<div class="weekstatus closed">${LOCK_SVG}<span><b>Semana fechada</b> em ${hora(f.fechado_em)}. Nada de ${ddmm(ws)} a ${ddmm(fim)} pode ser alterado.</span></div>`;
  if (ws > t) return '';
  if (ui.fechar === ws) {
    const R = relatorio(ws, fim, ''), pend = pendenciasSemana(ws), fut = fim > t;
    return `<section class="card form enter fecharbox" aria-label="Fechar semana">
      <h2 style="font-size:24px">Fechar a semana de ${ddmm(ws)} a ${ddmm(fim)}?</h2>
      <div class="rlines"><div><span>Diárias</span><span class="num">${fmtN(R.tot.dias)} · ${brl(R.tot.valor)}</span></div><div><span>Custos extras</span><span class="num">${brl(R.totEx)}</span></div><div><b>Custo total</b><b class="num">${brl(R.tot.valor + R.totEx)}</b></div></div>
      ${pend.length ? `<div class="banner"><b>Atenção:</b> ${pend.map(esc).join(' · ')}.</div>` : ''}
      ${fut ? `<p class="muted" style="margin:0;font-size:14px">A semana ainda não terminou. Os dias até ${ddmm(fim)} também ficarão travados.</p>` : ''}
      <p style="margin:0;font-weight:600">Depois de fechada, nenhuma presença, custo extra, dia sem obra ou vale desta semana poderá ser alterado. Não dá para desfazer.</p>
      <div class="row end"><button class="btn btn-ghost" data-act="cancelfechar" data-k="cancelfechar">Cancelar</button><button class="btn btn-danger" data-act="fechar" data-k="fechar">Fechar semana definitivamente</button></div>
    </section>`;
  }
  return `<div class="weekstatus"><span>Semana de ${ddmm(ws)} a ${ddmm(fim)} · <b>aberta</b></span><button class="link" data-act="askfechar" data-ws="${ws}" data-k="askfechar">${LOCK_SVG}Fechar semana</button></div>`;
}

function vChamada() {
  const ps = pessoas(), t = today(), d = ui.day;
  if (!ps.length) return `<section class="card empty${enter()}"><h2>Ninguém nesta obra ainda</h2><p>Cadastre a equipe com o valor da diária de cada pessoa. Depois é só marcar a presença aqui todo dia.</p><button class="btn btn-primary" data-act="addpessoa" data-k="addp-empty">Cadastrar equipe</button></section>`;
  const ws = weekStart(d), days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(ws, i));
  const parado = paradoDe(d), extras = extrasDe(d), lock = fechada(d);
  let marc = 0, ints = 0, meias = 0, faltas = 0, cost = 0;
  ps.forEach(p => { const m = markOf(d, p.id); if (m) { marc++; if (m.v === 1) ints++; else if (m.v === 0.5) meias++; else faltas++; cost += m.v * m.d; } });
  const totEx = extras.reduce((s, x) => s + x.valor, 0);
  const strip = days.map(x => {
    const n = ps.filter(p => markOf(x, p.id)).length, st = paradoDe(x) ? 'stop' : n && n === ps.length ? 'full' : n ? 'part' : '';
    return `<button data-act="day" data-d="${x}" data-k="day-${x}" class="${x === t ? 'today' : ''}"${x === d ? ' aria-current="date"' : ''}${x > t ? ' disabled' : ''} aria-label="${DOWL[parse(x).getDay()]} ${ddmm(x)}${st === 'full' ? ', completa' : st === 'part' ? ', incompleta' : st === 'stop' ? ', sem obra' : ''}"><span>${DOW[parse(x).getDay()]}</span><b>${x.slice(8)}</b><i class="${st}"></i></button>`;
  }).join('');
  const dt = parse(d);
  let corpo = '';
  if (parado) {
    corpo = `<section class="card stopcard"><div class="eyebrow">Dia sem obra</div><h2>${esc(parado)}</h2><p class="muted" style="margin:0">Ninguém recebe diária neste dia e ele não conta como falta.</p>${lock ? '' : `<button class="btn" data-act="desparar" data-k="desparar" style="justify-self:start">Desfazer, teve obra</button>`}</section>`;
  } else if (ui.parar && !lock) {
    const pr = ui.parar;
    corpo = `<section class="card form enter" aria-label="Dia sem obra"><h2 style="font-size:24px">Não teve obra neste dia?</h2>
      <div class="chips" role="group" aria-label="Motivo">${MOTIVOS.map(m => `<button data-act="pmot" data-m="${m}" data-k="pm-${m}" aria-pressed="${pr.motivo === m}">${m}</button>`).join('')}</div>
      ${pr.motivo === 'Outro' ? `<div class="field"><label for="p-outro">Qual o motivo?</label><input id="p-outro" data-k="p-outro" value="${esc(pr.outro)}" maxlength="60" placeholder="Ex.: Paralisação"></div>` : ''}
      ${marc ? `<p class="muted" style="margin:0;font-size:14px">As ${marc} presenças marcadas neste dia serão apagadas.</p>` : ''}
      ${ui.err ? `<div class="err" role="alert">${esc(ui.err)}</div>` : ''}
      <div class="row end"><button class="btn btn-ghost" data-act="cancelparar" data-k="cancelparar">Cancelar</button><button class="btn btn-primary" data-act="confirmparar" data-k="confirmparar">Marcar sem obra</button></div></section>`;
  } else {
    const pend = ps.length - marc, pendLivres = ps.filter(p => !markOf(d, p.id) && d > (p.pago_ate || '')).length;
    const people = ps.map(p => {
      const m = markOf(d, p.id), pago = d <= (p.pago_ate || ''), trava = pago || lock;
      const st = pago && m ? `<span class="st sn">Pago</span>` : m ? `<span class="st ${m.v === 1 ? 's1' : m.v === 0.5 ? 'sh' : 's0'}">${TIPO[m.v]}</span>` : `<span class="st sn">${lock ? 'Sem marcação' : 'Pendente'}</span>`;
      return `<div class="person"><div class="id"><div class="av" aria-hidden="true">${esc(initials(p.nome))}</div><div class="who"><b>${esc(p.nome)}</b><span>${esc(p.funcao)} · ${brl(p.diaria)}</span></div>${st}</div>
        <div class="seg" role="group" aria-label="Presença de ${esc(p.nome)}">${[1, 0.5, 0].map(v => `<button data-act="mark" data-p="${p.id}" data-v="${v}" data-k="m-${p.id}-${v}" aria-pressed="${m?.v === v}"${trava ? ' disabled' : ''}>${TIPO[v]}</button>`).join('')}</div></div>`;
    }).join('');
    corpo = `<div class="prog"><div class="line"><span><b>${marc}</b> de ${ps.length} marcados</span><span class="muted">${pend ? pend + ' pendente' + (pend > 1 ? 's' : '') : 'Chamada completa'}</span></div><div class="bar"><i style="transform:scaleX(${marc / ps.length})"></i></div></div>
      ${pendLivres && !lock ? `<button class="btn" data-act="fill" data-k="fill">Marcar ${pendLivres} pendente${pendLivres > 1 ? 's' : ''} como inteira</button>` : ''}
      <div class="roll">${people}</div>
      ${lock ? '' : `<button class="btn btn-ghost" data-act="parar" data-k="parar" style="justify-self:center">Não teve obra neste dia (chuva, feriado…)</button>`}`;
  }
  const xf = lock ? null : ui.extra;
  const extrasHtml = `<section class="card" style="display:grid;gap:10px" aria-label="Custos extras do dia">
    <div class="sectitle"><div class="eyebrow">Custos extras do dia</div>${!xf && !lock ? `<button class="link" data-act="addextra" data-k="addextra">+ Adicionar custo</button>` : ''}</div>
    ${extras.length ? `<div class="xlist">${extras.map(x => `<div class="xitem"><span class="xcat">${esc(x.categoria)}</span><span class="xdesc">${esc(x.descricao || '')}</span><b class="num">${brl(x.valor)}</b>${lock ? '<span></span>' : `<button class="xrm" data-act="rmextra" data-x="${x.id}" data-k="rmx-${x.id}" aria-label="Apagar ${esc(x.categoria)} de ${brl(x.valor)}">×</button>`}</div>`).join('')}</div>` : (xf ? '' : `<p class="muted" style="margin:0;font-size:14px">${lock ? 'Nenhum custo extra neste dia.' : 'Almoço, combustível, material comprado na hora. Some ao custo do dia.'}</p>`)}
    ${xf ? `<div class="form enter" style="border-top:${extras.length ? '1px solid var(--line)' : '0'};padding-top:${extras.length ? '12px' : '0'}">
      <div class="chips" role="group" aria-label="Tipo de custo">${CATS.map(c => `<button data-act="xcat" data-c="${c}" data-k="xc-${c}" aria-pressed="${xf.cat === c}">${c}</button>`).join('')}</div>
      <div class="field"><label for="x-desc">Descrição (opcional)</label><input id="x-desc" data-k="x-desc" value="${esc(xf.desc)}" maxlength="80" placeholder="${CAT_PH[xf.cat]}"></div>
      <div class="field"><label for="x-valor">Valor</label><div class="money"><span>R$</span><input id="x-valor" data-k="x-valor" inputmode="decimal" value="${esc(xf.valor)}" placeholder="0,00"></div></div>
      ${ui.err ? `<div class="err" role="alert">${esc(ui.err)}</div>` : ''}
      <div class="row end"><button class="btn btn-ghost" data-act="cancelextra" data-k="cancelextra">Cancelar</button><button class="btn btn-primary" data-act="saveextra" data-k="saveextra">Adicionar</button></div></div>` : ''}
  </section>`;
  return `<div class="${enter().trim()}" style="display:grid;gap:14px">
    <div class="datehead"><h1>${DOWL[dt.getDay()]}, ${dt.getDate()} de ${MES[dt.getMonth()]}<small>${d === t ? 'Hoje' : 'Dia anterior'}</small></h1>${d !== t ? `<button class="btn" data-act="hoje" data-k="hoje">Hoje</button>` : ''}</div>
    <div class="weekbar"><button data-act="week" data-n="-7" data-k="wk-prev" aria-label="Semana anterior">‹</button><div class="strip">${strip}</div><button data-act="week" data-n="7" data-k="wk-next" aria-label="Próxima semana"${addDays(ws, 7) > t ? ' disabled' : ''}>›</button></div>
    ${vSemana(ws)}
    ${corpo}
    ${extrasHtml}
    <div class="sum">${parado ? '' : `<div class="k"><div><span>Inteiras</span><b>${ints}</b></div><div><span>Meias</span><b>${meias}</b></div><div><span>Faltas</span><b>${faltas}</b></div></div>`}
      <div class="lines"><div><span>Diárias</span><span class="num">${brl(cost)}</span></div><div><span>Custos extras</span><span class="num">${brl(totEx)}</span></div></div>
      <div class="cost"><span>Custo do dia</span><b class="num">${brl(cost + totEx)}</b></div></div>
  </div>`;
}

function formPessoa() {
  const f = ui.form, edit = f.id;
  return `<section class="card form enter" aria-label="${edit ? 'Editar pessoa' : 'Adicionar pessoa'}">
    <h2 style="font-size:24px">${edit ? 'Editar pessoa' : 'Adicionar pessoa'}</h2>
    <div class="field"><label for="p-nome">Nome</label><input id="p-nome" data-k="p-nome" value="${esc(f.nome)}" autocomplete="off" maxlength="80" placeholder="Nome completo"></div>
    <div class="field"><label for="p-funcao">Função</label><input id="p-funcao" data-k="p-funcao" list="funcoes" value="${esc(f.funcao)}" autocomplete="off" maxlength="40" placeholder="Ex.: Pedreiro"><datalist id="funcoes">${FUNCOES.map(x => `<option value="${x}">`).join('')}</datalist></div>
    <div class="field"><label for="p-diaria">Valor da diária</label><div class="money"><span>R$</span><input id="p-diaria" data-k="p-diaria" inputmode="decimal" value="${esc(f.diaria)}" placeholder="180,00"></div><span class="hint">Meia diária conta metade deste valor. Mudar o valor não altera dias já marcados.</span></div>
    ${ui.err ? `<div class="err" role="alert">${esc(ui.err)}</div>` : ''}
    <div class="row end"><button class="btn btn-ghost" data-act="cancelform" data-k="cancelform">Cancelar</button><button class="btn btn-primary" data-act="savepessoa" data-k="savepessoa">${edit ? 'Salvar' : 'Adicionar'}</button></div>
    ${edit ? (ui.confirm === 'rm' ? `<div class="confirm"><span>Tirar <b>${esc(f.nome)}</b> desta obra? As diárias e pagamentos já registrados continuam salvos.</span><div class="row end"><button class="btn btn-ghost" data-act="cancelrm" data-k="cancelrm">Manter</button><button class="btn btn-danger" data-act="rm" data-k="rm">Tirar da obra</button></div></div>` : `<button class="link" data-act="askrm" data-k="askrm" style="color:var(--bad);justify-self:start">Tirar desta obra</button>`) : ''}
  </section>`;
}
function vEquipe() {
  const ps = pessoas(), fora = pessoas(false), total = ps.reduce((s, p) => s + (+p.diaria || 0), 0);
  return `<div class="${enter().trim()}" style="display:grid;gap:14px">
    <div class="sectitle"><div><div class="eyebrow">Equipe da obra</div><h2>${ps.length} ${ps.length === 1 ? 'pessoa' : 'pessoas'}</h2></div>${!ui.form ? `<button class="btn btn-primary" data-act="addpessoa" data-k="addp">Adicionar</button>` : ''}</div>
    ${ui.form ? formPessoa() : ''}
    ${ps.length ? `<div class="list">${ps.map(p => `<div class="item"><div class="av" aria-hidden="true">${esc(initials(p.nome))}</div><div class="who"><b>${esc(p.nome)}</b><span>${esc(p.funcao)}</span></div><span class="num" style="font-weight:600">${brl(p.diaria)}</span><button class="link" data-act="editpessoa" data-p="${p.id}" data-k="ed-${p.id}" aria-label="Editar ${esc(p.nome)}">Editar</button></div>`).join('')}</div>
      <p class="muted" style="margin:0;font-size:14px">Dia com todos presentes custa <b class="num" style="color:var(--ink)">${brl(total)}</b>.</p>`
      : (ui.form ? '' : `<div class="card empty"><h2>Equipe vazia</h2><p>Adicione cada pessoa com a função e o valor da diária.</p></div>`)}
    ${fora.length ? `<details class="out"><summary>Fora desta obra (${fora.length})</summary><div class="list">${fora.map(p => `<div class="item"><div class="who"><b>${esc(p.nome)}</b><span>${esc(p.funcao)} · ${brl(p.diaria)}</span></div><button class="link" data-act="reativar" data-p="${p.id}" data-k="re-${p.id}">Trazer de volta</button></div>`).join('')}</div></details>` : ''}
    ${DEMO ? '' : `<section class="card account" aria-label="Conta"><div class="eyebrow">Conta</div>
      <div class="rlines"><div><span>Entrou como</span><b>${esc(USER?.email || '')}</b></div><div><span>Última sincronização</span><span>${sync.last ? hora(sync.last) : (outbox.length ? 'pendente' : '—')}</span></div><div><span>Alterações para enviar</span><span class="num">${outbox.length}</span></div></div>
      ${ui.confirm === 'sair' ? `<div class="confirm"><span>${outbox.length ? `Ainda há ${outbox.length} ${outbox.length === 1 ? 'alteração' : 'alterações'} sem enviar. Conecte-se à internet antes de sair, ou elas serão perdidas.` : 'Sair da conta neste celular? Seus dados continuam salvos no servidor.'}</span><div class="row end"><button class="btn btn-ghost" data-act="cancelsair" data-k="cancelsair">Cancelar</button>${outbox.length ? '' : '<button class="btn btn-danger" data-act="sair" data-k="sair">Sair</button>'}</div></div>` : `<button class="btn" data-act="asksair" data-k="asksair" style="justify-self:start">Sair da conta</button>`}
    </section>`}
  </div>`;
}

function vPagar() {
  if (ui.recibo && L.pagamentos.get(ui.recibo)) return vRecibo();
  const all = pessoas(true).concat(pessoas(false)).map(p => ({ p, ...aberto(p) })).filter(a => a.p.ativo !== false || a.bruto > 0 || a.tv > 0);
  all.sort((a, b) => b.valor - a.valor || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  const tot = all.reduce((s, a) => s + Math.max(0, a.valor), 0), dias = all.reduce((s, a) => s + a.dias, 0), tvs = all.reduce((s, a) => s + a.tv, 0);
  const pags = [...L.pagamentos.values()].filter(x => x.obra_id === ui.obra).sort((a, b) => (a.criado_em || '') < (b.criado_em || '') ? 1 : -1).slice(0, 20);
  const rows = all.map(a => {
    const open = ui.open === a.p.id, nome1 = esc(a.p.nome.split(' ')[0]);
    let ext = '';
    if (open) {
      const tabela = (a.linhas.length || a.vales.length) ? `<table><tbody>
        ${a.linhas.map(l => `<tr><td>${DOW[parse(l.d).getDay()]} <span class="mono">${ddmm(l.d)}</span></td><td><span class="tag ${TCLS[l.v]}">${TIPO[l.v]}</span></td><td class="r num">${l.v ? brl(l.valor) : '—'}</td></tr>`).join('')}
        ${a.vales.map(v => `<tr><td>Vale <span class="mono">${ddmm(v.data)}</span>${v.obs ? `<br><span class="muted" style="font-size:12px">${esc(v.obs)}</span>` : ''}</td><td>${fechada(v.data) ? '' : `<button class="link" data-act="rmvale" data-x="${v.id}" data-k="rmv-${v.id}" style="color:var(--bad);font-size:13px">Apagar</button>`}</td><td class="r num" style="color:var(--bad)">−${brl(v.valor)}</td></tr>`).join('')}
        </tbody><tfoot>
        ${a.tv ? `<tr><td colspan="2" style="font-weight:500">Diárias (${nDias(a.dias)})</td><td class="r num" style="font-weight:500">${brl(a.bruto)}</td></tr><tr><td colspan="2" style="font-weight:500">Vales</td><td class="r num" style="font-weight:500;color:var(--bad)">−${brl(a.tv)}</td></tr>` : ''}
        <tr><td colspan="2">A pagar</td><td class="r num">${brl(a.valor)}</td></tr></tfoot></table>`
        : `<p class="muted" style="margin:0">${a.p.pago_ate ? `Tudo pago até ${ddmm(a.p.pago_ate)}.` : 'Nenhuma diária marcada ainda.'}</p>`;
      const valeUi = ui.vale === a.p.id ? `<div class="form enter vform"><div class="eyebrow">Novo vale para ${nome1}</div>
          <div class="range"><div class="field"><label for="v-valor">Valor</label><div class="money"><span>R$</span><input id="v-valor" data-k="v-valor" inputmode="decimal" placeholder="0,00" value="${esc(ui.vf?.valor || '')}"></div></div><div class="field"><label for="v-data">Dia</label><input type="date" id="v-data" data-k="v-data" value="${ui.vf?.data || today()}" max="${today()}"></div></div>
          <div class="field"><label for="v-obs">Observação (opcional)</label><input id="v-obs" data-k="v-obs" maxlength="60" placeholder="Ex.: adiantamento em Pix" value="${esc(ui.vf?.obs || '')}"></div>
          ${ui.err ? `<div class="err" role="alert">${esc(ui.err)}</div>` : ''}
          <div class="row end"><button class="btn btn-ghost" data-act="cancelvale" data-k="cancelvale">Cancelar</button><button class="btn btn-primary" data-act="savevale" data-p="${a.p.id}" data-k="savevale">Lançar vale</button></div></div>`
        : `<button class="link" data-act="addvale" data-p="${a.p.id}" data-k="addvale-${a.p.id}" style="justify-self:start">+ Lançar vale ou adiantamento</button>`;
      let payUi = '';
      if (a.bruto > 0) {
        if (a.valor < 0) payUi = `<p class="banner" style="margin:0">Os vales (${brl(a.tv)}) passam do valor das diárias (${brl(a.bruto)}). Marque mais diárias antes de registrar o pagamento.</p>`;
        else if (ui.confirm === 'pay:' + a.p.id) payUi = `<div class="confirm pay"><span>Registrar pagamento de <b>${brl(a.valor)}</b> a ${nome1}, referente a ${ddmm(a.linhas[0].d)} até ${ddmm(a.linhas[a.linhas.length - 1].d)}${a.tv ? `, já descontando ${brl(a.tv)} de vales` : ''}?</span><div class="row end"><button class="btn btn-ghost" data-act="cancelpay" data-k="cancelpay">Cancelar</button><button class="btn btn-primary" data-act="pay" data-p="${a.p.id}" data-k="pay">Confirmar pagamento</button></div></div>`;
        else payUi = `<button class="btn btn-primary btn-block" data-act="askpay" data-p="${a.p.id}" data-k="askpay-${a.p.id}">Registrar pagamento de ${brl(a.valor)}</button>`;
      }
      ext = `<div class="ext">${tabela}${valeUi}${payUi}</div>`;
    }
    const sub = a.dias ? nDias(a.dias) + (a.linhas.length ? ' desde ' + ddmm(a.linhas[0].d) : '') : 'em dia';
    return `<div class="payrow"><button data-act="open" data-p="${a.p.id}" data-k="open-${a.p.id}" aria-expanded="${open}"><b>${esc(a.p.nome)}</b><span class="v num">${brl(a.valor)}</span><span class="m">${esc(a.p.funcao)} · ${sub}${a.tv ? ` · vale ${brl(a.tv)}` : ''}</span><span class="chip ${a.valor > 0 ? 'open' : 'done'}">${a.valor > 0 ? 'Em aberto' : a.valor < 0 ? 'Vale a descontar' : 'Em dia'}</span></button>${ext}</div>`;
  }).join('');
  return `<div class="${enter().trim()}" style="display:grid;gap:14px">
    <div class="card owedhead"><span class="eyebrow">Em aberto nesta obra</span><b class="num">${brl(tot)}</b><span class="muted" style="font-size:14px">${dias ? nDias(dias) + ' a pagar' : 'Nada a pagar agora'}${tvs ? ` · ${brl(tvs)} em vales já descontados` : ''}</span></div>
    ${all.length ? `<div class="list" style="display:block">${rows}</div><p class="muted" style="margin:0;font-size:13px">Toque em uma pessoa para ver o extrato, lançar vale ou pagar.</p>` : `<div class="card empty"><h2>Sem equipe</h2><p>Cadastre a equipe e marque as diárias para ver aqui quanto pagar a cada pessoa.</p></div>`}
    <section style="display:grid;gap:8px"><div class="eyebrow">Pagamentos registrados</div>
      ${pags.length ? `<div class="card hist">${pags.map(x => { const p = L.pessoas.get(x.pessoa_id); return `<div><span>${esc(p?.nome || 'Pessoa removida')} · <span class="mono">${ddmm(x.data)}</span> · ref. ${ddmm(x.de)} a ${ddmm(x.ate)}<br><button class="link" data-act="recibo" data-x="${x.id}" data-k="rec-${x.id}" style="font-size:13px">Ver recibo</button></span><b class="num">${brl(x.valor)}</b></div>`; }).join('')}</div>` : `<p class="muted" style="margin:0;font-size:14px">Nenhum pagamento registrado nesta obra.</p>`}
    </section>
  </div>`;
}
function reciboTexto(x) {
  const p = L.pessoas.get(x.pessoa_id) || { nome: '', funcao: '' }, ob = L.obras.get(x.obra_id)?.nome || '';
  const l = ['*RECIBO*', '', `Recebi de ${ob} a importância de *${brl(x.valor)}* (${extenso(x.valor)}), referente a ${nDias(x.dias)} de trabalho como ${(p.funcao || '').toLowerCase()} no período de ${dmy(x.de)} a ${dmy(x.ate)}.`, ''];
  if (x.vales) l.push(`Diárias: ${brl(x.bruto)}`, `Vales descontados: −${brl(x.vales)}`, `Valor pago: ${brl(x.valor)}`, '');
  l.push(`Data: ${dmy(x.data)}`, '', p.nome);
  return l.join('\n');
}
function vRecibo() {
  const x = L.pagamentos.get(ui.recibo), p = L.pessoas.get(x.pessoa_id) || { nome: 'Pessoa removida', funcao: '' }, ob = L.obras.get(x.obra_id)?.nome || '';
  return `<div class="enter" style="display:grid;gap:14px">
    <button class="link" data-act="fecharrecibo" data-k="fecharrecibo" style="justify-self:start">‹ Voltar para A pagar</button>
    <article class="card recibo" aria-label="Recibo">
      <div class="rhead"><h2>Recibo</h2><b class="num">${brl(x.valor)}</b></div>
      <p>Recebi de <b>${esc(ob)}</b> a importância de <b>${brl(x.valor)}</b> (${esc(extenso(x.valor))}), referente a ${nDias(x.dias)} de trabalho como ${esc((p.funcao || '').toLowerCase())} no período de ${dmy(x.de)} a ${dmy(x.ate)}.</p>
      ${x.vales ? `<div class="rlines"><div><span>Diárias</span><span class="num">${brl(x.bruto)}</span></div><div><span>Vales descontados</span><span class="num">−${brl(x.vales)}</span></div><div><b>Valor pago</b><b class="num">${brl(x.valor)}</b></div></div>` : ''}
      <p class="muted" style="margin:0">Data: ${dmy(x.data)}</p>
      <div class="sign"><span aria-hidden="true"></span>${esc(p.nome)}</div>
    </article>
    ${ui.copy != null ? `<div class="field"><label for="copybox">Selecione e copie o texto abaixo</label><textarea id="copybox" class="copybox" readonly>${esc(ui.copy)}</textarea></div>` : `<button class="btn btn-primary btn-block" data-act="copiar" data-what="recibo" data-k="copiar-recibo">Copiar recibo para WhatsApp</button>`}
  </div>`;
}

function statusSemanaRel(R) {
  if (ui.per !== 'semana' && ui.per !== 'semanaant') return '';
  const f = fechamentoDe(R.de);
  return f ? `<div class="weekstatus closed">${LOCK_SVG}<span><b>Semana fechada</b> em ${hora(f.fechado_em)}. Os números abaixo não mudam mais.</span></div>`
    : `<div class="weekstatus"><span>Semana <b>aberta</b>: os números ainda podem mudar. Feche a semana na aba Chamada.</span></div>`;
}
function textoResumo(R) {
  const ob = L.obras.get(ui.obra)?.nome || '', f = fechamentoDe(R.de);
  const l = ['*Relatório da obra*', ob, `${ddmm(R.de)} a ${ddmm(R.ate)}${f && f.fim === R.ate ? ' (semana fechada)' : ''}`, '',
    `Custo total: *${brl(R.tot.valor + R.totEx)}*`, `Mão de obra: ${brl(R.tot.valor)} (${nDias(R.tot.dias)})`];
  if (R.totEx) l.push(`Custos extras: ${brl(R.totEx)}`);
  l.push(`Inteiras: ${R.tot.i} · Meias: ${R.tot.m} · Faltas: ${R.tot.f}`, '');
  if (R.linhas.length) { l.push('*Por pessoa*'); R.linhas.forEach(r => l.push(`• ${r.p.nome} (${r.p.funcao}): ${nDias(r.dias)}${r.f ? `, ${r.f} falta${r.f > 1 ? 's' : ''}` : ''} = ${brl(r.valor)}`)); }
  if (R.extras.length) { l.push('', '*Custos extras*'); R.extras.forEach(x => l.push(`• ${x.c}: ${brl(x.v)}`)); }
  if (R.parados.length) l.push('', `*Dias sem obra:* ${R.parados.map(x => `${ddmm(x.d)} (${x.motivo})`).join(', ')}`);
  if (R.pago || R.vales) l.push('', `Pago no período: ${brl(R.pago)}${R.vales ? ` · Vales: ${brl(R.vales)}` : ''}`);
  if (f && f.fim === R.ate) l.push('', `Semana fechada em ${hora(f.fechado_em)}.`);
  return l.join('\n');
}
function vRelatorio() {
  const R = relatorio(), maxD = Math.max(1, ...R.dias.map(x => x.mo + x.ex));
  const pers = [['semana', 'Esta semana'], ['semanaant', 'Semana passada'], ['mes', 'Este mês'], ['mesant', 'Mês passado'], ['outro', 'Escolher datas']];
  const tem = R.linhas.length || R.extras.length || R.parados.length;
  return `<div class="${enter().trim()}" style="display:grid;gap:14px">
    <div><div class="eyebrow">Relatório</div><h2 style="font-size:28px;line-height:1.05">${R.nome}</h2><span class="muted mono">${dmy(R.de)} a ${dmy(R.ate)}</span></div>
    <div class="periods" role="group" aria-label="Período">${pers.map(([k, l]) => `<button data-act="per" data-per="${k}" data-k="per-${k}" aria-pressed="${ui.per === k}">${l}</button>`).join('')}</div>
    ${ui.per === 'outro' ? `<div class="range"><div class="field"><label for="r-de">De</label><input type="date" id="r-de" value="${R.de}" max="${today()}"></div><div class="field"><label for="r-ate">Até</label><input type="date" id="r-ate" value="${R.ate}" max="${today()}"></div></div>` : ''}
    ${statusSemanaRel(R)}
    ${tem ? `
    <div class="kgrid">
      <div class="card big"><span class="eyebrow">Custo total da obra</span><b class="num">${brl(R.tot.valor + R.totEx)}</b><span class="muted" style="font-size:14px">Mão de obra ${brl(R.tot.valor)} · Extras ${brl(R.totEx)}</span></div>
      <div class="card"><span class="eyebrow">Inteiras / meias</span><b class="num">${R.tot.i} / ${R.tot.m}</b></div>
      <div class="card"><span class="eyebrow">Faltas</span><b class="num" style="color:${R.tot.f ? 'var(--bad)' : 'inherit'}">${R.tot.f}</b></div>
      <div class="card"><span class="eyebrow">Pago no período</span><b class="num">${brl(R.pago)}</b></div>
      <div class="card"><span class="eyebrow">Vales no período</span><b class="num">${brl(R.vales)}</b></div>
    </div>
    ${R.linhas.length ? `<section class="card" style="display:grid;gap:8px"><div class="eyebrow">Mão de obra por pessoa</div>
      <table class="rtable"><thead><tr><th>Pessoa</th><th>Dias</th><th>Faltas</th><th>Valor</th></tr></thead><tbody>
      ${R.linhas.map(r => `<tr><td><b>${esc(r.p.nome)}</b><span>${esc(r.p.funcao)} · ${r.i} int.${r.m ? ` · ${r.m} meia${r.m > 1 ? 's' : ''}` : ''}</span></td><td class="num">${fmtN(r.dias)}</td><td class="num" style="color:${r.f ? 'var(--bad)' : 'var(--muted)'}">${r.f}</td><td class="num">${brl(r.valor)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total</td><td class="num">${fmtN(R.tot.dias)}</td><td class="num">${R.tot.f}</td><td class="num">${brl(R.tot.valor)}</td></tr></tfoot></table></section>` : ''}
    ${R.extras.length ? `<section class="card" style="display:grid;gap:8px"><div class="eyebrow">Custos extras por tipo</div>
      <div class="rlines">${R.extras.map(x => `<div><span>${esc(x.c)}</span><span class="num">${brl(x.v)}</span></div>`).join('')}<div><b>Total</b><b class="num">${brl(R.totEx)}</b></div></div></section>` : ''}
    ${R.dias.length ? `<section class="card" style="display:grid;gap:10px"><div class="sectitle"><div class="eyebrow">Custo por dia</div><div class="legend2"><span><i class="lmo"></i>Diárias</span><span><i class="lex"></i>Extras</span></div></div>
      <div class="days">${R.dias.map(x => `<div class="dayrow"><span>${DOW[parse(x.d).getDay()]} <span class="mono">${ddmm(x.d)}</span></span><div class="track" title="${x.pres} presentes"><i class="mo" style="width:${x.mo / maxD * 100}%"></i><i class="ex" style="width:${x.ex / maxD * 100}%"></i></div><span class="num" style="font-weight:600">${brl(x.mo + x.ex)}</span></div>`).join('')}</div></section>` : ''}
    ${R.parados.length ? `<section class="card" style="display:grid;gap:6px"><div class="eyebrow">Dias sem obra (${R.parados.length})</div><div class="rlines">${R.parados.map(x => `<div><span>${DOW[parse(x.d).getDay()]} <span class="mono">${ddmm(x.d)}</span></span><span>${esc(x.motivo)}</span></div>`).join('')}</div></section>` : ''}
    ${ui.copy != null ? `<div class="field"><label for="copybox">Selecione e copie o texto abaixo</label><textarea id="copybox" class="copybox" readonly>${esc(ui.copy)}</textarea></div>` : `<button class="btn btn-primary btn-block" data-act="copiar" data-what="rel" data-k="copiar">Copiar resumo para WhatsApp</button>`}
    ` : `<div class="card empty"><h2>Nada neste período</h2><p>Nenhuma diária ou custo lançado entre ${ddmm(R.de)} e ${ddmm(R.ate)}. Escolha outro período ou marque a chamada.</p></div>`}
  </div>`;
}

/* ===================== ações ===================== */
let toastT;
function toast(msg, bad) { const el = document.getElementById('toast'); el.innerHTML = `<div class="toast${bad ? ' bad' : ''}" role="status">${esc(msg)}</div>`; clearTimeout(toastT); toastT = setTimeout(() => el.innerHTML = '', 3600); }
const val = id => document.getElementById(id)?.value ?? '';
function readForm() { ui.form.nome = val('p-nome'); ui.form.funcao = val('p-funcao'); ui.form.diaria = val('p-diaria'); }
function readExtra() { if (!ui.extra) return; if (document.getElementById('x-desc')) ui.extra.desc = val('x-desc'); if (document.getElementById('x-valor')) ui.extra.valor = val('x-valor'); }
function readParar() { if (ui.parar && document.getElementById('p-outro')) ui.parar.outro = val('p-outro'); }
function resetForms() { ui.extra = null; ui.parar = null; ui.vale = null; ui.vf = null; ui.recibo = null; ui.fechar = null; ui.form = null; ui.confirm = null; ui.err = ''; ui.copy = null; }
const marcar = (pid, v) => { const p = L.pessoas.get(pid); put('presencas', { obra_id: ui.obra, pessoa_id: pid, data: ui.day, tipo: v, diaria: v == null ? (L.presencas.get(pid + '|' + ui.day)?.diaria ?? p.diaria) : p.diaria }); };

async function acaoAuth() {
  const a = ui.auth, email = val('l-email').trim(), senha = val('l-senha'), senha2 = val('l-senha2');
  ui.email = email || ui.email; ui.authErr = ''; ui.authMsg = '';
  if (a !== 'nova' && !/^\S+@\S+\.\S+$/.test(email)) { ui.authErr = 'Digite um e-mail válido.'; return render(); }
  if ((a === 'criar' || a === 'nova') && senha.length < 8) { ui.authErr = 'A senha precisa ter pelo menos 8 caracteres.'; return render(); }
  if ((a === 'criar' || a === 'nova') && senha !== senha2) { ui.authErr = 'As duas senhas não são iguais.'; return render(); }
  if (a === 'entrar' && !senha) { ui.authErr = 'Digite a senha.'; return render(); }
  if (!navigator.onLine) { ui.authErr = 'Sem internet. Conecte-se para continuar.'; return render(); }
  ui.busy = true; render();
  try {
    const redirectTo = location.origin + location.pathname;
    if (a === 'entrar') {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      NEEDS_LOGIN = false; await startUser(data.user);
    } else if (a === 'criar') {
      const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      if (data.session) await startUser(data.user);
      else { ui.auth = 'entrar'; ui.authMsg = `Enviamos um link de confirmação para ${email}. Abra o e-mail, toque no link e depois entre aqui.`; }
    } else if (a === 'esqueci') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      ui.authMsg = `Se existir uma conta com ${email}, enviamos um link para criar uma nova senha.`;
    } else if (a === 'nova') {
      const { data, error } = await sb.auth.updateUser({ password: senha });
      if (error) throw error;
      ui.auth = 'entrar'; await startUser(data.user); toast('Senha alterada.');
    }
  } catch (e) {
    const m = (e && e.message) || '';
    ui.authErr = /Invalid login/i.test(m) ? 'E-mail ou senha incorretos.'
      : /not confirmed/i.test(m) ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
      : /already registered|already exists/i.test(m) ? 'Já existe uma conta com este e-mail. Use "Entrar".'
      : /rate limit|too many/i.test(m) ? 'Muitas tentativas. Espere alguns minutos e tente de novo.'
      : /signups? not allowed|disabled/i.test(m) ? 'A criação de contas está desativada. Peça acesso ao responsável.'
      : isNetErr(e) ? 'Sem conexão com o servidor. Confira a internet.' : 'Não foi possível concluir: ' + m;
  } finally { ui.busy = false; render(); }
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
  const a = b.dataset.act, pid = b.dataset.p;
  if (a === 'auth-go') return acaoAuth();
  if (a === 'auth-mode') { ui.email = val('l-email') || ui.email; ui.auth = b.dataset.m; ui.authErr = ''; ui.authMsg = ''; return render(); }
  if (a === 'tab') { ui.tab = b.dataset.tab; ui.newObra = false; resetForms(); ENTER = true; rememberUi(); window.scrollTo(0, 0); }
  else if (a === 'day') { ui.day = b.dataset.d; ui.extra = null; ui.parar = null; ui.fechar = null; ui.err = ''; }
  else if (a === 'hoje') { ui.day = today(); ui.extra = null; ui.parar = null; ui.fechar = null; ui.err = ''; }
  else if (a === 'week') { ui.extra = null; ui.parar = null; ui.fechar = null; ui.err = ''; const nd = addDays(ui.day, +b.dataset.n); ui.day = nd > today() ? today() : nd; }
  else if (a === 'mark') { if (fechada(ui.day)) return; const v = +b.dataset.v, cur = markOf(ui.day, pid); marcar(pid, cur && cur.v === v ? null : v); return commit(); }
  else if (a === 'fill') { if (fechada(ui.day)) return; pessoas().forEach(p => { if (!markOf(ui.day, p.id) && ui.day > (p.pago_ate || '')) marcar(p.id, 1); }); return commit(); }
  else if (a === 'askfechar') { ui.fechar = b.dataset.ws; ui.parar = null; ui.extra = null; }
  else if (a === 'cancelfechar') { ui.fechar = null; }
  else if (a === 'fechar') {
    const ws = ui.fechar; if (!ws || fechamentoDe(ws)) { ui.fechar = null; return render(); }
    put('fechamentos', { id: uuid(), obra_id: ui.obra, inicio: ws, fim: addDays(ws, 6), fechado_em: new Date().toISOString() });
    ui.fechar = null; toast(`Semana de ${ddmm(ws)} a ${ddmm(addDays(ws, 6))} fechada.`); return commit();
  }
  else if (a === 'newobra') { ui.newObra = true; ui.err = ''; ENTER = true; render(); document.getElementById('obra-nome')?.focus(); return; }
  else if (a === 'cancelobra') { ui.newObra = false; ui.err = ''; }
  else if (a === 'exemplo' && DEMO) {
    const oid = uuid(); put('obras', { id: oid, nome: 'Obra de exemplo', apagado: false, criado_em: new Date().toISOString() });
    [['Raimundo Nonato Silva', 'Mestre de obras', 280], ['José Carlos Pereira', 'Pedreiro', 180], ['Francisco Alves', 'Pedreiro', 180], ['Antônio Marcos Sousa', 'Carpinteiro', 190], ['Wesley Rodrigues', 'Servente', 120], ['Luan Batista', 'Servente', 120]]
      .forEach(([nome, funcao, diaria], i) => put('pessoas', { id: 'ex' + i, obra_id: oid, nome, funcao, diaria, ativo: true, pago_ate: null, criado_em: new Date(Date.now() + i).toISOString() }));
    ui.obra = oid; ui.tab = 'chamada'; ui.day = today(); ENTER = true; toast('Exemplo carregado. Marque a chamada de hoje.');
  }
  else if (a === 'saveobra') {
    const nome = val('obra-nome').trim();
    if (!nome) { ui.err = 'Dê um nome para a obra.'; render(); document.getElementById('obra-nome').focus(); return; }
    const src = val('obra-equipe'), id = uuid(), agora = Date.now(); ui.err = '';
    const copia = src ? [...L.pessoas.values()].filter(p => p.obra_id === src && p.ativo !== false) : [];
    put('obras', { id, nome, apagado: false, criado_em: new Date(agora).toISOString() });
    copia.forEach((p, i) => put('pessoas', { id: uuid(), obra_id: id, nome: p.nome, funcao: p.funcao, diaria: p.diaria, ativo: true, pago_ate: null, criado_em: new Date(agora + i + 1).toISOString() }));
    ui.obra = id; ui.newObra = false; ui.day = today(); ENTER = true;
    if (copia.length) { ui.tab = 'chamada'; ui.form = null; toast(`Obra criada com ${copia.length} ${copia.length === 1 ? 'pessoa' : 'pessoas'} da equipe.`); }
    else { ui.tab = 'equipe'; ui.form = { nome: '', funcao: '', diaria: '' }; toast('Obra criada. Agora adicione a equipe.'); }
    rememberUi(); return commit();
  }
  else if (a === 'addpessoa') { ui.tab = 'equipe'; ui.form = { nome: '', funcao: '', diaria: '' }; ui.confirm = null; ui.err = ''; rememberUi(); render(); document.getElementById('p-nome')?.focus(); return; }
  else if (a === 'editpessoa') { const p = L.pessoas.get(pid); ui.form = { id: pid, nome: p.nome, funcao: p.funcao, diaria: String(p.diaria).replace('.', ',') }; ui.confirm = null; ui.err = ''; window.scrollTo(0, 0); render(); document.getElementById('p-nome')?.focus(); return; }
  else if (a === 'cancelform') { ui.form = null; ui.confirm = null; ui.err = ''; }
  else if (a === 'savepessoa') {
    readForm(); const f = ui.form, nome = f.nome.trim(), funcao = f.funcao.trim(), diaria = parseMoney(f.diaria);
    ui.err = !nome ? 'Escreva o nome da pessoa.' : !funcao ? 'Escreva a função, por exemplo Pedreiro.' : !(diaria > 0) ? 'Informe o valor da diária em reais, por exemplo 180,00.' : '';
    if (ui.err) return render();
    if (f.id) put('pessoas', { id: f.id, nome, funcao, diaria });
    else put('pessoas', { id: uuid(), obra_id: ui.obra, nome, funcao, diaria, ativo: true, pago_ate: null, criado_em: new Date().toISOString() });
    toast(f.id ? 'Alterações salvas.' : `${nome.split(' ')[0]} entrou na equipe.`); ui.form = null; return commit();
  }
  else if (a === 'askrm') { readForm(); ui.confirm = 'rm'; }
  else if (a === 'cancelrm') { readForm(); ui.confirm = null; }
  else if (a === 'rm') { const id = ui.form.id, n = ui.form.nome; put('pessoas', { id, ativo: false }); ui.form = null; ui.confirm = null; toast(`${n.split(' ')[0]} saiu desta obra.`); return commit(); }
  else if (a === 'reativar') { put('pessoas', { id: pid, ativo: true }); toast('Pessoa de volta na equipe.'); return commit(); }
  else if (a === 'asksair') { ui.confirm = 'sair'; }
  else if (a === 'cancelsair') { ui.confirm = null; }
  else if (a === 'sair') { await sair(); return; }
  else if (a === 'per') { ui.per = b.dataset.per; ui.copy = null; if (ui.per === 'outro' && !ui.de) { const r = periodo(); ui.de = r[0]; ui.ate = r[1]; } }
  else if (a === 'copiar') {
    const rec = b.dataset.what === 'recibo', txt = rec ? reciboTexto(L.pagamentos.get(ui.recibo)) : textoResumo(relatorio());
    try { await navigator.clipboard.writeText(txt); toast(rec ? 'Recibo copiado. Cole no WhatsApp.' : 'Resumo copiado. Cole no WhatsApp.'); }
    catch (err) { ui.copy = txt; render(); const ta = document.getElementById('copybox'); ta?.focus(); ta?.select(); return; }
  }
  else if (a === 'addextra') { if (fechada(ui.day)) return; ui.extra = { cat: 'Almoço', desc: '', valor: '' }; ui.err = ''; render(); document.getElementById('x-valor')?.focus(); return; }
  else if (a === 'xcat') { readExtra(); ui.extra.cat = b.dataset.c; }
  else if (a === 'cancelextra') { ui.extra = null; ui.err = ''; }
  else if (a === 'saveextra') {
    readExtra(); const v = parseMoney(ui.extra.valor);
    if (fechada(ui.day)) { ui.err = 'Esta semana está fechada.'; return render(); }
    if (!(v > 0)) { ui.err = 'Informe o valor em reais, por exemplo 85,00.'; render(); document.getElementById('x-valor')?.focus(); return; }
    const cat = ui.extra.cat;
    put('extras', { id: uuid(), obra_id: ui.obra, data: ui.day, categoria: cat, descricao: ui.extra.desc.trim(), valor: v, apagado: false, criado_em: new Date().toISOString() });
    ui.err = ''; ui.extra = null; toast(`${cat}: ${brl(v)} lançado.`); return commit();
  }
  else if (a === 'rmextra') { if (fechada(ui.day)) return; put('extras', { id: b.dataset.x, apagado: true }); toast('Custo apagado.'); return commit(); }
  else if (a === 'parar') { ui.parar = { motivo: 'Chuva', outro: '' }; ui.err = ''; }
  else if (a === 'pmot') { readParar(); ui.parar.motivo = b.dataset.m; }
  else if (a === 'cancelparar') { ui.parar = null; ui.err = ''; }
  else if (a === 'confirmparar') {
    readParar(); const pr = ui.parar, motivo = pr.motivo === 'Outro' ? (pr.outro.trim() || 'Outro motivo') : pr.motivo;
    if (fechada(ui.day)) { ui.err = 'Esta semana está fechada.'; return render(); }
    const travados = pessoas(true).concat(pessoas(false)).filter(p => markOf(ui.day, p.id) && ui.day <= (p.pago_ate || ''));
    if (travados.length) { ui.err = `Este dia já foi pago para ${travados.map(p => p.nome.split(' ')[0]).join(', ')}. Não dá para marcar como sem obra.`; return render(); }
    pessoas(true).concat(pessoas(false)).forEach(p => { if (markOf(ui.day, p.id)) marcar(p.id, null); });
    put('dias_obra', { obra_id: ui.obra, data: ui.day, parado_motivo: motivo });
    ui.parar = null; ui.err = ''; toast(`Dia marcado sem obra: ${motivo}.`); return commit();
  }
  else if (a === 'desparar') { if (fechada(ui.day)) return; put('dias_obra', { obra_id: ui.obra, data: ui.day, parado_motivo: null }); toast('Dia liberado para a chamada.'); return commit(); }
  else if (a === 'open') { ui.open = ui.open === pid ? null : pid; ui.confirm = null; ui.vale = null; ui.err = ''; }
  else if (a === 'addvale') { ui.vale = pid; ui.vf = null; ui.err = ''; ui.confirm = null; render(); document.getElementById('v-valor')?.focus(); return; }
  else if (a === 'cancelvale') { ui.vale = null; ui.vf = null; ui.err = ''; }
  else if (a === 'savevale') {
    const vf = { valor: val('v-valor'), data: val('v-data'), obs: val('v-obs').trim() }, v = parseMoney(vf.valor);
    ui.err = !(v > 0) ? 'Informe o valor do vale, por exemplo 100,00.' : (!vf.data || vf.data > today()) ? 'Escolha o dia do vale (hoje ou antes).' : fechada(vf.data) ? 'Esse dia está numa semana fechada. Escolha outra data.' : '';
    if (ui.err) { ui.vf = vf; return render(); }
    put('vales', { id: uuid(), obra_id: ui.obra, pessoa_id: pid, data: vf.data, valor: v, obs: vf.obs, pagamento_id: null, apagado: false, criado_em: new Date().toISOString() });
    ui.vale = null; ui.vf = null; toast(`Vale de ${brl(v)} lançado para ${L.pessoas.get(pid).nome.split(' ')[0]}.`); return commit();
  }
  else if (a === 'rmvale') { const v = L.vales.get(b.dataset.x); if (!v || fechada(v.data)) return; put('vales', { id: v.id, apagado: true }); toast('Vale apagado.'); return commit(); }
  else if (a === 'recibo') { ui.recibo = b.dataset.x; ui.copy = null; ENTER = true; window.scrollTo(0, 0); }
  else if (a === 'fecharrecibo') { ui.recibo = null; ui.copy = null; }
  else if (a === 'askpay') { ui.confirm = 'pay:' + pid; }
  else if (a === 'cancelpay') { ui.confirm = null; }
  else if (a === 'pay') {
    const p = L.pessoas.get(pid), ab = aberto(p); if (!ab.bruto || ab.valor < 0) { ui.confirm = null; return render(); }
    const de = ab.linhas[0].d, ate = ab.linhas[ab.linhas.length - 1].d, pagId = uuid();
    put('pagamentos', { id: pagId, obra_id: ui.obra, pessoa_id: pid, bruto: ab.bruto, vales: ab.tv, valor: ab.valor, dias: ab.dias, de, ate, data: today(), criado_em: new Date().toISOString() });
    ab.vales.forEach(v => put('vales', { id: v.id, pagamento_id: pagId }));
    put('pessoas', { id: pid, pago_ate: ate });
    ui.confirm = null; ui.recibo = pagId; ui.copy = null; ENTER = true; window.scrollTo(0, 0); toast(`Pagamento de ${brl(ab.valor)} registrado.`); return commit();
  }
  render();
});
document.addEventListener('change', e => {
  if (e.target.id === 'r-de' || e.target.id === 'r-ate') { ui[e.target.id === 'r-de' ? 'de' : 'ate'] = e.target.value; ui.copy = null; return render(); }
  if (e.target.id === 'obra-sel') { ui.obra = e.target.value; resetForms(); ui.open = null; ENTER = true; rememberUi(); render(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = e.target.id, go = act => { e.preventDefault(); document.querySelector(`[data-act="${act}"]`)?.click(); };
  if (['l-email', 'l-senha', 'l-senha2'].includes(id)) go('auth-go');
  else if (['x-desc', 'x-valor'].includes(id)) go('saveextra');
  else if (['v-valor', 'v-obs'].includes(id)) go('savevale');
  else if (id === 'obra-nome') go('saveobra');
  else if (['p-nome', 'p-funcao', 'p-diaria'].includes(id)) go('savepessoa');
});

/* ===================== sessão ===================== */
async function startUser(u) {
  if (USER && USER.id === u.id && MODE === 'app') { NEEDS_LOGIN = false; render(); scheduleSync(100); return; }
  USER = { id: u.id, email: u.email };
  lsSet('diarias:lastUser', USER);
  loadLocal();
  const saved = lsGet(skey('ui'), {}); if (saved.tab) ui.tab = saved.tab; if (saved.obra) ui.obra = saved.obra;
  NEEDS_LOGIN = false; ENTER = true;
  const primeiraVez = !Object.keys(lastPull).length && !L.obras.size;
  MODE = primeiraVez && navigator.onLine ? 'loading' : 'app';
  render();
  if (MODE === 'loading') { await runSync(); MODE = 'app'; ENTER = true; render(); }
  else scheduleSync(200);
}
let saindo = false;
async function sair() {
  if (outbox.length) return;
  saindo = true;
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { }
  saindo = false; NEEDS_LOGIN = false;
  ['db', 'outbox', 'pull', 'ui'].forEach(s => { try { localStorage.removeItem(skey(s)); } catch (e) { } });
  try { localStorage.removeItem('diarias:lastUser'); } catch (e) { }
  USER = null; TABLES.forEach(t => L[t].clear()); outbox = []; lastPull = {};
  MODE = 'login'; ui.auth = 'entrar'; ui.email = ''; resetForms(); ENTER = true; render();
}
const comPrazo = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ timeout: true }), ms))]);
async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
    const tinhaVersao = !!navigator.serviceWorker.controller;
    let avisou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!tinhaVersao || avisou) return; avisou = true; toast('App atualizado para a nova versão.'); });
  }
  if (DEMO) { USER = null; loadLocal(); MODE = 'app'; ENTER = true; render(); return; }
  if (!sb) { $app.innerHTML = '<div class="card empty"><h2>Configuração ausente</h2><p>O endereço do servidor não foi configurado.</p></div>'; return; }
  const last = lsGet('diarias:lastUser', null);
  const hasRecovery = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'PASSWORD_RECOVERY') { MODE = 'login'; ui.auth = 'nova'; ui.authMsg = ''; ui.authErr = ''; setTimeout(render, 0); }
    else if (ev === 'SIGNED_IN' && s && MODE !== 'login' && USER && USER.id !== s.user.id) setTimeout(() => startUser(s.user), 0);
    else if (ev === 'SIGNED_OUT' && USER && !saindo) { NEEDS_LOGIN = true; setTimeout(render, 0); }
  });
  const r = await comPrazo(sb.auth.getSession(), 5000);
  const session = r && !r.timeout ? r.data?.session : null;
  if (hasRecovery) { MODE = 'login'; ui.auth = 'nova'; return render(); }
  if (session) return startUser(session.user);
  if (last) { // sem sessão válida agora: abre com os dados do celular e pede login só quando houver internet
    await startUser(last);
    if (navigator.onLine && r && !r.timeout) { NEEDS_LOGIN = true; ui.email = last.email; render(); }
    return;
  }
  MODE = 'login'; ENTER = true; render();
}
boot();
