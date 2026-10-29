'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#90a4ae', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (reto: hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const LIGHTNING_MS = 400;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let gridColor = '#22222e';
let ghostAlpha = 0.2;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let lightning = null; // { rows, bolts, start } mientras dura el efecto

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  const full = [];
  for (let r = 0; r < ROWS; r++)
    if (board[r].every(v => v !== 0)) full.push(r);
  // de arriba a abajo: quitar una fila no cambia el índice de las de abajo
  for (const r of full) {
    board.splice(r, 1);
    board.unshift(new Array(COLS).fill(0));
  }
  const cleared = full.length;
  if (cleared) {
    strikeLightning(full);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

// rayo en zigzag desde el borde superior hasta el centro de la fila limpiada
function makeBolt(row) {
  const targetY = row * BLOCK + BLOCK / 2;
  let x = canvas.width * (0.15 + Math.random() * 0.7);
  const pts = [[x, 0]];
  for (let y = 15 + Math.random() * 20; y < targetY; y += 15 + Math.random() * 20) {
    x = Math.min(canvas.width - 5, Math.max(5, x + (Math.random() - 0.5) * 50));
    pts.push([x, y]);
  }
  pts.push([x, targetY]);
  return pts;
}

function strikeLightning(rows) {
  lightning = { rows, bolts: rows.map(makeBolt), start: performance.now() };
}

function drawLightning() {
  if (!lightning) return;
  const t = (performance.now() - lightning.start) / LIGHTNING_MS;
  if (t >= 1) { lightning = null; return; }
  // parpadeo al inicio, luego se desvanece
  const a = (1 - t) * (t < 0.4 && Math.random() < 0.3 ? 0.3 : 1);
  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * a})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `rgba(255, 245, 157, ${0.7 * a})`;
  for (const r of lightning.rows) ctx.fillRect(0, r * BLOCK, canvas.width, BLOCK);
  ctx.shadowColor = '#fff59d';
  ctx.shadowBlur = 20;
  ctx.lineJoin = 'round';
  for (const bolt of lightning.bolts) {
    ctx.beginPath();
    ctx.moveTo(bolt[0][0], bolt[0][1]);
    for (const [x, y] of bolt) ctx.lineTo(x, y);
    ctx.strokeStyle = `rgba(255, 235, 59, ${a})`;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  // delega en la skin activa (tablero, fantasma y vista previa)
  activeSkin.drawBlock(context, x, y, activeSkin.colors[colorIndex], size, alpha ?? 1);
}

// ---- Skins visuales ----

// Retro: bloques cuadrados con color plano (estilo original)
function drawRetroBlock(context, x, y, color, size, alpha) {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Neon: interior tenue con borde brillante (shadowBlur)
function drawNeonBlock(context, x, y, color, size, alpha) {
  const px = x * size + 3, py = y * size + 3, s = size - 6;
  context.save(); // aísla shadowBlur/shadowColor del resto del dibujo
  context.fillStyle = color;
  context.globalAlpha = alpha * 0.25;
  context.fillRect(px, py, s, s);
  context.globalAlpha = alpha;
  context.shadowColor = color;
  context.shadowBlur = size / 3;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px, py, s, s);
  context.restore();
}

// trazado de rectángulo redondeado con arcTo
function roundRectPath(context, px, py, w, h, r) {
  context.beginPath();
  context.moveTo(px + r, py);
  context.arcTo(px + w, py, px + w, py + h, r);
  context.arcTo(px + w, py + h, px, py + h, r);
  context.arcTo(px, py + h, px, py, r);
  context.arcTo(px, py, px + w, py, r);
  context.closePath();
}

// Pastel: colores suaves con bordes redondeados
function drawPastelBlock(context, x, y, color, size, alpha) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.save();
  context.globalAlpha = alpha;
  roundRectPath(context, px, py, s, s, size / 4);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,0.12)';
  context.lineWidth = 1;
  context.stroke();
  // brillo suave
  roundRectPath(context, px + s * 0.2, py + s * 0.15, s * 0.6, s * 0.2, s * 0.1);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fill();
  context.restore();
}

// Pixel art: textura de píxeles con luz arriba/izquierda y sombra abajo/derecha
function drawPixelBlock(context, x, y, color, size, alpha) {
  const px = x * size, py = y * size;
  const p = Math.max(2, Math.floor(size / 10)); // tamaño de cada "píxel"
  const n = Math.floor(size / p);
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let shade = null;
      if (i === n - 1 || j === n - 1) shade = 'rgba(0,0,0,0.35)';                     // sombra
      else if (i === 0 || j === 0) shade = 'rgba(255,255,255,0.35)';                  // luz
      else if ((i === 1 && j <= 2) || (j === 1 && i <= 2)) shade = 'rgba(255,255,255,0.5)'; // brillo
      else if ((i * 7 + j * 3) % 5 === 0) shade = 'rgba(0,0,0,0.12)';                 // ruido
      if (shade) {
        context.fillStyle = shade;
        context.fillRect(px + j * p, py + i * p, p, p);
      }
    }
  }
  context.restore();
}

// boardBg/grid null = usar los del tema claro/oscuro
const SKINS = {
  retro:  { colors: COLORS, drawBlock: drawRetroBlock, boardBg: null, grid: null },
  neon:   { drawBlock: drawNeonBlock, boardBg: '#000000', grid: '#0d1424',
            colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2f6bff', '#ff8c00', '#c0c8d0'] },
  pastel: { drawBlock: drawPastelBlock, boardBg: null, grid: null,
            colors: [null, '#a0e7ef', '#fdf1a6', '#d7b8f3', '#b5ead7', '#ffb7b2', '#b8c4f5', '#ffd6a5', '#c9cfd6'] },
  pixel:  { colors: COLORS, drawBlock: drawPixelBlock, boardBg: null, grid: null },
};

let activeSkin = SKINS.retro;

function setSkin(key) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, key)) key = 'retro';
  activeSkin = SKINS[key];
  try { localStorage.setItem('skin', key); } catch (e) { /* almacenamiento no disponible */ }
  skinSelect.value = key;
  // fondo propio de la skin (Neon fuerza negro); vacío = el del tema
  const bg = activeSkin.boardBg || '';
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  // repintar si el bucle no está corriendo (pausa o fin de juego)
  if (current && (paused || gameOver)) { draw(); drawNext(); }
}

function drawGrid() {
  ctx.strokeStyle = activeSkin.grid || gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, ghostAlpha);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  drawLightning();
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  lightning = null; // no congelar el rayo en el tablero final
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() no puede cancelar el frame en curso: detener aquí el bucle
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (e) { /* almacenamiento no disponible */ }
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim();
  ghostAlpha = parseFloat(styles.getPropertyValue('--ghost-alpha'));
  themeBtn.textContent = theme === 'light' ? '🌙 Modo oscuro' : '☀️ Modo claro';
  // repintar si el bucle no está corriendo (pausa o fin de juego)
  if (current && (paused || gameOver)) { draw(); drawNext(); }
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lightning = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeBtn.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeBtn.blur(); // evita que Space active el botón en vez de la caída
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; } catch (e) { /* ignorar */ }
setTheme(savedTheme);

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // evita que flechas/Space cambien la skin durante la partida
});

let savedSkin = 'retro';
try { savedSkin = localStorage.getItem('skin') || 'retro'; } catch (e) { /* ignorar */ }
setSkin(savedSkin);

init();
