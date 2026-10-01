// Browser APIs needed by Ant Design's responsive layouts in jsdom.
if (typeof window !== 'undefined') {
  if (!window.matchMedia)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return true;
        },
      }),
    });
  if (!globalThis.ResizeObserver)
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  // jsdom has no pseudo-element layout; rc-table probes scrollbar dimensions.
  const getStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element: Element) => getStyle(element);
  // Node 22 ships its own (flag-gated, undefined) localStorage global; on
  // that runtime vitest's jsdom population leaves bare `localStorage`
  // unset. Capture the window storage first (the global may alias window,
  // so a getter returning window.localStorage would recurse) and fall back
  // to an in-memory Storage when even that is missing.
  const captured = window.localStorage;
  if (globalThis.localStorage === undefined || globalThis.localStorage === null) {
    const store = captured ?? createMemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        return store;
      },
    });
  }
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}
