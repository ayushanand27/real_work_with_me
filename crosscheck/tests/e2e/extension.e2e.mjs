// End-to-end check of the real extension in Chromium. Model and database
// replies are faked, so it needs no API keys and costs nothing.
//
//   npx playwright install chromium   # once
//   npm run test:e2e
//
// Set SCREENSHOT_DIR to save screenshots of the side panel.

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '../../extension');
const shots = process.env.SCREENSHOT_DIR;

const TEXT = `The Eiffel Tower is in Paris and was finished in 1899.
Water boils at 100 °C at sea level.

References
1. LeCun, Y., Bengio, Y., & Hinton, G. (2015). "Deep learning." Nature, 521, 436-444. doi:10.1038/nature14539
2. Smith, J., & Doe, A. (2021). Quantum gardening for beginners. Journal of Imaginary Results, 4(2), 1-10.
3. Turing, A. (1950). "Sourdough fermentation kinetics." doi:10.1093/mind/LIX.236.433`;

const CLAIMS = {
  claims: [
    { id: 1, text: 'The Eiffel Tower is in Paris.' },
    { id: 2, text: 'The Eiffel Tower was finished in 1899.' },
    { id: 3, text: 'Water boils at 100 °C at sea level.' },
  ],
};

const verdicts = (second) => ({
  verdicts: [
    { id: 1, verdict: 'true', confidence: 0.99, reason: 'It stands on the Champ de Mars in Paris.', correction: null },
    second,
    { id: 3, verdict: 'true', confidence: 0.95, reason: 'Standard boiling point at 1 atm.', correction: null },
  ],
});

const GROQ_VERDICTS = verdicts({ id: 2, verdict: 'false', confidence: 0.95, reason: 'It was completed in 1889 for the World Fair.', correction: 'It was finished in 1889.' });
const GEMINI_VERDICTS = verdicts({ id: 2, verdict: 'true', confidence: 0.6, reason: 'Built in the late 1800s.', correction: null });

function isExtraction(body) {
  const system = body.messages?.[0]?.content ?? body.systemInstruction?.parts?.[0]?.text ?? '';
  return system.includes('atomic factual claims');
}

async function mockNetwork(context, seen) {
  const json = (route, data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

  await context.route('https://api.groq.com/**', async (route) => {
    const url = route.request().url();
    seen.push(url);
    if (url.endsWith('/models')) return json(route, { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'llama-3.1-8b-instant' }] });
    const body = route.request().postDataJSON();
    const isAnswer = body.messages[0].content.startsWith('Answer the question');
    const userText = body.messages[1].content;
    const claims = userText.includes('onerror') ? { claims: [{ id: 1, text: '<img src=x onerror="window.__pwned=1"> Paris is in France.' }] } : CLAIMS;
    const content = isAnswer ? 'The Eiffel Tower is in Paris and was finished in 1899.' : JSON.stringify(isExtraction(body) ? claims : GROQ_VERDICTS);
    return json(route, { choices: [{ message: { content }, finish_reason: 'stop' }] });
  });

  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    seen.push(route.request().url());
    return json(route, { candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(GEMINI_VERDICTS) + '\n```' }] }, finishReason: 'STOP' }] });
  });

  await context.route('https://api.crossref.org/**', async (route) => {
    const url = route.request().url();
    seen.push(url);
    if (url.includes('/works/10.1038/nature14539')) {
      return json(route, { status: 'ok', message: { DOI: '10.1038/nature14539', title: ['Deep learning'], author: [{ given: 'Yann', family: 'LeCun' }, { given: 'Yoshua', family: 'Bengio' }, { given: 'Geoffrey', family: 'Hinton' }], issued: { 'date-parts': [[2015, 5, 27]] }, 'container-title': ['Nature'] } });
    }
    if (url.includes('/works/10.1093/mind/LIX.236.433')) {
      return json(route, { status: 'ok', message: { DOI: '10.1093/mind/LIX.236.433', title: ['I.—Computing Machinery and Intelligence'], author: [{ given: 'A. M.', family: 'Turing' }], issued: { 'date-parts': [[1950, 10, 1]] }, 'container-title': ['Mind'] } });
    }
    if (url.includes('/works?')) {
      return json(route, { status: 'ok', message: { items: [{ DOI: '10.1/xyz', title: ['Urban gardening and community health'], author: [{ given: 'K', family: 'Lee' }], issued: { 'date-parts': [[2019]] } }] } });
    }
    return route.fulfill({ status: 404, body: 'Resource not found.' });
  });

  await context.route('https://api.openalex.org/**', (route) => {
    seen.push(route.request().url());
    return json(route, { results: [] });
  });
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  viewport: { width: 420, height: 900 },
});

