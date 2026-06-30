/**
 * Core application logic for the Cinematic Spatial Couple Experience.
 * Handles:
 * - IndexedDB Local Database & File Storage
 * - Starfield Background & Zoom Transitions
 * - Hash Routing & Authentication (User & Admin)
 * - Chapter Navigation & UI Interactions
 * - Dynamic Layouts for Universo, Constellation, Museum, Videos, Random Archiver, and Final Stages
 * - Admin Panel operations, including upload, deletion, backups, and configurations
 */

// Global App State
const state = {
  db: null,
  isAuthenticated: false,
  isAdmin: false,
  currentChapter: 'universo', // universo, constelacion, museo, videos, archivo, final
  chapters: ['universo', 'constelacion', 'museo', 'videos', 'archivo', 'final'],
  constellationPan: { x: 0, y: 0 },
  activeAudio: null, // Track currently playing audio to avoid overlaps
  typewriterInterval: null, // Track typewriter interval to prevent text accumulation
  universeTimeout: null, // Timer for the 10-second transition in Universo intro
  currentMuseumIndex: 0, // Índice de la foto activa en la galería 3D del Louvre
};

// Database Initialization
const DB_NAME = 'ConstellationDB';
const DB_VERSION = 1;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error('Database failed to open:', e);
      reject(e);
    };

    request.onsuccess = (e) => {
      state.db = e.target.result;
      console.log('Database initialized successfully.');
      resolve(state.db);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Settings store: final letter, anniversary date, etc.
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Media store: photos/videos for universe, museum, and video gallery
      if (!db.objectStoreNames.contains('media')) {
        const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
        mediaStore.createIndex('section', 'section', { unique: false });
        mediaStore.createIndex('type', 'type', { unique: false });
      }

      // Memories store: constellation stars
      if (!db.objectStoreNames.contains('memories')) {
        db.createObjectStore('memories', { keyPath: 'id' });
      }
    };
  });
}

// Database Helpers
function dbGetSetting(key, defaultValue) {
  return new Promise((resolve) => {
    if (!state.db) return resolve(defaultValue);
    const transaction = state.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : defaultValue);
    request.onerror = () => resolve(defaultValue);
  });
}

