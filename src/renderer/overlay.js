const container = document.getElementById('overlay-container');
const mediaImage = document.getElementById('media-image');
const mediaVideo = document.getElementById('media-video');
const mediaAudio = document.getElementById('media-audio');
const textEl = document.getElementById('text');
const senderInfo = document.getElementById('sender-info');
const senderAvatar = document.getElementById('sender-avatar');
const senderName = document.getElementById('sender-name');
const experimentalContainer = document.getElementById('experimental-container');
const reactionBtns = document.querySelectorAll('.reaction-btn');

let currentMedia = null;
let hideTimeout = null;
let audioTimeout = null;

// Listen for media to display
window.electronAPI.onShowMedia((media) => {
  console.log('📺 Overlay - Média reçu:', media);
  console.log('📺 URL du média:', media.url);
  console.log('📺 Type du média:', media.type);
  console.log('📺 Mode fullscreen:', media.fullscreen);
  console.log('📺 experimentalPosition raw:', media.experimentalPosition);
  console.log('📺 experimentalPosition type:', typeof media.experimentalPosition);
  console.log('🎵 Audio attaché:', media.audio ? media.audio.url : 'non');

  // Si experimentalPosition est une string, le parser
  if (typeof media.experimentalPosition === 'string') {
    try {
      media.experimentalPosition = JSON.parse(media.experimentalPosition);
      console.log('📺 experimentalPosition parsée:', media.experimentalPosition);
    } catch (e) {
      console.error('❌ Erreur parsing experimentalPosition:', e);
      media.experimentalPosition = null;
    }
  }

  // NETTOYER IMMÉDIATEMENT avant de faire quoi que ce soit
  container.classList.remove('show', 'fullscreen');
  container.style.opacity = '0';
  mediaImage.src = '';
  mediaImage.style.display = 'none';
  mediaVideo.src = '';
  mediaVideo.style.display = 'none';
  mediaAudio.src = '';
  mediaAudio.style.display = 'none';
  textEl.textContent = '';
  textEl.style.display = 'none';
  senderInfo.style.display = 'none';
  senderAvatar.src = '';
  senderName.textContent = '';

  currentMedia = media;
  displayMedia(media);
});

function displayMedia(media) {
  console.log('🎬 displayMedia appelée avec:', media);
  console.log('🔍 experimentalPosition présent?', !!media.experimentalPosition);

  // Clear previous timeouts
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  if (audioTimeout) {
    clearTimeout(audioTimeout);
  }

  // Si position expérimentale, utiliser le conteneur expérimental
  if (media.experimentalPosition) {
    console.log('🔬 REDIRECTION vers displayExperimentalMedia');
    return displayExperimentalMedia(media);
  }

  console.log('📺 Affichage NORMAL (pas expérimental)');

  // Display sender info (if not anonymous)
  if (!media.anonymous && media.sender && media.sender.username) {
    console.log('👤 Affichage expéditeur:', media.sender.username, 'Avatar:', media.sender.avatar);

    if (media.sender.avatar) {
      senderAvatar.src = media.sender.avatar;
      senderAvatar.style.display = 'block';
    } else {
      senderAvatar.style.display = 'none';
    }
    senderName.textContent = media.sender.username;
    senderInfo.style.display = 'flex';
  } else {
    console.log('🔒 Mode anonyme ou pas de sender');
  }

  // Display based on type
  switch (media.type) {
    case 'image':
    case 'gif':
      mediaImage.src = media.url;
      mediaImage.style.display = 'block';
      mediaImage.id = 'media';

      // Si un audio est attaché, le jouer
      if (media.audio) {
        console.log('🎵 Audio attaché, lecture en cours');
        mediaAudio.src = media.audio.url;
        mediaAudio.play();

        // Arrêter l'audio après la durée du média
        audioTimeout = setTimeout(() => {
          console.log('⏱️ Durée du média écoulée, arrêt de l\'audio');
          mediaAudio.pause();
          mediaAudio.src = '';
        }, media.duration || 5000);
      }
      break;

    case 'video':
      mediaVideo.src = media.url;
      mediaVideo.style.display = 'block';
      mediaVideo.id = 'media';

      // Fermer l'overlay quand la vidéo se termine
      mediaVideo.onended = () => {
        console.log('🎬 Vidéo terminée, fermeture de l\'overlay');
        hideOverlay();
      };

      mediaVideo.play();
      break;

    case 'audio':
      mediaAudio.src = media.url;
      mediaAudio.style.display = 'block';

      // Fermer l'overlay quand l'audio se termine
      mediaAudio.onended = () => {
        console.log('🎵 Audio terminé, fermeture de l\'overlay');
        hideOverlay();
      };

      mediaAudio.play();
      // Show a placeholder for audio
      textEl.textContent = '🎵 Audio en cours...';
      textEl.style.display = 'block';
      break;
  }

  // Display text
  if (media.text && media.type !== 'audio') {
    textEl.textContent = media.text;
    textEl.className = media.textPosition || 'bottom';
    textEl.style.display = 'block';

    // Lire le texte avec TTS si activé
    if (media.enableTTS) {
      console.log('🔊 TTS activé, lecture du texte:', media.text);
      speakText(media.text);
    }
  }

  // Afficher l'overlay APRÈS avoir tout configuré
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.classList.add('show');

      // Ajouter la classe fullscreen si nécessaire
      if (media.fullscreen) {
        container.classList.add('fullscreen');
        console.log('📺 Mode plein écran activé');
      }
    });
  });

  // Auto-hide après durée uniquement pour les images/GIF
  if (media.type === 'image' || media.type === 'gif') {
    hideTimeout = setTimeout(() => {
      hideOverlay();
    }, media.duration || 5000);
  }
}

