// FinanCerto — Metas (integrado com a API Spring Boot via api.js)
// Requer: api.js carregado ANTES deste arquivo.
// Endpoints: GET/POST /metas, PUT/DELETE /metas/{id}, POST /metas/{id}/aportes

const state = { metas: [] };

let pendingDeleteId = null;
let lastDeleted = null;
let undoTimeout = null;

/* ---------- Utilitários ---------- */

function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return dia + '/' + mes + '/' + ano;
}

function dataDaquiUmAno() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
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

/* ---------- Carregamento dos dados ---------- */

function mapMeta(g) {
  return {
    id: g.id,
    nome: g.descricao,
    atual: Number(g.valorAtual) || 0,
    alvo: Number(g.valorMeta),
    dataMeta: g.dataMeta,
    status: String(g.status).toUpperCase(),
  };
}

async function loadAll() {
  const metas = await api('/metas');
  if (!metas) return; // api() já redirecionou para o login
  state.metas = metas
    .map(mapMeta)
    .filter((g) => g.status !== 'CANCELADA')
    .sort((a, b) => a.id - b.id);
}

async function recarregar() {
  try {
    await loadAll();
    render();
  } catch (e) {
    notify(e.message || 'Não foi possível atualizar as metas.');
  }
}

function findById(id) {
  return state.metas.find((m) => String(m.id) === String(id));
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  ensureDateField();
  initSidebarToggle();
  initModal();
  initDeleteConfirm();
  initSnackbar();

  try {
    await loadAll();
  } catch (e) {
    notify(e.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. O back-end está rodando?'
      : (e.message || 'Erro ao carregar as metas.'));
  }
  render();
});

// O back-end exige uma data para a meta. Se o HTML não tiver o campo, ele é criado aqui.
function ensureDateField() {
  if (document.getElementById('meta-data')) return;
  const alvoField = document.getElementById('meta-alvo')?.closest('.field');
  if (!alvoField) return;
  const campo = document.createElement('div');
  campo.className = 'field';
  campo.innerHTML = `
    <label for="meta-data">Data limite</label>
    <div class="input-wrap">
      <input type="date" id="meta-data" required />
    </div>
  `;
  alvoField.insertAdjacentElement('afterend', campo);
}

/* ---------- Render ---------- */

function render() {
  const container = document.getElementById('goal-grid');
  if (!container) return;

  if (!state.metas.length) {
    container.innerHTML = `
      <div class="panel" style="grid-column:1/-1;">
        <div class="empty-state">
          <div class="empty-ico">◎</div>
          <div class="empty-title">Nenhuma meta criada ainda</div>
          <div class="empty-sub">Defina um objetivo, como uma viagem ou reserva de emergência, e acompanhe o progresso aqui.</div>
          <button class="empty-action" id="empty-open-modal">Criar minha primeira meta</button>
        </div>
      </div>
    `;
    document.getElementById('empty-open-modal')?.addEventListener('click', () => openCreate());
    return;
  }

  container.innerHTML = state.metas.map(goalCardHtml).join('');

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEdit(btn.dataset.edit));
  });
  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => requestDelete(btn.dataset.delete));
  });
}

