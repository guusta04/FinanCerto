// FinanCerto — Perfil (integrado com a API Spring Boot via api.js)
// Requer: api.js carregado ANTES deste arquivo.
// Endpoints: GET /perfil, PUT /perfil, PATCH /perfil/senha
//
// O back-end guarda só nome e e-mail. Telefone e "Sobre" não existem no banco,
// então ficam salvos apenas neste navegador (localStorage).
// Atenção: o token de login é gerado a partir do e-mail. Se o e-mail mudar,
// é preciso entrar de novo.

const PROFILE_CACHE_KEY = 'financecerto:perfil';        // lido pelo perfil-sync.js (sidebar)
const EXTRAS_KEY = 'financerto:perfil-extra';           // telefone e bio (só neste navegador)

let perfilAtual = null; // { nome, email } vindo da API

/* ---------- Utilitários ---------- */

function getInitials(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] || '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

let snackbarTimeout;
function showSnackbar(message) {
  const snackbar = document.getElementById('snackbar');
  document.getElementById('snackbar-text').textContent = message;
  snackbar.classList.add('show');
  clearTimeout(snackbarTimeout);
  snackbarTimeout = setTimeout(() => snackbar.classList.remove('show'), 4000);
}

/* ---------- Extras locais (telefone e bio) ---------- */

function loadExtras() {
  try {
    const raw = localStorage.getItem(EXTRAS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn(e); }
  return { telefone: '', bio: '' };
}

function saveExtras(extras) {
  try { localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras)); }
  catch (e) { console.warn(e); }
}

function cachePerfil(perfil) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ nome: perfil.nome, email: perfil.email }));
  } catch (e) { console.warn(e); }
}

/* ---------- Inicialização ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  initSidebarToggle();
  ensureCurrentPasswordField();
  initProfileForm();
  initPasswordForm();

  const extras = loadExtras();
  document.getElementById('p-telefone').value = extras.telefone || '';
  document.getElementById('p-bio').value = extras.bio || '';

  try {
    const perfil = await api('/perfil');
    if (!perfil) return; // api() já redirecionou para o login
    perfilAtual = { nome: perfil.nome, email: perfil.email };
    cachePerfil(perfilAtual);
    fillForm(perfilAtual);
    updatePreview(perfilAtual);
  } catch (e) {
    showSnackbar(e.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. O back-end está rodando?'
      : (e.message || 'Não foi possível carregar o perfil.'));
  }
});

/* ---------- Dados pessoais ---------- */

function fillForm(perfil) {
  document.getElementById('p-nome').value = perfil.nome || '';
  document.getElementById('p-email').value = perfil.email || '';
}

function updatePreview(perfil) {
  const initials = getInitials(perfil.nome);
  document.getElementById('profile-avatar-lg').textContent = initials;
  document.getElementById('profile-preview-nome').textContent = perfil.nome || 'Sem nome definido';
  document.getElementById('profile-preview-email').textContent = perfil.email || '—';

  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const sidebarNome = document.getElementById('sidebar-nome');
  const sidebarEmail = document.getElementById('sidebar-email');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarNome) sidebarNome.textContent = perfil.nome || 'Meu perfil';
  if (sidebarEmail) sidebarEmail.textContent = perfil.email || 'Editar dados';
}

function initProfileForm() {
  const form = document.getElementById('profile-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('p-nome').value.trim();
    const email = document.getElementById('p-email').value.trim();
    const telefone = document.getElementById('p-telefone').value.trim();
    const bio = document.getElementById('p-bio').value.trim();

    if (!nome) { showSnackbar('Informe seu nome.'); return; }
    if (!isValidEmail(email)) { showSnackbar('Informe um e-mail válido.'); return; }

    submitBtn.disabled = true;
    try {
      const atualizado = await api('/perfil', { method: 'PUT', body: { nome, email } });
      if (!atualizado) return;

      saveExtras({ telefone, bio });

      const emailMudou = perfilAtual && perfilAtual.email.toLowerCase() !== atualizado.email.toLowerCase();
      if (emailMudou) {
        // o token foi gerado com o e-mail antigo: precisa entrar de novo
        localStorage.removeItem('financerto:token');
        localStorage.removeItem(PROFILE_CACHE_KEY);
        showSnackbar('E-mail alterado. Entre novamente com o novo e-mail.');
        setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        return;
      }

      perfilAtual = { nome: atualizado.nome, email: atualizado.email };
      cachePerfil(perfilAtual);
      updatePreview(perfilAtual);
      showSnackbar('Perfil atualizado com sucesso.');
    } catch (err) {
      showSnackbar(err.message || 'Não foi possível atualizar o perfil.');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Alterar senha ---------- */

// O back-end exige a senha atual. Se o HTML não tiver o campo, ele é criado aqui.
function ensureCurrentPasswordField() {
  if (document.getElementById('p-senha-atual')) return;
  const novaField = document.getElementById('p-senha-nova')?.closest('.field');
  if (!novaField) return;
  const campo = document.createElement('div');
  campo.className = 'field';
  campo.innerHTML = `
    <label for="p-senha-atual">Senha atual</label>
    <div class="input-wrap">
      <input type="password" id="p-senha-atual" placeholder="Sua senha atual" autocomplete="current-password" />
    </div>
    <div class="field-error" id="p-senha-atual-error"></div>
  `;
  novaField.insertAdjacentElement('beforebegin', campo);
}

function setError(input, errorEl, message) {
  if (message) {
    errorEl.textContent = message;
    input.classList.add('invalid');
  } else {
    errorEl.textContent = '';
    input.classList.remove('invalid');
  }
}

function initPasswordForm() {
  const form = document.getElementById('password-form');
  const atual = document.getElementById('p-senha-atual');
  const nova = document.getElementById('p-senha-nova');
  const confirmar = document.getElementById('p-senha-confirmar');
  const atualError = document.getElementById('p-senha-atual-error');
  const novaError = document.getElementById('p-senha-nova-error');
  const confirmarError = document.getElementById('p-senha-confirmar-error');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let valid = true;

    if (!atual.value) {
      setError(atual, atualError, 'Informe sua senha atual.');
      valid = false;
    } else {
      setError(atual, atualError, '');
    }

    if (nova.value.length < 6) {
      setError(nova, novaError, 'Use pelo menos 6 caracteres.');
      valid = false;
    } else {
      setError(nova, novaError, '');
    }

    if (confirmar.value !== nova.value || confirmar.value === '') {
      setError(confirmar, confirmarError, 'As senhas não coincidem.');
      valid = false;
    } else {
      setError(confirmar, confirmarError, '');
    }

    if (!valid) return;

    submitBtn.disabled = true;
    try {
      await api('/perfil/senha', {
        method: 'PATCH',
        body: { senhaAtual: atual.value, novaSenha: nova.value },
      });
      form.reset();
      showSnackbar('Senha atualizada com sucesso.');
    } catch (err) {
      const msg = err.message || 'Não foi possível atualizar a senha.';
      if (/senha atual/i.test(msg)) {
        setError(atual, atualError, msg);
      } else {
        showSnackbar(msg);
      }
    } finally {
      submitBtn.disabled = false;
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