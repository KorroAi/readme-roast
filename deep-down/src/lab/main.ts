import { t } from '../i18n';
import { Renderer } from '../render/Renderer';
import { LAB_VIEWS, VisualLab, type LabView } from './VisualLab';
import './lab.css';

/** Visual Lab entry: view switcher + a window.__DD__ hook for the screenshot tool. */
function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  if (!Renderer.isSupported()) {
    ui.textContent = t('error.webgl');
    return;
  }
  const lab = new VisualLab(canvas);
  const params = new URLSearchParams(location.search);
  const initial = (params.get('view') as LabView) ?? 'materials';
  const bar = document.createElement('nav');
  bar.className = 'lab-bar';
  const title = document.createElement('span');
  title.className = 'lab-title';
  title.textContent = t('lab.title');
  bar.appendChild(title);
  const buttons = new Map<LabView, HTMLButtonElement>();
  for (const v of LAB_VIEWS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(v.label);
    b.addEventListener('click', () => select(v.id));
    buttons.set(v.id, b);
    bar.appendChild(b);
  }
  const back = document.createElement('a');
  back.href = './index.html';
  back.className = 'lab-back';
  back.textContent = t('lab.backToGame');
  bar.appendChild(back);
  if (params.get('chrome') !== '0') ui.appendChild(bar);

  function select(v: LabView): void {
    lab.setView(v);
    buttons.forEach((b, id) => b.classList.toggle('active', id === v));
    const url = new URL(location.href);
    url.searchParams.set('view', v);
    history.replaceState(null, '', url);
  }
  select(LAB_VIEWS.some((v) => v.id === initial) ? initial : 'materials');

  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    lab.step(dt);
  };
  requestAnimationFrame(loop);
  window.addEventListener('resize', () => lab.renderer.resize());
  (window as unknown as { __DD__: unknown }).__DD__ = {
    get ready() {
      return lab.ready && lab.frames > 5;
    },
    setView: (v: LabView) => select(v),
    report: () => ({ view: lab.currentView, render: { ...lab.renderer.gl.info.render }, frames: lab.frames }),
  };
}

boot();
