// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const translations = {
  en: {
    title: 'Welcome',
    instructions: 'Grant camera permissions and point your camera at the image to see the magic!',
    start: 'Start Camera',
    scanning: 'Looking for the image…',
    lost: 'Point your camera at the image',
    permissionDenied: 'Camera access was denied. Please enable camera permissions in your browser settings and try again.',
    retry: 'Try Again',
  },
  zh: {
    title: '欢迎',
    instructions: '请允许使用摄像头，并将摄像头对准图片，见证奇迹的发生！',
    start: '启动摄像头',
    scanning: '正在寻找图片…',
    lost: '请将摄像头对准图片',
    permissionDenied: '摄像头访问被拒绝。请在浏览器设置中启用摄像头权限后重试。',
    retry: '重试',
  },
  es: {
    title: 'Bienvenido',
    instructions: '¡Concede permiso para usar la cámara y apúntala a la imagen para ver la magia!',
    start: 'Iniciar cámara',
    scanning: 'Buscando la imagen…',
    lost: 'Apunta la cámara hacia la imagen',
    permissionDenied: 'Se denegó el acceso a la cámara. Habilita los permisos de la cámara en la configuración de tu navegador e inténtalo de nuevo.',
    retry: 'Reintentar',
  },
};

function getLang() {
  const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return translations[lang] ? lang : 'en';
}

const t = translations[getLang()];

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (t[key]) el.textContent = t[key];
  });
}

// ---------------------------------------------------------------------------
// Onboarding flow (plain DOM — no A-Frame scene access here)
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();

  const sceneEl = document.querySelector('a-scene');
  const onboardingEl = document.getElementById('onboarding');
  const messageEl = document.getElementById('onboarding-message');
  const statusEl = document.getElementById('onboarding-status');
  const startBtn = document.getElementById('start-btn');
  const hintEl = document.getElementById('hint');

  let started = false;
  let foundOnce = false;

  function setStatus(text) {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
  }

  function showPermissionError() {
    messageEl.textContent = t.permissionDenied;
    setStatus('');
    startBtn.textContent = t.retry;
    startBtn.disabled = false;
    started = false;
  }

  function hideOnboarding() {
    if (foundOnce) return;
    foundOnce = true;
    onboardingEl.classList.add('hidden');
  }

  startBtn.addEventListener('click', () => {
    if (started) return;
    started = true;
    startBtn.disabled = true;
    setStatus(t.scanning);

    // --- iOS / Safari media-engine "unlock" -----------------------------
    // Must happen synchronously inside this user-gesture handler so that
    // play()/pause()/unmute() calls later in the AR session are not blocked
    // by mobile autoplay policies.
    ['video1', 'video2', 'video3', 'video4'].forEach((id) => {
      const video = document.getElementById(id);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => video.pause()).catch(() => {});
      } else {
        video.pause();
      }
    });

    // --- Start MindAR (requests camera via getUserMedia) ----------------
    sceneEl.systems['mindar-image-system'].start();
  });

  sceneEl.addEventListener('camera-error', showPermissionError);

  document.addEventListener('ar-target-found', () => {
    hideOnboarding();
    hintEl.classList.remove('fade-out');
    hintEl.hidden = true;
  });

  document.addEventListener('ar-target-lost', () => {
    if (!foundOnce) return;
    hintEl.hidden = false;
    // allow the element to be in the DOM before transitioning opacity in
    requestAnimationFrame(() => hintEl.classList.remove('fade-out'));
  });
});