// Affichage avec positions expérimentales
function displayExperimentalMedia(media) {
  console.log('🔬 Affichage expérimental:', media.experimentalPosition);

  const expPos = media.experimentalPosition;

  // Nettoyer le conteneur expérimental
  experimentalContainer.innerHTML = '';
  experimentalContainer.style.display = 'block';
  experimentalContainer.style.pointerEvents = 'none';

  // Créer l'élément média
  const mediaElement = document.createElement('div');
  mediaElement.className = 'experimental-media';

  // Calculer la position et les transformations
  // La prévisualisation utilise une résolution 1920x1080
  const PREVIEW_WIDTH = 1920;
  const PREVIEW_HEIGHT = 1080;

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // Calculer les ratios d'échelle pour adapter à la vraie résolution
  const scaleX = screenWidth / PREVIEW_WIDTH;
  const scaleY = screenHeight / PREVIEW_HEIGHT;

  // Utiliser une conversion directe en % pour garder la précision maximale
  // Les positions sont déjà en %, on les applique directement sur l'écran réel
  const pixelX = (expPos.positionX / 100) * screenWidth;
  const pixelY = (expPos.positionY / 100) * screenHeight;

  // Le scale doit être multiplié par le ratio, mais utiliser le ratio X et Y séparément
  // pour éviter la distorsion. On prend le ratio minimal pour garder l'image entière visible
  const minRatio = Math.min(scaleX, scaleY);
  const adjustedScale = expPos.scale * minRatio;

  console.log('📐 Écran:', screenWidth, 'x', screenHeight);
  console.log('📐 Ratio d\'écran: scaleX=' + scaleX.toFixed(4) + ', scaleY=' + scaleY.toFixed(4) + ', min=' + minRatio.toFixed(4));
  console.log('📍 Position précise: X=' + expPos.positionX.toFixed(2) + '% (' + pixelX.toFixed(2) + 'px), Y=' + expPos.positionY.toFixed(2) + '% (' + pixelY.toFixed(2) + 'px)');
  console.log('🎯 Scale original:', expPos.scale.toFixed(3), '→ Scale ajusté:', adjustedScale.toFixed(4));
  console.log('🎯 Rotation:', expPos.rotation.toFixed(1) + '°, Opacité:', expPos.opacity + '%');
  console.log('📏 Taille de base normalisée: 500px → ' + (500 * minRatio).toFixed(2) + 'px sur cet écran');

  // Calculer le translate en fonction de la position pour que les bords de l'image
  // correspondent aux bords de l'écran (0% = bord gauche/haut, 100% = bord droit/bas)
  const translateX = -expPos.positionX;
  const translateY = -expPos.positionY;

  mediaElement.style.left = pixelX + 'px';
  mediaElement.style.top = pixelY + 'px';
  mediaElement.style.transform = `translate(${translateX}%, ${translateY}%) scale(${adjustedScale}) rotate(${expPos.rotation}deg)`;
  mediaElement.style.opacity = expPos.opacity / 100;
  mediaElement.style.zIndex = '9999';
  mediaElement.style.overflow = 'visible';
  mediaElement.style.transformOrigin = `${expPos.positionX}% ${expPos.positionY}%`;

  // Définir une taille de base normalisée (500px de largeur sur un écran 1920)
  // Cela permet d'avoir une échelle cohérente peu importe la taille originale du média
  // Note: Les vidéos gardent leur taille originale
  const BASE_SIZE = 500; // Taille de base en pixels sur l'écran de référence
  const normalizedSize = BASE_SIZE * minRatio; // Adapter à la résolution réelle

  // Ajouter le média
  if (media.type === 'video') {
    const video = document.createElement('video');
    video.src = media.url;
    video.autoplay = true;
    video.controls = false;
    video.style.display = 'block';
    video.style.width = 'auto';
    video.style.height = 'auto';
    video.style.maxWidth = 'none';
    video.style.maxHeight = 'none';
    mediaElement.appendChild(video);

    video.onended = () => {
      console.log('🎬 Vidéo expérimentale terminée');
      hideExperimentalOverlay();
    };
  } else {
    const img = document.createElement('img');
    img.src = media.url;
    img.style.display = 'block';
    img.style.width = normalizedSize + 'px';
    img.style.height = 'auto';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';

    // Écouter le chargement de l'image
    img.onload = () => {
      console.log('🖼️ Image chargée:', {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        displayWidth: img.width,
        displayHeight: img.height
      });
    };

    img.onerror = () => {
      console.log('❌ Erreur chargement image:', media.url);
    };

    mediaElement.appendChild(img);
  }

  experimentalContainer.appendChild(mediaElement);
  console.log('✅ Média expérimental ajouté au DOM');

  // Afficher le texte si présent
  if (media.text) {
    console.log('📝 Ajout du texte:', media.text);
    const textElement = document.createElement('div');
    textElement.className = 'experimental-text';
    textElement.textContent = media.text;

    // Style de base
    textElement.style.position = 'absolute';
    textElement.style.background = 'rgba(0, 0, 0, 0.8)';
    textElement.style.color = 'white';
    textElement.style.padding = '15px 30px';
    textElement.style.borderRadius = '10px';
    textElement.style.fontSize = '24px';
    textElement.style.fontWeight = 'bold';
    textElement.style.maxWidth = '80%';
    textElement.style.wordWrap = 'break-word';
    textElement.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
    textElement.style.zIndex = '10000';

    // Positionner le texte selon textPosition
    const textPos = media.textPosition || 'bottom';
    console.log('📍 Position du texte:', textPos);

    switch (textPos) {
      case 'top':
        textElement.style.top = '20px';
        textElement.style.left = '50%';
        textElement.style.transform = 'translateX(-50%)';
        break;
      case 'bottom':
        textElement.style.bottom = '20px';
        textElement.style.left = '50%';
        textElement.style.transform = 'translateX(-50%)';
        break;
      case 'left':
        textElement.style.left = '20px';
        textElement.style.top = '50%';
        textElement.style.transform = 'translateY(-50%)';
        break;
      case 'right':
        textElement.style.right = '20px';
        textElement.style.top = '50%';
        textElement.style.transform = 'translateY(-50%)';
        break;
      case 'custom':
      default:
        // Position par défaut en bas
        textElement.style.bottom = '20px';
        textElement.style.left = '50%';
        textElement.style.transform = 'translateX(-50%)';
        break;
    }

    experimentalContainer.appendChild(textElement);
    console.log('✅ Texte expérimental ajouté au DOM');

    // Lire le texte avec TTS si activé
    if (media.enableTTS) {
      console.log('🔊 TTS activé pour le texte expérimental');
      speakText(media.text);
    }
  }

  // Vérifier que le conteneur est bien visible
  const containerRect = experimentalContainer.getBoundingClientRect();
  const mediaRect = mediaElement.getBoundingClientRect();
  console.log('📦 Container bounding rect:', {
    display: window.getComputedStyle(experimentalContainer).display,
    zIndex: window.getComputedStyle(experimentalContainer).zIndex,
    width: containerRect.width,
    height: containerRect.height
  });
  console.log('📦 Media bounding rect:', {
    width: mediaRect.width,
    height: mediaRect.height,
    left: mediaRect.left,
    top: mediaRect.top,
    display: window.getComputedStyle(mediaElement).display,
    visibility: window.getComputedStyle(mediaElement).visibility
  });

  // Jouer l'audio si présent
  if (media.audio && (media.type === 'image' || media.type === 'gif')) {
    console.log('🎵 Lecture de l\'audio expérimental');
    mediaAudio.src = media.audio.url;
    mediaAudio.play();

    audioTimeout = setTimeout(() => {
      console.log('⏱️ Arrêt de l\'audio (durée écoulée)');
      mediaAudio.pause();
      mediaAudio.src = '';
    }, media.duration || 5000);
  }

  // Auto-hide après durée
  if (media.type === 'image' || media.type === 'gif') {
    console.log('⏱️ Minuteur défini pour', media.duration || 5000, 'ms');
    hideTimeout = setTimeout(() => {
      console.log('⏳ Masquage du média expérimental après durée');
      hideExperimentalOverlay();
    }, media.duration || 5000);
  }
}

