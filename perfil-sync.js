// FinanCerto — Sincronização do perfil na sidebar + proteção de página + logout
// Carregado nas páginas internas (depois de api.js, antes do script da página).
// - Se não houver token, volta para o login.
// - Busca o perfil em GET /perfil e atualiza nome/e-mail/iniciais na sidebar.
// - O botão de sair apaga o token e volta para o login.

(function () {
  const TOKEN_KEY = 'financerto:token';
  const PROFILE_KEY = 'financecerto:perfil';
  const LOGIN_PAGE = 'index.html';

  // Proteção: sem token, não fica numa página interna
  const pagina = window.location.pathname.split('/').pop();
  const ehPaginaPublica = pagina === 'index.html' || pagina === 'cadastro.html';
  if (!ehPaginaPublica && !localStorage.getItem(TOKEN_KEY)) {
    window.location.href = LOGIN_PAGE;
    return;
  }

  function getInitials(nome) {
    if (!nome) return '?';
    const partes = nome.trim().split(/\s+/);
    const primeiras = partes[0]?.[0] || '';
    const ultimas = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeiras + ultimas).toUpperCase();
  }

  function aplicarPerfil(perfil) {
    if (!perfil) return;
    const avatarEl = document.getElementById('sidebar-avatar');
    const nomeEl = document.getElementById('sidebar-nome');
    const emailEl = document.getElementById('sidebar-email');

    if (avatarEl) avatarEl.textContent = getInitials(perfil.nome);
    if (nomeEl && perfil.nome) nomeEl.textContent = perfil.nome;
    if (emailEl && perfil.email) emailEl.textContent = perfil.email;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // 1) mostra o último perfil conhecido (rápido, evita "piscar")
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) aplicarPerfil(JSON.parse(raw));
    } catch (e) {
      console.warn('Não foi possível ler o perfil salvo:', e);
    }

    // 2) atualiza com os dados reais da API
    if (typeof api === 'function' && localStorage.getItem(TOKEN_KEY)) {
      try {
        const perfil = await api('/perfil');
        if (perfil) {
          localStorage.setItem(PROFILE_KEY, JSON.stringify({ nome: perfil.nome, email: perfil.email }));
          aplicarPerfil(perfil);
        }
      } catch (e) {
        console.warn('Não foi possível carregar o perfil:', e);
      }
    }

    initLogoutButtons();
  });

  /* ---------- Botão de sair (logout) ---------- */
  // O back-end usa JWT sem sessão: sair = apagar o token no navegador.

  function initLogoutButtons() {
    document.querySelectorAll('.logout-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(PROFILE_KEY);
        showLogoutToast();
        setTimeout(() => { window.location.href = LOGIN_PAGE; }, 700);
      });
    });
  }

  function showLogoutToast() {
    if (document.getElementById('logout-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'logout-toast';
    toast.className = 'snackbar show';
    toast.innerHTML = '<span>Saindo da sua conta...</span>';
    document.body.appendChild(toast);
  }
})();