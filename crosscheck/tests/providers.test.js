import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ProviderError, callModel, listModels } from '../extension/lib/providers.js';
import { fakeFetch } from './helpers.js';

const base = { system: 'sys', prompt: 'hello' };

test('OpenAI-compatible providers get the right URL, auth and token field', async () => {
  const fetch = fakeFetch([[/chat\/completions$/, { json: { choices: [{ message: { content: 'hi there' }, finish_reason: 'stop' }] } }]]);
  const deps = { fetch };

  assert.equal(await callModel({ ...base, provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_1' }, deps), 'hi there');
  await callModel({ ...base, provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-2' }, deps);
  await callModel({ ...base, provider: 'openrouter', model: 'x/y:free', apiKey: 'sk-or-3' }, deps);

  const [groq, deepseek, openrouter] = fetch.calls;
  assert.equal(groq.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(groq.init.headers.Authorization, 'Bearer gsk_1');
  const groqBody = JSON.parse(groq.init.body);
  assert.equal(groqBody.max_completion_tokens, 8192);
  assert.deepEqual(groqBody.messages, [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hello' },
  ]);

  assert.equal(deepseek.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(JSON.parse(deepseek.init.body).max_tokens, 8192);
  assert.equal(openrouter.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(openrouter.init.headers['X-Title'], 'CrossCheck');
});

test('Gemini requests use the key header and skip thought parts', async () => {
  const fetch = fakeFetch([
    [
      /generateContent$/,
      {
        json: {
          candidates: [
            {
              content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"ok":' }, { text: 'true}' }] },
              finishReason: 'STOP',
            },
          ],
        },
      },
    ],
  ]);
  const out = await callModel({ ...base, provider: 'gemini', model: 'models/gemini-flash-lite-latest', apiKey: 'AIza1' }, { fetch });
  assert.equal(out, '{"ok":true}');
  const [call] = fetch.calls;
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent');
  assert.equal(call.init.headers['x-goog-api-key'], 'AIza1');
  const body = JSON.parse(call.init.body);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'sys' }] });
  assert.equal(body.generationConfig.maxOutputTokens, 8192);
});

test('Gemini safety blocks become a "refused" error', async () => {
  const fetch = fakeFetch([[/generateContent$/, { json: { promptFeedback: { blockReason: 'SAFETY' } } }]]);
  await assert.rejects(
    callModel({ ...base, provider: 'gemini', model: 'g', apiKey: 'k' }, { fetch }),
    (err) => err instanceof ProviderError && err.kind === 'refused',
  );
});

test('HTTP errors map to friendly kinds', async () => {
  const cases = [
    [401, 'auth', /API key was rejected/],
    [402, 'credits', /out of credits/],
    [429, 'rate_limit', /rate limit/],
    [404, 'bad_request', /check the model name/],
    [500, 'other', /server error/],
  ];
  for (const [status, kind, message] of cases) {
    const fetch = fakeFetch([[/./, { status, json: { error: { message: 'detail from server' } } }]]);
    await assert.rejects(
      callModel({ ...base, provider: 'groq', model: 'm', apiKey: 'k' }, { fetch }),
      (err) => err.kind === kind && message.test(err.message) && /detail from server/.test(err.message),
      `HTTP ${status}`,
    );
  }
});

test('network failures and empty answers are reported', async () => {
  const down = fakeFetch([[/./, new TypeError('fetch failed')]]);
  await assert.rejects(callModel({ ...base, provider: 'groq', model: 'm', apiKey: 'k' }, { fetch: down }), (err) => err.kind === 'network');

  const empty = fakeFetch([[/./, { json: { choices: [{ message: { content: '  ' } }] } }]]);
  await assert.rejects(callModel({ ...base, provider: 'groq', model: 'm', apiKey: 'k' }, { fetch: empty }), (err) => err.kind === 'empty');
});

test('missing key or model is rejected before any request', async () => {
  const fetch = fakeFetch([]);
  await assert.rejects(callModel({ ...base, provider: 'groq', model: 'm', apiKey: '' }, { fetch }), (err) => err.kind === 'auth');
  await assert.rejects(callModel({ ...base, provider: 'groq', model: '', apiKey: 'k' }, { fetch }), (err) => err.kind === 'bad_request');
  assert.equal(fetch.calls.length, 0);
});

function fakeAnthropic(response) {
  const created = [];
  const client = {
    messages: { create: async (params, opts) => (created.push({ path: 'messages', params, opts }), response) },
    beta: { messages: { create: async (params, opts) => (created.push({ path: 'beta', params, opts }), response) } },
  };
  return { created, createAnthropic: (opts) => ((client.opts = opts), client), client };
}

test('Claude Opus 5.5 calls opt into server-side refusal fallback', async () => {
  const fake = fakeAnthropic({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'answer' }] });
  const out = await callModel({ ...base, provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant' }, fake);
  assert.equal(out, 'answer');
  assert.equal(fake.client.opts.apiKey, 'sk-ant');
  assert.equal(fake.client.opts.dangerouslyAllowBrowser, true);
  const [call] = fake.created;
  assert.equal(call.path, 'beta');
  assert.deepEqual(call.params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(call.params.fallbacks, 'default');
  assert.equal(call.params.max_tokens, 16000);
  assert.equal(call.params.system, 'sys');
});

test('Claude models without fallback support use the plain endpoint', async () => {
  const fake = fakeAnthropic({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
  await callModel({ ...base, provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'sk-ant' }, fake);
  assert.equal(fake.created[0].path, 'messages');
  assert.equal(fake.created[0].params.fallbacks, undefined);
});

test('a Claude refusal is an error, not an empty answer', async () => {
  const fake = fakeAnthropic({ stop_reason: 'refusal', content: [], stop_details: { type: 'refusal', category: null } });
  await assert.rejects(
    callModel({ ...base, provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant' }, fake),
    (err) => err.kind === 'refused',
  );
});

test('listModels puts free OpenRouter models first and filters Gemini models', async () => {
  const fetch = fakeFetch([
    [
      'https://openrouter.ai/api/v1/models',
      {
        json: {
          data: [
            { id: 'b/paid', pricing: { prompt: '0.000001', completion: '0.000002' } },
            { id: 'a/free:free', pricing: { prompt: '0', completion: '0' } },
          ],
        },
      },
    ],
    [
      'https://generativelanguage.googleapis.com/v1beta/models',
      {
        json: {
          models: [
            { name: 'models/gemini-flash-lite-latest', displayName: 'Flash-Lite', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          ],
        },
      },
    ],
  ]);
  assert.deepEqual(await listModels('openrouter', 'k', { fetch }), [
    { id: 'a/free:free', note: 'free' },
    { id: 'b/paid', note: '' },
  ]);
  assert.deepEqual(await listModels('gemini', 'k', { fetch }), [{ id: 'gemini-flash-lite-latest', note: 'Flash-Lite' }]);
});
