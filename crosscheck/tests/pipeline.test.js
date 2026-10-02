import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveModels, runCheck } from '../extension/lib/pipeline.js';
import { CHECK_SYSTEM, EXTRACT_SYSTEM } from '../extension/lib/claims.js';
import { DEFAULT_SETTINGS, mergeSettings } from '../extension/lib/settings.js';
import { ProviderError } from '../extension/lib/providers.js';

const TEXT = 'The Eiffel Tower is in Paris. It was finished in 1899. See doi:10.1038/nature14539';

const CLAIMS_JSON = JSON.stringify({
  claims: [
    { id: 1, text: 'The Eiffel Tower is in Paris.' },
    { id: 2, text: 'The Eiffel Tower was finished in 1899.' },
  ],
});

const verdicts = (v1, v2, correction = null) =>
  JSON.stringify({
    verdicts: [
      { id: 1, verdict: v1, confidence: 0.9, reason: 'r1', correction: null },
      { id: 2, verdict: v2, confidence: 0.8, reason: 'r2', correction },
    ],
  });

function settingsWith(keys) {
  return mergeSettings({ ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys, ...keys } });
}

// A fake callModel that answers by provider and records every call.
function fakeModels(byProvider) {
  const calls = [];
  const callModel = async (args) => {
    calls.push(args);
    const reply = byProvider[args.provider];
    const value = typeof reply === 'function' ? reply(args, calls) : reply;
    if (value instanceof Error) throw value;
    return value;
  };
  return { calls, callModel };
}

const noCitations = async (list) => list.map((c) => ({ ...c, status: 'found', notes: [] }));

test('resolveModels uses only models that have a key', () => {
  const none = resolveModels(settingsWith({}));
  assert.equal(none.main, null);
  assert.equal(none.checkers.length, 0);

  const onlyGroq = resolveModels(settingsWith({ groq: 'g' }));
  assert.equal(onlyGroq.main.provider, 'groq', 'falls back to the first working checker');
  assert.deepEqual(onlyGroq.checkers.map((c) => c.provider), ['groq']);

  const full = resolveModels(settingsWith({ anthropic: 'a', groq: 'g', gemini: 'm', deepseek: 'd' }));
  assert.equal(full.main.model, 'claude-opus-5-5');
  assert.deepEqual(full.checkers.map((c) => c.provider), ['groq', 'gemini', 'deepseek']);
});

test('verify mode: extract claims, cross-check them, combine the votes', async () => {
  const models = fakeModels({
    anthropic: CLAIMS_JSON,
    groq: verdicts('true', 'false', 'It was finished in 1889.'),
    gemini: verdicts('true', 'false'),
    deepseek: verdicts('true', 'unsure'),
  });
  const progress = [];
  const result = await runCheck(
    {
      text: TEXT,
      settings: settingsWith({ anthropic: 'a', groq: 'g', gemini: 'm', deepseek: 'd' }),
      onProgress: (e) => progress.push(e.stage),
    },
    { callModel: models.callModel, checkCitations: noCitations },
  );

  // 1 extraction + 3 checkers
  assert.equal(models.calls.length, 4);
  assert.equal(models.calls[0].system, EXTRACT_SYSTEM);
  assert.match(models.calls[0].prompt, /<text>\nThe Eiffel Tower is in Paris/);
  for (const call of models.calls.slice(1)) {
    assert.equal(call.system, CHECK_SYSTEM);
    assert.doesNotMatch(call.prompt, /See doi/, 'checkers see the claims, not the original text');
  }

  assert.deepEqual(result.claims.map((c) => c.status), ['agreed', 'refuted']);
  assert.deepEqual(result.claims[1].corrections, ['It was finished in 1889.']);
  assert.equal(result.claims[0].votes.length, 3);
  assert.equal(result.citations.length, 1);
  assert.equal(result.extractedBy, 'Anthropic (Claude) · claude-opus-5-5');
  assert.deepEqual(result.notices, []);
  assert.deepEqual(progress, ['citations', 'extracting', 'checking', 'done']);
});

