// Tiny DOM builder so screens read as structure instead of createElement noise.

export type Child = Node | string | number | null | undefined | false;

type Listener = (e: Event) => void;

export interface Props {
  class?: string;
  text?: string | number;
  [attr: string]: string | number | boolean | Listener | undefined;
}

/**
 * Create an element. `on*` props become event listeners, `class` sets className, `text`
 * sets textContent, booleans toggle attributes, everything else is an attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const key in props) {
      const v = props[key];
      if (v === undefined || v === false) continue;
      if (key === 'class') el.className = String(v);
      else if (key === 'text') el.textContent = String(v);
      else if (typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v);
      else el.setAttribute(key, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** <img> for a generated icon, sized in CSS px, decorative unless a label is given. */
export function icon(src: string, cssSize: number, className = 'dd-icon', label?: string): HTMLImageElement {
  return h('img', {
    class: className,
    src,
    width: cssSize,
    height: cssSize,
    alt: label ?? '',
    draggable: 'false',
    'aria-hidden': label ? undefined : 'true',
  });
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}
