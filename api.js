const API_URL = 'http://localhost:8080';

async function api(caminho, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('financerto:token');
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const resposta = await fetch(API_URL + caminho, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if ((resposta.status === 401 || resposta.status === 403) && !caminho.startsWith('/auth/')) {
    localStorage.removeItem('financerto:token');
    window.location.href = 'index.html';
    return;
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) throw new Error((dados && dados.erro) || 'Erro ' + resposta.status);
  return dados;
}