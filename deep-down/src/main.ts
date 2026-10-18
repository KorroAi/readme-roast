import { Game } from './game/Game';
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

async function boot(): Promise<void> {
  if (!Renderer.isSupported()) {
    fatal(t('error.webgl'));
    return;
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui);
  await game.boot();
}

window.addEventListener('error', (e) => console.error('[deep-down]', e.error ?? e.message));
boot().catch((e) => fatal(t('error.generic'), e));
