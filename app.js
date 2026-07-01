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
  currentChapter: 'universo', // universo, museo, videos, archivo, final
  chapters: ['universo', 'museo', 'videos', 'archivo', 'final'],
  constellationPan: { x: 0, y: 0 },
  activeAudio: null, // Track currently playing audio to avoid overlaps
  typewriterInterval: null, // Track typewriter interval to prevent text accumulation
  universeTimeout: null, // Timer for the 10-second transition in Universo intro
  currentMuseumIndex: 0, // Índice de la foto activa en la galería 3D del Louvre
  playlistMode: false, // Tracks sequential video playlist mode
  playlistVideos: [], // Array of videos in playlist
  currentPlaylistIndex: 0 // Index of active video in playlist
};

// Database Helpers (PostgreSQL API Client)
function initDB() {
  console.log('PostgreSQL API client initialized.');
  return Promise.resolve();
}

async function dbGetSetting(key, defaultValue) {
  try {
    const response = await fetch(`/api/settings/${encodeURIComponent(key)}`);
    if (!response.ok) return defaultValue;
    const data = await response.json();
    return data.value !== undefined ? data.value : defaultValue;
  } catch (e) {
    console.error('Error fetching setting:', e);
    return defaultValue;
  }
}

async function dbSetSetting(key, value) {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
  } catch (e) {
    console.error('Error saving setting:', e);
  }
}

async function dbSaveMedia(mediaObj) {
  try {
    const formData = new FormData();
    formData.append('id', mediaObj.id);
    formData.append('name', mediaObj.name);
    formData.append('type', mediaObj.type);
    formData.append('section', mediaObj.section);
    if (mediaObj.associatedAudioId) {
      formData.append('associatedAudioId', mediaObj.associatedAudioId);
    }
    if (mediaObj.blob) {
      formData.append('file', mediaObj.blob);
    }
    await fetch('/api/media', {
      method: 'POST',
      body: formData
    });
  } catch (e) {
    console.error('Error saving media:', e);
    throw e;
  }
}

async function dbGetAllMedia() {
  try {
    const response = await fetch('/api/media');
    if (!response.ok) return [];
    return await response.json();
  } catch (e) {
    console.error('Error fetching media:', e);
    return [];
  }
}

async function dbDeleteMedia(id) {
  try {
    await fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) {
    console.error('Error deleting media:', e);
    throw e;
  }
}

async function dbSaveMemory(memoryObj) {
  try {
    const formData = new FormData();
    formData.append('id', memoryObj.id);
    formData.append('title', memoryObj.title);
    formData.append('date', memoryObj.date);
    formData.append('text', memoryObj.text);
    if (memoryObj.mediaBlob) {
      formData.append('file', memoryObj.mediaBlob);
    }
    await fetch('/api/memories', {
      method: 'POST',
      body: formData
    });
  } catch (e) {
    console.error('Error saving memory:', e);
    throw e;
  }
}

async function dbGetAllMemories() {
  try {
    const response = await fetch('/api/memories');
    if (!response.ok) return [];
    return await response.json();
  } catch (e) {
    console.error('Error fetching memories:', e);
    return [];
  }
}

async function dbDeleteMemory(id) {
  try {
    await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) {
    console.error('Error deleting memory:', e);
    throw e;
  }
}

// Media URL routing helpers
function getMediaUrl(item) {
  if (!item) return '';
  if (item.url) return item.url;
  if (item.blob) return URL.createObjectURL(item.blob);
  return `/api/media/${item.id}/file`;
}

