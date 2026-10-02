import { PROVIDERS, listModels } from './lib/providers.js';
import { loadSettings, saveSettings } from './lib/settings.js';
import { el } from './lib/dom.js';

const $ = (id) => document.getElementById(id);
const ANY_SITE = { origins: ['https://*/*', 'http://*/*'] };

let settings;
let savedTimer;

async function save() {
  await saveSettings(settings);
  $('saved').textContent = 'Saved';
  $('saved').className = 'status ok';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($('saved').textContent = ''), 1500);
}

function ensureDatalist(provider) {
  const id = `models-${provider}`;
  let list = document.getElementById(id);
  if (!list) {
    list = el('datalist', { id });
    const fallback = PROVIDERS[provider].defaultModel;
    if (fallback) list.append(el('option', { value: fallback }));
    document.querySelector('main').append(list);
  }
  return list;
}

function fillDatalist(provider, models) {
  const list = ensureDatalist(provider);
  const existing = new Set([...list.options].map((o) => o.value));
  for (const m of models) {
    if (existing.has(m.id)) continue;
    list.append(el('option', { value: m.id, text: m.note || undefined }));
  }
}

function renderKeys() {
  const rows = Object.entries(PROVIDERS).map(([provider, spec]) => {
    const input = el('input', {
      type: 'password',
      id: `key-${provider}`,
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Paste your API key',
    });
    input.value = settings.keys[provider] ?? '';
    input.addEventListener('change', () => {
      settings.keys[provider] = input.value.trim();
      input.value = settings.keys[provider];
      save();
    });

    const show = el('button', { type: 'button', text: 'Show' });
    show.addEventListener('click', () => {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      show.textContent = hidden ? 'Hide' : 'Show';
    });

    const status = el('div', { class: 'status', id: `status-${provider}` });
    const test = el('button', { type: 'button', text: 'Test' });
    test.addEventListener('click', async () => {
      const key = input.value.trim();
      if (!key) {
        status.textContent = 'Paste a key first.';
        status.className = 'status bad';
        return;
      }
      test.disabled = true;
      status.textContent = 'Checking…';
      status.className = 'status';
      try {
        const models = await listModels(provider, key);
        fillDatalist(provider, models);
        const free = models.filter((m) => m.note === 'free').length;
        status.textContent = `Key works. ${models.length} models available${free ? `, ${free} of them free` : ''}.`;
        status.className = 'status ok';
      } catch (err) {
        status.textContent = err?.message ?? String(err);
        status.className = 'status bad';
      } finally {
        test.disabled = false;
      }
    });

    return el('div', { class: 'provider' }, [
      el('label', { for: `key-${provider}` }, [
        `${spec.label} `,
        el('a', { href: spec.keyUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Get a key' }),
      ]),
      el('p', { class: 'hint', text: spec.note }),
      el('div', { class: 'key-row' }, [input, show, test]),
      status,
    ]);
  });
  $('keys').replaceChildren(...rows);
}

function modelRow(entry, { checkbox }) {
  const select = el(
    'select',
    { 'aria-label': 'Provider' },
    Object.entries(PROVIDERS).map(([value, spec]) => el('option', { value, text: spec.label })),
  );
  select.value = entry.provider;

  const input = el('input', {
    type: 'text',
    'aria-label': 'Model',
    placeholder: 'Model name',
    spellcheck: 'false',
    list: ensureDatalist(entry.provider).id,
  });
  input.value = entry.model;

  select.addEventListener('change', () => {
    const previousDefault = PROVIDERS[entry.provider].defaultModel;
    entry.provider = select.value;
    if (!input.value || input.value === previousDefault) input.value = PROVIDERS[entry.provider].defaultModel;
    entry.model = input.value.trim();
    input.setAttribute('list', ensureDatalist(entry.provider).id);
    save();
  });
  input.addEventListener('change', () => {
    entry.model = input.value.trim();
    save();
  });

  let first;
  if (checkbox) {
    first = el('input', { type: 'checkbox', 'aria-label': 'Use this checker' });
    first.checked = entry.enabled !== false;
    first.addEventListener('change', () => {
      entry.enabled = first.checked;
      save();
    });
  } else {
    first = el('span', { class: 'hint', text: 'Main' });
  }
  return el('div', { class: 'model-row' }, [first, select, input]);
}

function renderModels() {
  $('main-row').replaceChildren(...modelRow(settings.mainModel, { checkbox: false }).childNodes);
  $('checker-rows').replaceChildren(...settings.checkers.map((c) => modelRow(c, { checkbox: true })));
}

async function renderCitations() {
  $('mailto').value = settings.mailto;
  $('mailto').addEventListener('change', () => {
    settings.mailto = $('mailto').value.trim();
    save();
  });

  const box = $('check-links');
  // The user may have removed the permission from chrome://extensions.
  if (settings.checkLinks && !(await chrome.permissions.contains(ANY_SITE))) {
    settings.checkLinks = false;
    await save();
  }
  box.checked = settings.checkLinks;

  box.addEventListener('change', async () => {
    const status = $('links-status');
    if (box.checked) {
      // Must be called straight from the click, before any other await.
      const granted = await chrome.permissions.request(ANY_SITE).catch(() => false);
      box.checked = granted;
      settings.checkLinks = granted;
      status.textContent = granted ? '' : 'Permission was not granted, so links will not be checked.';
      status.className = granted ? 'status' : 'status bad';
    } else {
      await chrome.permissions.remove(ANY_SITE).catch(() => false);
      settings.checkLinks = false;
      status.textContent = '';
    }
    save();
  });
}

settings = await loadSettings();
for (const provider of Object.keys(PROVIDERS)) ensureDatalist(provider);
renderKeys();
renderModels();
renderCitations();
