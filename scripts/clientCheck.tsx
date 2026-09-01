/**
 * Client-side interaction test.
 *
 * Mounts the real application into a jsdom document, drives it the way a user
 * would — load the demo, walk every screen, change the focus brand, apply a
 * filter, open a calculation — and fails on any console error along the way.
 *
 * SSR proves a page can render. This proves it can be used.
 */
import { JSDOM } from 'jsdom';
import type { Root } from 'react-dom/client';

type Check = (label: string, condition: boolean, detail?: string) => void;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

// Minimal browser surface the app and Recharts expect.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const globalAny = globalThis as unknown as Record<string, unknown>;
globalAny.window = dom.window;
globalAny.document = dom.window.document;
// Node exposes `navigator` as a read-only accessor, so it has to be redefined.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globalAny.HTMLElement = dom.window.HTMLElement;
globalAny.Element = dom.window.Element;
globalAny.Node = dom.window.Node;
globalAny.MouseEvent = dom.window.MouseEvent;
globalAny.Event = dom.window.Event;
globalAny.getComputedStyle = dom.window.getComputedStyle;
globalAny.requestAnimationFrame = (cb: FrameRequestCallback) => dom.window.setTimeout(() => cb(Date.now()), 0);
globalAny.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
globalAny.ResizeObserver = ResizeObserverStub;
(dom.window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
globalAny.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};

const errors: string[] = [];
const originalError = console.error;
const originalWarn = console.warn;
console.error = (...args: unknown[]) => {
  errors.push(args.map(String).join(' '));
};
console.warn = () => {};

async function tick(ms = 40) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runClientChecks(check: Check, heading: (text: string) => void) {
  // Imported after the DOM globals exist, so module-level browser access is safe.
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react-dom/test-utils');
  const { default: App } = await import('../src/App');
  const React = await import('react');

  const container = dom.window.document.getElementById('root')!;
  let root: Root;

  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(App));
  });
  await tick();

  const text = () => container.textContent ?? '';
  const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
  const byText = (needle: string) => buttons().find((b) => (b.textContent ?? '').includes(needle));
  /** Exact label match — "Save" must not resolve to the "Saved (0)" filter chip. */
  const byExactText = (label: string) => buttons().find((b) => (b.textContent ?? '').trim() === label);

  const click = async (element: Element | undefined, label: string) => {
    if (!element) {
      check(`clicks ${label}`, false, 'element not found');
      return false;
    }
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await tick();
    return true;
  };

  heading('12. Client interaction — the real app driven in a DOM');

  check('app mounts to the empty state', text().includes('From market data to brand decisions'));
  check('empty state offers the demo', Boolean(byText('Explore demo dataset')));

  await click(byText('Explore demo dataset'), 'Explore demo dataset');
  await tick(120);

  check('demo dataset loads', text().includes('Soranil'), 'focus brand rendered');
  check('KPI row renders the market size', /₹\s?3,?361|3361/.test(text()));
  check('the synthetic badge is visible', text().includes('Synthetic demo data'));
  check('attention cards are generated', text().includes('Key findings'));

  const pages = [
    ['Market Landscape', 'Market structure'],
    ['Brand Performance', 'Brand scorecard'],
    ['Molecule Explorer', 'Molecule scorecard'],
    ['Competitor Intelligence', 'Competitor landscape'],
    ['Opportunity Signals', 'What counts as a signal'],
    ['Insight Center', 'What should a Brand Manager pay attention to?'],
    ['Data Explorer', 'How was this calculated?'],
    ['MAT Data Upload', 'Upload new MAT data'],
    ['Methodology', 'Rule catalogue'],
    ['Overview', 'Executive summary'],
  ] as const;

  for (const [navLabel, expected] of pages) {
    const navButton = byText(navLabel);
    await click(navButton, `nav: ${navLabel}`);
    check(`navigates to ${navLabel}`, text().includes(expected), expected);
  }

  // Focus-brand switch from the top bar.
  await click(byText('Insight Center'), 'nav: Insight Center');
  const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[];
  const brandSelect = selects.find((s) => [...s.options].some((o) => o.value === 'Fungiclear'));
  if (brandSelect) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(brandSelect, 'Fungiclear');
      brandSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await tick(80);
    check('changing the focus brand re-runs the rule engine', text().includes('Fungiclear'), 'insights mention the new focus brand');
  } else {
    check('changing the focus brand re-runs the rule engine', false, 'brand selector not found');
  }

  // Filter interaction.
  await click(byText('Market Landscape'), 'nav: Market Landscape');
  const filterSelects = [...container.querySelectorAll('select')] as HTMLSelectElement[];
  const segmentSelect = filterSelects.find((s) => [...s.options].some((o) => o.value === 'Anti-Acne'));
  if (segmentSelect) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(segmentSelect, 'Anti-Acne');
      segmentSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await tick(80);
    check('a filter narrows the scope', text().includes('Filters are active'), 'scope note shown');
    check('the filtered scope reports its row count', /of 288 rows in scope/.test(text()));
    await click(byText('Clear filters'), 'Clear filters');
    check('filters can be cleared', !text().includes('Filters are active'));
  } else {
    check('a filter narrows the scope', false, 'segment filter not found');
  }

  // Insight workspace: save a finding, then confirm it collects under Saved.
  await click(byText('Insight Center'), 'nav: Insight Center');
  check('findings offer a save action', Boolean(byExactText('Save')));
  await click(byExactText('Save'), 'Save insight');
  check('a saved finding reports itself as saved', Boolean(byText('Saved (1)')), 'saved counter');
  await click(byText('Saved (1)'), 'Saved filter');
  check('the saved filter shows the collected findings', text().includes('Saved findings'));
  await click(byText('All ('), 'All filter');

  // Calculation modal.
  await click(byText('Insight Center'), 'nav: Insight Center');
  await click(byText('How was this calculated?'), 'How was this calculated?');
  check('the calculation modal opens', text().includes('Signal — what the data shows'));
  check('the modal shows the formula', text().includes('Growth Gap (pp)') || text().includes('Growth % ='));
  check('the modal states the no-causation rule', text().includes('It does not assert causes'));

  await act(async () => {
    root!.unmount();
  });

  console.error = originalError;
  console.warn = originalWarn;

  const realErrors = errors.filter(
    (message) =>
      !message.includes('not wrapped in act') &&
      !message.includes('ReactDOMTestUtils.act') &&
      !message.includes('Support for defaultProps'),
  );
  check('no console errors during the whole walkthrough', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
}
