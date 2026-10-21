import { h, icon, type Child } from '../dom';

// Building blocks shared by every screen. `key` (data-key) lets a re-render restore focus
// to the same control, so keyboard and gamepad users never lose their place.

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonOpts {
  variant?: ButtonVariant;
  sub?: string;
  disabled?: boolean;
  key?: string;
  autofocus?: boolean;
  label?: string;
  className?: string;
}

export function btn(text: string, onClick: () => void, o: ButtonOpts = {}): HTMLButtonElement {
  const b = h(
    'button',
    {
      class: `dd-btn ${o.variant ?? 'secondary'}${o.sub ? ' has-sub' : ''}${o.className ? ` ${o.className}` : ''}`,
      type: 'button',
      disabled: o.disabled,
      'data-key': o.key,
      'data-autofocus': o.autofocus,
      'aria-label': o.label,
      onclick: () => onClick(),
    },
    h('span', { class: 'dd-btn-text', text }),
    o.sub ? h('span', { class: 'dd-btn-sub', text: o.sub }) : null,
  );
  return b;
}

export function header(title: string, ...right: Child[]): HTMLElement {
  return h('header', { class: 'dd-panel-head' }, h('h2', { class: 'dd-panel-title', text: title }), h('div', { class: 'dd-panel-actions' }, ...right));
}

/** Small square close button with a drawn X and an accessible name. */
export function closeBtn(label: string, onClick: () => void): HTMLButtonElement {
  return h('button', { class: 'dd-btn ghost dd-close', type: 'button', 'aria-label': label, 'data-key': 'close', onclick: () => onClick() }, h('span', { class: 'dd-x', 'aria-hidden': 'true' }), h('span', { class: 'dd-close-text', text: label }));
}

export interface LedgerRow {
  label: string;
  value: string;
  /** Icon data URL (24 px). */
  icon?: string;
  /** Extra class on the row, e.g. a rarity (uncommon, rare, relic) or ok / short. */
  tone?: string;
}

/**
 * Ledger rows, the expedition kit's tables: label, a brass dotted leader, a tabular value.
 * Shared by every screen that lists counts (black-out, reports, requirements).
 */
export function ledger(rows: LedgerRow[], className = ''): HTMLElement {
  return h(
    'ul',
    { class: `dd-ledger${className ? ` ${className}` : ''}` },
    ...rows.map((r) =>
      h(
        'li',
        { class: `dd-ledger-row${r.tone ? ` ${r.tone}` : ''}` },
        r.icon ? icon(r.icon, 24) : null,
        h('span', { class: 'dd-ledger-label', text: r.label }),
        h('span', { class: 'dd-ledger-leader', 'aria-hidden': 'true' }),
        h('b', { class: 'dd-ledger-value', text: r.value }),
      ),
    ),
  );
}

export function section(title: string, ...rows: Child[]): HTMLElement {
  return h('section', { class: 'dd-section' }, h('h3', { class: 'dd-section-title', text: title }), ...rows);
}

function row(label: string, control: HTMLElement, valueEl?: HTMLElement): HTMLElement {
  return h('div', { class: 'dd-row' }, h('span', { class: 'dd-row-label' }, label, valueEl ?? null), control);
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void, key: string, onText: string, offText: string): HTMLElement {
  const sw = h(
    'button',
    { class: 'dd-switch', type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': label, 'data-key': key },
    h('span', { class: 'dd-switch-track', 'aria-hidden': 'true' }, h('span', { class: 'dd-switch-knob' })),
    h('span', { class: 'dd-switch-text', text: value ? onText : offText }),
  );
  sw.addEventListener('click', () => {
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    sw.querySelector('.dd-switch-text')!.textContent = next ? onText : offText;
    onChange(next);
  });
  return row(label, sw);
}

export interface SliderOpts {
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  key: string;
  disabled?: boolean;
  /** Extra control after the slider (e.g. an Auto chip). */
  extra?: HTMLElement;
}

export function slider(label: string, value: number, onInput: (v: number) => void, o: SliderOpts): HTMLElement {
  const out = h('output', { class: 'dd-row-value', text: o.format(value) });
  const input = h('input', {
    class: 'dd-range',
    type: 'range',
    min: o.min,
    max: o.max,
    step: o.step,
    value,
    'aria-label': label,
    'aria-valuetext': o.format(value),
    'data-key': o.key,
    disabled: o.disabled,
  });
  const paint = (v: number) => input.style.setProperty('--fill', `${((v - o.min) / (o.max - o.min)) * 100}%`);
  paint(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    paint(v);
    const text = o.format(v);
    out.textContent = text;
    input.setAttribute('aria-valuetext', text);
    onInput(v);
  });
  return row(label, h('div', { class: 'dd-range-wrap' }, input, o.extra ?? null), out);
}

export function segmented<T extends string>(label: string, options: Array<{ value: T; text: string }>, current: T, onChange: (v: T) => void, key: string): HTMLElement {
  const group = h('div', { class: 'dd-seg', role: 'group', 'aria-label': label });
  for (const opt of options) {
    const b = h('button', {
      class: 'dd-seg-btn',
      type: 'button',
      'aria-pressed': String(opt.value === current),
      'data-key': `${key}:${opt.value}`,
      text: opt.text,
    });
    b.addEventListener('click', () => {
      for (const other of group.children) other.setAttribute('aria-pressed', String(other === b));
      onChange(opt.value);
    });
    group.appendChild(b);
  }
  return row(label, group);
}
