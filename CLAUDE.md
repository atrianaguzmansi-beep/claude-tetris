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

Three files: `index.html` (DOM: `#board` canvas 300×600, side panel with `#score`/`#lines`/`#level`, `#next-canvas` 120×120, `#overlay` for pause/game over), `style.css` (dark retro theme), `game.js` (all logic, global mutable state, no modules).

Key points in `game.js`:

- **Board**: `ROWS × COLS` matrix; each cell `0` (empty) or color index 1–8. The piece type number doubles as the value stored in its shape matrix and as the index into `COLORS`/`PIECES` (index 0 is `null`). Adding a piece type means updating `PIECES` and `COLORS` (`randomPiece()` uses `PIECES.length - 1`). Type 8 is the custom "tuerca" challenge piece (3×3 ring, hollow center).
- **Pieces**: square matrices; rotation = `rotateCW` (transpose + reverse). `tryRotate` applies simple horizontal wall kicks `[0,-1,1,-2,2]` (not SRS).
- **Collision** (`collide`): out of bounds left/right/bottom or overlap; rows with `y < 0` are allowed.
- **Loop** (`loop`): `requestAnimationFrame`, accumulates `dt` into `dropAccum`, drops one row when `≥ dropInterval`. Lock path: `lockPiece` → `merge` → `clearLines` → `spawn`; `spawn` triggers `endGame()` if the new piece collides immediately.
- **Scoring/levels**: `LINE_SCORES[cleared] * level`; hard drop +2/cell, soft drop +1/row. Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY()` projection drawn at `alpha 0.2`.
- **Skins**: `SKINS = { retro, neon, pastel, pixel }`, each `{ colors, drawBlock, boardBg, grid }`. `drawBlock` delegates to `activeSkin` (retro = original look, uses `COLORS`). `setSkin(key)` swaps skin, sets canvas inline `background` (`boardBg`; `null` = theme CSS var), saves `localStorage` key `skin`, redraws if paused/gameOver. `drawGrid` uses `activeSkin.grid || gridColor`. Skin draw fns that set shadow use `save/restore`. Adding a color index means adding it to every skin's `colors`.
- **Input**: single `keydown` handler (arrows, `KeyX` rotate, `Space` hard drop, `KeyP` pause). `restart-btn` calls `init()`, which resets all state.

## Gotchas

- Changing `COLS`, `ROWS`, or `BLOCK` requires updating `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). `drawNext` assumes a 4×4 grid at 30px (matches the 120×120 next canvas).
- `togglePause` shows the overlay on pause but does not hide it on resume.
- `cancelAnimationFrame` inside `endGame()` can't cancel the frame currently running, so `loop` checks `gameOver` before re-requesting `requestAnimationFrame`. Keep that check if refactoring the loop.
