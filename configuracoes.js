// FinanCerto — Configurações
// As chaves abaixo ficam só neste navegador (localStorage). O back-end ainda não
// tem endpoints de preferências, então os interruptores são preferências locais.
// "Limpar dados deste navegador" NÃO apaga nada do banco de dados.

const CONFIG_KEY = 'financerto:config';

const DEFAULT_CONFIG = {
  alertas: true,
  resumo: false,
  faturas: true,
};

// Tudo o que o front guarda no navegador (exceto o token de login)
const LOCAL_KEYS = [
  'financerto:config',
  'financerto:regras-alerta',
  'financerto:perfil-extra',
  'financecerto:perfil',
  // chaves da versão antiga (antes da integração com a API)
  'financecerto:dashboard',
  'financecerto:cartoes',
  'financecerto:alertas',
];

/* ---------- Utilitários ---------- */

let toastTimeout;
function notify(mensagem) {
  let el = document.getElementById('cfg-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cfg-toast';
    el.className = 'snackbar';
    el.innerHTML = '<span></span>';
    document.body.appendChild(el);
  }
  el.querySelector('span').textContent = mensagem;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3500);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) { console.warn(e); }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
  catch (e) { console.warn(e); }
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initSidebarToggle();
  initToggles();
  initClearData();
});

/* ---------- Interruptores ---------- */

function initToggles() {
  const config = loadConfig();
  const toggles = {
    alertas: document.getElementById('cfg-alertas'),
    resumo: document.getElementById('cfg-resumo'),
    faturas: document.getElementById('cfg-faturas'),
  };

  Object.entries(toggles).forEach(([chave, input]) => {
    if (!input) return;
    input.checked = !!config[chave];
    input.addEventListener('change', () => {
      const atual = loadConfig();
      atual[chave] = input.checked;
      saveConfig(atual);
      notify('Preferência salva neste navegador.');
    });
  });
}

/* ---------- Limpar dados do navegador ---------- */

function initClearData() {
  const overlay = document.getElementById('confirm-clear-overlay');
  const openBtn = document.getElementById('clear-data');
  const cancelBtn = document.getElementById('cancel-clear');
  const confirmBtn = document.getElementById('confirm-clear');
  if (!overlay || !openBtn) return;

  const close = () => overlay.classList.remove('show');

  openBtn.addEventListener('click', () => overlay.classList.add('show'));
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  confirmBtn.addEventListener('click', () => {
    LOCAL_KEYS.forEach((chave) => {
      try { localStorage.removeItem(chave); } catch (e) { console.warn(e); }
    });
    close();

    // volta os interruptores ao padrão
    const config = { ...DEFAULT_CONFIG };
    document.getElementById('cfg-alertas').checked = config.alertas;
    document.getElementById('cfg-resumo').checked = config.resumo;
    document.getElementById('cfg-faturas').checked = config.faturas;

    notify('Dados deste navegador foram limpos.');
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