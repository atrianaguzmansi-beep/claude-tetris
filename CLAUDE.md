# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas + CSS). No dependencies, no `package.json`, no build, no tests, no linter. README and UI text are in Spanish — keep user-facing strings in Spanish.

## Running

Open `index.html` directly, or serve statically (recommended):

```bash
python -m http.server 8000   # then http://localhost:8000
npx serve .
```

## Architecture

Three files: `index.html` (DOM: `#board` canvas 300×600, side panel with `#score`/`#lines`/`#level`, `#next-canvas` 120×120, `#overlay` for game over, `#pause-menu` for pause), `style.css` (dark retro theme), `game.js` (all logic, global mutable state, no modules).

Key points in `game.js`:

- **Board**: `ROWS × COLS` matrix; each cell `0` (empty) or color index 1–8. The piece type number doubles as the value stored in its shape matrix and as the index into `COLORS`/`PIECES` (index 0 is `null`). Adding a piece type means updating `PIECES` and `COLORS` (`randomPiece()` uses `PIECES.length - 1`). Type 8 is the custom "tuerca" challenge piece (3×3 ring, hollow center).
- **Pieces**: square matrices; rotation = `rotateCW` (transpose + reverse). `tryRotate` applies simple horizontal wall kicks `[0,-1,1,-2,2]` (not SRS).
- **Collision** (`collide`): out of bounds left/right/bottom or overlap; rows with `y < 0` are allowed.
- **Loop** (`loop`): `requestAnimationFrame`, accumulates `dt` into `dropAccum`, drops one row when `≥ dropInterval`. Lock path: `lockPiece` → `merge` → `clearLines` → `spawn`; `spawn` triggers `endGame()` if the new piece collides immediately.
- **Scoring/levels**: `LINE_SCORES[cleared] * level`; hard drop +2/cell, soft drop +1/row. Level = `baseLevel + floor(lines/10)` (`baseLevel` = `startLevel` captured by `init()`, so changing the selector mid-game only affects the next game); `dropInterval = intervalFor(level)` = `max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY()` projection drawn at `alpha 0.2`.
- **Input**: single `keydown` handler (arrows, `KeyX` rotate, `Space` hard drop, `KeyP`/`Escape` pause). `restart-btn` calls `init()`, which resets all state.
- **Pause menu** (`// ---- Menú de pausa ----` block): `togglePause` shows/hides `#pause-menu` (Reanudar, Reiniciar → `init()`, Ver controles, Nivel inicial 1–10 persisted in `localStorage` key `startLevel`). While paused, keys go to `handlePauseMenuKey` (↑/↓ focus nav, Tab trapped in menu). Resume resets `lastTime` (paused time doesn't count; `dropAccum` is kept so pause-spam can't freeze gravity) and calls `armInputGrace()`: game keys ignored for `RESUME_GRACE_MS`, and auto-repeats of keys pressed before resume (tracked in `keyDownAt`) ignored until released. Restarts (both buttons) also arm the grace.

## Gotchas

- Changing `COLS`, `ROWS`, or `BLOCK` requires updating `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). `drawNext` assumes a 4×4 grid at 30px (matches the 120×120 next canvas).
- `cancelAnimationFrame` inside `endGame()` can't cancel the frame currently running, so `loop` checks `gameOver` before re-requesting `requestAnimationFrame`. Keep that check if refactoring the loop.
