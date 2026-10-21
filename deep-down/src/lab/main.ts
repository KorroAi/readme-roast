import { Renderer } from '../render/Renderer';
import { bootHybridLab } from './hybridLab';
import './lab.css';

/** The Lantern Lab entry (visuallab.html): DepthScene on a stand-in node, with window.__DD__.lab for the capture tool. */
async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  if (!Renderer.isSupported()) {
    document.body.textContent = 'WebGL 2 is required.';
    return;
  }
  const lab = await bootHybridLab(canvas);
  const w = window as unknown as { __DD__?: Record<string, unknown> };
  w.__DD__ = { ...(w.__DD__ ?? {}), lab, get ready() { return lab.ready; } };
}

void boot();