// ---------------------------------------------------------------------------
// video-carousel A-Frame component
// All 3D scene manipulation lives here, scoped to the target entity.
// ---------------------------------------------------------------------------
AFRAME.registerComponent('video-carousel', {
  schema: {
    swipeThreshold: { type: 'number', default: 40 },
  },

  init: function () {
    this.mod = (n, m) => ((n % m) + m) % m;
    this.activeIndex = 0;
    this.found = false;

    this.videos = [1, 2, 3, 4, 5].map((i) => document.getElementById(`video${i}`));
    this.slots = Array.from(this.el.querySelectorAll('.carousel-slot'));

    // Target transforms keyed by signed offset from the active slot (-2..+2).
    // +2 and -2 share the same look (they sit directly behind ±1) but mirrored.
    const DEG = Math.PI / 180;
    this.slotConfigs = {
      0: { position: [0, 0, 0.05], rotationY: 0, scale: 1, opacity: 1 },
      1: { position: [0.55, 0, 0], rotationY: -35 * DEG, scale: 0.7, opacity: 0.55 },
      [-1]: { position: [-0.55, 0, 0], rotationY: 35 * DEG, scale: 0.7, opacity: 0.55 },
      2: { position: [0.85, 0, -0.1], rotationY: -50 * DEG, scale: 0.5, opacity: 0.25 },
      [-2]: { position: [-0.85, 0, -0.1], rotationY: 50 * DEG, scale: 0.5, opacity: 0.25 },
    };

    this._targets = this.slots.map(() => null);

    this.onTargetFound = this.onTargetFound.bind(this);
    this.onTargetLost = this.onTargetLost.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);

    this.el.addEventListener('targetFound', this.onTargetFound);
    this.el.addEventListener('targetLost', this.onTargetLost);

    const canvas = this.el.sceneEl.canvas;
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });

    this.layoutCarousel();
  },

  remove: function () {
    this.el.removeEventListener('targetFound', this.onTargetFound);
    this.el.removeEventListener('targetLost', this.onTargetLost);
    const canvas = this.el.sceneEl.canvas;
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchend', this.onTouchEnd);
  },

  onTargetFound: function () {
    this.found = true;
    document.dispatchEvent(new CustomEvent('ar-target-found'));
    this.playActiveVideo();
  },

  onTargetLost: function () {
    this.found = false;
    document.dispatchEvent(new CustomEvent('ar-target-lost'));
    this.pauseAllVideos();
  },

  onTouchStart: function (e) {
    const touch = e.changedTouches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  },

  onTouchEnd: function (e) {
    if (this.touchStartX === undefined) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    if (Math.abs(dx) > this.data.swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault();
      // Swipe left -> reveal next video (index + 1); swipe right -> previous.
      this.setActive(this.mod(this.activeIndex + (dx < 0 ? 1 : -1), this.slots.length));
    }
  },

  setActive: function (newIndex) {
    if (newIndex === this.activeIndex) return;
    this.activeIndex = newIndex;
    this.layoutCarousel();
    if (this.found) this.playActiveVideo();
  },

  // Computes the desired end-state transform for every slot and stores it;
  // tick() interpolates toward these targets every frame.
  layoutCarousel: function () {
    const count = this.slots.length;
    this.slots.forEach((slotEl, i) => {
      // Signed shortest offset in range [-2, +1] for 4 items, then fold +2/-2.
      let offset = this.mod(i - this.activeIndex + 2, count) - 2;
      const cfg = this.slotConfigs[offset] !== undefined
        ? this.slotConfigs[offset]
        : this.slotConfigs[Math.sign(offset) * 2];

      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, cfg.rotationY, 0)
      );

      this._targets[i] = {
        position: new THREE.Vector3(cfg.position[0], cfg.position[1], cfg.position[2]),
        quaternion,
        scale: new THREE.Vector3(cfg.scale, cfg.scale, cfg.scale),
        opacity: cfg.opacity,
      };
    });
  },

  tick: function (time, deltaMs) {
    if (!this._targets) return;
    const dt = deltaMs || 16;
    const k = 1 - Math.exp(-dt / 140); // smooth, frame-rate-independent easing

    this.slots.forEach((slotEl, i) => {
      const target = this._targets[i];
      if (!target) return;

      const obj = slotEl.object3D;
      obj.position.lerp(target.position, k);
      obj.quaternion.slerp(target.quaternion, k);
      obj.scale.lerp(target.scale, k);

      const mesh = slotEl.getObject3D('mesh');
      if (mesh && mesh.material) {
        mesh.material.opacity = THREE.MathUtils.lerp(mesh.material.opacity, target.opacity, k);
      }
    });
  },

  playActiveVideo: function () {
    this.videos.forEach((video, i) => {
      if (i === this.activeIndex) {
        video.muted = false;
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else {
        video.pause();
        video.muted = true;
      }
    });
  },

  // Pause without resetting currentTime so playback resumes where it left
  // off once the target is re-detected (per spec: "pauses", not "restarts").
  pauseAllVideos: function () {
    this.videos.forEach((video) => video.pause());
  },
});
