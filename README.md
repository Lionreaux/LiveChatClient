# ChatDiscord - Client Electron

Client Electron pour ChatDiscord avec support d'overlay.

## 🚀 Installation

```bash
npm install
```

## ⚙️ Configuration ( pas d'actualité / mis en pause)

1. Copiez le fichier `.env.example` en `.env` :
```bash
cp .env.example .env
```

2. Modifiez le fichier `.env` avec vos URLs backend :
```env
BACKEND_URL=https://votre-backend.onrender.com
WS_URL=https://votre-backend.onrender.com
```

## 🏃 Développement

```bash
npm run dev
```

## 📦 Build

```bash
npm run build
```

Le build sera généré dans le dossier `dist/`.

## 📋 Fonctionnalités

- Interface de connexion
- Overlay transparent
- WebSocket en temps réel
- Gestion des médias (images, vidéos, audio, GIFs)
- Système de raccourcis clavier
- Notifications système

## 🔒 Sécurité

**Important :** Ne commitez jamais le fichier `.env` sur GitHub. Il est automatiquement ignoré par le `.gitignore`.

## 📄 Licence

MIT
