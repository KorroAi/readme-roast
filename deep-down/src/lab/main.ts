import * as THREE from 'three';
import { t } from '../i18n';
import { Renderer } from '../render/Renderer';
import { LAB_VIEWS, TRANSITION_CAMS, VisualLab, type LabView, type TransitionCam } from './VisualLab';
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
  // Transitions view options from the URL (repeatable captures): cam, fog=1, lt=<lantern angle>.
  const camParam = params.get('cam') as TransitionCam | null;
  const lt = params.get('lt');
  lab.setTransitionOptions({
    cam: camParam && TRANSITION_CAMS.includes(camParam) ? camParam : undefined,
    fog: params.get('fog') === '1',
    lanternAngle: lt !== null && Number.isFinite(Number(lt)) ? Number(lt) : null,
  });
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
  // Transitions options: cycle the camera stop, toggle fog (shown only in that view).
  const trTools: HTMLButtonElement[] = [];
  const angle = document.createElement('button');
  angle.type = 'button';
  angle.textContent = t('lab.trAngle');
  angle.addEventListener('click', () => {
    const cur = lab.transitionOptions.cam;
    const next = TRANSITION_CAMS[(TRANSITION_CAMS.indexOf(cur) + 1) % TRANSITION_CAMS.length];
    lab.setTransitionOptions({ cam: next });
    syncUrl();
  });
  const fog = document.createElement('button');
  fog.type = 'button';
  fog.textContent = t('lab.trFog');
  fog.addEventListener('click', () => {
    lab.setTransitionOptions({ fog: !lab.transitionOptions.fog });
    syncUrl();
  });
  trTools.push(angle, fog);
  for (const b of trTools) {
    b.className = 'lab-tool';
    bar.appendChild(b);
  }
  // UI readability lives in the UI sandbox: the real HUD and screens over a cave backdrop.
  const uiLab = document.createElement('a');
  uiLab.href = './src/ui/dev/sandbox.html?lab=1&scene=hud';
  uiLab.className = 'lab-link';
  uiLab.textContent = t('lab.ui');
  bar.appendChild(uiLab);
  const back = document.createElement('a');
  back.href = './index.html';
  back.className = 'lab-back';
  back.textContent = t('lab.backToGame');
  bar.appendChild(back);
  if (params.get('chrome') !== '0') ui.appendChild(bar);
  // Android Back (android/MainActivity) returns to the game.
  (window as unknown as { deepDownBack: () => boolean }).deepDownBack = () => {
    location.href = './index.html';
    return true;
  };

  function syncUrl(): void {
    const url = new URL(location.href);
    url.searchParams.set('view', lab.currentView);
    if (lab.currentView === 'transitions') {
      url.searchParams.set('cam', lab.transitionOptions.cam);
      if (lab.transitionOptions.fog) url.searchParams.set('fog', '1');
      else url.searchParams.delete('fog');
    }
    history.replaceState(null, '', url);
    angle.classList.toggle('active', false);
    fog.classList.toggle('active', lab.transitionOptions.fog);
  }

  // Name labels projected from 3D (materials gallery and transitions court).
  const labelLayer = document.createElement('div');
  labelLayer.className = 'lab-labels';
  ui.appendChild(labelLayer);
  let labels: Array<{ el: HTMLSpanElement; pos: THREE.Vector3 }> = [];
  const buildLabels = (v: LabView) => {
    labelLayer.replaceChildren();
    labels = lab.viewLabels(v).map((l) => {
      const el = document.createElement('span');
      el.textContent = l.text;
      labelLayer.appendChild(el);
      return { el, pos: new THREE.Vector3(l.x, l.y, l.z) };
    });
  };

  function select(v: LabView): void {
    lab.setView(v);
    buttons.forEach((b, id) => b.classList.toggle('active', id === v));
    for (const b of trTools) b.hidden = v !== 'transitions';
    buildLabels(v);
    syncUrl();
  }
  select(LAB_VIEWS.some((v) => v.id === initial) ? initial : 'materials');

  const tmp = new THREE.Vector3();
  const placeLabels = () => {
    const show = labels.length > 0 && params.get('labels') !== '0';
    labelLayer.style.display = show ? '' : 'none';
    if (!show) return;
    for (const l of labels) {
      tmp.copy(l.pos).project(lab.camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      l.el.style.display = visible ? '' : 'none';
      l.el.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    }
  };

  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    lab.step(dt);
    placeLabels();
  };
  requestAnimationFrame(loop);
  window.addEventListener('resize', () => lab.renderer.resize());
  (window as unknown as { __DD__: unknown }).__DD__ = {
    get ready() {
      return lab.ready && lab.frames > 5;
    },
    setView: (v: LabView) => select(v),
    setTransitionOptions: (o: { cam?: TransitionCam; fog?: boolean; lanternAngle?: number | null }) => {
      lab.setTransitionOptions(o);
      syncUrl();
    },
    report: () => ({ view: lab.currentView, render: { ...lab.renderer.gl.info.render }, frames: lab.frames }),
  };
}

boot();
