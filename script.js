// FinanCerto — front-end de autenticação
// Integrado com a API REST (Spring Boot) via api.js.
// IMPORTANTE: nos HTMLs, carregue api.js ANTES de script.js.

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  initLoginForm();
  initCadastroForm();
});

/* ---------- Alternar visibilidade de senha ---------- */

function initPasswordToggles() {
  document.querySelectorAll('.toggle-visibility').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.textContent = isHidden ? 'Ocultar' : 'Mostrar';
      btn.setAttribute('aria-pressed', String(isHidden));
    });
  });
}

/* ---------- Utilitários de validação ---------- */

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function setFieldError(inputEl, errorEl, message) {
  if (message) {
    inputEl.classList.add('invalid');
    errorEl.textContent = message;
  } else {
    inputEl.classList.remove('invalid');
    errorEl.textContent = '';
  }
}

function showToast(toastEl, message, type) {
  toastEl.textContent = message;
  toastEl.className = 'form-toast show ' + type;
}

/* ---------- Tela de login ---------- */

function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  const email = document.getElementById('login-email');
  const emailError = document.getElementById('login-email-error');
  const senha = document.getElementById('login-senha');
  const senhaError = document.getElementById('login-senha-error');
  const toast = document.getElementById('login-toast');
  const submitBtn = document.getElementById('login-submit');

  // Habilita o botão apenas se ambos os campos contiverem texto
  function validarPreenchimento() {
    const preenchido = email.value.trim() !== '' && senha.value.trim() !== '';
    submitBtn.disabled = !preenchido;
  }

  email.addEventListener('input', validarPreenchimento);
  senha.addEventListener('input', validarPreenchimento);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    let valid = true;

    if (!isValidEmail(email.value)) {
      setFieldError(email, emailError, 'Informe um e-mail válido.');
      valid = false;
    } else {
      setFieldError(email, emailError, '');
    }

    if (senha.value.length < 6) {
      setFieldError(senha, senhaError, 'A senha deve ter pelo menos 6 caracteres.');
      valid = false;
    } else {
      setFieldError(senha, senhaError, '');
    }

    if (!valid) {
      showToast(toast, 'Verifique os campos destacados antes de continuar.', 'error');
      return;
    }

    const textoOriginal = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';

    try {
      const dados = await api('/auth/login', {
        method: 'POST',
        body: { email: email.value.trim(), senha: senha.value },
      });
      localStorage.setItem('financerto:token', dados.token);
      window.location.href = 'dashboard.html';
    } catch (e) {
      showToast(toast, e.message || 'E-mail ou senha inválidos.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginal;
    }
  });
}

/* ---------- Tela de cadastro ---------- */

function initCadastroForm() {
  const form = document.getElementById('cadastro-form');
  if (!form) return;

  const nome = document.getElementById('cad-nome');
  const nomeError = document.getElementById('cad-nome-error');
  const email = document.getElementById('cad-email');
  const emailError = document.getElementById('cad-email-error');
  const senha = document.getElementById('cad-senha');
  const senhaError = document.getElementById('cad-senha-error');
  const confirmar = document.getElementById('cad-confirmar');
  const confirmarError = document.getElementById('cad-confirmar-error');
  const termos = document.getElementById('cad-termos');
  const termosError = document.getElementById('cad-termos-error');
  const toast = document.getElementById('cadastro-toast');
  const submitBtn = document.getElementById('cadastro-submit');

  senha.addEventListener('input', () => updateStrength(senha.value));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    let valid = true;

    if (nome.value.trim().length < 3) {
      setFieldError(nome, nomeError, 'Informe seu nome completo.');
      valid = false;
    } else {
      setFieldError(nome, nomeError, '');
    }

    if (!isValidEmail(email.value)) {
      setFieldError(email, emailError, 'Informe um e-mail válido.');
      valid = false;
    } else {
      setFieldError(email, emailError, '');
    }

    if (senha.value.length < 6) {
      setFieldError(senha, senhaError, 'Use pelo menos 6 caracteres.');
      valid = false;
    } else {
      setFieldError(senha, senhaError, '');
    }

    if (confirmar.value !== senha.value || confirmar.value === '') {
      setFieldError(confirmar, confirmarError, 'As senhas não coincidem.');
      valid = false;
    } else {
      setFieldError(confirmar, confirmarError, '');
    }

    if (!termos.checked) {
      termosError.textContent = 'É preciso aceitar os termos para continuar.';
      valid = false;
    } else {
      termosError.textContent = '';
    }

    if (!valid) {
      showToast(toast, 'Verifique os campos destacados antes de continuar.', 'error');
      return;
    }

    const textoOriginal = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando conta...';

    try {
      // 1) cria a conta
      await api('/auth/register', {
        method: 'POST',
        body: { nome: nome.value.trim(), email: email.value.trim(), senha: senha.value },
      });

      // 2) já faz login para obter o token
      const dados = await api('/auth/login', {
        method: 'POST',
        body: { email: email.value.trim(), senha: senha.value },
      });
      localStorage.setItem('financerto:token', dados.token);
      window.location.href = 'dashboard.html';
    } catch (e) {
      showToast(toast, e.message || 'Não foi possível criar a conta.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginal;
    }
  });
}

function updateStrength(value) {
  const bars = document.querySelectorAll('#cad-strength .bar');
  const label = document.getElementById('cad-strength-label');
  if (!bars.length || !label) return;

  let score = 0;
  if (value.length >= 6) score++;
  if (value.length >= 10) score++;
  if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  const colors = ['#E3E1DB', '#B3261E', '#C97A1E', '#3C8C4A', '#146B4B'];
  const labels = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];

  bars.forEach((bar, i) => {
    bar.style.background = i < score ? colors[score] : '#E3E1DB';
  });

  label.textContent = value ? labels[score] : '';
}