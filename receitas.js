// FinanCerto — Receitas & Despesas (integrado com a API Spring Boot via api.js)
// Requer: api.js carregado ANTES deste arquivo.
// Endpoints: GET/POST /movimentacoes, PUT/DELETE /movimentacoes/{id}, GET /categorias

const MONTH_NAMES = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

const state = {
  movimentacoes: [],
  categorias: [],
};

let filtros = { tipo: 'todas', categoria: 'todas', mes: 'todos', busca: '' };

/* ---------- Utilitários ---------- */

function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayInputDate() {
  const hoje = new Date();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const d = String(hoje.getDate()).padStart(2, '0');
  return `${hoje.getFullYear()}-${m}-${d}`;
}

function formatarData(iso) {
  const [, mes, dia] = iso.split('-');
  return dia + '/' + mes;
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

/* ---------- Carregamento dos dados ---------- */

function mapMovimentacao(m) {
  const tipo = String(m.tipo).toLowerCase(); // 'receita' | 'despesa'
  const valorAbs = Math.abs(Number(m.valor));
  return {
    id: m.id,
    desc: m.descricao,
    categoria: m.categoria,
    dataISO: m.data,                 // yyyy-mm-dd
    data: formatarData(m.data),      // dd/mm (exibição)
    valor: tipo === 'receita' ? valorAbs : -valorAbs,
    tipo,
  };
}

async function loadAll() {
  const [movs, categorias] = await Promise.all([
    api('/movimentacoes'),
    api('/categorias'),
  ]);
  if (!movs && !categorias) return; // api() já redirecionou para o login
  state.movimentacoes = (movs || []).map(mapMovimentacao);
  state.categorias = categorias || [];
}

async function recarregar() {
  try {
    await loadAll();
    populateFilterOptions();
    renderAll();
  } catch (e) {
    notify(e.message || 'Não foi possível atualizar os dados.');
  }
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  initSidebarToggle();
  initFilters();
  initModal();
  initDeleteConfirm();
  initSnackbar();

  try {
    await loadAll();
  } catch (e) {
    notify(e.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. O back-end está rodando?'
      : (e.message || 'Erro ao carregar os dados.'));
  }
  populateFilterOptions();
  renderAll();
});

/* ---------- Filtros dinâmicos (categorias e meses existentes) ---------- */

function populateFilterOptions() {
  const categoriaSelect = document.getElementById('categoria-filter');
  const mesSelect = document.getElementById('mes-filter');

  const categoriaAtual = categoriaSelect.value;
  const mesAtual = mesSelect.value;

  categoriaSelect.innerHTML = '<option value="todas">Todas as categorias</option>';
  mesSelect.innerHTML = '<option value="todos">Todos os meses</option>';

  const categorias = [...new Set(state.movimentacoes.map((m) => m.categoria))].sort();
  categorias.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categoriaSelect.appendChild(opt);
  });

  // chave "yyyy-mm" evita misturar o mesmo mês de anos diferentes
  const meses = [...new Set(state.movimentacoes.map((m) => m.dataISO.slice(0, 7)))].sort().reverse();
  meses.forEach((chave) => {
    const [ano, mm] = chave.split('-');
    const opt = document.createElement('option');
    opt.value = chave;
    opt.textContent = (MONTH_NAMES[mm] || mm) + ' ' + ano;
    mesSelect.appendChild(opt);
  });

  if ([...categoriaSelect.options].some((o) => o.value === categoriaAtual)) categoriaSelect.value = categoriaAtual;
  if ([...mesSelect.options].some((o) => o.value === mesAtual)) mesSelect.value = mesAtual;

  // se a opção selecionada deixou de existir, o filtro volta ao padrão
  filtros.categoria = categoriaSelect.value;
  filtros.mes = mesSelect.value;
}

/* ---------- Filtragem e render ---------- */

function getFiltered() {
  return state.movimentacoes.filter((m) => {
    if (filtros.tipo !== 'todas' && m.tipo !== filtros.tipo) return false;
    if (filtros.categoria !== 'todas' && m.categoria !== filtros.categoria) return false;
    if (filtros.mes !== 'todos' && m.dataISO.slice(0, 7) !== filtros.mes) return false;
    if (filtros.busca && !m.desc.toLowerCase().includes(filtros.busca.toLowerCase())) return false;
    return true;
  });
}

function sortByDataDesc(list) {
  return [...list].sort((a, b) => b.dataISO.localeCompare(a.dataISO) || b.id - a.id);
}