function hideExperimentalOverlay() {
  experimentalContainer.style.display = 'none';
  experimentalContainer.innerHTML = '';

  if (audioTimeout) {
    clearTimeout(audioTimeout);
    audioTimeout = null;
  }

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  mediaAudio.pause();
  mediaAudio.src = '';

  // Notifier le processus principal que le média est terminé
  window.electronAPI.mediaEnded();
}

function hideOverlay() {
  // Juste réduire l'opacity, ne pas toucher au display
  container.style.opacity = '0';

  // Clear audio timeout
  if (audioTimeout) {
    clearTimeout(audioTimeout);
    audioTimeout = null;
  }

  // Clear hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // Cacher aussi le conteneur expérimental
  hideExperimentalOverlay();

  setTimeout(() => {
    container.classList.remove('show', 'fullscreen');

    // Stop media
    mediaVideo.pause();
    mediaVideo.src = '';
    mediaAudio.pause();
    mediaAudio.src = '';
    mediaImage.src = '';

    // Clear sender info
    senderInfo.style.display = 'none';
    senderAvatar.src = '';
    senderName.textContent = '';

    currentMedia = null;

    // Notifier le processus principal que le média est terminé
    window.electronAPI.mediaEnded();
  }, 300);
}

// Reaction buttons
reactionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentMedia) return;

    const reaction = btn.dataset.reaction;

    window.electronAPI.reactToMedia({
      mediaId: currentMedia._id,
      senderId: currentMedia.sender._id,
      reaction
    });

    // Visual feedback
    btn.style.transform = 'scale(1.3)';
    setTimeout(() => {
      btn.style.transform = '';
    }, 200);
  });
});

// Écouter l'événement stop-media
window.electronAPI.onStopMedia(() => {
  console.log('🛑 Arrêt forcé du média');
  hideOverlay();
  // Arrêter aussi la synthèse vocale
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
});

// Fonction Text-to-Speech
function speakText(text) {
  // Vérifier si l'API SpeechSynthesis est disponible
  if (!('speechSynthesis' in window)) {
    console.log('❌ TTS non supporté par ce navigateur');
    return;
  }

  // Arrêter toute lecture en cours
  window.speechSynthesis.cancel();

  // Créer l'énoncé
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR'; // Français
  utterance.rate = 1.0; // Vitesse normale
  utterance.pitch = 1.0; // Ton normal
  utterance.volume = 1.0; // Volume maximum

  utterance.onstart = () => {
    console.log('🔊 TTS démarré');
  };

  utterance.onend = () => {
    console.log('✅ TTS terminé');
  };

  utterance.onerror = (event) => {
    console.error('❌ Erreur TTS:', event.error);
  };

  // Lancer la lecture
  window.speechSynthesis.speak(utterance);
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && container.classList.contains('show')) {
    hideOverlay();
  }
});
