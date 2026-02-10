import { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { io } from 'socket.io-client';
import fs from 'fs';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Créer un fichier de log pour debug
const logPath = path.join(app.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    logStream.write(logMessage);
  } catch (err) {
    console.error('Erreur écriture log:', err);
  }
}

log('========================================');
log('🚀 DÉMARRAGE DE L\'APPLICATION');
log(`📁 Chemin logs: ${logPath}`);
log(`📁 User data: ${app.getPath('userData')}`);
log(`🖥️ Plateforme: ${process.platform}`);
log(`⚡ Electron version: ${process.versions.electron}`);
log(`📦 Node version: ${process.versions.node}`);
log('========================================');

// Charger le fichier .env manuellement
const envPath = path.join(process.cwd(), '.env');
log(`🔍 Recherche du fichier .env: ${envPath}`);
if (fs.existsSync(envPath)) {
  log('✅ Fichier .env trouvé');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
} else {
  log('⚠️ Fichier .env non trouvé');
}

const store = new Store();
let mainWindow = null;
let overlayWindow = null;
let tray = null;
let socket = null;

// File d'attente pour les médias
let mediaQueue = [];
let isDisplayingMedia = false;

// Configuration
// En production, utiliser les URLs déployées, en dev utiliser localhost
// ⚠️ Mettre à jour avec votre URL Render ou utiliser un fichier .env
const BACKEND_URL = process.env.BACKEND_URL || 'https://chatdiscord-backend.onrender.com';
const WS_URL = process.env.WS_URL || 'https://chatdiscord-backend.onrender.com';

log('🔧 Configuration chargée:');
log(`   BACKEND_URL: ${BACKEND_URL}`);
log(`   WS_URL: ${WS_URL}`);

// ============================================
// CONFIGURATION AUTO-UPDATE
// ============================================

// Configurer autoUpdater
autoUpdater.logger = {
  info: (msg) => log(`[AutoUpdater] ℹ️ ${msg}`),
  warn: (msg) => log(`[AutoUpdater] ⚠️ ${msg}`),
  error: (msg) => log(`[AutoUpdater] ❌ ${msg}`),
  debug: (msg) => log(`[AutoUpdater] 🐛 ${msg}`)
};

// Désactiver l'auto-download pour contrôler manuellement
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Événements de l'auto-updater
autoUpdater.on('checking-for-update', () => {
  log('🔍 Vérification des mises à jour...');
  if (tray) {
    updateTrayMenu('Vérification des mises à jour...');
  }
});

autoUpdater.on('update-available', (info) => {
  log(`✨ Mise à jour disponible: v${info.version}`);
  log(`   Taille: ${(info.files[0]?.size / 1024 / 1024).toFixed(2)} MB`);

  if (tray) {
    updateTrayMenu(`Téléchargement v${info.version}...`);
  }

  // Télécharger automatiquement
  autoUpdater.downloadUpdate();
});