function renderAll() {
  const filtrados = sortByDataDesc(getFiltered());

  const receitas = filtrados.filter((m) => m.tipo === 'receita').reduce((s, m) => s + m.valor, 0);
  const despesas = filtrados.filter((m) => m.tipo === 'despesa').reduce((s, m) => s + Math.abs(m.valor), 0);

  document.getElementById('sum-receitas').textContent = formatCurrency(receitas);
  document.getElementById('sum-despesas').textContent = formatCurrency(despesas);
  document.getElementById('sum-saldo').textContent = formatCurrency(receitas - despesas);

  const countEl = document.getElementById('results-count');
  countEl.textContent = filtrados.length === 1
    ? '1 movimentação encontrada'
    : `${filtrados.length} movimentações encontradas`;

  renderTransactions('tx-body', filtrados);
}

/* ---------- Tabela ---------- */

function renderTransactions(tbodyId, movimentacoes) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (!movimentacoes.length) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-ico">＋</div>
          <div class="empty-title">Nenhuma movimentação encontrada</div>
          <div class="empty-sub">Ajuste os filtros ou cadastre uma nova movimentação.</div>
        </div>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = movimentacoes.map(txRowHtml).join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.delete));
  });
}

function txRowHtml(m) {
  const isReceita = m.tipo === 'receita';
  const sign = isReceita ? '+ ' : '- ';
  return `
    <tr data-id="${m.id}">
      <td>${escapeHtml(m.desc)}</td>
      <td><span class="tx-cat-tag">${escapeHtml(m.categoria)}</span></td>
      <td><span class="tx-type-badge ${m.tipo}">${isReceita ? 'Receita' : 'Despesa'}</span></td>
      <td>${m.data}</td>
      <td class="tx-value ${isReceita ? 'in' : 'out'}">${sign}${formatCurrency(Math.abs(m.valor))}</td>
      <td class="actions-cell">
        <div class="row-actions">
          <button class="icon-btn" data-edit="${m.id}" title="Editar" type="button">✎</button>
          <button class="icon-btn danger" data-delete="${m.id}" title="Excluir" type="button">🗑</button>
        </div>
      </td>
    </tr>
  `;
}

/* ---------- Excluir (modal estilizado + desfazer) ---------- */
/* Exclui na API na hora. "Desfazer" recria a movimentação (novo id). */

let pendingDeleteId = null;
let lastDeleted = null;
let undoTimeout = null;

function findById(id) {
  return state.movimentacoes.find((m) => String(m.id) === String(id));
}

function deleteTransaction(id) {
  const item = findById(id);
  if (!item) return;

  pendingDeleteId = id;
  document.getElementById('confirm-delete-desc').textContent = `"${item.desc}"`;
  document.getElementById('confirm-delete-overlay').classList.add('show');
}

function initDeleteConfirm() {
  const overlay = document.getElementById('confirm-delete-overlay');
  const cancelBtn = document.getElementById('cancel-delete');
  const confirmBtn = document.getElementById('confirm-delete');

  const close = () => { overlay.classList.remove('show'); pendingDeleteId = null; };

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  confirmBtn.addEventListener('click', async () => {
    const id = pendingDeleteId;
    if (!id) return;
    overlay.classList.remove('show');
    pendingDeleteId = null;
    await performDelete(id);
  });
}

