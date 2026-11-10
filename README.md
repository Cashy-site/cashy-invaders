# Cashy Invaders

Cashy throws cash at the rival coins. A Space Invaders-style game for the Cashy Arcade.

Plain HTML, CSS and JavaScript on a canvas. No libraries, no build step, no install.

## Play it locally

From this folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser. (If port 8080 is busy, use another number.)

Opening `index.html` by double-clicking mostly works too, but a local server is the reliable way.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | ← → or A D | ← → buttons |
| Throw cash | Space, ↑ or W (hold to keep throwing) | Throw cash button |
| Pause | P or Esc | auto-pauses if you switch away |
| Sound on/off | M | speaker button, top right |

## How it plays

- 45 rival coins march sideways and drop down a row each time they reach an edge. The fewer there are, the faster they go.
- Cashy can have 3 bills in the air at once. Coins in the top row are worth 30, the middle two rows 20, the bottom two 10.
- The rival coins fire bolts back. Three hits and it's over, and so is letting them reach the street.
- The four blue bunkers crumble from both sides. They rebuild each wave.
- The **MSTR saucer** now and then crosses the top. Hit it for 50 to 300.
- An extra life every 2,500 points, up to 5.
- Each new wave starts lower and moves faster.
- Best score is saved in the browser (localStorage). Nothing is sent anywhere.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: the canvas, the sound button, the touch buttons |
| `style.css` | Fonts, layout, touch controls |
| `game.js` | The whole game |
| `assets/cashy.webp`, `assets/cashy-crouch.webp` | Cashy (temporary art, same as the site: **TODO: final art**) |
| `assets/fonts/` | Cynatar (headings) and Noto Sans (everything else), same as the site |

## Tuning

The numbers at the top of `game.js` (lives, speeds, cooldown, wave layout) are all in one block. Change them there.

## Testing hook

Add `?debug` to the URL and `window.__invaders` exposes the game state to the browser console. Leave it off for normal play.

## Putting it on the Arcade

The game runs on its own, the same way Cashy Tower does. Once this repo is on GitHub with Pages switched on, the site embeds it by URL in an iframe. The game area is 706 × 720, the same shape as Cashy Tower's frame.

## Rules this game follows

- No wallet connection, no accounts, nothing stored apart from the best score in the browser.
- No return promises anywhere in the game copy.
- Colours: the site's blues, cyan and white for the interface. Cashy and the cash keep their own colours.
