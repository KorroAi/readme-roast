// The Settings sheet (≡ in play; SPEC §9.4): the same rows as the menu's Settings screen (sound, haptics, shake,
// quality, text size, left-handed, show FPS), plus "back to the surface" and About. The world keeps digging above it.

import type { TextKey } from '../../../i18n';
import { t } from '../../../i18n';
import { h } from '../../dom';
import { settingsRows, type SettingsSink } from '../../screens/settings';
import { btn } from '../../screens/widgets';
import type { SheetBody } from '../Sheet';

export class SettingsSheet implements SheetBody {
  readonly id = 'settings' as const;
  readonly title: TextKey = 'ui.sheet.settings.title';
  readonly modes = false;
  readonly body: HTMLElement;

  constructor(private readonly sink: SettingsSink, private readonly actions: { toMenu(): void; about(): void }) {
    this.body = h('div', { class: 'dd-sheet-body dd-settings-sheet' });
  }

  opened(): void {
    this.body.replaceChildren(
      ...settingsRows(this.sink),
      h(
        'div',
        { class: 'dd-settings-foot' },
        btn(t('ui.sheet.settings.menu'), () => this.actions.toMenu(), { key: 'toMenu' }),
        btn(t('ui.menu.about'), () => this.actions.about(), { key: 'about', variant: 'ghost' }),
      ),
    );
  }

  refresh(): void {
    // Static rows: nothing to update per frame.
  }
}
