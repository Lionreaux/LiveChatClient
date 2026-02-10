const loginView = document.getElementById('loginView');
const connectedView = document.getElementById('connectedView');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const stopMediaBtn = document.getElementById('stopMediaBtn');
const errorDiv = document.getElementById('error');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const dndToggle = document.getElementById('dndToggle');
const statusEl = document.getElementById('status');

let isConnected = false;

// Login
loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    showError('Veuillez remplir tous les champs');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Connexion...';

  const result = await window.electronAPI.login({ username, password });

  if (result.success) {
    showConnected();
    loadSettings();
  } else {
    showError(result.error);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Se connecter';
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  await window.electronAPI.logout();
  showLogin();
});

// Stop Media Local
stopMediaBtn.addEventListener('click', async () => {
  await window.electronAPI.stopMediaLocal();
  console.log('🛑 Média arrêté localement');
});

// Do Not Disturb Toggle
dndToggle.addEventListener('click', async () => {
  const isActive = dndToggle.classList.contains('active');
  dndToggle.classList.toggle('active');
  
  await window.electronAPI.updateSettings({
    doNotDisturb: !isActive
  });
});

// Functions
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function showConnected() {
  loginView.style.display = 'none';
  connectedView.style.display = 'block';
  isConnected = true;
  statusEl.textContent = '🟢 Connecté et en écoute';
}

function showLogin() {
  loginView.style.display = 'block';
  connectedView.style.display = 'none';
  isConnected = false;
  statusEl.textContent = 'Client d\'affichage de médias';
  usernameInput.value = '';
  passwordInput.value = '';
}

async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  
  if (settings.doNotDisturb) {
    dndToggle.classList.add('active');
  }
}

// Auth status listener
window.electronAPI.onAuthStatus((data) => {
  if (data.success) {
    showConnected();
  } else {
    showLogin();
  }
});

// Enter key support
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    loginBtn.click();
  }
});
