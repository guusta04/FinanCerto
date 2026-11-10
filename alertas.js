// FinanCerto — Alertas (integrado com a API Spring Boot via api.js)
// Requer: api.js carregado ANTES deste arquivo.
//
// Esta tela junta duas fontes:
//  1) Alertas do SISTEMA, vindos do back-end (GET /alertas, PATCH /alertas/{id}/lido):
//     limite do cartão, meta e fatura próximas do vencimento. O back-end os cria sozinho.
//  2) Regras por CATEGORIA, definidas pelo usuário (ex.: Alimentação até R$ 500/mês).
//     O back-end ainda não tem esse recurso, então as regras ficam salvas neste navegador
//     (localStorage), mas os gastos comparados vêm da API (GET /movimentacoes).

const RULES_KEY = 'financerto:regras-alerta';

const state = {
  alertas: [],
  movimentacoes: [],
  categorias: [],
};

let rules = [];
let pendingDeleteId = null;

/* ---------- Utilitários ---------- */

function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatarDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Mensagem rápida (cria um snackbar se a página não tiver um)
let msgTimeout = null;
function notify(mensagem) {
  let el = document.getElementById('alert-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'alert-toast';
    el.className = 'snackbar';
    el.innerHTML = '<span></span>';
    document.body.appendChild(el);
  }
  el.querySelector('span').textContent = mensagem;
  el.classList.add('show');
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => el.classList.remove('show'), 4500);
}

/* ---------- Regras (localStorage) ---------- */

function loadRules() {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn(e); }
  return [];
}

function saveRules() {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); }
  catch (e) { console.warn(e); }
}

/* ---------- Carregamento dos dados da API ---------- */

async function loadAll() {
  const [alertas, movs, categorias] = await Promise.all([
    api('/alertas'),
    api('/movimentacoes'),
    api('/categorias'),
  ]);
  if (!alertas && !movs) return; // api() já redirecionou para o login

  state.alertas = alertas || [];
  state.movimentacoes = movs || [];
  state.categorias = categorias || [];
}

async function recarregar() {
  try {
    await loadAll();
    render();
  } catch (e) {
    notify(e.message || 'Não foi possível atualizar os alertas.');
  }
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  rules = loadRules();
  initSidebarToggle();
  initModal();
  initDeleteConfirm();

  try {
    await loadAll();
  } catch (e) {
    notify(e.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. O back-end está rodando?'
      : (e.message || 'Erro ao carregar os alertas.'));
  }
  populateCategorias();
  render();
});