function dbSetSetting(key, value) {
  return new Promise((resolve, reject) => {
    if (!state.db) return resolve();
    const transaction = state.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

function dbSaveMedia(mediaObj) {
  return new Promise((resolve, reject) => {
    if (!state.db) return resolve();
    const transaction = state.db.transaction(['media'], 'readwrite');
    const store = transaction.objectStore('media');
    const request = store.put(mediaObj);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

function dbGetAllMedia() {
  return new Promise((resolve) => {
    if (!state.db) return resolve([]);
    const transaction = state.db.transaction(['media'], 'readonly');
    const store = transaction.objectStore('media');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

function dbDeleteMedia(id) {
  return new Promise((resolve, reject) => {
    if (!state.db) return resolve();
    const transaction = state.db.transaction(['media'], 'readwrite');
    const store = transaction.objectStore('media');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

function dbSaveMemory(memoryObj) {
  return new Promise((resolve, reject) => {
    if (!state.db) return resolve();
    const transaction = state.db.transaction(['memories'], 'readwrite');
    const store = transaction.objectStore('memories');
    const request = store.put(memoryObj);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

function dbGetAllMemories() {
  return new Promise((resolve) => {
    if (!state.db) return resolve([]);
    const transaction = state.db.transaction(['memories'], 'readonly');
    const store = transaction.objectStore('memories');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

function dbDeleteMemory(id) {
  return new Promise((resolve, reject) => {
    if (!state.db) return resolve();
    const transaction = state.db.transaction(['memories'], 'readwrite');
    const store = transaction.objectStore('memories');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

// ----------------------------------------------------
// Background Starfield Animation
// ----------------------------------------------------
class Starfield {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.baseNumStars = 250;
    this.speedFactor = 0.3;
    this.zoomMode = false;
    this.zoomProgress = 0;
    this.mouseX = 0;
    this.mouseY = 0;

    this.resize();
    this.initStars();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < this.baseNumStars; i++) {
      this.stars.push(this.createStar());
    }
  }

  createStar(isNew = false) {
    // Distribute stars outwards from center to create a depth feel
    const angle = Math.random() * Math.PI * 2;
    const distance = isNew ? 10 : Math.random() * Math.max(this.canvas.width, this.canvas.height) * 0.8;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      z: Math.random() * 1000 + 100, // Z coordinate represents distance from screen
      size: Math.random() * 1.5 + 0.5,
      color: Math.random() > 0.8 ? '#00f2ff' : '#ffffff',
      alpha: Math.random() * 0.5 + 0.5,
      pulseSpeed: Math.random() * 0.02 + 0.005,
      pulsePhase: Math.random() * Math.PI
    };
  }

  handleMouseMove(e) {
    // Parallax values based on cursor relative to screen center
    this.mouseX = (e.clientX - this.canvas.width / 2) * 0.05;
    this.mouseY = (e.clientY - this.canvas.height / 2) * 0.05;
  }

  triggerZoom() {
    this.zoomMode = true;
    this.zoomProgress = 0;
    gsap.to(this, {
      speedFactor: 25,
      duration: 1.5,
      ease: 'power2.in',
      onComplete: () => {
        gsap.to(this, {
          speedFactor: 0.3,
          duration: 1.5,
          ease: 'power2.out',
          onComplete: () => {
            this.zoomMode = false;
          }
        });
      }
    });
  }

  draw() {
    this.ctx.fillStyle = '#050508';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    this.stars.forEach((star) => {
      // Modify star position based on speed factor
      star.z -= this.speedFactor * 1.5;

      if (star.z <= 0) {
        // Reset star to back of field when it passes the screen
        const newStar = this.createStar(true);
        Object.assign(star, newStar);
        star.z = 1000;
      }

      // Project 3D coordinates onto 2D viewport
      const px = (star.x / star.z) * 500 + centerX + this.mouseX;
      const py = (star.y / star.z) * 500 + centerY + this.mouseY;

      // Filter out off-screen projected coordinates
      if (px >= 0 && px <= this.canvas.width && py >= 0 && py <= this.canvas.height) {
        // Calculate size based on distance Z
        const size = (1 - star.z / 1000) * star.size * 2.5;

        // Calculate pulsating opacity
        star.pulsePhase += star.pulseSpeed;
        let opacity = star.alpha;
        if (!this.zoomMode) {
          opacity += Math.sin(star.pulsePhase) * 0.2;
        }
        opacity = Math.max(0.1, Math.min(1, opacity));

        this.ctx.fillStyle = star.color;
        this.ctx.globalAlpha = opacity;
        
        // Draw star with soft glow if cian
        if (star.color === '#00f2ff' && size > 2) {
          this.ctx.shadowBlur = 8;
          this.ctx.shadowColor = '#00f2ff';
        } else {
          this.ctx.shadowBlur = 0;
        }

        this.ctx.beginPath();
        this.ctx.arc(px, py, Math.max(0.1, size), 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
    requestAnimationFrame(() => this.draw());
  }
}

let globalStarfield;

// ----------------------------------------------------
// Routing & Authentication
// ----------------------------------------------------
function getHash() {
  return window.location.hash.replace(/^#\/?/, '') || '';
}

function checkSession() {
  state.isAuthenticated = true; // Desactivado login temporalmente para pruebas locales
  state.isAdmin = sessionStorage.getItem('admin_auth') === 'true';
}

function handleNavigation() {
  checkSession();
  const route = getHash();

  // Route protection
  if (route.startsWith('admin')) {
    if (route === 'admin') {
      if (state.isAdmin) {
        showSection('admin');
      } else {
        window.location.hash = '#/admin-login';
      }
    } else if (route === 'admin-login') {
      if (state.isAdmin) {
        window.location.hash = '#/admin';
      } else {
        showSection('admin-login');
      }
    }
    return;
  }

  // Experience routing
  if (!state.isAuthenticated) {
    showSection('login');
    window.location.hash = '#/';
    return;
  }

  // Navigate to experience sections
  if (state.chapters.includes(route)) {
    showSection(route);
  } else {
    // Default to universo
    window.location.hash = '#/universo';
  }
}

function showSection(sectionId) {
  // Limpiar temporizador del universo si navegamos a otra sección
  if (state.universeTimeout && sectionId !== 'universo') {
    clearTimeout(state.universeTimeout);
    state.universeTimeout = null;
  }

  // Stop all active audios/videos from previous sections
  stopAllMedia();

  // Controlar los temas de fondo específicos de la sección (Louvre o Cine)
  document.body.classList.remove('theme-museum', 'theme-videos');
  if (sectionId === 'museo') {
    document.body.classList.add('theme-museum');
  } else if (sectionId === 'videos') {
    document.body.classList.add('theme-videos');
  }

  // Atenuar las estrellas del espacio en Museo y Vídeos, mostrarlas en Universo/Constelación/Final
  const showStars = (sectionId === 'universo' || sectionId === 'constelacion' || sectionId === 'final' || sectionId === 'login' || sectionId === '');
  gsap.to('#starfield', { opacity: showStars ? 1 : 0, duration: 1.2 });

  // Update navbar/footer state
  const isExperience = state.chapters.includes(sectionId);
  const header = document.getElementById('experience-header');
  const footer = document.getElementById('experience-nav-controls');
  const tracker = document.getElementById('experience-nav-tracker');

  if (isExperience) {
    header.classList.remove('hidden');
    footer.classList.remove('hidden');
    tracker.classList.remove('hidden');
    state.currentChapter = sectionId;
    updateNavigationControls();
    updateNavigationTracker();
  } else {
    header.classList.add('hidden');
    footer.classList.add('hidden');
    tracker.classList.add('hidden');
  }

  // Trigger hyperspace zoom on transition between chapters
  if (globalStarfield && isExperience) {
    globalStarfield.triggerZoom();
  }

  // Toggle page visibility with fade transitions
  const sections = document.querySelectorAll('.page-section');
  sections.forEach((sec) => {
    if (sec.id === `sec-${sectionId}`) {
      sec.classList.add('active');
      gsap.killTweensOf(sec);
      gsap.fromTo(sec, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.out' });
      // Trigger section entry behaviors
      onSectionEnter(sectionId);
    } else {
      if (sec.classList.contains('active')) {
        gsap.killTweensOf(sec);
        gsap.to(sec, { 
          opacity: 0, 
          duration: 0.5, 
          ease: 'power2.in',
          onComplete: () => {
            sec.classList.remove('active');
          }
        });
      } else {
        sec.classList.remove('active');
        sec.style.opacity = 0; // Restablecer opacidad inline
      }
    }
  });
}

function stopAllMedia() {
  if (state.typewriterInterval) {
    clearInterval(state.typewriterInterval);
    state.typewriterInterval = null;
  }

  if (state.activeAudio) {
    state.activeAudio.pause();
    state.activeAudio = null;
  }
  
  // Pause any audio element on page
  const audios = document.querySelectorAll('audio');
  audios.forEach(a => {
    if (a.id !== 'ambient-audio') {
      a.pause();
    }
  });

  // Pause all playing videos
  const videos = document.querySelectorAll('video');
  videos.forEach(v => {
    v.pause();
    v.src = "";
    v.load();
  });
}

function updateNavigationControls() {
  const prevBtn = document.getElementById('btn-prev-chapter');
  const nextBtn = document.getElementById('btn-next-chapter');
  const currentIndex = state.chapters.indexOf(state.currentChapter);

  if (currentIndex === 0) {
    prevBtn.classList.add('disabled');
  } else {
    prevBtn.classList.remove('disabled');
  }

  // Final page hides the next button, as it is the end of the narrative
  if (currentIndex === state.chapters.length - 1) {
    nextBtn.classList.add('disabled');
  } else {
    nextBtn.classList.remove('disabled');
  }
}

function updateNavigationTracker() {
  const dots = document.querySelectorAll('.nav-dot');
  dots.forEach((dot) => {
    const target = dot.getAttribute('data-target');
    if (target === state.currentChapter) {
      dot.classList.add('bg-neon-cyan', 'border-neon-cyan', 'scale-125');
      dot.classList.remove('bg-transparent', 'border-gray-600');
    } else {
      dot.classList.remove('bg-neon-cyan', 'border-neon-cyan', 'scale-125');
      dot.classList.add('bg-transparent', 'border-gray-600');
    }
  });

  // Mostrar/ocultar flechas arriba/abajo en el tracker lateral
  const currentIndex = state.chapters.indexOf(state.currentChapter);
  const arrowPrev = document.getElementById('tracker-btn-prev');
  const arrowNext = document.getElementById('tracker-btn-next');

  if (arrowPrev) {
    if (currentIndex === 0) {
      arrowPrev.style.visibility = 'hidden';
    } else {
      arrowPrev.style.visibility = 'visible';
    }
  }

  if (arrowNext) {
    if (currentIndex === state.chapters.length - 1) {
      arrowNext.style.visibility = 'hidden';
    } else {
      arrowNext.style.visibility = 'visible';
    }
  }
}

// ----------------------------------------------------
// Dynamic Entry Behaviors for Sections
// ----------------------------------------------------
async function onSectionEnter(sectionId) {
  switch (sectionId) {
    case 'universo':
      setupUniverseSection();
      break;
    case 'constelacion':
      setupConstellationSection();
      break;
    case 'museo':
      setupMuseumSection();
      break;
    case 'videos':
      setupVideoSection();
      break;
    case 'archivo':
      // Clear random container on entry
      document.getElementById('random-memory-container').classList.add('hidden');
      document.getElementById('random-memory-container').innerHTML = '';
      break;
    case 'final':
      setupFinalSection();
      break;
    case 'admin':
      setupAdminDashboard();
      break;
  }
}

// 1. Universo Section
async function setupUniverseSection() {
  if (state.universeTimeout) {
    clearTimeout(state.universeTimeout);
    state.universeTimeout = null;
  }

  const universePhoto = document.getElementById('universe-photo');
  const universePhrase = document.getElementById('universe-phrase');
  const photoFrame = document.getElementById('universe-photo-frame');
  const enterBtn = document.getElementById('btn-enter-constellation');

  // Ocultar botón manual ya que avanza automáticamente
  if (enterBtn) enterBtn.classList.add('hidden');

  // Load Universo details from db
  const media = await dbGetAllMedia();
  const universeItem = media.find(m => m.section === 'universe');

  if (universeItem && universeItem.blob) {
    const url = URL.createObjectURL(universeItem.blob);
    universePhoto.src = url;
  } else {
    universePhoto.src = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600';
  }

  const customPhrase = await dbGetSetting('universe_phrase', 'En un universo infinito, tuve la suerte de coincidir contigo.');
  universePhrase.textContent = `"${customPhrase}"`;

  // Iniciar viaje espacial acelerando y luego desacelerando las estrellas usando una línea de tiempo GSAP
  if (globalStarfield) {
    gsap.killTweensOf(globalStarfield);
    globalStarfield.zoomMode = true;
    
    const tl = gsap.timeline();
    // Acelerar a 18 en 2.5 segundos
    tl.to(globalStarfield, { speedFactor: 18, duration: 2.5, ease: 'power2.in' });
    // Mantener velocidad de 18 por 4.5 segundos (total 7 segundos)
    tl.to(globalStarfield, { speedFactor: 18, duration: 4.5 });
    // Desacelerar de vuelta a 0.3 en 3.0 segundos (total 10 segundos)
    tl.to(globalStarfield, { 
      speedFactor: 0.3, 
      duration: 3.0, 
      ease: 'power2.out',
      onComplete: () => {
        if (globalStarfield) globalStarfield.zoomMode = false;
      }
    });
  }

  // Animar aparición y desaparición cinematográfica
  gsap.killTweensOf([photoFrame, universePhrase]);
  gsap.set([photoFrame, universePhrase], { opacity: 0, scale: 0.8 });

  // Entrada de la foto y la frase
  gsap.to(photoFrame, { opacity: 1, scale: 1, duration: 1.5, delay: 1.5, ease: 'power2.out' });
  gsap.to(universePhrase, { opacity: 1, scale: 1, duration: 1.5, delay: 2.2, ease: 'power2.out' });

  // Salida/desvanecimiento de los elementos del universo
  gsap.to([photoFrame, universePhrase], { opacity: 0, scale: 0.9, duration: 1.5, delay: 8.0, ease: 'power2.in' });

  // Transición automática al siguiente capítulo (Constelación) a los 10 segundos
  state.universeTimeout = setTimeout(() => {
    state.universeTimeout = null;
    window.location.hash = '#/constelacion';
  }, 10000);
}

// 2. Constelación Section (Interactive Starfield Map)
let constellationStars = [];
let draggingConstellation = false;
let startDragX = 0, startDragY = 0;
let dragOffsetX = 0, dragOffsetY = 0;
let selectedStar = null;

async function setupConstellationSection() {
  const canvas = document.getElementById('constellation-canvas');
  const wrapper = document.getElementById('constellation-wrapper');
  
  // Set dimensions based on wrapper size
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;

  // Center coordinate system initially
  dragOffsetX = 0;
  dragOffsetY = 0;

  // Retrieve constellation memory objects from db
  const memories = await dbGetAllMemories();
  
  // Generate coordinates for stars representing memories
  constellationStars = memories.map((mem, index) => {
    // Scatter coordinates in a spiral or orbiting shape around the center
    const angle = (index / memories.length) * Math.PI * 4 + Math.random() * 0.5;
    const radius = 100 + index * 60 + Math.random() * 20;
    return {
      id: mem.id,
      title: mem.title,
      text: mem.text,
      date: mem.date,
      mediaBlob: mem.mediaBlob,
      mediaType: mem.mediaType,
      mediaName: mem.mediaName,
      // Target localized coordinates relative to virtual center
      rx: Math.cos(angle) * radius,
      ry: Math.sin(angle) * radius,
      size: Math.random() * 3 + 4,
      glow: Math.random() * 10 + 5,
      pulseSpeed: Math.random() * 0.05 + 0.02,
      pulsePhase: Math.random() * Math.PI
    };
  });

  // Bind mouse dragging events for map exploration
  wrapper.onmousedown = (e) => {
    draggingConstellation = true;
    startDragX = e.clientX - dragOffsetX;
    startDragY = e.clientY - dragOffsetY;
  };

  window.onmousemove = (e) => {
    if (!draggingConstellation) return;
    dragOffsetX = e.clientX - startDragX;
    dragOffsetY = e.clientY - startDragY;
  };

  window.onmouseup = () => {
    draggingConstellation = false;
  };

  // Bind Touch Events for mobile
  wrapper.ontouchstart = (e) => {
    draggingConstellation = true;
    startDragX = e.touches[0].clientX - dragOffsetX;
    startDragY = e.touches[0].clientY - dragOffsetY;
  };
  wrapper.ontouchmove = (e) => {
    if (!draggingConstellation) return;
    dragOffsetX = e.touches[0].clientX - startDragX;
    dragOffsetY = e.touches[0].clientY - startDragY;
  };
  wrapper.ontouchend = () => {
    draggingConstellation = false;
  };

  // Click / select star on mouse click (no dragging)
  let clickStartX = 0, clickStartY = 0;
  wrapper.addEventListener('pointerdown', (e) => {
    clickStartX = e.clientX;
    clickStartY = e.clientY;
  });

  wrapper.onclick = (e) => {
    // Verify if it's a drag or click
    const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);
    if (dist > 5) return; // Dragged, don't trigger click

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - canvas.width / 2 - dragOffsetX;
    const clickY = e.clientY - rect.top - canvas.height / 2 - dragOffsetY;

    // Check hit star
    let hitStar = null;
    for (let star of constellationStars) {
      const starDist = Math.hypot(star.rx - clickX, star.ry - clickY);
      if (starDist < star.size + 15) { // 15px bounding hitbox padding
        hitStar = star;
        break;
      }
    }

    if (hitStar) {
      openMemoryModal(hitStar);
    }
  };

  // Start internal drawing loop for Constellation
  drawConstellationMap();
}

function drawConstellationMap() {
  const canvas = document.getElementById('constellation-canvas');
  if (!canvas || !document.getElementById('sec-constelacion').classList.contains('active')) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2 + dragOffsetX;
  const cy = canvas.height / 2 + dragOffsetY;

  // 1. Draw dynamic connection constellation lines
  ctx.strokeStyle = 'rgba(0, 242, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < constellationStars.length; i++) {
    const starA = constellationStars[i];
    const ax = starA.rx + cx;
    const ay = starA.ry + cy;

    // Connect sequentially to draw a visual timeline constelation
    if (i < constellationStars.length - 1) {
      const starB = constellationStars[i + 1];
      ctx.lineTo(starB.rx + cx, starB.ry + cy);
    } else if (constellationStars.length > 2) {
      // Close loop or lead to center
      ctx.lineTo(constellationStars[0].rx + cx, constellationStars[0].ry + cy);
    }
  }
  ctx.stroke();

  // Connect stars with neighbors within close proximity for extra grid feeling
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.04)';
  for (let i = 0; i < constellationStars.length; i++) {
    for (let j = i + 1; j < constellationStars.length; j++) {
      const starA = constellationStars[i];
      const starB = constellationStars[j];
      const dist = Math.hypot(starA.rx - starB.rx, starA.ry - starB.ry);
      if (dist < 180) {
        ctx.beginPath();
        ctx.moveTo(starA.rx + cx, starA.ry + cy);
        ctx.lineTo(starB.rx + cx, starB.ry + cy);
        ctx.stroke();
      }
    }
  }

  // 2. Draw stars
  constellationStars.forEach((star) => {
    star.pulsePhase += star.pulseSpeed;
    const pulseScale = 1 + Math.sin(star.pulsePhase) * 0.25;

    const sx = star.rx + cx;
    const sy = star.ry + cy;

    // Outer glow cian/purple
    ctx.shadowBlur = star.glow * pulseScale;
    ctx.shadowColor = star.id === (selectedStar?.id) ? '#ffffff' : '#00f2ff';
    ctx.fillStyle = star.id === (selectedStar?.id) ? '#ffffff' : 'rgba(0, 242, 255, 0.9)';

    // Pulse size
    ctx.beginPath();
    ctx.arc(sx, sy, star.size * pulseScale * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Dibujar el título de la estrella en el mapa de forma más clara y visible
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#000000';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = '500 13px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(star.title, sx, sy - star.size - 12);
    ctx.shadowBlur = 0; // Restaurar shadowBlur
  });

  requestAnimationFrame(drawConstellationMap);
}

function openMemoryModal(star) {
  selectedStar = star;
  stopAllMedia();

  const modal = document.getElementById('memory-modal');
  const title = document.getElementById('memory-title');
  const text = document.getElementById('memory-text');
  const dateSpan = document.getElementById('memory-category');
  const mediaContainer = document.getElementById('memory-media-container');
  const audioPlayer = document.getElementById('memory-audio-player');
  const videoPlayer = document.getElementById('memory-video-player');

  title.textContent = star.title;
  text.textContent = star.text;
  
  // Format Date gracefully
  const formattedDate = star.date ? new Date(star.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Recuerdo Especial';
  dateSpan.textContent = `ESTRELLA DEL RECUERDO • ${formattedDate}`;

  // Media attachments check
  if (star.mediaBlob) {
    mediaContainer.classList.remove('hidden');
    const mediaUrl = URL.createObjectURL(star.mediaBlob);

    if (star.mediaType.startsWith('video/')) {
      videoPlayer.classList.remove('hidden');
      audioPlayer.classList.add('hidden');
      const videoEl = document.getElementById('memory-video-element');
      videoEl.src = mediaUrl;
    } else if (star.mediaType.startsWith('audio/')) {
      audioPlayer.classList.remove('hidden');
      videoPlayer.classList.add('hidden');
      const audioEl = document.getElementById('memory-audio-element');
      audioEl.src = mediaUrl;
      
      // Bind audio controls
      const playBtn = document.getElementById('btn-memory-play');
      const progressBar = document.getElementById('audio-progress-bar');
      progressBar.style.width = '0%';
      playBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';

      playBtn.onclick = () => {
        if (audioEl.paused) {
          audioEl.play();
          playBtn.innerHTML = '<i class="fas fa-pause"></i>';
          state.activeAudio = audioEl;
        } else {
          audioEl.pause();
          playBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';
        }
      };

      audioEl.ontimeupdate = () => {
        const percent = (audioEl.currentTime / audioEl.duration) * 100;
        progressBar.style.width = `${percent}%`;
      };

      audioEl.onended = () => {
        playBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';
        progressBar.style.width = '0%';
      };
    }
  } else {
    mediaContainer.classList.add('hidden');
    audioPlayer.classList.add('hidden');
    videoPlayer.classList.add('hidden');
  }

  // Animate open modal
  modal.classList.remove('hidden');
  const innerModal = modal.querySelector('.glass-premium');
  gsap.fromTo(innerModal, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.2)' });
}

function closeMemoryModal() {
  const modal = document.getElementById('memory-modal');
  const innerModal = modal.querySelector('.glass-premium');
  
  stopAllMedia();
  selectedStar = null;

  gsap.to(innerModal, {
    scale: 0.9,
    opacity: 0,
    duration: 0.3,
    ease: 'power2.in',
    onComplete: () => {
      modal.classList.add('hidden');
    }
  });
}

// 3. Museo Section (Louvre Museum 3D Square Room version)
const DEFAULT_MUSEUM_PHOTOS = [
  {
    id: 'default-museum-1',
    name: 'El Comienzo del Viaje',
    url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=800',
    section: 'museum',
    type: 'image/jpeg'
  },
  {
    id: 'default-museum-2',
    name: 'Noches Bajo las Estrellas',
    url: 'https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=800',
    section: 'museum',
    type: 'image/jpeg'
  },
  {
    id: 'default-museum-3',
    name: 'Un Destello en el Infinito',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800',
    section: 'museum',
    type: 'image/jpeg'
  },
  {
    id: 'default-museum-4',
    name: 'Explorando Mundos Nuevos',
    url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=800',
    section: 'museum',
    type: 'image/jpeg'
  },
  {
    id: 'default-museum-5',
    name: 'Nuestra Constelación',
    url: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=800',
    section: 'museum',
    type: 'image/jpeg'
  }
];

async function setupMuseumSection() {
  const grid = document.getElementById('museum-gallery-grid');
  grid.innerHTML = '';

  const media = await dbGetAllMedia();
  // Filter for museum photo assets
  let museumPhotos = media.filter(m => m.section === 'museum' && m.type.startsWith('image/')).slice(0, 50);

  // Use fallback photos if database is empty
  if (museumPhotos.length === 0) {
    museumPhotos = DEFAULT_MUSEUM_PHOTOS;
  }

  state.museumPhotos = museumPhotos;

  state.currentMuseumIndex = 0; // Iniciar siempre en la primera foto al cargar el museo

  const controls = document.querySelector('.louvre-controls');
  if (controls) {
    if (museumPhotos.length === 0) {
      controls.classList.add('hidden');
    } else {
      controls.classList.remove('hidden');
    }
  }

  if (museumPhotos.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center text-gray-500 font-light py-12">No hay fotos en el museo aún. Sube fotos desde el panel de administración.</div>';
    return;
  }

  // Generar las 4 paredes del salón cuadrado 3D
  for (let i = 0; i < 4; i++) {
    const wall = document.createElement('div');
    wall.className = 'museum-wall-3d';
    wall.setAttribute('data-wall', i);
    grid.appendChild(wall);
  }

  // Enlazar los botones de navegación (giro de 90 grados de la cámara)
  const btnPrev = document.getElementById('btn-louvre-prev');
  const btnNext = document.getElementById('btn-louvre-next');

  if (btnPrev) {
    btnPrev.onclick = () => {
      const totalPhotos = state.museumPhotos.length;
      const activePhotoIndex = (state.currentMuseumIndex % totalPhotos + totalPhotos) % totalPhotos;
      if (activePhotoIndex === 0) {
        window.location.hash = '#/constelacion';
      } else {
        state.currentMuseumIndex--;
        updateSquareRoom3D();
      }
    };
  }

  if (btnNext) {
    btnNext.onclick = () => {
      const totalPhotos = state.museumPhotos.length;
      const activePhotoIndex = (state.currentMuseumIndex % totalPhotos + totalPhotos) % totalPhotos;
      if (activePhotoIndex === totalPhotos - 1) {
        window.location.hash = '#/videos';
      } else {
        state.currentMuseumIndex++;
        updateSquareRoom3D();
      }
    };
  }

  // Renderizar la orientación inicial y contenidos 3D
  updateSquareRoom3D();
}

function updateSquareRoom3D() {
  const grid = document.getElementById('museum-gallery-grid');
  if (!grid) return;

  const museumPhotos = state.museumPhotos || [];
  const totalPhotos = museumPhotos.length;
  if (totalPhotos === 0) return;

  const currentIndex = state.currentMuseumIndex;
  
  // Girar la habitación y desplazar en Z para situar al usuario dentro
  // Invertido el signo del ángulo para que avanzar (Siguiente) rote la habitación hacia la derecha (90)
  const rotateAngle = currentIndex * 90;
  grid.style.transform = `translate3d(0, 0, 32vw) rotateY(${rotateAngle}deg)`;

  // Obtener el índice real de la foto activa actual
  const activePhotoIndex = (currentIndex % totalPhotos + totalPhotos) % totalPhotos;

  // Actualizar el tracker numérico
  const tracker = document.getElementById('louvre-index-tracker');
  if (tracker) {
    tracker.textContent = `Obra ${activePhotoIndex + 1} de ${totalPhotos}`;
  }

  // Actualizar el contenido de las 4 paredes
  const walls = grid.querySelectorAll('.museum-wall-3d');
  if (walls.length === 4) {
    // offsets para las 4 paredes según la dirección de giro invertida:
    const offsets = [0, 1, 2, -1];
    for (let d of offsets) {
      const photoGlobalIndex = currentIndex + d;
      const w_target = (4 - photoGlobalIndex % 4 + 4) % 4;
      const wall = walls[w_target];

      const photoIndex = (photoGlobalIndex % totalPhotos + totalPhotos) % totalPhotos;
      const photo = museumPhotos[photoIndex];

      updateWallContent(wall, photo, w_target);
    }
  }
}

function updateWallContent(wall, photo, wallIndex) {
  // Solo recrear si el contenido ha cambiado para optimizar, o simplemente limpiar y reconstruir
  wall.innerHTML = '';

  if (photo) {
    const frame = document.createElement('div');
    frame.className = 'museum-frame-3d';
    frame.setAttribute('data-index', wallIndex);

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'museum-img-wrapper-3d';

    const img = document.createElement('img');
    img.className = 'museum-img-3d';
    img.loading = 'lazy';
    if (photo.blob) {
      img.src = URL.createObjectURL(photo.blob);
    } else if (photo.url) {
      img.src = photo.url;
    }

    imgWrapper.appendChild(img);
    frame.appendChild(imgWrapper);

    // Crear y añadir el título del recuerdo debajo de la foto dentro del marco
    const titleEl = document.createElement('div');
    titleEl.className = 'museum-frame-title-3d';
    titleEl.textContent = photo.name.length > 25 ? photo.name.slice(0, 22) + '...' : photo.name;
    frame.appendChild(titleEl);

    // Icono de micrófono si cuenta con grabación de voz asociada
    if (photo.associatedAudioId) {
      const audioBadge = document.createElement('div');
      audioBadge.className = 'absolute top-3 right-3 w-7 h-7 rounded-full bg-neon-cyan text-space flex items-center justify-center shadow-lg text-[10px] z-10';
      audioBadge.innerHTML = '<i class="fas fa-microphone"></i>';
      frame.appendChild(audioBadge);
    }

    // Interacciones: zoom en el activo del centro, rotación del salón al hacer clic en los laterales
    frame.onclick = (e) => {
      e.stopPropagation();
      const activeWallIndex = (4 - state.currentMuseumIndex % 4 + 4) % 4;
      if (activeWallIndex === wallIndex) {
        openLightbox(photo);
      } else {
        const diff = (activeWallIndex - wallIndex + 4) % 4;
        if (diff === 1) {
          state.currentMuseumIndex++;
        } else if (diff === 3) {
          state.currentMuseumIndex--;
        } else if (diff === 2) {
          state.currentMuseumIndex += 2;
        }
        updateSquareRoom3D();
      }
    };

    wall.appendChild(frame);
  } else {
    // Si no hay foto cargada, renderizar un marco vacío elegante
    const emptyFrame = document.createElement('div');
    emptyFrame.className = 'museum-frame-3d opacity-45';

    const placeholder = document.createElement('div');
    placeholder.className = 'empty-frame-placeholder';
    placeholder.innerHTML = `
      <i class="fas fa-heart text-2xl text-neon-purple/50 mb-2"></i>
      <span class="text-[9px] uppercase tracking-widest block font-semibold text-neon-cyan/70">Espacio Reservado</span>
      <span class="text-[8px] text-gray-500 block mt-1">Sube un recuerdo desde el panel</span>
    `;

    emptyFrame.appendChild(placeholder);
    wall.appendChild(emptyFrame);
  }
}

function openLightbox(photo) {
  stopAllMedia();
  const lightbox = document.getElementById('museum-lightbox');
  const img = document.getElementById('lightbox-img');
  const audioPlayer = document.getElementById('lightbox-audio-player');
  const audioEl = document.getElementById('lightbox-audio-element');

  if (photo.blob) {
    img.src = URL.createObjectURL(photo.blob);
  } else if (photo.url) {
    img.src = photo.url;
  }

  // If photo has associated audio
  if (photo.associatedAudioId) {
    // Find associated audio file in DB
    const request = state.db.transaction(['media'], 'readonly').objectStore('media').get(photo.associatedAudioId);
    request.onsuccess = () => {
      const audioItem = request.result;
      if (audioItem && audioItem.blob) {
        audioPlayer.classList.remove('hidden');
        audioEl.src = URL.createObjectURL(audioItem.blob);

        const playBtn = document.getElementById('btn-lightbox-play');
        playBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';
        
        playBtn.onclick = () => {
          if (audioEl.paused) {
            audioEl.play();
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            state.activeAudio = audioEl;
          } else {
            audioEl.pause();
            playBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';
          }
        };

        audioEl.onended = () => {
          playBtn.innerHTML = '<i class="fas fa-play ml-1"></i>';
        };
      } else {
        audioPlayer.classList.add('hidden');
      }
    };
  } else {
    audioPlayer.classList.add('hidden');
  }

  lightbox.classList.remove('hidden');
  const content = lightbox.querySelector('.lightbox-content');
  gsap.fromTo(content, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'power3.out' });
}

function closeLightbox() {
  const lightbox = document.getElementById('museum-lightbox');
  if (!lightbox) return;

  try {
    stopAllMedia();
  } catch (e) {
    console.error(e);
  }

  const content = lightbox.querySelector('.lightbox-content');
  if (content && typeof gsap !== 'undefined') {
    gsap.to(content, {
      scale: 0.95,
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        lightbox.classList.add('hidden');
      }
    });
  } else {
    lightbox.classList.add('hidden');
  }
}

// 4. Galería de Vídeos Section (Netflix Grid)
async function setupVideoSection() {
  const grid = document.getElementById('video-gallery-grid');
  grid.innerHTML = '';

  const media = await dbGetAllMedia();
  const videos = media.filter(m => m.section === 'video-gallery' && m.type.startsWith('video/')).slice(0, 24);

  if (videos.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center text-gray-500 font-light py-12">No hay vídeos cargados aún. Configúralos en el panel de administración.</div>';
    return;
  }

  videos.forEach((video) => {
    const card = document.createElement('div');
    card.className = 'video-card group';

    // Generates a mock canvas thumbnail to avoid blank states
    const thumb = document.createElement('div');
    thumb.className = 'w-full h-full bg-slate-950 flex flex-col items-center justify-center absolute inset-0';
    thumb.innerHTML = `
      <i class="fas fa-play text-4xl text-white/40 group-hover:text-neon-cyan group-hover:scale-110 transition-all duration-300"></i>
      <span class="text-[9px] uppercase tracking-wider text-gray-600 mt-3">Ver Vídeo</span>
    `;

    const info = document.createElement('div');
    info.className = 'video-info';
    info.innerHTML = `
      <h4 class="text-sm font-semibold text-white truncate">${video.name}</h4>
      <p class="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">Capítulo Movimiento</p>
    `;

    card.appendChild(thumb);
    card.appendChild(info);

    card.onclick = () => {
      openTheater(video);
    };

    grid.appendChild(card);
  });

  // Increíble animación de aparición suave y escalado (pop-in) tipo cartelera de cine
  gsap.fromTo('.video-card', 
    { opacity: 0, scale: 0.9, y: 30 }, 
    { opacity: 1, scale: 1, y: 0, duration: 0.8, stagger: 0.05, ease: 'back.out(1.2)' }
  );
}

function openTheater(video) {
  stopAllMedia();
  const lightbox = document.getElementById('theater-lightbox');
  const videoEl = document.getElementById('theater-video-element');

  videoEl.src = URL.createObjectURL(video.blob);
  lightbox.classList.remove('hidden');
  videoEl.play();
  
  const content = lightbox.querySelector('.lightbox-content');
  gsap.fromTo(content, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'power3.out' });
}

function closeTheater() {
  const lightbox = document.getElementById('theater-lightbox');
  const content = lightbox.querySelector('.lightbox-content');

  stopAllMedia();

  gsap.to(content, {
    scale: 0.95,
    opacity: 0,
    duration: 0.3,
    ease: 'power2.in',
    onComplete: () => {
      lightbox.classList.add('hidden');
    }
  });
}

// 5. Archivo Aleatorio (Memory Generator Orb)
async function triggerRandomMemory() {
  const container = document.getElementById('random-memory-container');
  container.classList.remove('hidden');
  container.innerHTML = '<div class="text-neon-cyan animate-spin"><i class="fas fa-atom text-2xl"></i></div>';

  // Gather all items from media and memories
  const media = await dbGetAllMedia();
  const memories = await dbGetAllMemories();

  // Combine eligible items
  const allPool = [];

  // Exclude universe photo, it is only for intro
  media.forEach(m => {
    if (m.section !== 'universe') {
      allPool.push({ type: 'media', item: m });
    }
  });

  memories.forEach(m => {
    allPool.push({ type: 'memory', item: m });
  });

  if (allPool.length === 0) {
    container.innerHTML = '<span class="text-gray-500 text-xs font-light">No hay ningún recuerdo almacenado en el sistema todavía.</span>';
    return;
  }

  // Animate Orb explosion
  const orb = document.getElementById('btn-generate-random').querySelector('.w-32');
  gsap.fromTo(orb, { scale: 1 }, { scale: 1.15, duration: 0.2, yoyo: true, repeat: 1 });

  // Delay for cinematic suspense
  setTimeout(() => {
    const pick = allPool[Math.floor(Math.random() * allPool.length)];
    renderRandomPick(pick, container);
  }, 600);
}

function renderRandomPick(pick, container) {
  container.innerHTML = '';
  stopAllMedia();

  if (pick.type === 'media') {
    const item = pick.item;
    const url = URL.createObjectURL(item.blob);

    if (item.type.startsWith('image/')) {
      // Photo rendering
      container.innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full">
          <img class="max-h-[300px] object-contain rounded border border-white/10" src="${url}">
          <span class="text-xs uppercase tracking-widest text-gray-400">Una foto del Museo</span>
        </div>
      `;
    } else if (item.type.startsWith('video/')) {
      // Video rendering
      container.innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full">
          <video class="w-full max-h-[300px] rounded-lg" controls src="${url}"></video>
          <span class="text-xs uppercase tracking-widest text-gray-400">Vídeo: ${item.name}</span>
        </div>
      `;
    } else if (item.type.startsWith('audio/')) {
      // Audio rendering
      container.innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full p-4">
          <div class="w-16 h-16 rounded-full bg-neon-purple/20 flex items-center justify-center text-neon-purple text-2xl border border-neon-purple/30">
            <i class="fas fa-microphone"></i>
          </div>
          <audio controls src="${url}"></audio>
          <span class="text-xs uppercase tracking-widest text-gray-400">Nota de Audio: ${item.name}</span>
        </div>
      `;
    }
  } else if (pick.type === 'memory') {
    const item = pick.item;
    let mediaHTML = '';
    if (item.mediaBlob) {
      const url = URL.createObjectURL(item.mediaBlob);
      if (item.mediaType.startsWith('video/')) {
        mediaHTML = `<video class="w-full max-h-[150px] rounded-lg mt-3" controls src="${url}"></video>`;
      } else {
        mediaHTML = `<audio class="mt-3 w-full" controls src="${url}"></audio>`;
      }
    }

    container.innerHTML = `
      <div class="flex flex-col text-center p-4">
        <span class="text-[10px] uppercase tracking-widest text-neon-cyan">Recuerdo de la Constelación</span>
        <h4 class="serif-title text-2xl text-white mt-1 mb-2">${item.title}</h4>
        <p class="text-xs text-gray-300 font-light leading-relaxed max-w-sm mx-auto">${item.text}</p>
        ${mediaHTML}
      </div>
    `;
  }

  // Fade-in dynamic random layout
  gsap.fromTo(container, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 });
}

// 6. Final Section (Colliding Stars, Letter & Count)
let relationshipInterval = null;

async function setupFinalSection() {
  stopAllMedia();
  clearInterval(relationshipInterval);

  // Show Stage 1
  document.getElementById('final-stage-collide').classList.remove('hidden');
  document.getElementById('final-stage-video').classList.add('hidden');
  document.getElementById('final-stage-letter').classList.add('hidden');
}

async function triggerStarsCollision() {
  // Trigger transition: fade out stage 1
  gsap.to('#final-stage-collide', {
    opacity: 0,
    duration: 0.5,
    onComplete: async () => {
      document.getElementById('final-stage-collide').classList.add('hidden');
      document.getElementById('final-stage-collide').style.opacity = 1;

      // Check if there is a final video upload in database settings
      const media = await dbGetAllMedia();
      const finalVideoItem = media.find(m => m.section === 'video-gallery' && m.type.startsWith('video/'));

      if (finalVideoItem && finalVideoItem.blob) {
        // Show stage 2 (Video player)
        const stageVideo = document.getElementById('final-stage-video');
        const videoEl = document.getElementById('final-video-element');
        
        stageVideo.classList.remove('hidden');
        videoEl.src = URL.createObjectURL(finalVideoItem.blob);
        videoEl.play();

        videoEl.onended = () => {
          transitionToFinalLetter();
        };
      } else {
        // Skip video, go to letter directly
        transitionToFinalLetter();
      }
    }
  });
}

async function transitionToFinalLetter() {
  stopAllMedia();
  
  gsap.to('#final-stage-video', {
    opacity: 0,
    duration: 0.5,
    onComplete: async () => {
      document.getElementById('final-stage-video').classList.add('hidden');
      document.getElementById('final-stage-video').style.opacity = 1;

      const stageLetter = document.getElementById('final-stage-letter');
      stageLetter.classList.remove('hidden');
      
      const letterText = document.getElementById('final-letter-text');
      letterText.textContent = '';

      // Get configuration details
      const rawDate = await dbGetSetting('anniversary_date', '2026-05-14T00:00');
      const letterContent = await dbGetSetting('final_letter', 'Mi amor,\n\nDesde el primer día que cruzamos miradas, supe que nuestra historia se escribiría en las estrellas. Cada risa, cada viaje, cada pequeño momento a tu lado ha formado una constelación de recuerdos que atesoraré para siempre. Gracias por ser mi puerto seguro en este inmenso universo.\n\nTe amo hoy, mañana y hasta el fin del tiempo.\n\nManuel');

      // Typewriter writing animation
      typewriterAnimation(letterContent, letterText);

      // Start tick anniversary counter
      startAnniversaryCounter(rawDate);
    }
  });
}

function typewriterAnimation(text, element) {
  let index = 0;
  element.textContent = '';
  
  if (state.typewriterInterval) {
    clearInterval(state.typewriterInterval);
  }
  
  // Set blink class
  element.classList.add('cursor-blink');

  state.typewriterInterval = setInterval(() => {
    if (index < text.length) {
      element.textContent += text.charAt(index);
      index++;
    } else {
      clearInterval(state.typewriterInterval);
      state.typewriterInterval = null;
      element.classList.remove('cursor-blink');
    }
  }, 40); // 40ms speed typing
}

function startAnniversaryCounter(rawDate) {
  clearInterval(relationshipInterval);
  const anniversary = new Date(rawDate);

  function update() {
    const now = new Date();
    let diff = now.getTime() - anniversary.getTime();
    
    // Check if anniversary is in the future
    let isInFuture = diff < 0;
    diff = Math.abs(diff);

    // Calculate details
    let seconds = Math.floor(diff / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);

    // Dynamic month/year estimation
    let years = Math.floor(days / 365);
    let remDays = days % 365;
    let months = Math.floor(remDays / 30);
    let finalDays = remDays % 30;

    document.getElementById('counter-years').textContent = String(years).padStart(2, '0');
    document.getElementById('counter-months').textContent = String(months).padStart(2, '0');
    document.getElementById('counter-days').textContent = String(finalDays).padStart(2, '0');
    document.getElementById('counter-hours').textContent = String(hours % 24).padStart(2, '0');
    document.getElementById('counter-minutes').textContent = String(minutes % 60).padStart(2, '0');
    document.getElementById('counter-seconds').textContent = String(seconds % 60).padStart(2, '0');
  }

  update();
  relationshipInterval = setInterval(update, 1000);
}

// ----------------------------------------------------
// Admin Panel Functions & Operations
// ----------------------------------------------------
let activeAdminTab = 'media';

function setupAdminDashboard() {
  // Reset tabs
  switchAdminTab('media');
  // Load list elements
  loadAdminItems();
  // Sync statistics
  syncAdminStatistics();
}

function switchAdminTab(tabName) {
  activeAdminTab = tabName;
  const tabMedia = document.getElementById('tab-btn-media');
  const tabMemory = document.getElementById('tab-btn-memory');
  const tabSystem = document.getElementById('tab-btn-system');
  
  const formMedia = document.getElementById('admin-media-form');
  const formMemory = document.getElementById('admin-memory-form');
  const panelSystem = document.getElementById('admin-system-settings');

  [tabMedia, tabMemory, tabSystem].forEach(b => b.className = 'text-xs uppercase tracking-wider font-semibold text-gray-400 hover:text-white pb-2 px-2 transition-colors');
  [formMedia, formMemory, panelSystem].forEach(f => f.classList.add('hidden'));

  if (tabName === 'media') {
    tabMedia.className = 'text-xs uppercase tracking-wider font-semibold text-neon-cyan border-b-2 border-neon-cyan pb-2 px-2';
    formMedia.classList.remove('hidden');
  } else if (tabName === 'memory') {
    tabMemory.className = 'text-xs uppercase tracking-wider font-semibold text-neon-cyan border-b-2 border-neon-cyan pb-2 px-2';
    formMemory.classList.remove('hidden');
  } else if (tabName === 'system') {
    tabSystem.className = 'text-xs uppercase tracking-wider font-semibold text-neon-cyan border-b-2 border-neon-cyan pb-2 px-2';
    panelSystem.classList.remove('hidden');
    loadSystemConfigurations();
  }
}

async function loadSystemConfigurations() {
  const finalLetter = await dbGetSetting('final_letter', '');
  const anniversaryDate = await dbGetSetting('anniversary_date', '');
  
  document.getElementById('final-letter-input').value = finalLetter;
  document.getElementById('anniversary-date-input').value = anniversaryDate;
}

async function saveFinalSettings() {
  const finalLetter = document.getElementById('final-letter-input').value;
  const anniversaryDate = document.getElementById('anniversary-date-input').value;

  await dbSetSetting('final_letter', finalLetter);
  await dbSetSetting('anniversary_date', anniversaryDate);

  alert('Configuración final guardada correctamente.');
}

// Media upload operations
async function handleMediaUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('media-files');
  const sectionSelect = document.getElementById('media-section');
  const audioInput = document.getElementById('museum-audio-file');

  const files = fileInput.files;
  const section = sectionSelect.value;

  if (files.length === 0) return;

  // Pre-validating limit checks
  const existingMedia = await dbGetAllMedia();
  
  if (section === 'universe' && files.length > 1) {
    alert('La sección Universo solo permite 1 foto clave.');
    return;
  }
  if (section === 'universe') {
    const oldUniverse = existingMedia.filter(m => m.section === 'universe');
    // Clear old universe items if uploading a new one
    for (let u of oldUniverse) {
      await dbDeleteMedia(u.id);
    }
  }

  if (section === 'museum') {
    const currentCount = existingMedia.filter(m => m.section === 'museum').length;
    if (currentCount + files.length > 50) {
      alert(`Supera el límite de 50 fotos en el Museo. Espacio disponible: ${50 - currentCount}`);
      return;
    }
  }

  if (section === 'video-gallery') {
    const currentCount = existingMedia.filter(m => m.section === 'video-gallery').length;
    if (currentCount + files.length > 24) {
      alert(`Supera el límite de 24 vídeos en la Galería. Espacio disponible: ${24 - currentCount}`);
      return;
    }
  }

  // Handle voice message upload for museum photo
  let associatedAudioId = null;
  if (section === 'museum' && audioInput.files.length > 0) {
    const audioFile = audioInput.files[0];
    const audioId = 'audio_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    await dbSaveMedia({
      id: audioId,
      name: audioFile.name,
      type: audioFile.type,
      section: 'associated-audio',
      blob: audioFile,
      createdAt: Date.now()
    });
    associatedAudioId = audioId;
  }

  for (let file of files) {
    const fileId = (file.type.startsWith('video/') ? 'video_' : 'photo_') + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    await dbSaveMedia({
      id: fileId,
      name: file.name,
      type: file.type,
      section: section,
      blob: file,
      associatedAudioId: associatedAudioId,
      createdAt: Date.now()
    });
  }

  // Reset forms
  fileInput.value = '';
  audioInput.value = '';
  
  alert('Archivos subidos y guardados con éxito.');
  loadAdminItems();
  syncAdminStatistics();
}

async function handleMemoryCreation(e) {
  e.preventDefault();
  const title = document.getElementById('memory-form-title').value;
  const date = document.getElementById('memory-form-date').value;
  const text = document.getElementById('memory-form-text').value;
  const mediaInput = document.getElementById('memory-form-media');

  let mediaBlob = null;
  let mediaType = null;
  let mediaName = null;

  if (mediaInput.files.length > 0) {
    const file = mediaInput.files[0];
    mediaBlob = file;
    mediaType = file.type;
    mediaName = file.name;
  }

  const memoryId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  await dbSaveMemory({
    id: memoryId,
    title,
    date,
    text,
    mediaBlob,
    mediaType,
    mediaName,
    createdAt: Date.now()
  });

  // Reset form
  document.getElementById('admin-memory-form').reset();

  alert('Recuerdo guardado y estrella añadida.');
  loadAdminItems();
  syncAdminStatistics();
}

let adminFilter = 'all';

async function loadAdminItems() {
  const container = document.getElementById('admin-items-list');
  container.innerHTML = '<div class="text-center py-6 text-gray-500"><i class="fas fa-spinner animate-spin"></i> Cargando...</div>';

  const media = await dbGetAllMedia();
  const memories = await dbGetAllMemories();

  let items = [];

  media.forEach(m => {
    if (m.section !== 'associated-audio') { // Ignore auxiliary audios from direct list
      items.push({ type: 'media', category: m.section, details: m });
    }
  });

  memories.forEach(mem => {
    items.push({ type: 'memory', category: 'timeline', details: mem });
  });

  // Apply filters
  if (adminFilter !== 'all') {
    items = items.filter(i => i.category === adminFilter);
  }

  // Sort by date (newest first)
  items.sort((a, b) => b.details.createdAt - a.details.createdAt);

  if (items.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-gray-600 text-xs font-light">No hay elementos almacenados que coincidan con el filtro.</div>';
    return;
  }

  container.innerHTML = '';
  items.forEach(item => {
    const itemCard = document.createElement('div');
    itemCard.className = 'flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-lg text-xs hover:border-white/20 transition-all';

    let itemTitle = '';
    let itemBadge = '';
    let previewHTML = '';

    if (item.type === 'media') {
      const details = item.details;
      itemTitle = details.name;
      itemBadge = `MEDIA • ${details.section.toUpperCase()}`;

      if (details.type.startsWith('image/')) {
        const url = URL.createObjectURL(details.blob);
        previewHTML = `<img src="${url}" class="w-12 h-12 object-cover rounded border border-white/10">`;
      } else {
        previewHTML = `<div class="w-12 h-12 rounded bg-black/40 flex items-center justify-center text-neon-cyan"><i class="fas fa-video"></i></div>`;
      }
    } else {
      const details = item.details;
      itemTitle = details.title;
      itemBadge = `ESTRELLA • CONSTELACIÓN`;
      previewHTML = `<div class="w-12 h-12 rounded bg-neon-purple/20 flex items-center justify-center text-neon-purple"><i class="fas fa-star"></i></div>`;
    }

    itemCard.innerHTML = `
      <div class="flex items-center gap-3">
        ${previewHTML}
        <div>
          <span class="text-[9px] font-semibold tracking-wider text-neon-cyan uppercase block">${itemBadge}</span>
          <span class="text-white font-medium block truncate max-w-[200px] sm:max-w-xs">${itemTitle}</span>
        </div>
      </div>
      <button class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="Borrar elemento">
        <i class="fas fa-trash-alt"></i>
      </button>
    `;

    itemCard.querySelector('button').onclick = async () => {
      if (confirm('¿Seguro que deseas eliminar este elemento permanentemente?')) {
        if (item.type === 'media') {
          // If museum photo has voice associated, delete voice asset too
          if (item.details.associatedAudioId) {
            await dbDeleteMedia(item.details.associatedAudioId);
          }
          await dbDeleteMedia(item.details.id);
        } else {
          await dbDeleteMemory(item.details.id);
        }
        loadAdminItems();
        syncAdminStatistics();
      }
    };

    container.appendChild(itemCard);
  });
}

async function syncAdminStatistics() {
  const media = await dbGetAllMedia();
  const memories = await dbGetAllMemories();

  const universeCount = media.filter(m => m.section === 'universe').length;
  const museumCount = media.filter(m => m.section === 'museum').length;
  const videoCount = media.filter(m => m.section === 'video-gallery').length;
  const memoryCount = memories.length;

  document.getElementById('stat-universe').textContent = universeCount > 0 ? 'Foto configurada' : 'No configurada';
  document.getElementById('stat-museum-count').textContent = museumCount;
  document.getElementById('stat-video-count').textContent = videoCount;
  document.getElementById('stat-memory-count').textContent = `${memoryCount} creados`;
}

// Backup Manager
async function exportBackup() {
  const media = await dbGetAllMedia();
  const memories = await dbGetAllMemories();
  
  // Read database configurations
  const finalLetter = await dbGetSetting('final_letter', '');
  const anniversaryDate = await dbGetSetting('anniversary_date', '');

  // Helper function to serialize blob into Base64 string for JSON transfer
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const backupData = {
    settings: { finalLetter, anniversaryDate },
    media: [],
    memories: []
  };

  alert('Preparando copia de seguridad. Esto puede tardar un momento si has subido muchos vídeos o fotos...');

  for (let m of media) {
    let b64 = '';
    if (m.blob) {
      b64 = await blobToBase64(m.blob);
    }
    backupData.media.push({
      id: m.id,
      name: m.name,
      type: m.type,
      section: m.section,
      associatedAudioId: m.associatedAudioId,
      createdAt: m.createdAt,
      base64Blob: b64
    });
  }

  for (let mem of memories) {
    let b64 = '';
    if (mem.mediaBlob) {
      b64 = await blobToBase64(mem.mediaBlob);
    }
    backupData.memories.push({
      id: mem.id,
      title: mem.title,
      date: mem.date,
      text: mem.text,
      mediaName: mem.mediaName,
      mediaType: mem.mediaType,
      createdAt: mem.createdAt,
      base64Blob: b64
    });
  }

  // Create JSON download link
  const jsonStr = JSON.stringify(backupData);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_constelacion_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  alert('Copia de seguridad descargada exitosamente.');
}

async function importBackup(e) {
  const fileInput = document.getElementById('backup-file-input');
  if (fileInput.files.length === 0) {
    alert('Por favor selecciona un archivo JSON de copia de seguridad.');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.settings || !data.media || !data.memories) {
        throw new Error('Formato de copia de seguridad inválido.');
      }

      const base64ToBlob = (b64Data) => {
        const parts = b64Data.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType });
      };

      alert('Restaurando elementos en la base de datos local...');

      // Save Configurations
      if (data.settings.finalLetter) await dbSetSetting('final_letter', data.settings.finalLetter);
      if (data.settings.anniversaryDate) await dbSetSetting('anniversary_date', data.settings.anniversaryDate);

      // Restore Media files
      for (let m of data.media) {
        let blob = null;
        if (m.base64Blob) {
          blob = base64ToBlob(m.base64Blob);
        }
        await dbSaveMedia({
          id: m.id,
          name: m.name,
          type: m.type,
          section: m.section,
          associatedAudioId: m.associatedAudioId,
          createdAt: m.createdAt,
          blob: blob
        });
      }

      // Restore constellation memories
      for (let mem of data.memories) {
        let blob = null;
        if (mem.base64Blob) {
          blob = base64ToBlob(mem.base64Blob);
        }
        await dbSaveMemory({
          id: mem.id,
          title: mem.title,
          date: mem.date,
          text: mem.text,
          mediaName: mem.mediaName,
          mediaType: mem.mediaType,
          createdAt: mem.createdAt,
          mediaBlob: blob
        });
      }

      // Clear input file
      fileInput.value = '';

      alert('Copia de seguridad restaurada correctamente. Recargando datos.');
      setupAdminDashboard();
    } catch (err) {
      console.error(err);
      alert('Error al importar la copia de seguridad. Revisa que el archivo sea válido.');
    }
  };

  reader.readAsText(file);
}

// ----------------------------------------------------
// UI Events Bindings
// ----------------------------------------------------
function bindUIEvents() {
  // Autocompletado automático de barras en la fecha clave (DD/MM/AA)
  const dateInput = document.getElementById('login-date');
  if (dateInput) {
    dateInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, ''); // Conservar solo dígitos
      if (value.length > 6) {
        value = value.slice(0, 6);
      }
      let formatted = '';
      if (value.length > 0) {
        formatted += value.slice(0, 2);
      }
      if (value.length > 2) {
        formatted += '/' + value.slice(2, 4);
      }
      if (value.length > 4) {
        formatted += '/' + value.slice(4, 6);
      }
      e.target.value = formatted;
    });
  }

  // Login Form Submission
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.onsubmit = (e) => {
      e.preventDefault();
      const dateVal = document.getElementById('login-date').value.trim();
      const passVal = document.getElementById('login-pass').value.trim();

      // Standardized inputs check
      const validDates = ['14/05/26', '14/05/2026', '14-05-26', '14-05-2026'];
      if (validDates.includes(dateVal) && passVal === '1206') {
        sessionStorage.setItem('couple_auth', 'true');
        state.isAuthenticated = true;
        document.getElementById('login-error').classList.add('hidden');
        
        // Animate transition into Universo
        gsap.to('#sec-login', {
          opacity: 0,
          duration: 0.5,
          onComplete: () => {
            document.getElementById('sec-login').classList.remove('active');
            window.location.hash = '#/universo';
          }
        });
      } else {
        document.getElementById('login-error').classList.remove('hidden');
      }
    };
  }

  // Admin Login Form Submission
  const formAdminLogin = document.getElementById('form-admin-login');
  if (formAdminLogin) {
    formAdminLogin.onsubmit = (e) => {
      e.preventDefault();
      const passVal = document.getElementById('admin-pass').value.trim();

      if (passVal === 'Manuel1214$') {
        sessionStorage.setItem('admin_auth', 'true');
        state.isAdmin = true;
        document.getElementById('admin-login-error').classList.add('hidden');
        
        // Redirect to panel dashboard
        window.location.hash = '#/admin';
      } else {
        document.getElementById('admin-login-error').classList.remove('hidden');
      }
    };
  }

  // Logout Buttons
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.onclick = () => {
      sessionStorage.removeItem('couple_auth');
      state.isAuthenticated = false;
      stopAllMedia();
      window.location.hash = '#/';
    };
  }

  document.getElementById('btn-admin-logout').onclick = () => {
    sessionStorage.removeItem('admin_auth');
    state.isAdmin = false;
    window.location.hash = '#/';
  };

  // Navigation arrows next/prev chapter clicks
  document.getElementById('btn-prev-chapter').onclick = () => {
    const currentIndex = state.chapters.indexOf(state.currentChapter);
    if (currentIndex > 0) {
      window.location.hash = `#/${state.chapters[currentIndex - 1]}`;
    }
  };

  document.getElementById('btn-next-chapter').onclick = () => {
    const currentIndex = state.chapters.indexOf(state.currentChapter);
    if (currentIndex < state.chapters.length - 1) {
      window.location.hash = `#/${state.chapters[currentIndex + 1]}`;
    }
  };

  // Navigation tracker dots binding
  document.querySelectorAll('.nav-dot').forEach((dot) => {
    dot.onclick = () => {
      const target = dot.getAttribute('data-target');
      window.location.hash = `#/${target}`;
    };
  });

  // Enter experience button from Universo Intro
  document.getElementById('btn-enter-constellation').onclick = () => {
    window.location.hash = '#/constelacion';
  };

  // Close modals
  document.getElementById('btn-close-memory').onclick = closeMemoryModal;
  document.getElementById('memory-modal-bg').onclick = closeMemoryModal;

  document.getElementById('btn-close-lightbox').onclick = closeLightbox;
  document.getElementById('lightbox-bg').onclick = closeLightbox;

  document.getElementById('btn-close-theater').onclick = closeTheater;
  document.getElementById('theater-bg').onclick = closeTheater;

  // Toggle ambient music loop playback
  document.getElementById('btn-toggle-music').onclick = () => {
    const audio = document.getElementById('ambient-audio');
    const icon = document.getElementById('music-icon');
    
    if (audio.paused) {
      audio.play().then(() => {
        icon.className = 'fas fa-volume-up';
        document.getElementById('btn-toggle-music').classList.add('shadow-lg', 'shadow-neon-cyan/20');
      }).catch(err => console.log('Interacción necesaria para reproducir audio:', err));
    } else {
      audio.pause();
      icon.className = 'fas fa-volume-mute';
      document.getElementById('btn-toggle-music').classList.remove('shadow-lg', 'shadow-neon-cyan/20');
    }
  };

  // Generate random memories
  document.getElementById('btn-generate-random').onclick = triggerRandomMemory;

  // Final actions triggers
  document.getElementById('btn-merge-stars').onclick = triggerStarsCollision;
  document.getElementById('btn-skip-final-video').onclick = transitionToFinalLetter;

  // Admin tabs switching
  document.getElementById('tab-btn-media').onclick = () => switchAdminTab('media');
  document.getElementById('tab-btn-memory').onclick = () => switchAdminTab('memory');
  document.getElementById('tab-btn-system').onclick = () => switchAdminTab('system');

  // Admin dynamic hide audio option in sections
  document.getElementById('media-section').onchange = (e) => {
    const container = document.getElementById('museum-audio-select-container');
    if (e.target.value === 'museum') {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  };

  // Admin configurations submit binding
  document.getElementById('admin-media-form').onsubmit = handleMediaUpload;
  document.getElementById('admin-memory-form').onsubmit = handleMemoryCreation;
  document.getElementById('btn-save-final-letter').onclick = saveFinalSettings;

  // Admin backup actions bindings
  document.getElementById('btn-export-backup').onclick = exportBackup;
  document.getElementById('btn-import-backup').onclick = importBackup;

  // Admin list filters binding
  document.getElementById('filter-btn-all').onclick = (e) => setAdminFilter('all', e.target);
  document.getElementById('filter-btn-universe').onclick = (e) => setAdminFilter('universe', e.target);
  document.getElementById('filter-btn-museum').onclick = (e) => setAdminFilter('museum', e.target);
  document.getElementById('filter-btn-timeline').onclick = (e) => setAdminFilter('timeline', e.target);
  document.getElementById('filter-btn-video').onclick = (e) => setAdminFilter('video-gallery', e.target);

  // Botones de flecha arriba/abajo en el tracker de navegación de la izquierda
  const trackerPrev = document.getElementById('tracker-btn-prev');
  const trackerNext = document.getElementById('tracker-btn-next');

  if (trackerPrev) {
    trackerPrev.onclick = () => {
      const currentIndex = state.chapters.indexOf(state.currentChapter);
      if (currentIndex > 0) {
        window.location.hash = `#/${state.chapters[currentIndex - 1]}`;
      }
    };
  }

  if (trackerNext) {
    trackerNext.onclick = () => {
      const currentIndex = state.chapters.indexOf(state.currentChapter);
      if (currentIndex < state.chapters.length - 1) {
        window.location.hash = `#/${state.chapters[currentIndex + 1]}`;
      }
    };
  }

  // Manejador de teclado para navegación con flechas
  window.addEventListener('keydown', (e) => {
    // Si el usuario está escribiendo en un input o textarea, ignorar atajos del teclado
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }

    if (e.key === 'ArrowRight') {
      if (state.currentChapter === 'museo') {
        state.currentMuseumIndex++;
        updateSquareRoom3D();
      }
    } else if (e.key === 'ArrowLeft') {
      if (state.currentChapter === 'museo') {
        state.currentMuseumIndex--;
        updateSquareRoom3D();
      }
    } else if (e.key === 'ArrowDown') {
      // Siguiente sección
      const currentIndex = state.chapters.indexOf(state.currentChapter);
      if (currentIndex < state.chapters.length - 1) {
        window.location.hash = `#/${state.chapters[currentIndex + 1]}`;
      }
    } else if (e.key === 'ArrowUp') {
      // Sección anterior
      const currentIndex = state.chapters.indexOf(state.currentChapter);
      if (currentIndex > 0) {
        window.location.hash = `#/${state.chapters[currentIndex - 1]}`;
      }
    }
  });
}

function setAdminFilter(filterName, btnElement) {
  adminFilter = filterName;
  const filters = btnElement.parentElement.querySelectorAll('button');
  filters.forEach(b => b.className = 'hover:text-white pb-2 transition-colors');
  btnElement.className = 'text-neon-cyan border-b-2 border-neon-cyan pb-2';
  loadAdminItems();
}

// ----------------------------------------------------
// App Entry Point / Initializer
// ----------------------------------------------------
window.onload = async () => {
  // Initialize canvas backgrounds safely
  try {
    globalStarfield = new Starfield('starfield');
    globalStarfield.draw();
  } catch (err) {
    console.error("Starfield load failed:", err);
  }

  // Connect local DB safely
  try {
    await initDB();
  } catch (err) {
    console.error("Local DB connection failed. Falling back to memory storage:", err);
  }

  // Setup ambient music tracker
  const ambientAudio = document.getElementById('ambient-audio');
  let rawMusic = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

  if (state.db) {
    try {
      rawMusic = await dbGetSetting('ambient_music_url', rawMusic);
    } catch (err) {
      console.error("Failed to load custom music url:", err);
    }
  }
  
  if (ambientAudio) {
    ambientAudio.src = rawMusic;
    ambientAudio.volume = 0.3; // Soft overlay volume
  }

  // Show audio controls once authenticated
  checkSession();
  if (state.isAuthenticated) {
    const playerContainer = document.getElementById('ambient-player-container');
    if (playerContainer) playerContainer.classList.remove('hidden');
  }

  // Bind forms & clicks
  bindUIEvents();

  // Hook Hash Routing
  window.addEventListener('hashchange', handleNavigation);
  handleNavigation(); // Trigger router on launch
};