function getMemoryUrl(mem) {
  if (!mem) return '';
  if (mem.mediaBlob) return URL.createObjectURL(mem.mediaBlob);
  return `/api/memories/${mem.id}/file`;
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
    
    const animObj = { speedFactor: this.speedFactor };
    
    gsap.to(animObj, {
      speedFactor: 25,
      duration: 1.5,
      ease: 'power2.in',
      onUpdate: () => {
        this.speedFactor = animObj.speedFactor;
      },
      onComplete: () => {
        gsap.to(animObj, {
          speedFactor: 0.3,
          duration: 1.5,
          ease: 'power2.out',
          onUpdate: () => {
            this.speedFactor = animObj.speedFactor;
          },
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
function getPath() {
  return window.location.pathname.replace(/^\/+|\/+$/g, '') || '';
}

function navigateTo(route) {
  const cleanRoute = route.replace(/^\/+/, '');
  history.pushState(null, '', `/${cleanRoute}`);
  handleNavigation();
}

function checkSession() {
  state.isAuthenticated = sessionStorage.getItem('couple_auth') === 'true';
  state.isAdmin = sessionStorage.getItem('admin_auth') === 'true';
}

function handleNavigation() {
  checkSession();
  const route = getPath();

  // Route protection
  if (route.startsWith('admin')) {
    if (route === 'admin') {
      if (state.isAdmin) {
        showSection('admin');
      } else {
        navigateTo('admin-login');
      }
    } else if (route === 'admin-login') {
      if (state.isAdmin) {
        navigateTo('admin');
      } else {
        showSection('admin-login');
      }
    }
    return;
  }

  // Experience routing
  if (!state.isAuthenticated) {
    showSection('login');
    if (getPath() !== '') {
      history.replaceState(null, '', '/');
    }
    return;
  }

  // Navigate to experience sections
  if (state.chapters.includes(route)) {
    showSection(route);
  } else {
    // Default to universo
    navigateTo('universo');
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

  if (universeItem) {
    const url = getMediaUrl(universeItem);
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

  // Transición automática al siguiente capítulo (Museo) a los 10 segundos
  state.universeTimeout = setTimeout(() => {
    state.universeTimeout = null;
    navigateTo('museo');
  }, 10000);
}

// 2. Labyrinth 3D Section (Interactive 3D Memories Maze)
const mazeMap = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1],
  [1, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, 1],
  [1, 1, 1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1]
];

const mazePlayer = {
  x: 1.5,
  y: 1.5,
  yaw: 0, // direction angle in radians
  speed: 0.035, // Slower movement speed (was 0.05)
  rotSpeed: 0.03, // Slower rotation speed (was 0.04)
  radius: 0.25
};

const mazeKeys = {};
let mazeLoopId = null;

async function setupConstellationSection() {
  const world = document.getElementById('labyrinth-world');
  if (!world) return;
  
  // Clear any existing elements
  world.innerHTML = '';
  
  // Hide success overlay
  const successOverlay = document.getElementById('labyrinth-success-overlay');
  if (successOverlay) successOverlay.classList.add('hidden');
  
  // Reset player position & angle
  mazePlayer.x = 1.5;
  mazePlayer.y = 1.5;
  mazePlayer.yaw = 0;
  
  // Fetch photos from DB
  const media = await dbGetAllMedia();
  const photos = media.filter(m => m.section === 'museum' && m.type.startsWith('image/'));
  
  const CELL_SIZE = 400;
  
  // Render Floor Plane (Centered at grid middle 4x4)
  const floor = document.createElement('div');
  floor.className = 'maze-floor-plane';
  floor.style.transform = `translate3d(${4 * CELL_SIZE}px, 300px, ${-4 * CELL_SIZE}px) rotateX(90deg)`;
  world.appendChild(floor);

  // Render Ceiling Plane (Centered at grid middle 4x4)
  const ceiling = document.createElement('div');
  ceiling.className = 'maze-ceiling-plane';
  ceiling.style.transform = `translate3d(${4 * CELL_SIZE}px, -300px, ${-4 * CELL_SIZE}px) rotateX(90deg)`;
  world.appendChild(ceiling);
  
  // Render Maze Walls in 3D (8x8 grid)
  let photoIndex = 0;
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      // Horizontal wall: top boundary of cell
      if (r > 0 && ((mazeMap[r][c] === 1) !== (mazeMap[r-1][c] === 1))) {
        createMazeWall(c * CELL_SIZE + CELL_SIZE / 2, -r * CELL_SIZE, 0, photos, photoIndex++);
      }
      // Vertical wall: left boundary of cell
      if (c > 0 && ((mazeMap[r][c] === 1) !== (mazeMap[r][c-1] === 1))) {
        createMazeWall(c * CELL_SIZE, -r * CELL_SIZE - CELL_SIZE / 2, 90, photos, photoIndex++);
      }
    }
  }
  
  // Render outer boundary walls (row 0, row 8, col 0, col 8)
  for (let c = 0; c < 8; c++) {
    createMazeWall(c * CELL_SIZE + CELL_SIZE / 2, 0, 0, photos, photoIndex++);
    createMazeWall(c * CELL_SIZE + CELL_SIZE / 2, -8 * CELL_SIZE, 0, photos, photoIndex++);
  }
  for (let r = 0; r < 8; r++) {
    createMazeWall(0, -r * CELL_SIZE - CELL_SIZE / 2, 90, photos, photoIndex++);
    createMazeWall(8 * CELL_SIZE, -r * CELL_SIZE - CELL_SIZE / 2, 90, photos, photoIndex++);
  }
  
  // Keyboard Listeners
  window.addEventListener('keydown', handleMazeKeyDown);
  window.addEventListener('keyup', handleMazeKeyUp);
  
  // Start Game Loop
  if (mazeLoopId) cancelAnimationFrame(mazeLoopId);
  updateLabyrinth();
}

function createMazeWall(x, z, angle, photos, wallIndex) {
  const world = document.getElementById('labyrinth-world');
  if (!world) return;
  
  const wall = document.createElement('div');
  wall.className = 'maze-wall';
  wall.style.transform = `translate3d(${x}px, 0px, ${z}px) rotateY(${angle}deg)`;
  
  // Place photos on every 3rd wall, if photos are available
  if (photos.length > 0 && wallIndex % 3 === 0) {
    const photo = photos[wallIndex % photos.length];
    const url = getMediaUrl(photo);
    
    const frame = document.createElement('div');
    frame.className = 'maze-picture-frame';
    frame.innerHTML = `
      <img src="${url}" alt="Recuerdo">
    `;
    frame.onclick = (e) => {
      e.stopPropagation();
      openLightbox(photo);
    };
    wall.appendChild(frame);
  }
  
  world.appendChild(wall);
}

function handleMazeKeyDown(e) {
  mazeKeys[e.key.toLowerCase()] = true;
}

function handleMazeKeyUp(e) {
  mazeKeys[e.key.toLowerCase()] = false;
}

function updateLabyrinth() {
  if (state.currentChapter !== 'constelacion') {
    window.removeEventListener('keydown', handleMazeKeyDown);
    window.removeEventListener('keyup', handleMazeKeyUp);
    return;
  }
  
  // 1. Move Player
  let dx = 0;
  let dy = 0;
  
  if (mazeKeys['w']) {
    dx += Math.sin(mazePlayer.yaw) * mazePlayer.speed;
    dy -= Math.cos(mazePlayer.yaw) * mazePlayer.speed;
  }
  if (mazeKeys['s']) {
    dx -= Math.sin(mazePlayer.yaw) * mazePlayer.speed;
    dy += Math.cos(mazePlayer.yaw) * mazePlayer.speed;
  }
  if (mazeKeys['a']) {
    mazePlayer.yaw -= mazePlayer.rotSpeed;
  }
  if (mazeKeys['d']) {
    mazePlayer.yaw += mazePlayer.rotSpeed;
  }
  
  // Apply Collision Detection
  const nx = mazePlayer.x + dx;
  const ny = mazePlayer.y + dy;
  
  // Check collision along X axis (boundary: 8 cells)
  if (nx > 0 && nx < 8 && mazeMap[Math.floor(mazePlayer.y)][Math.floor(nx + Math.sign(dx) * mazePlayer.radius)] !== 1) {
    mazePlayer.x = nx;
  }
  // Check collision along Y axis (boundary: 8 cells)
  if (ny > 0 && ny < 8 && mazeMap[Math.floor(ny + Math.sign(dy) * mazePlayer.radius)][Math.floor(mazePlayer.x)] !== 1) {
    mazePlayer.y = ny;
  }
  
  // 2. Center Camera in 3D (No double-centering 50vw/50vh offset)
  const world = document.getElementById('labyrinth-world');
  if (world) {
    const CELL_SIZE = 400;
    const tx = mazePlayer.x * CELL_SIZE;
    const tz = -mazePlayer.y * CELL_SIZE;
    const angleDeg = -mazePlayer.yaw * (180 / Math.PI);
    
    // Centered at screen center, Z pushed by 300px
    world.style.transform = `translate3d(0px, 0px, 300px) rotateY(${angleDeg}deg) translate3d(${-tx}px, 0px, ${-tz}px)`;
  }
  
  // 3. Check Exit (Target cell: column 6, row 1)
  const distToExit = Math.hypot(mazePlayer.x - 6.5, mazePlayer.y - 1.5);
  if (distToExit < 0.4) {
    const successOverlay = document.getElementById('labyrinth-success-overlay');
    if (successOverlay && successOverlay.classList.contains('hidden')) {
      successOverlay.classList.remove('hidden');
      stopAllMedia();
    }
  }
  
  mazeLoopId = requestAnimationFrame(updateLabyrinth);
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
  let museumPhotos = media.filter(m => m.section === 'museum' && m.type.startsWith('image/')).slice(0, 200);

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
        navigateTo('constelacion');
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
        navigateTo('videos');
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
    if (photo.id) {
      img.src = getMediaUrl(photo);
    } else if (photo.url) {
      img.src = photo.url;
    }

    imgWrapper.appendChild(img);
    frame.appendChild(imgWrapper);

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

  if (photo.id) {
    img.src = getMediaUrl(photo);
  } else if (photo.url) {
    img.src = photo.url;
  }

  // If photo has associated audio
  if (photo.associatedAudioId) {
    audioPlayer.classList.remove('hidden');
    audioEl.src = `/api/media/${encodeURIComponent(photo.associatedAudioId)}/file`;

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

// 4. Galería de Vídeos Section (Sala de Cine POV)
async function setupVideoSection() {
  const grid = document.getElementById('video-gallery-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const media = await dbGetAllMedia();
  // Filter for video gallery assets, completely removing the slice limit!
  const videos = media.filter(m => m.section === 'video-gallery' && m.type.startsWith('video/'));
  
  state.playlistVideos = videos;
  state.playlistMode = false;

  // Reset screen and viewport
  const viewport = document.getElementById('pov-viewport');
  const placeholder = document.getElementById('cinema-placeholder');
  const videoEl = document.getElementById('theater-video-element');
  const billboardOverlay = document.getElementById('cinema-billboard-overlay');
  const btnOpenBillboard = document.getElementById('btn-open-billboard');

  if (viewport) {
    viewport.classList.remove('screen-playing', 'viewport-submerged', 'viewport-cinema-fullscreen');
  }
  if (placeholder) placeholder.classList.remove('hidden');
  if (videoEl) {
    videoEl.pause();
    videoEl.src = "";
    videoEl.load();
  }
  if (billboardOverlay) {
    billboardOverlay.classList.remove('hidden-overlay');
  }
  if (btnOpenBillboard) btnOpenBillboard.classList.add('hidden');

  if (videos.length === 0) {
    grid.innerHTML = '<div class="text-center text-gray-500 font-light py-8 col-span-full">No hay películas en cartelera aún. Sube vídeos desde el panel de administración.</div>';
    return;
  }

  videos.forEach((video, index) => {
    const card = document.createElement('div');
    card.className = 'movie-poster-item';
    const url = getMediaUrl(video);

    card.innerHTML = `
      <div class="movie-poster-item-thumb">
        <!-- Static video thumbnail preview showing first frame with object-contain to avoid crops -->
        <video src="${url}" preload="metadata" class="w-full h-full object-contain"></video>
        <div class="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-[10px] text-neon-cyan border border-neon-cyan/30">
          <i class="fas fa-play" style="font-size: 8px; margin-left: 2px; color: var(--color-accent);"></i>
        </div>
      </div>
      <div class="movie-poster-item-info">
        <div class="movie-poster-item-title">Película ${index + 1}</div>
        <div class="movie-poster-item-subtitle">Proyectar</div>
      </div>
    `;

    card.onclick = () => {
      document.querySelectorAll('.movie-poster-item').forEach(c => c.classList.remove('active-item'));
      card.classList.add('active-item');
      state.playlistMode = false; // Disable sequential playlist mode on manual video select
      playMovieOnScreen(video);
    };

    grid.appendChild(card);
  });

  // GSAP animation for movie posters pop-in
  gsap.fromTo('.movie-poster-item', 
    { opacity: 0, scale: 0.9, y: 15 }, 
    { opacity: 1, scale: 1, y: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out' }
  );
}

function playMovieOnScreen(video) {
  stopAllMedia();
  const viewport = document.getElementById('pov-viewport');
  const placeholder = document.getElementById('cinema-placeholder');
  const videoEl = document.getElementById('theater-video-element');
  const billboardOverlay = document.getElementById('cinema-billboard-overlay');
  const btnOpenBillboard = document.getElementById('btn-open-billboard');

  if (placeholder) placeholder.classList.add('hidden');
  if (viewport) {
    viewport.classList.add('screen-playing', 'viewport-submerged');
  }
  if (billboardOverlay) billboardOverlay.classList.add('hidden-overlay');
  if (btnOpenBillboard) btnOpenBillboard.classList.remove('hidden');

  videoEl.src = getMediaUrl(video);
  videoEl.play();
}

function createRadarParticles(x, y, parent) {
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'radar-particle';
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    parent.appendChild(p);

    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 50 + 20;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;

    gsap.to(p, {
      x: tx,
      y: ty,
      opacity: 0,
      scale: 0.2,
      duration: 0.8,
      ease: 'power2.out',
      onComplete: () => p.remove()
    });
  }
}

// 5. Generador de Fotos y Vídeos Aleatorios
async function triggerRandomMemory() {
  const content = document.getElementById('random-memory-content');
  if (!content) return;
  content.innerHTML = '<div class="text-neon-cyan animate-spin py-12"><i class="fas fa-atom text-2xl"></i></div>';

  // Open modal first
  const modal = document.getElementById('random-memory-modal');
  if (modal) {
    modal.classList.remove('hidden');
    gsap.fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.3 });
  }

  // Gather all items from media
  const media = await dbGetAllMedia();

  // Filter images from museum and videos from video-gallery
  const pool = media.filter(m => 
    (m.section === 'museum' && m.type.startsWith('image/')) ||
    (m.section === 'video-gallery' && m.type.startsWith('video/'))
  );

  if (pool.length === 0) {
    content.innerHTML = '<span class="text-gray-500 text-xs font-light text-center py-6">No hay fotos en el Museo ni vídeos en la Galería todavía. Sube archivos desde el panel de administración.</span>';
    return;
  }

  const item = pool[Math.floor(Math.random() * pool.length)];
  const url = getMediaUrl(item);
  
  stopAllMedia();
  
  let elementHTML = '';
  
  if (item.type.startsWith('image/')) {
    elementHTML = `
      <div class="relative rounded-lg overflow-hidden border border-white/10 shadow-2xl shadow-neon-cyan/20 max-w-[400px]">
        <img class="max-h-[380px] w-full object-contain rounded" src="${url}" alt="Foto aleatoria">
        <div class="absolute inset-0 bg-gradient-to-t from-space/30 to-transparent pointer-events-none"></div>
      </div>
    `;
  } else if (item.type.startsWith('video/')) {
    elementHTML = `
      <div class="relative rounded-lg overflow-hidden border border-white/10 shadow-2xl shadow-neon-purple/20 max-w-[400px] bg-black">
        <!-- Living cinemagraph style loop with autoplay, muted, loop, playsinline and no controls -->
        <video class="w-full max-h-[380px] rounded object-contain" autoplay loop muted playsinline src="${url}"></video>
      </div>
    `;
  }
  
  content.innerHTML = `
    <div class="flex flex-col items-center w-full p-2">
      ${elementHTML}
    </div>
  `;
}



// 6. Final Section (Colliding Stars, Letter & Count)
let relationshipInterval = null;

async function setupFinalSection() {
  stopAllMedia();
  clearInterval(relationshipInterval);

  // Show Stage 1
  document.getElementById('final-stage-collide').classList.remove('hidden');
  const stageVideo = document.getElementById('final-stage-video');
  if (stageVideo) {
    stageVideo.classList.add('hidden');
  }
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

      // Skip video, go to letter directly
      transitionToFinalLetter();
    }
  });
}

async function transitionToFinalLetter() {
  stopAllMedia();
  
  const stageLetter = document.getElementById('final-stage-letter');
  if (stageLetter) {
    stageLetter.classList.remove('hidden');
    gsap.fromTo(stageLetter, { opacity: 0 }, { opacity: 1, duration: 0.8 });
    
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
        const url = getMediaUrl(details);
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
  alert('Preparando copia de seguridad. Esto puede tardar un momento si has subido muchos vídeos o fotos...');
  try {
    const response = await fetch('/api/backup');
    if (!response.ok) throw new Error('Error al obtener la copia de seguridad');
    const backupData = await response.json();
    
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
  } catch (e) {
    console.error(e);
    alert('Error al exportar la copia de seguridad.');
  }
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

      alert('Restaurando elementos en la base de datos central de PostgreSQL...');

      const response = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Error en el servidor al restaurar');

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
            navigateTo('universo');
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
        navigateTo('admin');
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
      navigateTo('');
    };
  }

  document.getElementById('btn-admin-logout').onclick = () => {
    sessionStorage.removeItem('admin_auth');
    state.isAdmin = false;
    navigateTo('');
  };

  // Navigation arrows next/prev chapter clicks
  document.getElementById('btn-prev-chapter').onclick = () => {
    const currentIndex = state.chapters.indexOf(state.currentChapter);
    if (currentIndex > 0) {
      navigateTo(state.chapters[currentIndex - 1]);
    }
  };

  document.getElementById('btn-next-chapter').onclick = () => {
    const currentIndex = state.chapters.indexOf(state.currentChapter);
    if (currentIndex < state.chapters.length - 1) {
      navigateTo(state.chapters[currentIndex + 1]);
    }
  };

  // Navigation tracker dots binding
  document.querySelectorAll('.nav-dot').forEach((dot) => {
    dot.onclick = () => {
      const target = dot.getAttribute('data-target');
      navigateTo(target);
    };
  });

  // Enter experience button from Universo Intro
  const btnEnterConstellation = document.getElementById('btn-enter-constellation');
  if (btnEnterConstellation) {
    btnEnterConstellation.onclick = () => {
      navigateTo('museo');
    };
  }



  document.getElementById('btn-close-lightbox').onclick = closeLightbox;
  document.getElementById('lightbox-bg').onclick = closeLightbox;

  // Billboard & Zoom Controls for Cinema Room
  const billboardOverlay = document.getElementById('cinema-billboard-overlay');
  const btnOpenBillboard = document.getElementById('btn-open-billboard');
  const btnCloseBillboard = document.getElementById('btn-close-billboard');
  const povViewport = document.getElementById('pov-viewport');
  const videoEl = document.getElementById('theater-video-element');

  if (btnCloseBillboard) {
    btnCloseBillboard.onclick = () => {
      billboardOverlay.classList.add('hidden-overlay');
      if (videoEl.src) {
        videoEl.play();
        povViewport.classList.add('screen-playing');
      }
    };
  }

  if (btnOpenBillboard) {
    btnOpenBillboard.onclick = () => {
      billboardOverlay.classList.remove('hidden-overlay');
      videoEl.pause();
    };
  }

  // Click on the projector screen toggles play/pause natively
  if (videoEl) {
    videoEl.onclick = () => {
      if (videoEl.paused) {
        videoEl.play();
        povViewport.classList.add('screen-playing');
      } else {
        videoEl.pause();
        povViewport.classList.remove('screen-playing');
      }
    };

    // Autoplay sequential playlist feature
    videoEl.onended = () => {
      if (state.playlistMode) {
        state.currentPlaylistIndex++;
        if (state.playlistVideos && state.currentPlaylistIndex < state.playlistVideos.length) {
          playMovieOnScreen(state.playlistVideos[state.currentPlaylistIndex]);
        } else {
          // Playlist finished
          state.playlistMode = false;
          // Open billboard again to let user select another movie
          const billboard = document.getElementById('cinema-billboard-overlay');
          if (billboard) billboard.classList.remove('hidden-overlay');
        }
      }
    };
  }

  // Play All Playlist button inside Billboard
  const btnPlayPlaylist = document.getElementById('btn-play-playlist');
  if (btnPlayPlaylist) {
    btnPlayPlaylist.onclick = () => {
      if (state.playlistVideos && state.playlistVideos.length > 0) {
        state.playlistMode = true;
        state.currentPlaylistIndex = 0;
        playMovieOnScreen(state.playlistVideos[0]);
      } else {
        alert("No hay vídeos disponibles para reproducir.");
      }
    };
  }

  // Labyrinth exit continue action
  const btnLabyrinthContinue = document.getElementById('btn-labyrinth-continue');
  if (btnLabyrinthContinue) {
    btnLabyrinthContinue.onclick = () => {
      navigateTo('museo');
    };
  }


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

  // Holographic Radar Memory Scan
  const radar = document.getElementById('radar-screen');
  const lockCursor = document.getElementById('radar-lock-cursor');
  const randomModal = document.getElementById('random-memory-modal');
  const btnCloseRandomModal = document.getElementById('btn-close-random-modal');
  
  state.radarScanning = false;

  if (radar) {
    radar.onclick = () => {
      if (state.radarScanning) return;
      state.radarScanning = true;
      
      // Acelerar radar
      radar.classList.add('radar-scanning');
      
      // Elegir estrella de señal aleatoria
      const dots = radar.querySelectorAll('.radar-signal-dot');
      if (dots.length > 0) {
        const targetDot = dots[Math.floor(Math.random() * dots.length)];
        
        // Colocar mira láser
        if (lockCursor) {
          lockCursor.style.top = targetDot.style.top;
          lockCursor.style.left = targetDot.style.left;
          lockCursor.style.display = 'block';
          
          // Animar cursor latiendo
          gsap.fromTo(lockCursor, { scale: 1.5, opacity: 0.3 }, { scale: 0.9, opacity: 1, duration: 0.5, repeat: 2 });
        }
        
        // Esperar 1.5s de suspenso de escaneo
        setTimeout(() => {
          // Explosión de partículas
          createRadarParticles(targetDot.offsetLeft, targetDot.offsetTop, radar);
          
          // Detener animaciones y abrir foto/vídeo en modal
          radar.classList.remove('radar-scanning');
          if (lockCursor) lockCursor.style.display = 'none';
          state.radarScanning = false;
          
          triggerRandomMemory();
        }, 1500);
      }
    };
  }

  // Close Random Memory Modal Action
  if (btnCloseRandomModal) {
    btnCloseRandomModal.onclick = () => {
      if (randomModal) {
        gsap.to(randomModal, {
          opacity: 0,
          duration: 0.3,
          onComplete: () => {
            randomModal.classList.add('hidden');
            document.getElementById('random-memory-content').innerHTML = '';
            stopAllMedia();
          }
        });
      }
    };
  }



  // Final actions triggers
  document.getElementById('btn-merge-stars').onclick = triggerStarsCollision;
  const btnSkipFinalVideo = document.getElementById('btn-skip-final-video');
  if (btnSkipFinalVideo) {
    btnSkipFinalVideo.onclick = transitionToFinalLetter;
  }

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
        navigateTo(state.chapters[currentIndex - 1]);
      }
    };
  }

  if (trackerNext) {
    trackerNext.onclick = () => {
      const currentIndex = state.chapters.indexOf(state.currentChapter);
      if (currentIndex < state.chapters.length - 1) {
        navigateTo(state.chapters[currentIndex + 1]);
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
        navigateTo(state.chapters[currentIndex + 1]);
      }
    } else if (e.key === 'ArrowUp') {
      // Sección anterior
      const currentIndex = state.chapters.indexOf(state.currentChapter);
      if (currentIndex > 0) {
        navigateTo(state.chapters[currentIndex - 1]);
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

  // Hook History API Routing
  window.addEventListener('popstate', handleNavigation);
  handleNavigation(); // Trigger router on launch
};