function populateCategorias() {
  const select = document.getElementById('rule-categoria');
  if (!select) return;
  const despesas = state.categorias.filter((c) => String(c.tipo).toUpperCase() === 'DESPESA');
  if (!despesas.length) return; // mantém as opções do HTML
  select.innerHTML = despesas.map((c) => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join('');
}

/* ---------- Render ---------- */

function render() {
  renderAlerts();
  renderRules();
}

// Gasto por categoria no mês corrente, a partir das movimentações da API
function gastosDoMesPorCategoria() {
  const hoje = new Date();
  const chaveMes = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
  const soma = {};
  state.movimentacoes
    .filter((m) => String(m.tipo).toUpperCase() === 'DESPESA' && String(m.data).slice(0, 7) === chaveMes)
    .forEach((m) => {
      soma[m.categoria] = (soma[m.categoria] || 0) + Math.abs(Number(m.valor));
    });
  return soma;
}

function iconeDoTipo(tipo) {
  switch (String(tipo).toUpperCase()) {
    case 'LIMITE_ULTRAPASSADO': return '⚠';
    case 'LIMITE_ATINGIDO': return '⚠';
    case 'META_PROX_VENCER': return '◎';
    case 'FATURA_PROX_VENCER': return '▤';
    default: return '!';
  }
}

function renderAlerts() {
  const container = document.getElementById('alerts-list');
  if (!container) return;

  const gastos = gastosDoMesPorCategoria();

  // 1) regras por categoria que foram ultrapassadas
  const estourados = rules
    .map((r) => ({ ...r, gasto: gastos[r.categoria] || 0 }))
    .filter((r) => r.gasto > r.limite);

  const htmlRegras = estourados.map((r) => `
    <div class="alert-card">
      <span class="alert-ico">⚠</span>
      <div class="alert-body">
        <strong>${escapeHtml(r.categoria)} passou do limite</strong>
        <p>Gasto atual: ${formatCurrency(r.gasto)} — limite definido: ${formatCurrency(r.limite)} (${Math.round((r.gasto / r.limite) * 100)}% do limite).</p>
      </div>
    </div>
  `).join('');

  // 2) alertas do sistema (não lidos primeiro, depois os mais recentes)
  const doSistema = [...state.alertas]
    .sort((a, b) => (a.lido === b.lido ? 0 : a.lido ? 1 : -1)
      || String(b.dataCriacao).localeCompare(String(a.dataCriacao)))
    .slice(0, 20);

  const htmlSistema = doSistema.map((a) => `
    <div class="alert-card" style="${a.lido ? 'opacity:0.6;' : ''}">
      <span class="alert-ico">${iconeDoTipo(a.tipo)}</span>
      <div class="alert-body">
        <strong>${escapeHtml(a.titulo)}</strong>
        <p>${escapeHtml(a.mensagem)}</p>
        <p style="font-size:0.75rem; color:var(--ink-faint);">${formatarDataHora(a.dataCriacao)}</p>
      </div>
      ${a.lido ? '' : `<button class="btn-ghost" data-read="${a.id}" type="button">Marcar como lido</button>`}
    </div>
  `).join('');

  if (!htmlRegras && !htmlSistema) {
    container.innerHTML = `
      <div class="alert-card ok">
        <span class="alert-ico">✓</span>
        <div class="alert-body">
          <strong>Tudo certo por enquanto</strong>
          <p>${rules.length
            ? 'Nenhuma categoria passou do limite definido este mês e não há alertas do sistema.'
            : 'Não há alertas do sistema. Crie uma regra por categoria para ser avisado quando passar do limite.'}</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = htmlRegras + htmlSistema;

  container.querySelectorAll('[data-read]').forEach((btn) => {
    btn.addEventListener('click', () => marcarComoLido(btn.dataset.read, btn));
  });
}

async function marcarComoLido(id, btn) {
  if (btn) btn.disabled = true;
  try {
    await api('/alertas/' + id + '/lido', { method: 'PATCH' });
    await recarregar();
  } catch (e) {
    if (btn) btn.disabled = false;
    notify(e.message || 'Não foi possível marcar como lido.');
  }
}

function renderRules() {
  const container = document.getElementById('rules-list');
  if (!container) return;

  if (!rules.length) {
    container.innerHTML = `
      <div class="panel">
        <div class="empty-state">
          <div class="empty-ico">▤</div>
          <div class="empty-title">Você ainda não tem regras</div>
          <div class="empty-sub">Clique em "+ Nova regra" para definir o primeiro limite.</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = rules.map((r) => `
    <div class="rule-row" data-id="${r.id}">
      <div class="rule-info">
        <strong>${escapeHtml(r.categoria)}</strong> · <span class="rule-limit">limite de ${formatCurrency(r.limite)} / mês</span>
      </div>
      <div class="rule-actions">
        <button class="icon-btn danger" data-delete="${r.id}" title="Excluir regra" type="button">🗑</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => requestDelete(btn.dataset.delete));
  });
}

/* ---------- Sidebar mobile ---------- */

function initSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  const openBtn = document.getElementById('menu-toggle');
  const closeBtn = document.getElementById('sidebar-close');
  if (!sidebar || !scrim || !openBtn) return;
  const open = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
  const close = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };
  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  scrim.addEventListener('click', close);
}

/* ---------- Modal: nova regra ---------- */

function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const openBtn = document.getElementById('open-modal');
  const cancelBtn = document.getElementById('cancel-modal');
  const form = document.getElementById('rule-form');

  const open = () => overlay.classList.add('show');
  const close = () => { overlay.classList.remove('show'); form.reset(); };

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const categoria = document.getElementById('rule-categoria').value;
    const limite = parseFloat(document.getElementById('rule-limite').value);
    if (!categoria || !limite || limite <= 0) return;

    // uma regra por categoria: se já existir, atualiza o limite
    const existente = rules.find((r) => r.categoria === categoria);
    if (existente) {
      existente.limite = limite;
    } else {
      rules.push({ id: uid('r'), categoria, limite });
    }

    close();
    render();
    saveRules();
  });
}

/* ---------- Excluir regra ---------- */

function requestDelete(id) {
  const item = rules.find((r) => r.id === id);
  if (!item) return;
  pendingDeleteId = id;
  document.getElementById('confirm-delete-text').innerHTML =
    `Você está prestes a excluir a regra de <strong>${escapeHtml(item.categoria)}</strong>.`;
  document.getElementById('confirm-delete-overlay').classList.add('show');
}

function initDeleteConfirm() {
  const overlay = document.getElementById('confirm-delete-overlay');
  document.getElementById('cancel-delete').addEventListener('click', () => {
    overlay.classList.remove('show');
    pendingDeleteId = null;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { overlay.classList.remove('show'); pendingDeleteId = null; }
  });
  document.getElementById('confirm-delete').addEventListener('click', () => {
    if (!pendingDeleteId) return;
    rules = rules.filter((r) => r.id !== pendingDeleteId);
    pendingDeleteId = null;
    overlay.classList.remove('show');
    render();
    saveRules();
  });
}