async function performDelete(id) {
  const item = findById(id);
  if (!item) return;

  const row = document.querySelector(`#tx-body tr[data-id="${id}"]`);
  if (row) {
    row.classList.add('tx-row-removing');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  try {
    await api('/movimentacoes/' + id, { method: 'DELETE' });
    lastDeleted = item;
    await recarregar();
    showUndoSnackbar(item.desc);
  } catch (err) {
    if (row) row.classList.remove('tx-row-removing');
    notify(err.message || 'Não foi possível excluir a movimentação.');
  }
}

function showUndoSnackbar(desc) {
  const snackbar = document.getElementById('snackbar');
  const undoBtn = document.getElementById('snackbar-undo');
  document.getElementById('snackbar-text').textContent = `"${desc}" foi excluída.`;
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
    const item = lastDeleted;
    lastDeleted = null;
    document.getElementById('snackbar').classList.remove('show');

    const cat = state.categorias.find(
      (c) => c.nome === item.categoria && String(c.tipo).toLowerCase() === item.tipo
    ) || state.categorias.find((c) => c.nome === item.categoria);
    if (!cat) { notify('Categoria não encontrada para desfazer.'); return; }

    try {
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
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível desfazer.');
    }
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

/* ---------- Filtros (UI) ---------- */

function initFilters() {
  document.querySelectorAll('#tipo-filter button').forEach((btn) => {
    btn.addEventListener('click', () => {
      filtros.tipo = btn.dataset.tipo;
      document.querySelectorAll('#tipo-filter button').forEach((b) => b.classList.toggle('active', b === btn));
      renderAll();
    });
  });

  document.getElementById('categoria-filter').addEventListener('change', (e) => {
    filtros.categoria = e.target.value;
    renderAll();
  });

  document.getElementById('mes-filter').addEventListener('change', (e) => {
    filtros.mes = e.target.value;
    renderAll();
  });

  let buscaTimeout;
  document.getElementById('busca-filter').addEventListener('input', (e) => {
    clearTimeout(buscaTimeout);
    buscaTimeout = setTimeout(() => {
      filtros.busca = e.target.value.trim();
      renderAll();
    }, 200);
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    filtros = { tipo: 'todas', categoria: 'todas', mes: 'todos', busca: '' };
    document.querySelectorAll('#tipo-filter button').forEach((b) => b.classList.toggle('active', b.dataset.tipo === 'todas'));
    document.getElementById('categoria-filter').value = 'todas';
    document.getElementById('mes-filter').value = 'todos';
    document.getElementById('busca-filter').value = '';
    renderAll();
  });
}

/* ---------- Modal: nova / editar movimentação ---------- */

// Preenche o <select> de categorias (value = id) conforme o tipo escolhido
function popularCategorias(tipo, nomeSelecionado) {
  const select = document.getElementById('tx-categoria');
  const doTipo = state.categorias.filter((c) => String(c.tipo).toLowerCase() === tipo);

  if (!doTipo.length) {
    select.innerHTML = '<option value="">Nenhuma categoria cadastrada</option>';
    return;
  }
  select.innerHTML = doTipo
    .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`)
    .join('');

  if (nomeSelecionado) {
    const achada = doTipo.find((c) => c.nome === nomeSelecionado);
    if (achada) select.value = String(achada.id);
  }
}

function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const openBtn = document.getElementById('open-modal');
  const cancelBtn = document.getElementById('cancel-modal');
  const form = document.getElementById('tx-form');
  const toggleReceita = document.getElementById('type-receita');
  const toggleDespesa = document.getElementById('type-despesa');
  const tipoInput = document.getElementById('tx-tipo');
  const idInput = document.getElementById('tx-id');
  const modalTitle = document.getElementById('modal-title');
  const submitBtn = document.getElementById('tx-submit');

  const open = () => overlay.classList.add('show');
  const close = () => overlay.classList.remove('show');

  function setTipo(tipo, categoriaNome) {
    tipoInput.value = tipo;
    toggleReceita.classList.toggle('active', tipo === 'receita');
    toggleDespesa.classList.toggle('active', tipo === 'despesa');
    popularCategorias(tipo, categoriaNome);
  }

  function resetForCreate() {
    form.reset();
    idInput.value = '';
    setTipo('despesa');
    document.getElementById('tx-data').value = todayInputDate();
    modalTitle.textContent = 'Nova movimentação';
    submitBtn.textContent = 'Salvar';
  }

  openBtn.addEventListener('click', () => { resetForCreate(); open(); });
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  toggleReceita.addEventListener('click', () => setTipo('receita'));
  toggleDespesa.addEventListener('click', () => setTipo('despesa'));

  window.openEditModal = (id) => {
    const item = findById(id);
    if (!item) return;
    idInput.value = item.id;
    document.getElementById('tx-desc').value = item.desc;
    document.getElementById('tx-valor').value = Math.abs(item.valor);
    document.getElementById('tx-data').value = item.dataISO;
    setTipo(item.tipo, item.categoria);
    modalTitle.textContent = 'Editar movimentação';
    submitBtn.textContent = 'Salvar alterações';
    open();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = idInput.value;
    const desc = document.getElementById('tx-desc').value.trim();
    const categoriaId = Number(document.getElementById('tx-categoria').value);
    const valor = parseFloat(document.getElementById('tx-valor').value);
    const data = document.getElementById('tx-data').value; // yyyy-mm-dd
    const tipo = tipoInput.value;

    if (!desc || !valor || valor <= 0 || !data) return;
    if (!categoriaId) { notify('Cadastre uma categoria antes de lançar movimentações.'); return; }

    const body = {
      descricao: desc,
      valor,
      data,
      tipo: tipo.toUpperCase(),
      categoriaId,
    };

    submitBtn.disabled = true;
    try {
      if (id) {
        await api('/movimentacoes/' + id, { method: 'PUT', body });
      } else {
        await api('/movimentacoes', { method: 'POST', body });
      }
      close();
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível salvar a movimentação.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}