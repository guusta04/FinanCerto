// FinanCerto — Cartões & Faturas (integrado com a API Spring Boot via api.js)
// Requer: api.js carregado ANTES deste arquivo.
// Endpoints: GET/POST /cartoes, DELETE /cartoes/{id}
//            GET /faturas/cartao/{id}, PATCH /faturas/{id}/pagamentos
//            GET/POST /compras, DELETE /compras/{id}
// As faturas são geradas pelo back-end a partir das compras (não há "criar fatura").

const BRAND_COLORS = {
  VISA: ['#1A4B8C', '#0F2F5C'],
  MASTERCARD: ['#8C2A1A', '#5C160E'],
  ELO: ['#146B4B', '#0E4F38'],
  AMEX: ['#2A5A8C', '#173C61'],
};

const BRAND_LABELS = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  ELO: 'Elo',
  AMEX: 'American Express',
};

const state = { cartoes: [], faturas: [], compras: [] };

let pendingDelete = null; // { type: 'cartao' | 'compra', id }
let faturaEmPagamento = null;

/* ---------- Utilitários ---------- */

function escapeHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return dia + '/' + mes + '/' + ano;
}

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// "2030-05" -> "2030-05-31" (último dia do mês, para a validade do cartão)
function ultimoDiaDoMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  return anoMes + '-' + String(ultimo).padStart(2, '0');
}

// Mensagem rápida (usa o snackbar, sem botão "Desfazer")
let msgTimeout = null;
function notify(mensagem) {
  const snackbar = document.getElementById('snackbar');
  if (!snackbar) { alert(mensagem); return; }
  document.getElementById('snackbar-text').textContent = mensagem;
  snackbar.classList.add('show');
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => snackbar.classList.remove('show'), 4500);
}

/* ---------- Carregamento dos dados ---------- */

async function loadAll() {
  const [cartoes, compras] = await Promise.all([api('/cartoes'), api('/compras')]);
  if (!cartoes) return; // api() já redirecionou para o login

  state.cartoes = cartoes;
  state.compras = compras || [];

  // faturas: uma chamada por cartão
  const listas = await Promise.all(
    state.cartoes.map((c) => api('/faturas/cartao/' + c.id).catch(() => []))
  );
  state.faturas = listas.flat().filter(Boolean);
}

async function recarregar() {
  try {
    await loadAll();
    render();
  } catch (e) {
    notify(e.message || 'Não foi possível atualizar os dados.');
  }
}

function nomeDoCartao(id) {
  const c = state.cartoes.find((x) => String(x.id) === String(id));
  return c ? c.nomeCartao : null;
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  initSidebarToggle();
  initCardModal();
  initCompraModal();
  initPayModal();
  initDeleteConfirm();

  try {
    await loadAll();
  } catch (e) {
    notify(e.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. O back-end está rodando?'
      : (e.message || 'Erro ao carregar os dados.'));
  }
  render();
});

/* ---------- Render geral ---------- */

function render() {
  renderCards();
  renderFaturas();
  renderCompras();
  populateCompraCardSelect();
}

/* ---------- Cartões ---------- */

function renderCards() {
  const grid = document.getElementById('card-grid');
  const count = document.getElementById('card-count');
  if (!grid) return;

  count.textContent = state.cartoes.length ? `${state.cartoes.length} cadastrado(s)` : '';

  if (!state.cartoes.length) {
    grid.innerHTML = `
      <div class="panel" style="grid-column:1/-1;">
        <div class="empty-state">
          <div class="empty-ico">▤</div>
          <div class="empty-title">Nenhum cartão cadastrado</div>
          <div class="empty-sub">Adicione um cartão para começar a registrar compras e controlar faturas.</div>
          <button class="empty-action" id="empty-open-card">Cadastrar meu primeiro cartão</button>
        </div>
      </div>
    `;
    document.getElementById('empty-open-card')?.addEventListener('click', () => {
      document.getElementById('card-modal-overlay').classList.add('show');
    });
    return;
  }

  grid.innerHTML = state.cartoes.map(cardHtml).join('');
  grid.querySelectorAll('[data-delete-card]').forEach((btn) => {
    btn.addEventListener('click', () => requestDelete('cartao', btn.dataset.deleteCard));
  });
}

