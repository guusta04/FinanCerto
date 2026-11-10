// FinanCerto — Dashboard (integrado com a API Spring Boot via api.js)
// Requer: api.js carregado ANTES deste arquivo.
// Endpoints usados: GET /dashboard, GET /movimentacoes, GET /metas, GET /categorias,
// POST/DELETE /movimentacoes, POST/DELETE /metas, POST /metas/{id}/aportes.

const MONTH_NAMES = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

const state = {
  mesSelecionado: String(new Date().getMonth() + 1).padStart(2, '0'),
  saldoAtual: 0,
  movimentacoes: [],
  metas: [],
  categorias: [],
};

/* ---------- Utilitários ---------- */

function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Mensagem rápida (reaproveita o snackbar, sem o botão "Desfazer")
let msgTimeout = null;
function notify(mensagem) {
  const snackbar = document.getElementById('snackbar');
  const undoBtn = document.getElementById('snackbar-undo');
  if (!snackbar) { alert(mensagem); return; }
  document.getElementById('snackbar-text').textContent = mensagem;
  if (undoBtn) undoBtn.style.display = 'none';
  snackbar.classList.add('show');
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => {
    snackbar.classList.remove('show');
    if (undoBtn) undoBtn.style.display = '';
  }, 4000);
}

/* ---------- Carregamento dos dados da API ---------- */

function mapMovimentacao(m) {
  const [, mes, dia] = m.data.split('-');
  const tipo = String(m.tipo).toLowerCase(); // 'receita' | 'despesa'
  const valorAbs = Math.abs(Number(m.valor));
  return {
    id: m.id,
    desc: m.descricao,
    categoria: m.categoria,
    data: dia + '/' + mes,   // exibição
    dataISO: m.data,         // ordenação e filtros
    valor: tipo === 'receita' ? valorAbs : -valorAbs,
    tipo,
  };
}

function mapMeta(g) {
  return {
    id: g.id,
    nome: g.descricao,
    atual: Number(g.valorAtual),
    alvo: Number(g.valorMeta),
    dataMeta: g.dataMeta,
    status: String(g.status).toUpperCase(),
  };
}

async function loadAll() {
  const [resumo, movs, metas, categorias] = await Promise.all([
    api('/dashboard'),
    api('/movimentacoes'),
    api('/metas'),
    api('/categorias'),
  ]);
  if (!resumo) return; // api() já redirecionou para o login

  state.saldoAtual = Number(resumo.saldoAtual) || 0;
  state.movimentacoes = (movs || []).map(mapMovimentacao);
  state.metas = (metas || []).map(mapMeta).filter((g) => g.status === 'ATIVA');
  state.categorias = categorias || [];
}

async function recarregar() {
  try {
    await loadAll();
    renderAll();
  } catch (e) {
    notify(e.message || 'Não foi possível atualizar os dados.');
  }
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  initSidebarToggle();
  initMonthSelect();
  initModal();
  initMetaModal();
  initDeleteConfirm();
  initSnackbar();

  try {
    await loadAll();
  } catch (e) {
    notify(e.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. O back-end está rodando?'
      : (e.message || 'Erro ao carregar os dados.'));
  }
  renderAll();
});

/* ---------- Render geral ---------- */

function mesDe(m) { return m.dataISO.slice(5, 7); }

function renderAll() {
  const mesTx = state.movimentacoes.filter((m) => mesDe(m) === state.mesSelecionado);

  const receitasMes = mesTx.filter((m) => m.tipo === 'receita').reduce((s, m) => s + m.valor, 0);
  const despesasMes = mesTx.filter((m) => m.tipo === 'despesa').reduce((s, m) => s + Math.abs(m.valor), 0);

  const saldoEl = document.getElementById('saldo-atual-valor');
  const receitasEl = document.getElementById('receitas-mes-valor');
  const despesasEl = document.getElementById('despesas-mes-valor');

  saldoEl.textContent = formatCurrency(state.saldoAtual);
  saldoEl.classList.toggle('is-empty', state.saldoAtual === 0);
  receitasEl.textContent = formatCurrency(receitasMes);
  receitasEl.classList.toggle('is-empty', receitasMes === 0);
  despesasEl.textContent = formatCurrency(despesasMes);
  despesasEl.classList.toggle('is-empty', despesasMes === 0);

  renderChartArea('line-chart-wrap', state.movimentacoes);
  renderCategoryBars('cat-bars', buildCategorias(mesTx));
  renderTransactions('tx-body', sortByDataDesc(mesTx));
  renderGoals('goal-list', state.metas);

  const metasCountEl = document.getElementById('metas-count-valor');
  if (metasCountEl) {
    metasCountEl.textContent = state.metas.length;
    metasCountEl.classList.toggle('is-empty', state.metas.length === 0);
  }

  const goalCount = document.getElementById('goal-count');
  if (goalCount) goalCount.textContent = state.metas.length === 1 ? '1 ativa' : `${state.metas.length} ativas`;

  const chartSub = document.getElementById('chart-sub');
  if (chartSub) chartSub.textContent = buildEvolucaoSaldo(state.movimentacoes).length >= 2 ? 'histórico' : 'sem dados';

  populateMonthOptions();
}