function goalCardHtml(g) {
  const pct = g.alvo > 0 ? Math.min(100, Math.round((g.atual / g.alvo) * 100)) : 0;
  const falta = Math.max(0, g.alvo - g.atual);
  return `
    <div class="panel" data-id="${g.id}">
      <div class="panel-header">
        <h2 style="font-size:0.98rem;">${escapeHtml(g.nome)}</h2>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" data-edit="${g.id}" title="Editar" type="button">✎</button>
          <button class="icon-btn danger" data-delete="${g.id}" title="Excluir" type="button">🗑</button>
        </div>
      </div>
      <div class="goal-top">
        <span style="font-family:var(--font-mono); font-size:1.1rem;">${pct}%</span>
        <span class="amounts">${formatCurrency(g.atual)} / ${formatCurrency(g.alvo)}</span>
      </div>
      <div class="cat-track">
        <span class="cat-fill" style="width:${pct}%; background:var(--accent);"></span>
      </div>
      <p style="margin-top:12px; font-size:0.8rem; color:var(--ink-faint);">
        ${falta > 0 ? `Faltam ${formatCurrency(falta)} para concluir.` : 'Meta concluída! 🎉'}
        ${g.dataMeta ? `<br>Data limite: ${formatarDataBR(g.dataMeta)}` : ''}
      </p>
    </div>
  `;
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

/* ---------- Modal: criar / editar ---------- */

function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const openBtn = document.getElementById('open-modal');
  const cancelBtn = document.getElementById('cancel-modal');
  const form = document.getElementById('meta-form');
  const idInput = document.getElementById('meta-id');
  const title = document.getElementById('modal-title');
  const submitBtn = document.getElementById('meta-submit');
  const atualInput = document.getElementById('meta-atual');
  const dataInput = document.getElementById('meta-data');

  const close = () => overlay.classList.remove('show');

  openBtn.addEventListener('click', () => openCreate());
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  window.openCreate = () => {
    form.reset();
    idInput.value = '';
    atualInput.min = '0';
    if (dataInput) dataInput.value = dataDaquiUmAno();
    title.textContent = 'Nova meta';
    submitBtn.textContent = 'Salvar meta';
    overlay.classList.add('show');
  };

  window.openEdit = (id) => {
    const g = findById(id);
    if (!g) return;
    idInput.value = g.id;
    document.getElementById('meta-nome').value = g.nome;
    atualInput.value = g.atual;
    atualInput.min = String(g.atual); // o valor guardado só pode aumentar (aportes)
    document.getElementById('meta-alvo').value = g.alvo;
    if (dataInput) dataInput.value = g.dataMeta || dataDaquiUmAno();
    title.textContent = 'Editar meta';
    submitBtn.textContent = 'Salvar alterações';
    overlay.classList.add('show');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = idInput.value;
    const nome = document.getElementById('meta-nome').value.trim();
    const atual = parseFloat(atualInput.value) || 0;
    const alvo = parseFloat(document.getElementById('meta-alvo').value);
    const dataMeta = (dataInput && dataInput.value) || dataDaquiUmAno();

    if (!nome || !alvo || alvo <= 0) return;
    if (nome.length < 3) { notify('O nome da meta precisa ter pelo menos 3 caracteres.'); return; }

    submitBtn.disabled = true;
    try {
      if (id) {
        const meta = findById(id);
        if (meta && atual < meta.atual) {
          notify('O valor guardado só pode aumentar. Use aportes para adicionar dinheiro à meta.');
          return;
        }
        await api('/metas/' + id, {
          method: 'PUT',
          body: { descricao: nome, valorMeta: alvo, dataMeta },
        });
        const diferenca = meta ? +(atual - meta.atual).toFixed(2) : 0;
        if (diferenca > 0) {
          await api('/metas/' + id + '/aportes', { method: 'POST', body: { valor: diferenca } });
        }
      } else {
        const nova = await api('/metas', {
          method: 'POST',
          body: { descricao: nome, valorMeta: alvo, dataMeta },
        });
        if (nova && atual > 0) {
          await api('/metas/' + nova.id + '/aportes', { method: 'POST', body: { valor: atual } });
        }
      }
      close();
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível salvar a meta.');
      await recarregar();
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function openCreate() { window.openCreate(); }
function openEdit(id) { window.openEdit(id); }

/* ---------- Excluir (confirmação + desfazer) ---------- */
/* Exclui na API na hora. "Desfazer" recria a meta e refaz o valor guardado. */

function requestDelete(id) {
  const item = findById(id);
  if (!item) return;
  pendingDeleteId = id;
  document.getElementById('confirm-delete-text').innerHTML =
    `Você está prestes a excluir a meta <strong>"${escapeHtml(item.nome)}"</strong>.`;
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
  document.getElementById('confirm-delete').addEventListener('click', async () => {
    const id = pendingDeleteId;
    overlay.classList.remove('show');
    pendingDeleteId = null;
    if (!id) return;

    const item = findById(id);
    if (!item) return;

    const el = document.querySelector(`.panel[data-id="${id}"]`);
    if (el) {
      el.classList.add('row-removing');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    try {
      await api('/metas/' + id, { method: 'DELETE' });
      lastDeleted = item;
      await recarregar();
      showUndoSnackbar(`Meta "${item.nome}" foi excluída.`);
    } catch (err) {
      if (el) el.classList.remove('row-removing');
      notify(err.message || 'Não foi possível excluir a meta.');
    }
  });
}

function showUndoSnackbar(message) {
  const snackbar = document.getElementById('snackbar');
  const undoBtn = document.getElementById('snackbar-undo');
  document.getElementById('snackbar-text').textContent = message;
  if (undoBtn) undoBtn.style.display = '';
  snackbar.classList.add('show');
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => { snackbar.classList.remove('show'); lastDeleted = null; }, 6000);
}

function initSnackbar() {
  document.getElementById('snackbar-undo').addEventListener('click', async () => {
    if (!lastDeleted) return;
    clearTimeout(undoTimeout);
    const item = lastDeleted;
    lastDeleted = null;
    document.getElementById('snackbar').classList.remove('show');

    try {
      const nova = await api('/metas', {
        method: 'POST',
        body: { descricao: item.nome, valorMeta: item.alvo, dataMeta: item.dataMeta || dataDaquiUmAno() },
      });
      if (nova && item.atual > 0) {
        await api('/metas/' + nova.id + '/aportes', { method: 'POST', body: { valor: item.atual } });
      }
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível desfazer.');
      await recarregar();
    }
  });
}