autoUpdater.on('update-not-available', (info) => {
  log(`✅ Application à jour (v${info.version})`);
  if (tray) {
    updateTrayMenu(null); // Retirer le message
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  const percent = progressObj.percent.toFixed(1);
  log(`📥 Téléchargement: ${percent}% (${progressObj.transferred}/${progressObj.total} bytes)`);

  if (tray) {
    updateTrayMenu(`Téléchargement: ${percent}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log(`✅ Mise à jour téléchargée: v${info.version}`);
  log('🔄 Installation et redémarrage dans 5 secondes...');

  if (tray) {
    updateTrayMenu('Redémarrage pour mise à jour...');
  }

  // Installer et redémarrer après 5 secondes
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 5000);
});

autoUpdater.on('error', (err) => {
  log(`❌ Erreur auto-update: ${err.message}`);
  if (tray) {
    updateTrayMenu(null);
  }
});

// Fonction helper pour mettre à jour le menu tray
function updateTrayMenu(updateMessage) {
  if (!tray) return;

  const doNotDisturb = store.get('doNotDisturb', false);

  const menuTemplate = [
    {
      label: 'Ouvrir',
      click: () => mainWindow.show()
    },
    {
      label: 'Mode Ne pas déranger',
      type: 'checkbox',
      checked: doNotDisturb,
      click: (item) => {
        store.set('doNotDisturb', item.checked);
        if (socket) {
          socket.emit('settings:update', { doNotDisturb: item.checked });
        }
      }
    },
    { type: 'separator' }
  ];

  // Ajouter le message de mise à jour si présent
  if (updateMessage) {
    menuTemplate.push({
      label: updateMessage,
      enabled: false
    });
    menuTemplate.push({ type: 'separator' });
  }

  menuTemplate.push({
    label: 'Quitter',
    click: () => {
      app.isQuitting = true;
      app.quit();
    }
  });

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

// ============================================
// FIN CONFIGURATION AUTO-UPDATE
// ============================================

function createMainWindow() {
  log('📱 Création de la fenêtre principale...');
  try {
    mainWindow = new BrowserWindow({
      width: 400,
      height: 600,
      show: false,
      frame: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/preload.js')
      },
      icon: path.join(__dirname, '../../assets/icon.png')
    });
    log('✅ Fenêtre principale créée');

    const htmlPath = path.join(__dirname, '../renderer/index.html');
    log(`📄 Chargement de: ${htmlPath}`);
    mainWindow.loadFile(htmlPath);
    log('✅ HTML chargé');

    // Logger les erreurs de la console
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      log(`[Renderer Console] ${message}`);
    });

    mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
        log('🔽 Fenêtre cachée (non fermée)');
      }
    });
  } catch (error) {
    log(`❌ ERREUR création fenêtre principale: ${error.message}`);
    log(`   Stack: ${error.stack}`);
    throw error;
  }
}

function createOverlayWindow() {
  // Utiliser bounds pour obtenir la taille complète de l'écran (incluant la barre des tâches)
  const { bounds } = screen.getPrimaryDisplay();

  overlayWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  // Permettre les clics à travers la fenêtre par défaut
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'));

  // Afficher la fenêtre dès le départ (transparente), ne jamais la cacher
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    // Par défaut, utiliser le niveau 'normal' (au-dessus des fenêtres normales mais pas de la barre des tâches)
    // Le niveau sera changé dynamiquement selon le média
    overlayWindow.setAlwaysOnTop(true, 'normal');
  });

  // DevTools pour debug
  //overlayWindow.webContents.openDevTools({ mode: 'detach' });
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Mode Ne pas déranger',
      type: 'checkbox',
      checked: store.get('doNotDisturb', false),
      click: (item) => {
        store.set('doNotDisturb', item.checked);
        if (socket) {
          socket.emit('settings:update', { doNotDisturb: item.checked });
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('ChatDiscord Client');

  tray.on('click', () => {
    mainWindow.show();
  });
}

function connectWebSocket() {
  const userId = store.get('userId');
  const token = store.get('token');

  if (!userId || !token) {
    console.log('Pas d\'authentification, WebSocket non connecté');
    return;
  }

  socket = io(WS_URL, {
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('✅ WebSocket connecté');
    socket.emit('auth', { userId });
  });

  socket.on('auth:success', (data) => {
    console.log('✅ Authentifié sur le WebSocket');
    mainWindow?.webContents.send('auth-status', { success: true, user: data.user });
  });

  socket.on('media:new', (media) => {
    console.log('📬 Nouveau média reçu:', media);

    // Vérifier le mode Ne pas déranger
    const doNotDisturb = store.get('doNotDisturb', false);
    if (doNotDisturb) {
      console.log('🔕 Mode DND activé, média ignoré');
      return;
    }

    // Ajouter à la file d'attente
    addMediaToQueue(media);

    // Notifier l'expéditeur
    socket.emit('media:received', {
      mediaId: media._id,
      senderId: media.sender._id
    });
  });

  socket.on('media:stop-all', () => {
    console.log('🛑 Arrêt du média en cours demandé');

    // Vider la file d'attente
    mediaQueue = [];

    // Arrêter le média en cours
    if (overlayWindow) {
      overlayWindow.webContents.send('stop-media');
    }

    // Réinitialiser l'état
    isDisplayingMedia = false;

    console.log('✅ Média arrêté et file vidée');
  });

  socket.on('disconnect', () => {
    console.log('❌ WebSocket déconnecté');
    mainWindow?.webContents.send('auth-status', { success: false });
  });

  socket.on('error', (error) => {
    console.error('Erreur WebSocket:', error);
  });
}

// Gestion de la file d'attente des médias
function addMediaToQueue(media) {
  console.log('➕ Ajout à la file d\'attente:', media._id, '(Position:', mediaQueue.length + 1, ')');
  mediaQueue.push(media);

  // Si aucun média n'est en cours d'affichage, démarrer le traitement
  if (!isDisplayingMedia) {
    processMediaQueue();
  }
}

function processMediaQueue() {
  // Si la queue est vide ou un média est déjà en cours, ne rien faire
  if (mediaQueue.length === 0 || isDisplayingMedia) {
    return;
  }

  isDisplayingMedia = true;
  const media = mediaQueue.shift(); // Retirer le premier média de la queue

  console.log('▶️ Affichage du média:', media._id, '(Restants:', mediaQueue.length, ')');

  // Afficher le média
  showMediaOverlay(media);
  // Le média notifiera quand il se termine via l'événement 'media-ended'
}

function getMediaDuration(media) {
  // Pour vidéo/audio, utiliser leur durée native
  if (media.type === 'video' || media.type === 'audio') {
    return (media.duration * 1000) || 10000;
  }

  // Pour les images, utiliser displayDuration
  return media.displayDuration || 5000;
}

function showMediaOverlay(media) {
  if (!overlayWindow) return;

  // Calculer la durée d'affichage
  let duration = media.displayDuration || 5000;

  // Pour vidéo/audio, utiliser leur durée native
  if (media.type === 'video' || media.type === 'audio') {
    duration = media.duration * 1000 || 10000;
  }

  // Remplacer localhost par l'IP du backend dans l'URL (pour le média et l'avatar)
  const mediaWithFixedUrl = {
    ...media,
    url: media.url ? media.url.replace('http://localhost:3000', BACKEND_URL) : media.url,
    duration,
    audio: media.audio ? {
      ...media.audio,
      url: media.audio.url ? media.audio.url.replace('http://localhost:3000', BACKEND_URL) : media.audio.url
    } : null,
    experimentalPosition: media.experimentalPosition || null,
    sender: media.sender ? {
      ...media.sender,
      avatar: media.sender.avatar ? (
        media.sender.avatar.startsWith('http')
          ? media.sender.avatar.replace('http://localhost:3000', BACKEND_URL)
          : `${BACKEND_URL}${media.sender.avatar}`
      ) : null
    } : null
  };

  console.log('🔄 URL transformée:', media.url, '→', mediaWithFixedUrl.url);
  console.log('🎵 Audio:', mediaWithFixedUrl.audio ? mediaWithFixedUrl.audio.url : 'non');
  console.log('🔬 Experimental Position:', mediaWithFixedUrl.experimentalPosition);
  console.log('👤 Sender info:', mediaWithFixedUrl.sender);
  console.log('🔒 Anonymous:', mediaWithFixedUrl.anonymous);
  console.log('⚡ Super Overlay:', mediaWithFixedUrl.superOverlay);

  // Changer le niveau d'overlay selon le mode superOverlay
  if (mediaWithFixedUrl.superOverlay) {
    log('⚡ Mode Super Overlay activé - Passage au-dessus de tout (screen-saver)');
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    log('📺 Mode normal - Au-dessus des fenêtres normales uniquement');
    overlayWindow.setAlwaysOnTop(true, 'normal');
  }

  // Envoyer les données à l'overlay (la fenêtre reste toujours affichée)
  overlayWindow.webContents.send('show-media', mediaWithFixedUrl);
}

// IPC Handlers
ipcMain.handle('login', async (event, { username, password }) => {
  try {
    console.log('🔐 Tentative de connexion:', { username, backend: BACKEND_URL });
    const axios = (await import('axios')).default;
    const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      username,
      password
    });

    console.log('✅ Connexion réussie:', response.data);
    const { token, id } = response.data.data;
    store.set('token', token);
    store.set('userId', id);

    // Reconnecter le WebSocket
    if (socket) socket.disconnect();
    connectWebSocket();

    return { success: true, data: response.data.data };
  } catch (error) {
    console.error('❌ Erreur de connexion:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      url: `${BACKEND_URL}/api/auth/login`
    });
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Erreur de connexion'
    };
  }
});

ipcMain.handle('logout', async () => {
  store.delete('token');
  store.delete('userId');

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  return { success: true };
});

ipcMain.handle('get-settings', () => {
  return {
    doNotDisturb: store.get('doNotDisturb', false),
    displayMode: store.get('displayMode', 'normal')
  };
});

ipcMain.handle('update-settings', (event, settings) => {
  if (settings.doNotDisturb !== undefined) {
    store.set('doNotDisturb', settings.doNotDisturb);
  }
  if (settings.displayMode) {
    store.set('displayMode', settings.displayMode);
  }

  // Mettre à jour le menu tray
  if (tray) {
    const contextMenu = tray.getContextMenu();
    const dndItem = contextMenu.items.find(item => item.label === 'Mode Ne pas déranger');
    if (dndItem) {
      dndItem.checked = settings.doNotDisturb;
    }
  }

  // Envoyer au serveur
  if (socket && socket.connected) {
    socket.emit('settings:update', settings);
  }

  return { success: true };
});

ipcMain.handle('react-to-media', (event, { mediaId, senderId, reaction }) => {
  if (socket && socket.connected) {
    socket.emit('media:react', { mediaId, senderId, reaction });
  }
});

// Stop local du média (sans notifier le serveur)
ipcMain.handle('stop-media-local', () => {
  log('🛑 Arrêt local du média (demandé par l\'utilisateur)');

  // Vider la file d'attente
  mediaQueue = [];

  // Arrêter le média en cours
  if (overlayWindow) {
    overlayWindow.webContents.send('stop-media');
  }

  // Réinitialiser l'état
  isDisplayingMedia = false;

  log('✅ Média arrêté localement');
  return { success: true };
});

// Gestionnaire pour quand un média se termine
ipcMain.on('media-ended', () => {
  log('✅ Média terminé, passage au suivant...');

  // Petit délai pour une transition fluide
  setTimeout(() => {
    isDisplayingMedia = false;

    // Traiter le prochain média dans la queue
    if (mediaQueue.length > 0) {
      log('⏭️ Passage au média suivant (Restants:', mediaQueue.length, ')');
      processMediaQueue();
    } else {
      log('✅ File d\'attente vide');
    }
  }, 300); // 0.5 seconde de transition
});

// App lifecycle
app.whenReady().then(() => {
  log('🎬 App ready - Initialisation...');
  try {
    log('🔨 Création des fenêtres...');
    createMainWindow();
    createOverlayWindow();
    createTray();
    log('✅ Toutes les fenêtres créées');

        // Vérifier les mises à jour au démarrage
    log('🔍 Lancement de la vérification des mises à jour...');
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        log(`❌ Erreur lors de la vérification: ${err.message}`);
      });
    }, 5000); // Attendre 3 secondes après le démarrage

    // Enregistrer les raccourcis clavier globaux
    log('⌨️ Enregistrement des raccourcis clavier globaux...');

    // Ctrl+Shift+X : Arrêter le média en cours
    const stopMediaShortcut = globalShortcut.register('Ctrl+Shift+X', () => {
      log('⌨️ Raccourci Ctrl+Shift+X pressé - Arrêt du média');
      mediaQueue = [];
      if (overlayWindow) {
        overlayWindow.webContents.send('stop-media');
      }
      isDisplayingMedia = false;
    });

    // Ctrl+Shift+D : Activer/désactiver le mode Ne pas déranger
    const toggleDNDShortcut = globalShortcut.register('Ctrl+Shift+D', () => {
      const currentDND = store.get('doNotDisturb', false);
      const newDND = !currentDND;
      store.set('doNotDisturb', newDND);
      log(`⌨️ Raccourci Ctrl+Shift+D pressé - Mode DND: ${newDND ? 'ON' : 'OFF'}`);

      // Mettre à jour le menu tray
      if (tray) {
        const contextMenu = Menu.buildFromTemplate([
          {
            label: 'Ouvrir',
            click: () => mainWindow.show()
          },
          {
            label: 'Mode Ne pas déranger',
            type: 'checkbox',
            checked: newDND,
            click: (item) => {
              store.set('doNotDisturb', item.checked);
              if (socket) {
                socket.emit('settings:update', { doNotDisturb: item.checked });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Quitter',
            click: () => {
              app.isQuitting = true;
              app.quit();
            }
          }
        ]);
        tray.setContextMenu(contextMenu);
      }

      // Envoyer au serveur
      if (socket && socket.connected) {
        socket.emit('settings:update', { doNotDisturb: newDND });
      }
    });

    // Ctrl+Shift+O : Afficher/masquer la fenêtre principale
    const toggleWindowShortcut = globalShortcut.register('Ctrl+Shift+O', () => {
      log('⌨️ Raccourci Ctrl+Shift+O pressé - Toggle fenêtre');
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    if (stopMediaShortcut && toggleDNDShortcut && toggleWindowShortcut) {
      log('✅ Tous les raccourcis clavier enregistrés:');
      log('   - Ctrl+Shift+X : Arrêter le média');
      log('   - Ctrl+Shift+D : Toggle mode DND');
      log('   - Ctrl+Shift+O : Afficher/masquer fenêtre');
    } else {
      log('⚠️ Certains raccourcis n\'ont pas pu être enregistrés');
    }

    // Vérifier si l'utilisateur est déjà connecté
    const token = store.get('token');
    log(`🔑 Token trouvé: ${token ? 'Oui' : 'Non'}`);
    if (token) {
      log('🔌 Connexion WebSocket...');
      connectWebSocket();
    } else {
      log('👋 Affichage fenêtre de connexion');
      mainWindow.show();
    }

    app.on('activate', () => {
      log('🔄 App activée');
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  } catch (error) {
    log(`❌ ERREUR CRITIQUE lors de l'initialisation: ${error.message}`);
    log(`   Stack: ${error.stack}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  log('🪟 Toutes les fenêtres fermées');
  // Ne pas quitter l'app, rester dans le tray
  if (process.platform !== 'darwin' && !app.isQuitting) {
    // Continue de tourner en arrière-plan
  }
});

app.on('before-quit', () => {
  log('🛑 App en cours de fermeture...');
  app.isQuitting = true;

  // Désactiver tous les raccourcis globaux
  globalShortcut.unregisterAll();
  log('⌨️ Raccourcis claviers désactivés');

  if (socket) {
    log('🔌 Déconnexion WebSocket');
    socket.disconnect();
  }
  log('👋 Application fermée');
  logStream.end();
});

// Capturer les erreurs non gérées
process.on('uncaughtException', (error) => {
  log(`❌ ERREUR NON GÉRÉE: ${error.message}`);
  log(`   Stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ PROMESSE NON GÉRÉE: ${reason}`);
});