function sortByDataDesc(list) {
  return [...list].sort((a, b) => b.dataISO.localeCompare(a.dataISO) || b.id - a.id);
}

function buildCategorias(mesTx) {
  const soma = {};
  mesTx
    .filter((m) => m.tipo === 'despesa')
    .forEach((m) => {
      soma[m.categoria] = (soma[m.categoria] || 0) + Math.abs(m.valor);
    });
  return Object.entries(soma)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);
}

/* ---------- Gráfico de evolução do saldo ---------- */

function renderChartArea(containerId, movimentacoes) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const evolucao = buildEvolucaoSaldo(movimentacoes);

  // Só faz sentido mostrar uma linha de evolução com pelo menos 2 meses
  // de movimentações. Antes disso, mostramos o estado vazio explicando o motivo.
  if (evolucao.length < 2) {
    container.innerHTML = `
      <div class="empty-chart-placeholder">
        <div class="empty-state">
          <div class="empty-ico">↗</div>
          <div class="empty-title">Ainda não há histórico de saldo</div>
          <div class="empty-sub">O gráfico aparece assim que você tiver movimentações em pelo menos dois meses.</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = '<svg class="line-chart-svg" role="img" aria-label="Gráfico de evolução do saldo"></svg>';
  renderLineChart(container.querySelector('svg'), evolucao);
}

function buildEvolucaoSaldo(movimentacoes) {
  const porMes = {};
  movimentacoes.forEach((m) => {
    const chave = m.dataISO.slice(0, 7); // yyyy-mm
    porMes[chave] = (porMes[chave] || 0) + m.valor;
  });

  let acumulado = 0;
  return Object.keys(porMes)
    .sort()
    .map((chave) => {
      acumulado += porMes[chave];
      const mm = chave.slice(5, 7);
      return { mes: (MONTH_NAMES[mm] || mm).slice(0, 3), valor: acumulado };
    });
}

function renderLineChart(svg, data) {
  if (!svg) return;

  const width = 560;
  const height = 200;
  const padTop = 16;
  const padBottom = 26;
  const padX = 8;

  const values = data.map((d) => d.valor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const stepX = (width - padX * 2) / (data.length - 1);
  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padTop + (height - padTop - padBottom) * (1 - (d.valor - min) / range);
    return { x, y, mes: d.mes, valor: d.valor };
  });

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const fillPath =
    linePath +
    ` L${points[points.length - 1].x.toFixed(1)},${(height - padBottom).toFixed(1)}` +
    ` L${points[0].x.toFixed(1)},${(height - padBottom).toFixed(1)} Z`;

  const gridLines = [0.25, 0.5, 0.75]
    .map((f) => {
      const y = padTop + (height - padTop - padBottom) * f;
      return `<line class="grid-line" x1="${padX}" y1="${y.toFixed(1)}" x2="${width - padX}" y2="${y.toFixed(1)}" stroke-dasharray="3 4" />`;
    })
    .join('');

  const labels = points
    .map((p) => `<text class="axis-label" x="${p.x}" y="${height - 6}" text-anchor="middle">${p.mes}</text>`)
    .join('');

  const dots = points
    .map((p) => `<circle class="point" cx="${p.x}" cy="${p.y}" r="3.5"><title>${p.mes}: ${formatCurrency(p.valor)}</title></circle>`)
    .join('');

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="dashChartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#146B4B" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#146B4B" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${gridLines}
    <path class="fill" d="${fillPath}" />
    <path class="line" d="${linePath}" />
    ${dots}
    ${labels}
  `;
}