function cardHtml(c) {
  const limite = Number(c.limiteCartao) || 0;
  const usado = Number(c.saldoUsado) || 0;
  const pct = limite > 0 ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
  const marca = String(c.bandeira || '').toUpperCase();
  const [c1, c2] = BRAND_COLORS[marca] || ['#3A3F3D', '#20242A'];
  const final = String(c.numeroCartao || '').slice(-4);
  return `
    <div class="credit-card" data-id="${c.id}" style="--cc-color-1:${c1}; --cc-color-2:${c2};">
      <div class="cc-top">
        <span class="cc-brand">${escapeHtml(BRAND_LABELS[marca] || c.bandeira)}</span>
        <div class="cc-actions">
          <button class="icon-btn" data-delete-card="${c.id}" title="Excluir cartão" type="button">🗑</button>
        </div>
      </div>
      <div>
        <div class="cc-number">•••• •••• •••• ${escapeHtml(final || '••••')}</div>
        <div class="cc-name">${escapeHtml(c.nomeCartao)}</div>
      </div>
      <div>
        <div class="cc-meta">
          <span>Usado: ${formatCurrency(usado)}</span>
          <span>Limite: ${formatCurrency(limite)}</span>
        </div>
        <div class="cc-limit-bar"><span style="width:${pct}%;"></span></div>
      </div>
    </div>
  `;
}

/* ---------- Faturas ---------- */

function statusInfo(status) {
  switch (String(status).toUpperCase()) {
    case 'PAGA': return { css: 'paga', label: 'Paga' };
    case 'PARCIALMENTE_PAGA': return { css: 'aberta', label: 'Parcialmente paga' };
    case 'VENCIDA': return { css: 'atrasada', label: 'Vencida' };
    default: return { css: 'aberta', label: 'Aberta' };
  }
}

