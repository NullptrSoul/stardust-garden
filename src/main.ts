import { config } from './game/config';
import { Game } from './game/game';
import { Renderer } from './game/render';
import { createWebPlatform } from './platform/web';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const platform = createWebPlatform(canvas);
const renderer = new Renderer(platform);
const game = new Game(platform);

platform.onResize(() => renderer.resize());
platform.onPointer((e) => {
  const p = renderer.toDesign(e.x, e.y);
  game.onPointer(e.type, p.x, p.y, e.id);
});
platform.onKey((type, key) => game.onKey(type, key));

let last = platform.now();
function frame(): void {
  const now = platform.now();
  // Clamp so a background tab or a hitch doesn't jump the simulation.
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  game.update(dt);
  renderer.draw(game);
  platform.requestFrame(frame);
}
platform.requestFrame(frame);

// Tuning panel: always in dev; add ?tune to a deployed URL to get it there too.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('tune')) {
  void import('./dev/tuning').then((m) => m.createTuningPanel(game));
}
if (import.meta.env.DEV) {
  // Handles for testing from the browser console.
  Object.assign(window, { game, config, renderer });
}