/* ---------- Barras de gastos por categoria ---------- */

function renderCategoryBars(containerId, categorias) {
  const container = document.getElementById(containerId);
  const sub = document.getElementById('cat-sub');
  if (!container) return;

  if (!categorias.length) {
    if (sub) sub.textContent = 'sem dados';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico">▤</div>
        <div class="empty-title">Nenhum gasto neste mês</div>
        <div class="empty-sub">Os gastos do mês selecionado vão aparecer aqui.</div>
      </div>
    `;
    return;
  }

  if (sub) sub.textContent = 'este mês';

  const max = Math.max(...categorias.map((c) => c.valor));
  const colors = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)'];

  container.innerHTML = categorias
    .map((c, i) => {
      const pct = Math.round((c.valor / max) * 100);
      return `
        <div class="cat-row">
          <div class="cat-top">
            <span>${escapeHtml(c.nome)}</span>
            <span class="value">${formatCurrency(c.valor)}</span>
          </div>
          <div class="cat-track">
            <span class="cat-fill" style="width:${pct}%; background:${colors[i % colors.length]};"></span>
          </div>
        </div>
      `;
    })
    .join('');
}

/* ---------- Tabela de movimentações ---------- */

function renderTransactions(tbodyId, movimentacoes) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (!movimentacoes.length) {
    tbody.innerHTML = `
      <tr><td colspan="5">
        <div class="empty-state">
          <div class="empty-ico">＋</div>
          <div class="empty-title">Nenhuma movimentação neste mês</div>
          <div class="empty-sub">Lance uma receita ou despesa para vê-la aqui.</div>
        </div>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = movimentacoes.map(txRowHtml).join('');

  tbody.querySelectorAll('[data-delete-tx]').forEach((btn) => {
    btn.addEventListener('click', () => requestDelete('tx', btn.dataset.deleteTx));
  });
}

function txRowHtml(m) {
  const isReceita = m.tipo === 'receita';
  const sign = isReceita ? '+ ' : '- ';
  const initials = m.desc.trim().charAt(0).toUpperCase();
  return `
    <tr data-id="${m.id}">
      <td>
        <div class="tx-desc">
          <span class="tx-ico">${initials}</span>
          <span>${escapeHtml(m.desc)}</span>
        </div>
      </td>
      <td><span class="tx-cat-tag">${escapeHtml(m.categoria)}</span></td>
      <td>${m.data}</td>
      <td class="tx-value ${isReceita ? 'in' : 'out'}">${sign}${formatCurrency(Math.abs(m.valor))}</td>
      <td class="actions-cell">
        <button class="icon-btn danger" data-delete-tx="${m.id}" title="Excluir movimentação" type="button">🗑</button>
      </td>
    </tr>
  `;
}

/* ---------- Metas ---------- */

function renderGoals(containerId, metas) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!metas.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico">◎</div>
        <div class="empty-title">Nenhuma meta criada</div>
        <div class="empty-sub">Clique no + acima para criar sua primeira meta.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = metas
    .map((g) => {
      const pct = Math.min(100, Math.round((g.atual / g.alvo) * 100) || 0);
      return `
        <div class="goal-item" data-id="${g.id}">
          <div class="goal-top">
            <span>${escapeHtml(g.nome)}</span>
            <span class="goal-actions">
              <span class="amounts">${formatCurrency(g.atual)} / ${formatCurrency(g.alvo)}</span>
              <button class="icon-btn danger" data-delete-goal="${g.id}" title="Excluir meta" type="button">🗑</button>
            </span>
          </div>
          <div class="cat-track">
            <span class="cat-fill" style="width:${pct}%; background:var(--accent);"></span>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('[data-delete-goal]').forEach((btn) => {
    btn.addEventListener('click', () => requestDelete('goal', btn.dataset.deleteGoal));
  });
}

/* ---------- Utilitário de formatação ---------- */

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

/* ---------- Seletor de mês ---------- */

function initMonthSelect() {
  const wrap = document.getElementById('month-select');
  const btn = document.getElementById('month-btn');
  const menu = document.getElementById('month-menu');
  if (!wrap || !btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('show');
  });

  menu.addEventListener('click', (e) => {
    const option = e.target.closest('button[data-month]');
    if (!option) return;
    state.mesSelecionado = option.dataset.month;
    menu.classList.remove('show');
    renderAll();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) menu.classList.remove('show');
  });
}

function populateMonthOptions() {
  const btn = document.getElementById('month-btn');
  const menu = document.getElementById('month-menu');
  if (!btn || !menu) return;

  const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0');
  const meses = new Set(state.movimentacoes.map(mesDe));
  meses.add(mesAtual);
  meses.add(state.mesSelecionado);

  const ordenados = [...meses].sort();

  menu.innerHTML = ordenados
    .map((mm) => `<button type="button" data-month="${mm}" class="${mm === state.mesSelecionado ? 'active' : ''}">${MONTH_NAMES[mm] || mm}</button>`)
    .join('');

  btn.textContent = (MONTH_NAMES[state.mesSelecionado] || state.mesSelecionado) + ' ▾';
}

/* ---------- Modal "Nova movimentação" ---------- */

function popularCategorias(tipo) {
  const select = document.getElementById('tx-categoria');
  if (!select) return;
  const doTipo = state.categorias.filter((c) => String(c.tipo).toLowerCase() === tipo);

  if (!doTipo.length) {
    select.innerHTML = '<option value="">Nenhuma categoria cadastrada</option>';
    return;
  }
  select.innerHTML = doTipo
    .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`)
    .join('');
}

function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const openBtn = document.getElementById('open-modal');
  const closeBtn = document.getElementById('close-modal');
  const cancelBtn = document.getElementById('cancel-modal');
  const form = document.getElementById('tx-form');
  const toggleReceita = document.getElementById('type-receita');
  const toggleDespesa = document.getElementById('type-despesa');
  const tipoInput = document.getElementById('tx-tipo');
  if (!overlay || !form) return;

  const open = () => { popularCategorias(tipoInput.value || 'despesa'); overlay.classList.add('show'); };
  const close = () => overlay.classList.remove('show');

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  toggleReceita?.addEventListener('click', () => setTipo('receita'));
  toggleDespesa?.addEventListener('click', () => setTipo('despesa'));

  function setTipo(tipo) {
    tipoInput.value = tipo;
    toggleReceita.classList.toggle('active', tipo === 'receita');
    toggleDespesa.classList.toggle('active', tipo === 'despesa');
    popularCategorias(tipo);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const desc = document.getElementById('tx-desc').value.trim();
    const categoriaId = Number(document.getElementById('tx-categoria').value);
    const valor = parseFloat(document.getElementById('tx-valor').value);
    const tipo = tipoInput.value;

    if (!desc || !valor || valor <= 0) return;
    if (!categoriaId) { notify('Cadastre uma categoria antes de lançar movimentações.'); return; }

    try {
      await api('/movimentacoes', {
        method: 'POST',
        body: {
          descricao: desc,
          valor,
          data: hojeISO(),
          tipo: tipo.toUpperCase(),
          categoriaId,
        },
      });
      form.reset();
      setTipo('despesa');
      close();
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível salvar a movimentação.');
    }
  });
}

