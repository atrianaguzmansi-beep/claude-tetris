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
  trackCombo(cleared);
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
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
  showGameOverRecords();
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
  else if (!current) { ctx.clearRect(0, 0, canvas.width, canvas.height); drawGrid(); } // pantalla de inicio
}

// ---- Récords locales (localStorage 'tetris-records') ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const clearRecordsBtn = document.getElementById('clear-records-btn');
const startTable = document.getElementById('start-table');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const gameoverRecords = document.getElementById('gameover-records');
const gameoverTable = document.getElementById('gameover-table');
const recordEntry = document.getElementById('record-entry');
const recordNameInput = document.getElementById('record-name');
const recordSaveBtn = document.getElementById('record-save');

let combo = 0;          // piezas seguidas que limpian al menos una fila
let bestCombo = 0;      // mejor combo de la partida actual
let pendingRecord = null; // entrada que espera el nombre del jugador
let startKeyHeld = false; // tecla con la que se empezó aún pulsada

document.addEventListener('keyup', () => { startKeyHeld = false; });

function loadRecords() {
  const empty = { top: [], mejorCombo: 0, maxLineas: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.top)) return empty;
    return {
      top: data.top.filter(r => r && typeof r.puntos === 'number').slice(0, MAX_RECORDS),
      mejorCombo: Number(data.mejorCombo) || 0,
      maxLineas: Number(data.maxLineas) || 0,
    };
  } catch (e) {
    return empty;
  }
}

function saveRecords(data) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false; // almacenamiento no disponible
  }
}

function trackCombo(cleared) {
  combo = cleared ? combo + 1 : 0;
  if (combo > bestCombo) bestCombo = combo;
}

function qualifies(top, puntos) {
  if (puntos <= 0) return false;
  return top.length < MAX_RECORDS || puntos > top[top.length - 1].puntos;
}

// construye la tabla con textContent (los nombres no se interpretan como HTML)
function renderRecordsTable(container, top, highlight) {
  container.replaceChildren();
  if (!top.length) {
    const p = document.createElement('p');
    p.className = 'records-empty';
    p.textContent = 'Aún no hay récords';
    container.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'records-table';
  const head = table.insertRow();
  for (const [txt, cls] of [['#', 'num'], ['NOMBRE', ''], ['PUNTOS', 'num'], ['LÍNEAS', 'num'], ['COMBO', 'num'], ['FECHA', '']]) {
    const th = document.createElement('th');
    th.textContent = txt;
    if (cls) th.className = cls;
    head.appendChild(th);
  }
  top.forEach((r, i) => {
    const tr = table.insertRow();
    if (r === highlight) tr.className = 'new-record';
    const fecha = new Date(r.fecha);
    const cells = [
      [i + 1, 'num'],
      [r.nombre, ''],
      [Number(r.puntos).toLocaleString(), 'num'],
      [r.lineas, 'num'],
      [r.combo, 'num'],
      [isNaN(fecha) ? '' : fecha.toLocaleDateString('es-ES'), ''],
    ];
    for (const [txt, cls] of cells) {
      const td = tr.insertCell();
      td.textContent = String(txt ?? '');
      if (cls) td.className = cls;
    }
  });
  container.appendChild(table);
}

function showStartScreen() {
  const data = loadRecords();
  renderRecordsTable(startTable, data.top, null);
  bestComboEl.textContent = data.mejorCombo;
  maxLinesEl.textContent = data.maxLineas;
  // tablero vacío de fondo mientras no empieza la partida
  board = createBoard();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  startScreen.classList.remove('hidden');
}

function startGame() {
  startKeyHeld = true;
  startScreen.classList.add('hidden');
  init();
}

function showGameOverRecords() {
  const data = loadRecords();
  data.mejorCombo = Math.max(data.mejorCombo, bestCombo);
  data.maxLineas = Math.max(data.maxLineas, lines);
  // sin almacenamiento no se pide nombre: no se podría guardar
  if (saveRecords(data) && qualifies(data.top, score)) {
    pendingRecord = { nombre: '', puntos: score, lineas: lines, combo: bestCombo, fecha: new Date().toISOString() };
    recordNameInput.value = '';
    recordEntry.classList.remove('hidden');
  }
  renderRecordsTable(gameoverTable, data.top, null);
  gameoverRecords.classList.remove('hidden');
  if (pendingRecord) recordNameInput.focus();
}

// guarda la entrada pendiente con el nombre escrito (o "Anónimo")
function commitPendingRecord() {
  if (!pendingRecord) return null;
  const entry = pendingRecord;
  pendingRecord = null;
  entry.nombre = recordNameInput.value.trim().slice(0, 12) || 'Anónimo';
  const data = loadRecords();
  data.top.push(entry);
  data.top.sort((a, b) => b.puntos - a.puntos);
  data.top = data.top.slice(0, MAX_RECORDS);
  saveRecords(data);
  recordEntry.classList.add('hidden');
  recordNameInput.blur();
  return data.top.includes(entry) ? { top: data.top, entry } : null;
}

function saveNameAndShow() {
  const res = commitPendingRecord();
  if (res) renderRecordsTable(gameoverTable, res.top, res.entry);
}

function resetRecordsState() {
  commitPendingRecord(); // reiniciar sin escribir nombre no pierde el récord
  combo = 0;
  bestCombo = 0;
  gameoverRecords.classList.add('hidden');
  recordEntry.classList.add('hidden');
}

// devuelve true si la tecla no debe llegar al juego
function recordsKeyGuard(e) {
  if (e.target === recordNameInput) return true;
  // mantener Space pulsado al empezar no debe hacer caídas por autorepetición
  if (startKeyHeld && e.repeat) return true;
  if (!startScreen.classList.contains('hidden')) {
    // un botón con foco (p. ej. Borrar récords) conserva su Enter/Space
    if (e.target.closest && e.target.closest('button')) return true;
    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
      e.preventDefault();
      startGame();
    }
    return true;
  }
  return false;
}

recordNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); saveNameAndShow(); }
});

recordSaveBtn.addEventListener('click', () => {
  saveNameAndShow();
  recordSaveBtn.blur();
});

playBtn.addEventListener('click', () => {
  playBtn.blur();
  startGame();
});

clearRecordsBtn.addEventListener('click', () => {
  clearRecordsBtn.blur();
  if (!confirm('¿Borrar todos los récords?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* ignorar */ }
  showStartScreen();
});
// ---- fin récords ----

function init() {
  resetRecordsState();
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
  if (recordsKeyGuard(e)) return;
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

showStartScreen(); // la partida empieza al pulsar "Jugar"
