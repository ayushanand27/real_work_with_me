// Settings live in chrome.storage.local: on this device only, never synced.

export const DEFAULT_SETTINGS = {
  keys: { groq: '', gemini: '', openrouter: '', deepseek: '', openai: '', anthropic: '' },
  // Finds the claims in a text, and answers questions in "Ask & check" mode.
  mainModel: { provider: 'anthropic', model: 'claude-opus-5-5' },
  // Judge the claims independently. Models from different companies make
  // the cross-check meaningful.
  checkers: [
    { provider: 'groq', model: 'llama-3.3-70b-versatile', enabled: true },
    { provider: 'gemini', model: 'gemini-flash-lite-latest', enabled: true },
    { provider: 'deepseek', model: 'deepseek-chat', enabled: true },
    { provider: 'openrouter', model: '', enabled: false },
  ],
  mailto: '',
  checkLinks: false,
};

export function mergeSettings(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  return {
    keys: { ...DEFAULT_SETTINGS.keys, ...(s.keys ?? {}) },
    mainModel: { ...DEFAULT_SETTINGS.mainModel, ...(s.mainModel ?? {}) },
    checkers: DEFAULT_SETTINGS.checkers.map((def, i) => ({ ...def, ...(s.checkers?.[i] ?? {}) })),
    mailto: typeof s.mailto === 'string' ? s.mailto : DEFAULT_SETTINGS.mailto,
    checkLinks: typeof s.checkLinks === 'boolean' ? s.checkLinks : DEFAULT_SETTINGS.checkLinks,
  };
}

export async function loadSettings(storage = chrome.storage.local) {
  const { settings } = await storage.get('settings');
  return mergeSettings(settings);
}

export async function saveSettings(settings, storage = chrome.storage.local) {
  await storage.set({ settings: mergeSettings(settings) });
}