const failures = [];
try {
  const seen = [];
  await mockNetwork(context, seen);

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const pageErrors = [];
  context.on('weberror', (e) => pageErrors.push(e.error().message));

  // ---- Settings: add two free keys and load a model list.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.fill('#key-groq', 'gsk_test');
  await options.locator('#key-groq').dispatchEvent('change');
  await options.fill('#key-gemini', 'AIza_test');
  await options.locator('#key-gemini').dispatchEvent('change');
  await options.locator('#key-groq ~ button', { hasText: 'Test' }).click();
  await options.waitForSelector('#status-groq.ok');
  assert.match(await options.textContent('#status-groq'), /Key works\. 2 models available/);
  const stored = await options.evaluate(() => chrome.storage.local.get('settings'));
  assert.equal(stored.settings.keys.groq, 'gsk_test');
  assert.equal(stored.settings.keys.gemini, 'AIza_test');
  if (shots) await options.screenshot({ path: path.join(shots, 'settings.png'), fullPage: true });
  await options.close();

  // ---- Check text.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.waitForSelector('#setup-hint', { state: 'hidden' });
  await panel.fill('#text', TEXT);
  await panel.click('#run');
  await panel.waitForSelector('#claims li');
  await panel.waitForSelector('#run:not([disabled])');

  const claimBadges = await panel.locator('#claims li .item-head .badge').allTextContents();
  assert.deepEqual(claimBadges, ['Models agree', 'Disputed', 'Models agree']);
  assert.match(await panel.textContent('#claims'), /A checker says instead: It was finished in 1889\./);

  const citationBadges = await panel.locator('#citations li .item-head .badge').allTextContents();
  assert.deepEqual(citationBadges, ['Real', 'Not found', 'Wrong details']);
  assert.match(await panel.textContent('#citations'), /belongs to a different work/);
  assert.match(await panel.textContent('#checkers'), /Groq · llama-3\.3-70b-versatile: checked the claims/);
  assert.ok(seen.some((u) => u.includes('generativelanguage')), 'Gemini was asked');
  if (shots) await panel.screenshot({ path: path.join(shots, 'check-text.png'), fullPage: true });

  // ---- Ask & check.
  await panel.click('#tab-ask');
  assert.equal(await panel.isVisible('#text'), false);
  await panel.fill('#question', 'Where is the Eiffel Tower and when was it finished?');
  await panel.click('#run');
  await panel.waitForSelector('#answer-section:not([hidden])');
  await panel.waitForSelector('#run:not([disabled])');
  assert.match(await panel.textContent('#answer'), /finished in 1899/);
  assert.match(await panel.textContent('#notices'), /wrote the answer and also checked it/);
  if (shots) await panel.screenshot({ path: path.join(shots, 'ask.png'), fullPage: true });

  // ---- Right-click flow: the background worker hands text over via session storage.
  await panel.click('#tab-verify');
  await worker.evaluate(() =>
    chrome.storage.session.set({ pending: { text: 'Deep learning paper: doi:10.1038/nature14539', at: Date.now() } }),
  );
  await panel.waitForFunction(() => document.querySelector('#text').value.includes('doi:10.1038/nature14539'));
  await panel.waitForSelector('#citations li');
  await panel.waitForSelector('#run:not([disabled])');
  assert.deepEqual(await panel.locator('#citations li .item-head .badge').allTextContents(), ['Real']);

  // ---- Untrusted text must never become HTML.
  await panel.fill('#text', '<img src=x onerror="window.__pwned=1"> Paris is in France.');
  await panel.click('#run');
  await panel.waitForSelector('#claims li');
  await panel.waitForSelector('#run:not([disabled])');
  assert.match(await panel.textContent('#claims'), /<img src=x onerror/);
  assert.equal(await panel.locator('#claims img').count(), 0);
  assert.equal(await panel.evaluate(() => window.__pwned), undefined);

  assert.deepEqual(pageErrors, [], 'no uncaught errors in extension pages');
} catch (err) {
  failures.push(err);
} finally {
  await context.close();
}

if (failures.length) {
  console.error(failures[0]);
  process.exit(1);
}
console.log('e2e: all checks passed');
