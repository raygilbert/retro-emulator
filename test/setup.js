import '@testing-library/jest-dom/vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const createStorage = () => {
  let store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store = new Map();
    },
  };
};

if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== 'function') {
  const storage = createStorage();
  globalThis.localStorage = storage;
  if (globalThis.window) {
    globalThis.window.localStorage = storage;
  }
}
