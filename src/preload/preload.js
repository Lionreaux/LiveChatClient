const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  logout: () => ipcRenderer.invoke('logout'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  
  // Media
  reactToMedia: (data) => ipcRenderer.invoke('react-to-media', data),
  stopMediaLocal: () => ipcRenderer.invoke('stop-media-local'),
  mediaEnded: () => ipcRenderer.send('media-ended'),
  
  // Events
  onAuthStatus: (callback) => {
    ipcRenderer.on('auth-status', (event, data) => callback(data));
  },
  
  onShowMedia: (callback) => {
    ipcRenderer.on('show-media', (event, media) => callback(media));
  },
  
  onStopMedia: (callback) => {
    ipcRenderer.on('stop-media', (event) => callback());
  },
  
  // Cleanup
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
