// FinanCerto — Dashboard (estado inicial vazio)
// Nenhum valor fictício é pré-carregado. Tudo que o usuário cadastrar
// (movimentações e metas) fica salvo no localStorage do navegador e
// continua lá mesmo depois de atualizar a página.
// TODO: integrar com a API — GET/POST /api/movimentacoes, GET/POST /api/metas
// Quando a API existir, troque loadState()/saveState() por chamadas fetch().

const STORAGE_KEY = 'financecerto:dashboard-vazio';

const MONTH_NAMES = { '08': 'Agosto', '09': 'Setembro' };

function seedState() {
  return {
    mesSelecionado: '09',
    saldoAtual: 0,
    movimentacoes: [],
    metas: [],
  };
}

let state = null;

/* ---------- Persistência (localStorage) ---------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Não foi possível ler o localStorage:', e);
  }
  return null;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Não foi possível salvar no localStorage:', e);
  }
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', () => {
  state = loadState() || seedState();
  renderAll();
  initSidebarToggle();
  initMonthSelect();
  initModal();
  initMetaModal();
});

/* ---------- Render geral ---------- */

function renderAll() {
  const mesTx = state.movimentacoes.filter((m) => m.data.split('/')[1] === state.mesSelecionado);
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

  const monthBtn = document.getElementById('month-btn');
  if (monthBtn) monthBtn.textContent = MONTH_NAMES[state.mesSelecionado] + ' ▾';
  document.querySelectorAll('#month-menu button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.month === state.mesSelecionado);
  });
}

function sortByDataDesc(list) {
  return [...list].sort((a, b) => {
    const [da, ma] = a.data.split('/').map(Number);
    const [db, mb] = b.data.split('/').map(Number);
    return mb - ma || db - da;
  });
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

/* ---------- Área do gráfico (histórico de saldo) ---------- */

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
    const mm = m.data.split('/')[1];
    porMes[mm] = (porMes[mm] || 0) + m.valor;
  });

  let acumulado = 0;
  return Object.keys(porMes)
    .sort()
    .map((mm) => {
      acumulado += porMes[mm];
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

  if (!categorias.length) {
    if (sub) sub.textContent = 'sem dados';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico">▤</div>
        <div class="empty-title">Nenhum gasto registrado</div>
        <div class="empty-sub">Cadastre uma despesa para ver a divisão por categoria aqui.</div>
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
            <span>${c.nome}</span>
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
      <tr><td colspan="4">
        <div class="empty-state">
          <div class="empty-ico">＋</div>
          <div class="empty-title">Nenhuma movimentação ainda</div>
          <div class="empty-sub">Suas receitas e despesas vão aparecer aqui assim que forem cadastradas.</div>
          <button class="empty-action" id="empty-open-modal">Lançar a primeira movimentação</button>
        </div>
      </td></tr>
    `;
    document.getElementById('empty-open-modal')?.addEventListener('click', () => {
      document.getElementById('modal-overlay')?.classList.add('show');
    });
    return;
  }

  tbody.innerHTML = movimentacoes.map(txRowHtml).join('');
}

function txRowHtml(m) {
  const isReceita = m.tipo === 'receita';
  const sign = isReceita ? '+ ' : '- ';
  const initials = m.desc.trim().charAt(0).toUpperCase();
  return `
    <tr>
      <td>
        <div class="tx-desc">
          <span class="tx-ico">${initials}</span>
          <span>${m.desc}</span>
        </div>
      </td>
      <td><span class="tx-cat-tag">${m.categoria}</span></td>
      <td>${m.data}</td>
      <td class="tx-value ${isReceita ? 'in' : 'out'}">${sign}${formatCurrency(Math.abs(m.valor))}</td>
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
        <div class="empty-sub">Defina um objetivo, como uma viagem ou reserva de emergência, para acompanhar aqui.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = metas
    .map((g) => {
      const pct = Math.min(100, Math.round((g.atual / g.alvo) * 100));
      return `
        <div class="goal-item">
          <div class="goal-top">
            <span>${g.nome}</span>
            <span class="amounts">${formatCurrency(g.atual)} / ${formatCurrency(g.alvo)}</span>
          </div>
          <div class="cat-track">
            <span class="cat-fill" style="width:${pct}%; background:var(--accent);"></span>
          </div>
        </div>
      `;
    })
    .join('');
}

/* ---------- Utilitário de formatação ---------- */

function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

  menu.querySelectorAll('button').forEach((option) => {
    option.addEventListener('click', () => {
      state.mesSelecionado = option.dataset.month;
      menu.classList.remove('show');
      renderAll();
      saveState();
    });
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) menu.classList.remove('show');
  });
}

/* ---------- Modal "Nova movimentação" ---------- */

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

  const open = () => overlay.classList.add('show');
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
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const desc = document.getElementById('tx-desc').value.trim();
    const categoria = document.getElementById('tx-categoria').value;
    const valor = parseFloat(document.getElementById('tx-valor').value);
    const tipo = tipoInput.value;

    if (!desc || !valor || valor <= 0) return;

    const hoje = new Date();
    const data = String(hoje.getDate()).padStart(2, '0') + '/' + String(hoje.getMonth() + 1).padStart(2, '0');

    // TODO: integrar com a API — POST /api/movimentacoes
    state.movimentacoes.push({
      id: uid('t'),
      desc,
      categoria,
      data,
      valor: tipo === 'receita' ? valor : -valor,
      tipo,
    });
    state.saldoAtual += tipo === 'receita' ? valor : -valor;

    form.reset();
    setTipo('despesa');
    close();
    renderAll();
    saveState();
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('meta-nome').value.trim();
    const atual = parseFloat(document.getElementById('meta-atual').value) || 0;
    const alvo = parseFloat(document.getElementById('meta-alvo').value);

    if (!nome || !alvo || alvo <= 0) return;

    // TODO: integrar com a API — POST /api/metas
    state.metas.push({ id: uid('m'), nome, atual, alvo });

    form.reset();
    close();
    renderAll();
    saveState();
  });
}
