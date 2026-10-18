import { Game } from './game/Game';
import type { UiFactory } from './game/GameUi';
import { Renderer } from './render/Renderer';
import { UI } from './ui/UI';
import { t } from './i18n';

let failed = false;

function fatal(message: string, err?: unknown): void {
  failed = true;
  console.error(message, err);
  const el = document.createElement('div');
  el.className = 'fatal';
  el.setAttribute('role', 'alert');
  el.textContent = message;
  document.body.appendChild(el);
}

const createUi: UiFactory = (root, actions, bus, input) => new UI(root, actions, bus, input);

// Android Back before the game has installed its handler: ignore while loading, exit after a fatal error.
(window as unknown as { deepDownBack: () => boolean }).deepDownBack = () => !failed;

async function boot(): Promise<void> {
  if (!Renderer.isSupported()) {
    fatal(t('error.webgl'));
    return;
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui, createUi);
  await game.boot();
}

window.addEventListener('error', (e) => console.error('[deep-down]', e.error ?? e.message));
boot().catch((e) => fatal(t('error.generic'), e));
