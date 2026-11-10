// FinanCerto — Relatórios (integrado com a API Spring Boot via api.js)
// Requer: api.js carregado ANTES deste arquivo.
//
// - Totais e gastos por categoria: GET /relatorios/periodo (dataInicio e dataFim),
//   cobrindo da primeira à última movimentação do usuário.
// - Quebra mês a mês e exportação CSV: calculadas no navegador a partir de GET /movimentacoes
//   (o back-end não tem endpoint de relatório mensal nem de exportação).

const MONTH_NAMES = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

let movimentacoes = []; // já normalizadas (tipo em minúsculas, valor com sinal)

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
  const [ano, mes, dia] = String(iso).split('-');
  return dia + '/' + mes + '/' + ano;
}

// Mensagem rápida (cria um snackbar, pois a página não tem um)
let msgTimeout = null;
function notify(mensagem) {
  let el = document.getElementById('report-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'report-toast';
    el.className = 'snackbar';
    el.innerHTML = '<span></span>';
    document.body.appendChild(el);
  }
  el.querySelector('span').textContent = mensagem;
  el.classList.add('show');
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => el.classList.remove('show'), 4500);
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  initSidebarToggle();
  initExport();

  try {
    const movs = await api('/movimentacoes');
    if (!movs) return; // api() já redirecionou para o login

    movimentacoes = movs.map((m) => {
      const tipo = String(m.tipo).toLowerCase();
      const abs = Math.abs(Number(m.valor));
      return {
        dataISO: m.data,
        desc: m.descricao,
        categoria: m.categoria,
        tipo,
        valor: tipo === 'receita' ? abs : -abs,
      };
    });

    let relatorio = null;
    if (movimentacoes.length) {
      const datas = movimentacoes.map((m) => m.dataISO).sort();
      const inicio = datas[0];
      const fim = datas[datas.length - 1];
      relatorio = await api('/relatorios/periodo?dataInicio=' + inicio + '&dataFim=' + fim);
    }

    renderSummary(relatorio);
    renderMonthly();
    renderCategorias(relatorio);
  } catch (e) {
    notify(e.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. O back-end está rodando?'
      : (e.message || 'Erro ao carregar o relatório.'));
    renderSummary(null);
    renderMonthly();
    renderCategorias(null);
  }
});

/* ---------- Resumo ---------- */

function renderSummary(relatorio) {
  const receitas = relatorio ? Number(relatorio.totalReceitas) : 0;
  const despesas = relatorio ? Number(relatorio.totalDespesas) : 0;
  const saldo = relatorio ? Number(relatorio.saldoPeriodo) : 0;

  document.getElementById('summary-grid').innerHTML = `
    <div class="summary-card">
      <div class="label">Total de receitas</div>
      <div class="value ${receitas === 0 ? 'is-empty' : ''}">${formatCurrency(receitas)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total de despesas</div>
      <div class="value ${despesas === 0 ? 'is-empty' : ''}">${formatCurrency(despesas)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Saldo líquido</div>
      <div class="value ${saldo === 0 ? 'is-empty' : ''}">${formatCurrency(saldo)}</div>
    </div>
  `;
}

/* ---------- Receitas x despesas por mês ---------- */

function renderMonthly() {
  const container = document.getElementById('report-rows');
  if (!movimentacoes.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico">▦</div>
        <div class="empty-title">Nenhuma movimentação registrada</div>
        <div class="empty-sub">Cadastre receitas e despesas para ver o relatório mensal aqui.</div>
      </div>
    `;
    return;
  }

  const porMes = {};
  movimentacoes.forEach((m) => {
    const chave = m.dataISO.slice(0, 7); // yyyy-mm
    if (!porMes[chave]) porMes[chave] = { receitas: 0, despesas: 0 };
    if (m.tipo === 'receita') porMes[chave].receitas += m.valor;
    else porMes[chave].despesas += Math.abs(m.valor);
  });

  const chaves = Object.keys(porMes).sort();
  const maiorValor = Math.max(...chaves.map((k) => Math.max(porMes[k].receitas, porMes[k].despesas)), 1);
  const variosAnos = new Set(chaves.map((k) => k.slice(0, 4))).size > 1;

  container.innerHTML = chaves.map((chave) => {
    const [ano, mm] = chave.split('-');
    const { receitas, despesas } = porMes[chave];
    const pctReceita = Math.round((receitas / maiorValor) * 100);
    const pctDespesa = Math.round((despesas / maiorValor) * 100);
    const rotulo = (MONTH_NAMES[mm] || mm).slice(0, 3) + (variosAnos ? '/' + ano.slice(2) : '');
    return `
      <div class="report-row">
        <div class="report-month">${rotulo}</div>
        <div class="report-bar-wrap">
          <span style="font-size:0.72rem; color:var(--ink-faint);">Receitas ${formatCurrency(receitas)}</span>
          <div class="report-bar-track"><span class="report-bar-fill receita" style="width:${pctReceita}%;"></span></div>
        </div>
        <div class="report-bar-wrap">
          <span style="font-size:0.72rem; color:var(--ink-faint);">Despesas ${formatCurrency(despesas)}</span>
          <div class="report-bar-track"><span class="report-bar-fill despesa" style="width:${pctDespesa}%;"></span></div>
        </div>
        <div class="report-saldo">${formatCurrency(receitas - despesas)}</div>
      </div>
    `;
  }).join('');
}

/* ---------- Gastos por categoria ---------- */

function renderCategorias(relatorio) {
  const container = document.getElementById('report-cat-bars');
  const categorias = relatorio && relatorio.despesasPorCategoria
    ? relatorio.despesasPorCategoria
        .map((c) => ({ nome: c.categoria, valor: Number(c.total) }))
        .sort((a, b) => b.valor - a.valor)
    : [];

  if (!categorias.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico">▤</div>
        <div class="empty-title">Nenhum gasto registrado</div>
        <div class="empty-sub">As categorias mais gastas vão aparecer aqui.</div>
      </div>
    `;
    return;
  }

  const max = Math.max(...categorias.map((c) => c.valor), 1);
  const colors = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)'];

  container.innerHTML = categorias.map((c, i) => {
    const pct = Math.round((c.valor / max) * 100);
    return `
      <div class="cat-row">
        <div class="cat-top"><span>${escapeHtml(c.nome)}</span><span class="value">${formatCurrency(c.valor)}</span></div>
        <div class="cat-track"><span class="cat-fill" style="width:${pct}%; background:${colors[i % colors.length]};"></span></div>
      </div>
    `;
  }).join('');
}

/* ---------- Exportar CSV ---------- */

function initExport() {
  document.getElementById('export-csv').addEventListener('click', () => {
    if (!movimentacoes.length) {
      notify('Não há movimentações para exportar ainda.');
      return;
    }

    const linhas = [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']];
    [...movimentacoes]
      .sort((a, b) => a.dataISO.localeCompare(b.dataISO))
      .forEach((m) => {
        linhas.push([
          formatarDataBR(m.dataISO),
          m.desc,
          m.categoria,
          m.tipo,
          m.valor.toFixed(2).replace('.', ','),
        ]);
      });

    const csv = linhas.map((linha) => linha.map(csvEscape).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'financerto-movimentacoes.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
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