/* ---------- Excluir (modal estilizado + desfazer) ---------- */
/* Exclui na API na hora. "Desfazer" recria o item (novo id). */

let pendingDelete = null; // { type: 'tx' | 'goal', id }
let lastDeleted = null;   // { type, item }
let undoTimeout = null;

function requestDelete(type, id) {
  const overlay = document.getElementById('confirm-delete-overlay');
  const title = document.getElementById('confirm-delete-title');
  const text = document.getElementById('confirm-delete-text');

  if (type === 'tx') {
    const item = state.movimentacoes.find((m) => String(m.id) === String(id));
    if (!item) return;
    title.textContent = 'Excluir movimentação?';
    text.innerHTML = `Você está prestes a excluir <strong>"${escapeHtml(item.desc)}"</strong>. Isso também atualiza o saldo, as despesas do mês e os gastos por categoria.`;
  } else {
    const item = state.metas.find((g) => String(g.id) === String(id));
    if (!item) return;
    title.textContent = 'Excluir meta?';
    text.innerHTML = `Você está prestes a excluir a meta <strong>"${escapeHtml(item.nome)}"</strong>.`;
  }

  pendingDelete = { type, id };
  overlay.classList.add('show');
}

function initDeleteConfirm() {
  const overlay = document.getElementById('confirm-delete-overlay');
  const cancelBtn = document.getElementById('cancel-delete');
  const confirmBtn = document.getElementById('confirm-delete');

  const close = () => { overlay.classList.remove('show'); pendingDelete = null; };

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  confirmBtn.addEventListener('click', async () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    overlay.classList.remove('show');
    pendingDelete = null;
    await performDelete(type, id);
  });
}

