/** Small DOM helpers shared by the title screen and its sheets. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  kicker?: string;
  /** shown but not choosable (a jet not unlocked yet, revision 26), with `title` saying why */
  disabled?: boolean;
  title?: string;
  /** a small tag in the option's corner (the level a locked jet opens at) */
  badge?: string;
}

/**
 * A radio group drawn as HUD designation boxes: the chosen option is boxed like a designated target. With `rowOf`,
 * the options sit in labelled rows (the jets, one row per team).
 */
export function choiceGroup<T extends string>(
  name: string,
  legend: string,
  choices: readonly Choice<T>[],
  value: T,
  onChange: (v: T) => void,
  rowOf?: (c: Choice<T>) => string,
): HTMLFieldSetElement {
  const set = el('fieldset', `pick pick-${name}`);
  set.appendChild(el('legend', 'eyebrow', legend));
  const rows = new Map<string, HTMLDivElement>();
  const rowFor = (c: Choice<T>) => {
    const key = rowOf ? rowOf(c) : '';
    let row = rows.get(key);
    if (!row) {
      row = el('div', rowOf ? 'options option-row' : 'options');
      if (rowOf) row.appendChild(el('span', 'option-row-label', key));
      rows.set(key, row);
      set.appendChild(row);
    }
    return row;
  };
  for (const c of choices) {
    const row = rowFor(c);
    const input = el('input', 'sr-only');
    input.type = 'radio';
    input.name = name;
    input.id = `pick-${name}-${c.value}`;
    input.value = c.value;
    input.checked = c.value === value;
    input.disabled = c.disabled ?? false;
    input.addEventListener('change', () => {
      if (input.checked) onChange(c.value);
    });
    const label = el('label', 'option');
    label.htmlFor = input.id;
    if (c.disabled) label.classList.add('locked');
    if (c.title) label.title = c.title;
    // The space keeps screen readers from running "Russia" and "Kobchik" together; grid layout ignores it.
    if (c.kicker) label.append(el('span', 'option-kicker', c.kicker), ' ');
    label.appendChild(el('span', 'option-name', c.label));
    if (c.badge) label.appendChild(el('span', 'option-badge', c.badge));
    row.append(input, label);
  }
  return set;
}