function renderFaturas() {
  const tbody = document.getElementById('fatura-body');
  const count = document.getElementById('fatura-count');
  if (!tbody) return;

  if (count) count.textContent = state.faturas.length ? `${state.faturas.length} fatura(s)` : '';

  if (!state.faturas.length) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-ico">＋</div>
          <div class="empty-title">Nenhuma fatura ainda</div>
          <div class="empty-sub">${state.cartoes.length
            ? 'As faturas são geradas automaticamente quando você registra compras no cartão.'
            : 'Cadastre um cartão e registre compras para gerar faturas.'}</div>
        </div>
      </td></tr>
    `;
    return;
  }

  const ordenadas = [...state.faturas].sort((a, b) => String(b.dataFatura).localeCompare(String(a.dataFatura)));

  tbody.innerHTML = ordenadas.map((f) => {
    const nome = nomeDoCartao(f.cartaoId);
    const [ano, mes] = String(f.dataFatura).split('-');
    const mesLabel = new Date(Number(ano), Number(mes) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const st = statusInfo(f.status);
    const pendente = Number(f.valorPendente) || 0;
    const pago = Number(f.valorPago) || 0;
    const podePagar = st.css !== 'paga' && pendente > 0;
    const detalhe = pago > 0 && pendente > 0
      ? `<div style="font-size:0.72rem; color:var(--ink-faint);">Pendente: ${formatCurrency(pendente)}</div>`
      : '';
    return `
      <tr data-id="${f.id}">
        <td>${nome ? escapeHtml(nome) : '<span style="color:var(--ink-faint);">Cartão removido</span>'}</td>
        <td style="text-transform:capitalize;">${mesLabel}</td>
        <td>${formatarDataBR(f.dataVencimento)}</td>
        <td><span class="status-badge ${st.css}">${st.label}</span></td>
        <td class="tx-value out">${formatCurrency(f.valorTotal)}${detalhe}</td>
        <td class="actions-cell">
          ${podePagar ? `<button class="btn-ghost" data-pay="${f.id}" type="button">Pagar</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-pay]').forEach((btn) => {
    btn.addEventListener('click', () => openPayModal(btn.dataset.pay));
  });
}

/* ---------- Compras ---------- */

function renderCompras() {
  const tbody = document.getElementById('compra-body');
  if (!tbody) return;

  if (!state.compras.length) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-ico">＋</div>
          <div class="empty-title">Nenhuma compra registrada</div>
          <div class="empty-sub">${state.cartoes.length
            ? 'Registre uma compra para ela entrar na fatura do mês.'
            : 'Cadastre um cartão primeiro para poder lançar compras.'}</div>
        </div>
      </td></tr>
    `;
    return;
  }

  const ordenadas = [...state.compras].sort((a, b) => String(b.dataCompra).localeCompare(String(a.dataCompra)) || b.id - a.id);

  tbody.innerHTML = ordenadas.map((c) => {
    const nome = nomeDoCartao(c.cartaoId);
    const parcelas = Number(c.parcelasTotal) > 1
      ? `${c.parcelasTotal}x de ${formatCurrency(c.valorParcela)}`
      : 'À vista';
    return `
      <tr data-id="${c.id}">
        <td>${escapeHtml(c.descricao)}</td>
        <td>${nome ? escapeHtml(nome) : '<span style="color:var(--ink-faint);">Cartão removido</span>'}</td>
        <td>${formatarDataBR(c.dataCompra)}</td>
        <td>${parcelas}</td>
        <td class="tx-value out">${formatCurrency(c.valor)}</td>
        <td class="actions-cell">
          <button class="icon-btn danger" data-delete-compra="${c.id}" title="Excluir compra" type="button">🗑</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-delete-compra]').forEach((btn) => {
    btn.addEventListener('click', () => requestDelete('compra', btn.dataset.deleteCompra));
  });
}

function populateCompraCardSelect() {
  const select = document.getElementById('compra-cartao');
  if (!select) return;
  select.innerHTML = state.cartoes.length
    ? state.cartoes.map((c) => `<option value="${c.id}">${escapeHtml(c.nomeCartao)}</option>`).join('')
    : '<option value="">Cadastre um cartão primeiro</option>';
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

/* ---------- Modal: novo cartão ---------- */

function initCardModal() {
  const overlay = document.getElementById('card-modal-overlay');
  const openBtn = document.getElementById('open-card-modal');
  const cancelBtn = document.getElementById('cancel-card-modal');
  const form = document.getElementById('card-form');
  const submitBtn = document.getElementById('card-submit');

  const open = () => overlay.classList.add('show');
  const close = () => { overlay.classList.remove('show'); form.reset(); };

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nomeCartao = document.getElementById('card-nome').value.trim();
    const bandeira = document.getElementById('card-bandeira').value;
    const numeroCartao = document.getElementById('card-numero').value.replace(/\D/g, '');
    const validade = document.getElementById('card-validade').value; // yyyy-mm
    const diaVencimento = parseInt(document.getElementById('card-vencimento').value, 10);
    const limiteCartao = parseFloat(document.getElementById('card-limite').value);

    if (nomeCartao.length < 3) { notify('O nome do cartão precisa ter pelo menos 3 caracteres.'); return; }
    if (numeroCartao.length !== 16) { notify('O número do cartão deve ter 16 dígitos.'); return; }
    if (!validade) { notify('Informe a validade do cartão.'); return; }
    if (!diaVencimento || diaVencimento < 1 || diaVencimento > 31) { notify('Informe um dia de vencimento entre 1 e 31.'); return; }
    if (!limiteCartao || limiteCartao < 100) { notify('O limite mínimo é R$ 100,00.'); return; }

    submitBtn.disabled = true;
    try {
      await api('/cartoes', {
        method: 'POST',
        body: {
          numeroCartao,
          nomeCartao,
          limiteCartao,
          dataValidade: ultimoDiaDoMes(validade),
          bandeira,
          diaVencimento,
        },
      });
      close();
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível salvar o cartão.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Modal: nova compra ---------- */

function initCompraModal() {
  const overlay = document.getElementById('compra-modal-overlay');
  const openBtn = document.getElementById('open-compra-modal');
  const cancelBtn = document.getElementById('cancel-compra-modal');
  const form = document.getElementById('compra-form');
  const submitBtn = document.getElementById('compra-submit');
  const dataInput = document.getElementById('compra-data');

  const open = () => {
    if (!state.cartoes.length) {
      notify('Cadastre um cartão antes de registrar compras.');
      document.getElementById('card-modal-overlay').classList.add('show');
      return;
    }
    dataInput.max = hojeISO(); // o back-end só aceita data passada ou de hoje
    dataInput.value = hojeISO();
    document.getElementById('compra-parcelas').value = 1;
    overlay.classList.add('show');
  };
  const close = () => { overlay.classList.remove('show'); form.reset(); };

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cartaoId = Number(document.getElementById('compra-cartao').value);
    const descricao = document.getElementById('compra-desc').value.trim();
    const valor = parseFloat(document.getElementById('compra-valor').value);
    const parcelasTotal = parseInt(document.getElementById('compra-parcelas').value, 10) || 1;
    const dataCompra = dataInput.value;

    if (!cartaoId) { notify('Escolha um cartão.'); return; }
    if (descricao.length < 3) { notify('A descrição precisa ter pelo menos 3 caracteres.'); return; }
    if (!valor || valor <= 0) return;
    if (parcelasTotal < 1 || parcelasTotal > 36) { notify('As parcelas devem ficar entre 1 e 36.'); return; }
    if (!dataCompra) { notify('Informe a data da compra.'); return; }

    submitBtn.disabled = true;
    try {
      await api('/compras', {
        method: 'POST',
        body: { cartaoId, descricao, valor, parcelasTotal, dataCompra },
      });
      close();
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível registrar a compra.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Modal: pagar fatura ---------- */

function openPayModal(id) {
  const fatura = state.faturas.find((f) => String(f.id) === String(id));
  if (!fatura) return;
  faturaEmPagamento = fatura;
  const pendente = Number(fatura.valorPendente) || 0;
  document.getElementById('pay-info').textContent =
    `${nomeDoCartao(fatura.cartaoId) || 'Cartão'} — pendente: ${formatCurrency(pendente)}`;
  const input = document.getElementById('pay-valor');
  input.max = String(pendente);
  input.value = pendente.toFixed(2);
  document.getElementById('pay-modal-overlay').classList.add('show');
}

function initPayModal() {
  const overlay = document.getElementById('pay-modal-overlay');
  const cancelBtn = document.getElementById('cancel-pay-modal');
  const form = document.getElementById('pay-form');
  const submitBtn = document.getElementById('pay-submit');

  const close = () => { overlay.classList.remove('show'); form.reset(); faturaEmPagamento = null; };

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!faturaEmPagamento) return;
    const valor = parseFloat(document.getElementById('pay-valor').value);
    const pendente = Number(faturaEmPagamento.valorPendente) || 0;

    if (!valor || valor <= 0) return;
    if (valor > pendente + 0.001) { notify('O pagamento não pode ser maior que o valor pendente.'); return; }

    submitBtn.disabled = true;
    try {
      await api('/faturas/' + faturaEmPagamento.id + '/pagamentos', {
        method: 'PATCH',
        body: { valor },
      });
      close();
      notify('Pagamento registrado.');
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível registrar o pagamento.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Excluir (confirmação) ---------- */

function requestDelete(type, id) {
  const overlay = document.getElementById('confirm-delete-overlay');
  const title = document.getElementById('confirm-delete-title');
  const text = document.getElementById('confirm-delete-text');

  if (type === 'cartao') {
    const item = state.cartoes.find((c) => String(c.id) === String(id));
    if (!item) return;
    title.textContent = 'Excluir cartão?';
    text.innerHTML = `Você está prestes a excluir o cartão <strong>"${escapeHtml(item.nomeCartao)}"</strong>. Cartões com compras ou faturas registradas podem não poder ser excluídos.`;
  } else {
    const item = state.compras.find((c) => String(c.id) === String(id));
    if (!item) return;
    title.textContent = 'Excluir compra?';
    text.innerHTML = `Você está prestes a excluir a compra <strong>"${escapeHtml(item.descricao)}"</strong> de ${formatCurrency(item.valor)}. O limite do cartão e a fatura serão ajustados.`;
  }

  pendingDelete = { type, id };
  overlay.classList.add('show');
}

function initDeleteConfirm() {
  const overlay = document.getElementById('confirm-delete-overlay');
  document.getElementById('cancel-delete').addEventListener('click', () => {
    overlay.classList.remove('show');
    pendingDelete = null;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { overlay.classList.remove('show'); pendingDelete = null; }
  });
  document.getElementById('confirm-delete').addEventListener('click', async () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    overlay.classList.remove('show');
    pendingDelete = null;

    try {
      await api((type === 'cartao' ? '/cartoes/' : '/compras/') + id, { method: 'DELETE' });
      notify(type === 'cartao' ? 'Cartão excluído.' : 'Compra excluída.');
      await recarregar();
    } catch (err) {
      notify(err.message || 'Não foi possível excluir.');
    }
  });
}