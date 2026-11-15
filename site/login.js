// Tela de entrada: envia e-mail e senha ao servidor e segue para a página principal.
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const errorBox = document.getElementById('formError');

function mostraErro(mensagem) {
  errorBox.textContent = mensagem;
  errorBox.hidden = !mensagem;
}

function ocupado(sim) {
  submitBtn.disabled = sim;
  emailInput.disabled = sim;
  passwordInput.disabled = sim;
  submitBtn.textContent = sim ? 'Entrando…' : 'Entrar';
  form.setAttribute('aria-busy', String(sim));
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostraErro('');

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    mostraErro('Informe o e-mail e a senha.');
    (email ? passwordInput : emailInput).focus();
    return;
  }

  ocupado(true);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dados = await res.json().catch(() => ({}));

    if (res.ok) {
      window.location.href = '/';
      return;
    }
    if (res.status === 429) {
      mostraErro(dados.error || 'Muitas tentativas. Aguarde alguns minutos.');
    } else if (res.status === 401) {
      mostraErro('E-mail ou senha incorretos.');
    } else {
      mostraErro('Não foi possível entrar agora. Tente de novo.');
    }
    passwordInput.value = '';
    passwordInput.focus();
  } catch (erro) {
    mostraErro('Sem conexão com o servidor. Verifique sua rede e tente de novo.');
  } finally {
    ocupado(false);
  }
});