async function performDelete(type, id) {
  try {
    if (type === 'tx') {
      const item = state.movimentacoes.find((m) => String(m.id) === String(id));
      if (!item) return;
      await api('/movimentacoes/' + id, { method: 'DELETE' });
      lastDeleted = { type, item };
      showUndoSnackbar(`"${item.desc}" foi excluída.`);
    } else {
      const item = state.metas.find((g) => String(g.id) === String(id));
      if (!item) return;
      await api('/metas/' + id, { method: 'DELETE' });
      lastDeleted = { type, item };
      showUndoSnackbar(`Meta "${item.nome}" foi excluída.`);
    }
    await recarregar();
  } catch (err) {
    notify(err.message || 'Não foi possível excluir.');
  }
}

function showUndoSnackbar(message) {
  const snackbar = document.getElementById('snackbar');
  const undoBtn = document.getElementById('snackbar-undo');
  document.getElementById('snackbar-text').textContent = message;
  if (undoBtn) undoBtn.style.display = '';
  snackbar.classList.add('show');

  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    snackbar.classList.remove('show');
    lastDeleted = null;
  }, 6000);
}

function initSnackbar() {
  document.getElementById('snackbar-undo').addEventListener('click', async () => {
    if (!lastDeleted) return;
    clearTimeout(undoTimeout);
    const { type, item } = lastDeleted;
    lastDeleted = null;
    document.getElementById('snackbar').classList.remove('show');

    try {
      if (type === 'tx') {
        const cat = state.categorias.find((c) => c.nome === item.categoria);
        if (!cat) { notify('Categoria não encontrada para desfazer.'); return; }
        await api('/movimentacoes', {
          method: 'POST',
          body: {
            descricao: item.desc,
            valor: Math.abs(item.valor),
            data: item.dataISO,
            tipo: item.tipo.toUpperCase(),
            categoriaId: cat.id,
          },
        });
      } else {
        const nova = await api('/metas', {
          method: 'POST',
          body: { descricao: item.nome, valorMeta: item.alvo, dataMeta: item.dataMeta },
        });
        if (nova && item.atual > 0) {
          await api('/metas/' + nova.id + '/aportes', { method: 'POST', body: { valor: item.atual } });
        }
      }
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível desfazer.');
    }
  });
}

/* ---------- Modal "Nova meta" ---------- */

function initMetaModal() {
  const overlay = document.getElementById('modal-meta-overlay');
  const openBtn = document.getElementById('open-modal-meta');
  const cancelBtn = document.getElementById('cancel-modal-meta');
  const form = document.getElementById('meta-form');
  if (!overlay || !form) return;

  const open = () => overlay.classList.add('show');
  const close = () => overlay.classList.remove('show');

  openBtn?.addEventListener('click', open);
  cancelBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('meta-nome').value.trim();
    const atual = parseFloat(document.getElementById('meta-atual').value) || 0;
    const alvo = parseFloat(document.getElementById('meta-alvo').value);

    if (!nome || !alvo || alvo <= 0) return;

    // O back-end exige uma data para a meta. Se o formulário tiver um campo
    // id="meta-data" (type="date"), ele é usado; senão, assume 1 ano a partir de hoje.
    const campoData = document.getElementById('meta-data');
    let dataMeta = campoData && campoData.value;
    if (!dataMeta) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      dataMeta = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    try {
      const nova = await api('/metas', {
        method: 'POST',
        body: { descricao: nome, valorMeta: alvo, dataMeta },
      });
      if (nova && atual > 0) {
        await api('/metas/' + nova.id + '/aportes', { method: 'POST', body: { valor: atual } });
      }
      form.reset();
      close();
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível criar a meta.');
    }
  });
}