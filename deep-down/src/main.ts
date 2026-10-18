import { Game } from './game/Game';
import type { UiFactory } from './game/GameUi';
import { Renderer } from './render/Renderer';
import { t } from './i18n';

function fatal(message: string, err?: unknown): void {
  console.error(message, err);
  const el = document.createElement('div');
  el.className = 'fatal';
  el.setAttribute('role', 'alert');
  el.textContent = message;
  document.body.appendChild(el);
}

// Temporary while the UI module is being built: fall back to the dev stub if it is missing.
async function loadUi(): Promise<UiFactory> {
  try {
    const path = './ui/UI.ts';
    const m = await import(/* @vite-ignore */ path);
    return (root, actions, bus, input) => new m.UI(root, actions, bus, input);
  } catch {
    const { StubUI } = await import('./debug/StubUI');
    return () => new StubUI();
  }
}

async function boot(): Promise<void> {
  if (!Renderer.isSupported()) {
    fatal(t('error.webgl'));
    return;
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui, await loadUi());
  await game.boot();
}

window.addEventListener('error', (e) => console.error('[deep-down]', e.error ?? e.message));
boot().catch((e) => fatal(t('error.generic'), e));
