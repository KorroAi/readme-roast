import { t } from '../../i18n';
import { SETTINGS_LIMITS } from '../../save/settings';
import type { Settings } from '../../save/types';
import { h } from '../dom';
import { percent } from '../format';
import type { ScreenHost } from './host';
import { btn, closeBtn, header, section, segmented, slider, toggle } from './widgets';

/** Where the settings rows send their changes (the screen host, or the in-play Settings sheet). */
export interface SettingsSink {
  get(): Settings;
  set(p: Partial<Settings>): void;
  /** A slider drag: at most one patch per frame. */
  drag(p: Partial<Settings>): void;
}

/**
 * The settings rows (SPEC §9.4, W1: sound, haptics, shake, quality, text size, left-handed; plus Show FPS for
 * the device test, CRITIQUE MUST 16c). Shared by the menu's Settings screen and the in-play Settings sheet.
 */
export function settingsRows(sink: SettingsSink): HTMLElement[] {
  const s = sink.get();
  const on = t('settings.on');
  const off = t('settings.off');
  const vol = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume') =>
    slider(label, s[key], (v) => sink.drag({ [key]: v }), { min: 0, max: 1, step: 0.05, format: percent, key });
  return [
    section(t('settings.audio'), vol(t('settings.master'), 'masterVolume'), vol(t('settings.music'), 'musicVolume'), vol(t('settings.sfx'), 'sfxVolume')),
    section(
      t('ui.settings.feel'),
      toggle(t('ui.settings.haptics'), s.vibration, (vibration) => sink.set({ vibration }), 'vibration', on, off),
      slider(t('settings.cameraShake'), s.cameraShake, (cameraShake) => sink.drag({ cameraShake }), { min: 0, max: 1, step: 0.05, format: percent, key: 'shake' }),
      toggle(t('settings.leftHanded'), s.leftHanded, (leftHanded) => sink.set({ leftHanded }), 'leftHanded', on, off),
    ),
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
        (quality) => sink.set({ quality }),
        'quality',
      ),
      slider(t('settings.brightness'), s.brightness, (brightness) => sink.drag({ brightness }), {
        min: SETTINGS_LIMITS.brightness[0],
        max: SETTINGS_LIMITS.brightness[1],
        step: 0.05,
        format: percent,
        key: 'brightness',
      }),
      toggle(t('settings.showFps'), s.showFps, (showFps) => sink.set({ showFps }), 'showFps', on, off),
    ),
    section(
      t('settings.accessibility'),
      segmented(
        t('settings.textSize'),
        [
          { value: 'normal', text: t('settings.textSize.normal') },
          { value: 'large', text: t('settings.textSize.large') },
        ],
        s.textSize,
        (textSize) => sink.set({ textSize }),
        'textSize',
      ),
      toggle(t('settings.highContrast'), s.highContrast, (highContrast) => sink.set({ highContrast }), 'contrast', on, off),
    ),
  ];
}

/** The Settings screen (from the menu): the rows, About, reset and erase. */
export function buildSettings(host: ScreenHost): HTMLElement {
  const a = host.actions;
  const sink: SettingsSink = { get: () => a.getSettings(), set: (p) => host.patchSettings(p), drag: (p) => host.patchSettings(p, true) };
  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings.title') },
      header(
        t('settings.title'),
        btn(t('ui.settings.about'), () => host.show('about'), { variant: 'ghost', key: 'about', className: 'dd-about-link', label: t('ui.settings.aboutLabel') }),
        closeBtn(t('menu.back'), () => host.settingsBack()),
      ),
      h(
        'div',
        { class: 'dd-scroll' },
        ...settingsRows(sink),
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
            t('ui.settings.erase'),
            () =>
              host.confirm({
                text: t('ui.settings.eraseConfirm'),
                yes: t('ui.settings.eraseYes'),
                no: t('settings.deleteSaveNo'),
                danger: true,
                onYes: () => {
                  a.deleteSave();
                  host.toast(t('ui.settings.eraseDone'), 'info');
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