test('a failing checker is reported and the others still count', async () => {
  const models = fakeModels({
    anthropic: CLAIMS_JSON,
    groq: new ProviderError('Groq: rate limit or daily free quota reached', { kind: 'rate_limit' }),
    gemini: verdicts('true', 'true'),
    deepseek: 'Sorry, I cannot answer in JSON.',
  });
  const result = await runCheck(
    { text: TEXT, settings: settingsWith({ anthropic: 'a', groq: 'g', gemini: 'm', deepseek: 'd' }) },
    { callModel: models.callModel, checkCitations: noCitations },
  );
  assert.deepEqual(
    result.checkers.map((c) => [c.ok, c.error]),
    [
      [false, 'Groq: rate limit or daily free quota reached'],
      [true, null],
      [false, 'Reply was not in the expected format'],
    ],
  );
  assert.deepEqual(result.claims.map((c) => [c.status, c.total]), [
    ['agreed', 1],
    ['agreed', 1],
  ]);
});

test('with no keys, citations are still checked', async () => {
  const models = fakeModels({});
  const result = await runCheck(
    { text: TEXT, settings: settingsWith({}) },
    { callModel: models.callModel, checkCitations: noCitations },
  );
  assert.equal(models.calls.length, 0);
  assert.equal(result.claims.length, 0);
  assert.equal(result.citations.length, 1);
  assert.match(result.notices[0], /Add at least one API key/);
});

test('extraction is retried once when the reply is not JSON', async () => {
  const models = fakeModels({
    groq: (args) => (args.system === EXTRACT_SYSTEM ? (args.prompt.includes('JSON object only') ? CLAIMS_JSON : 'Here are the claims: ...') : verdicts('true', 'true')),
  });
  const result = await runCheck(
    { text: TEXT, settings: settingsWith({ groq: 'g' }) },
    { callModel: models.callModel, checkCitations: noCitations },
  );
  assert.equal(result.claims.length, 2);
  assert.match(result.notices.join(' '), /Only one checker model/);
});

test('if claims cannot be extracted, citation results are still returned', async () => {
  const models = fakeModels({ groq: 'never JSON' });
  const result = await runCheck(
    { text: TEXT, settings: settingsWith({ groq: 'g' }) },
    { callModel: models.callModel, checkCitations: noCitations },
  );
  assert.equal(result.claims.length, 0);
  assert.equal(result.citations.length, 1);
  assert.match(result.notices[0], /Could not extract claims/);
});

test('ask mode: the main model answers, then the answer is checked', async () => {
  const models = fakeModels({
    anthropic: (args) => (args.system === EXTRACT_SYSTEM ? CLAIMS_JSON : TEXT),
    groq: verdicts('true', 'false'),
    gemini: verdicts('true', 'false'),
  });
  const result = await runCheck(
    {
      mode: 'ask',
      question: 'Where is the Eiffel Tower and when was it finished?',
      settings: settingsWith({ anthropic: 'a', groq: 'g', gemini: 'm' }),
    },
    { callModel: models.callModel, checkCitations: noCitations },
  );
  assert.equal(result.answer, TEXT);
  assert.equal(result.answeredBy, 'Anthropic (Claude) · claude-opus-5-5');
  assert.match(models.calls[1].prompt, /<question>\nWhere is the Eiffel Tower/);
  assert.deepEqual(result.claims.map((c) => c.status), ['agreed', 'refuted']);
});

test('ask mode warns when the answering model also checks itself', async () => {
  const models = fakeModels({ groq: (args) => (args.system === EXTRACT_SYSTEM ? CLAIMS_JSON : args.system === CHECK_SYSTEM ? verdicts('true', 'true') : TEXT) });
  const result = await runCheck(
    { mode: 'ask', question: 'q?', settings: settingsWith({ groq: 'g' }) },
    { callModel: models.callModel, checkCitations: noCitations },
  );
  assert.match(result.notices.join(' '), /wrote the answer and also checked it/);
});

test('ask mode without any key fails clearly', async () => {
  await assert.rejects(
    runCheck({ mode: 'ask', question: 'q?', settings: settingsWith({}) }, { callModel: async () => '', checkCitations: noCitations }),
    /Add an API key/,
  );
});

test('mergeSettings fills gaps and ignores junk', () => {
  const merged = mergeSettings({ keys: { groq: 'g' }, checkers: [{ model: 'other' }], checkLinks: 'yes' });
  assert.equal(merged.keys.groq, 'g');
  assert.equal(merged.keys.gemini, '');
  assert.deepEqual(merged.checkers[0], { provider: 'groq', model: 'other', enabled: true });
  assert.equal(merged.checkers.length, 4);
  assert.equal(merged.checkLinks, false);
  assert.deepEqual(mergeSettings(undefined), mergeSettings(DEFAULT_SETTINGS));
});
