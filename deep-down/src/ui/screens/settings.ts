import { t } from '../../i18n';
import { SETTINGS_LIMITS } from '../../save/settings';
import type { Settings } from '../../save/types';
import { h } from '../dom';
import { multiplier, percent } from '../format';
import type { ScreenHost } from './host';
import { btn, closeBtn, header, section, segmented, slider, toggle } from './widgets';

/**
 * Settings. Every control applies immediately through UiActions.updateSettings; sliders
 * update their own readout while dragging instead of rebuilding the screen.
 */
export function buildSettings(host: ScreenHost): HTMLElement {
  const a = host.actions;
  const s = a.getSettings();
  const set = (p: Partial<Settings>) => host.patchSettings(p);
  const drag = (p: Partial<Settings>) => host.patchSettings(p, true);
  const on = t('settings.on');
  const off = t('settings.off');
  const vol = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'ambienceVolume') =>
    slider(label, s[key], (v) => drag({ [key]: v }), { min: 0, max: 1, step: 0.05, format: percent, key });

  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings.title') },
      header(t('settings.title'), closeBtn(t('menu.back'), () => host.settingsBack())),
      h(
        'div',
        { class: 'dd-scroll' },
        section(
          t('settings.graphics'),
          segmented(
            t('settings.quality'),
            [
              { value: 'battery', text: t('settings.quality.battery') },
              { value: 'balanced', text: t('settings.quality.balanced') },
              { value: 'high', text: t('settings.quality.high') },
            ],
            s.quality,
            (quality) => set({ quality }),
            'quality',
          ),
          resolutionRow(s, set, drag),
          slider(t('settings.brightness'), s.brightness, (brightness) => drag({ brightness }), {
            min: SETTINGS_LIMITS.brightness[0],
            max: SETTINGS_LIMITS.brightness[1],
            step: 0.05,
            format: percent,
            key: 'brightness',
          }),
          toggle(t('settings.bloom'), s.bloom, (bloom) => set({ bloom }), 'bloom', on, off),
          toggle(t('settings.showFps'), s.showFps, (showFps) => set({ showFps }), 'showFps', on, off),
        ),
        section(
          t('settings.controls'),
          slider(t('settings.lookSensitivity'), s.lookSensitivity, (lookSensitivity) => drag({ lookSensitivity }), {
            min: SETTINGS_LIMITS.lookSensitivity[0],
            max: SETTINGS_LIMITS.lookSensitivity[1],
            step: 0.05,
            format: multiplier,
            key: 'look',
          }),
          toggle(t('settings.invertY'), s.invertY, (invertY) => set({ invertY }), 'invertY', on, off),
          toggle(t('settings.leftHanded'), s.leftHanded, (leftHanded) => set({ leftHanded }), 'leftHanded', on, off),
          toggle(t('settings.vibration'), s.vibration, (vibration) => set({ vibration }), 'vibration', on, off),
          toggle(t('settings.cameraFollow'), s.cameraFollow, (cameraFollow) => set({ cameraFollow }), 'cameraFollow', on, off),
        ),
        section(
          t('settings.audio'),
          vol(t('settings.master'), 'masterVolume'),
          vol(t('settings.music'), 'musicVolume'),
          vol(t('settings.sfx'), 'sfxVolume'),
          vol(t('settings.ambience'), 'ambienceVolume'),
        ),
        section(
          t('settings.accessibility'),
          slider(t('settings.cameraShake'), s.cameraShake, (cameraShake) => drag({ cameraShake }), { min: 0, max: 1, step: 0.05, format: percent, key: 'shake' }),
          segmented(
            t('settings.textSize'),
            [
              { value: 'normal', text: t('settings.textSize.normal') },
              { value: 'large', text: t('settings.textSize.large') },
            ],
            s.textSize,
            (textSize) => set({ textSize }),
            'textSize',
          ),
          toggle(t('settings.highContrast'), s.highContrast, (highContrast) => set({ highContrast }), 'contrast', on, off),
        ),
        h(
          'div',
          { class: 'dd-settings-foot' },
          btn(
            t('settings.reset'),
            () => {
              a.resetSettings();
              host.toast(t('settings.resetDone'), 'info');
              host.rerender();
            },
            { key: 'reset' },
          ),
          btn(
            t('settings.deleteSave'),
            () =>
              host.confirm({
                text: t('settings.deleteSaveConfirm'),
                yes: t('settings.deleteSaveYes'),
                no: t('settings.deleteSaveNo'),
                danger: true,
                onYes: () => {
                  a.deleteSave();
                  host.toast(t('settings.deleteSaveDone'), 'info');
                  host.rerender();
                },
              }),
            { variant: 'danger', key: 'delete', disabled: !a.hasSave() },
          ),
        ),
      ),
    ),
  );
}

/** Resolution: a slider over the allowed scale range plus an Auto chip (null = preset default). */
function resolutionRow(s: Settings, set: (p: Partial<Settings>) => void, drag: (p: Partial<Settings>) => void): HTMLElement {
  const [min, max] = SETTINGS_LIMITS.renderScale;
  const auto = h('button', { class: 'dd-chip-btn', type: 'button', 'aria-pressed': String(s.renderScale === null), 'data-key': 'scaleAuto', text: t('settings.auto') });
  // Dragging the slider leaves Auto; the chip goes back to the preset's own resolution.
  const row = slider(t('settings.renderScale'), s.renderScale ?? 1, (v) => {
    auto.setAttribute('aria-pressed', 'false');
    row.classList.remove('is-auto');
    drag({ renderScale: v });
  }, { min, max, step: 0.05, format: percent, key: 'scale', extra: auto });
  const out = row.querySelector('output')!;
  const input = row.querySelector('input')!;
  const showAuto = (isAuto: boolean) => {
    row.classList.toggle('is-auto', isAuto);
    out.textContent = isAuto ? t('settings.auto') : percent(Number(input.value));
  };
  showAuto(s.renderScale === null);
  auto.addEventListener('click', () => {
    const next = auto.getAttribute('aria-pressed') !== 'true';
    auto.setAttribute('aria-pressed', String(next));
    showAuto(next);
    set({ renderScale: next ? null : Number(input.value) });
  });
  return row;
}
