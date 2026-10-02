// One call shape for every model provider the user can bring a key for.
// Keys are passed in per call and never stored or logged here.

import Anthropic from '../vendor/anthropic-sdk.js';

export const PROVIDERS = {
  groq: {
    label: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    tokenField: 'max_completion_tokens',
    keyUrl: 'https://console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile',
    note: 'Free tier, no card needed',
  },
  gemini: {
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/apikey',
    defaultModel: 'gemini-flash-lite-latest',
    note: 'Free tier for Flash models; free-tier prompts may be used by Google',
  },
  openrouter: {
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    tokenField: 'max_tokens',
    keyUrl: 'https://openrouter.ai/keys',
    defaultModel: '',
    note: 'Models ending in ":free" cost nothing (daily limit applies)',
  },
  deepseek: {
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com',
    tokenField: 'max_tokens',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: 'deepseek-chat',
    note: 'Prepaid, very cheap',
  },
  openai: {
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    tokenField: 'max_completion_tokens',
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultModel: '',
    note: 'Prepaid',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-opus-5-5',
    note: 'Prepaid',
  },
};

// Models that accept server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

const REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 8192;
const ANTHROPIC_MAX_TOKENS = 16000;

export class ProviderError extends Error {
  constructor(message, { provider, status = null, kind = 'other' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.kind = kind;
  }
}

const defaultDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  createAnthropic: (opts) => new Anthropic(opts),
};

export async function callModel(
  { provider, model, apiKey, system, prompt, maxTokens, signal },
  deps = defaultDeps,
) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new ProviderError(`Unknown provider "${provider}"`, { provider });
  if (!apiKey) throw new ProviderError(`No API key for ${spec.label}`, { provider, kind: 'auth' });
  if (!model) throw new ProviderError(`No model chosen for ${spec.label}`, { provider, kind: 'bad_request' });

  const args = { spec, provider, model, apiKey, system, prompt, signal };
  let text;
  if (spec.kind === 'openai') {
    text = await callOpenAICompatible({ ...args, maxTokens: maxTokens ?? DEFAULT_MAX_TOKENS }, deps);
  } else if (spec.kind === 'gemini') {
    text = await callGemini({ ...args, maxTokens: maxTokens ?? DEFAULT_MAX_TOKENS }, deps);
  } else {
    text = await callAnthropic({ ...args, maxTokens: maxTokens ?? ANTHROPIC_MAX_TOKENS }, deps);
  }

  if (!text || !text.trim()) {
    throw new ProviderError(`${spec.label} returned an empty answer`, { provider, kind: 'empty' });
  }
  return text;
}

async function callOpenAICompatible({ spec, provider, model, apiKey, system, prompt, maxTokens, signal }, deps) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') headers['X-Title'] = 'CrossCheck';

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    [spec.tokenField]: maxTokens,
  };

  const data = await postJson(`${spec.baseUrl}/chat/completions`, { headers, body, signal, provider, spec }, deps);
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'content_filter') {
    throw new ProviderError(`${spec.label} declined to answer`, { provider, kind: 'refused' });
  }
  const content = choice?.message?.content;
  if (Array.isArray(content)) return content.map((part) => part?.text ?? '').join('');
  return content ?? '';
}

async function callGemini({ spec, provider, model, apiKey, system, prompt, maxTokens, signal }, deps) {
  const modelId = model.replace(/^models\//, '');
  const url = `${spec.baseUrl}/models/${encodeURIComponent(modelId)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };

  const data = await postJson(url, { headers, body, signal, provider, spec }, deps);
  if (data?.promptFeedback?.blockReason) {
    throw new ProviderError(`${spec.label} blocked the request (${data.promptFeedback.blockReason})`, {
      provider,
      kind: 'refused',
    });
  }
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new ProviderError(`${spec.label} declined to answer`, { provider, kind: 'refused' });
  }
  const parts = candidate?.content?.parts ?? [];
  return parts
    .filter((part) => typeof part.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('');
}

async function callAnthropic({ spec, provider, model, apiKey, system, prompt, maxTokens, signal }, deps) {
  const client = deps.createAnthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    timeout: REQUEST_TIMEOUT_MS,
  });
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  };

  let response;
  try {
    response = FALLBACK_MODELS.has(model)
      ? await client.beta.messages.create(
          { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
          { signal },
        )
      : await client.messages.create(params, { signal });
  } catch (err) {
    throw anthropicError(err, spec, provider);
  }

  if (response.stop_reason === 'refusal') {
    throw new ProviderError(`${spec.label} declined to answer`, { provider, kind: 'refused' });
  }
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function anthropicError(err, spec, provider) {
  if (err instanceof Anthropic.APIUserAbortError || err?.name === 'AbortError') {
    return new ProviderError('Cancelled', { provider, kind: 'cancelled' });
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError(`${spec.label}: API key was rejected`, { provider, status: err.status, kind: 'auth' });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError(`${spec.label}: rate limit reached, try again in a minute`, {
      provider,
      status: err.status,
      kind: 'rate_limit',
    });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError(`${spec.label}: could not connect (${err.message})`, { provider, kind: 'network' });
  }
  if (err instanceof Anthropic.APIError) {
    const message = err.error?.error?.message ?? err.message;
    const kind = /credit balance/i.test(message) ? 'credits' : err.status === 400 ? 'bad_request' : 'other';
    return new ProviderError(`${spec.label}: ${message}`, { provider, status: err.status ?? null, kind });
  }
  return new ProviderError(`${spec.label}: ${err?.message ?? err}`, { provider });
}

async function postJson(url, { headers, body, signal, provider, spec }, deps) {
  return requestJson(url, { method: 'POST', headers, body: JSON.stringify(body), signal, provider, spec }, deps);
}

async function requestJson(url, { method, headers, body, signal, provider, spec }, deps) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await deps.fetch(url, {
      method,
      headers,
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) throw new ProviderError('Cancelled', { provider, kind: 'cancelled' });
    if (err?.name === 'TimeoutError') {
      throw new ProviderError(`${spec.label}: no answer after ${REQUEST_TIMEOUT_MS / 1000}s`, { provider, kind: 'network' });
    }
    throw new ProviderError(`${spec.label}: could not connect (${err?.message ?? err})`, { provider, kind: 'network' });
  }

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail = data?.error?.message ?? (typeof data?.error === 'string' ? data.error : null) ?? raw.slice(0, 200);
    throw new ProviderError(`${spec.label}: ${httpProblem(res.status)}${detail ? ` (${detail})` : ''}`, {
      provider,
      status: res.status,
      kind: httpKind(res.status),
    });
  }
  if (data === null) {
    throw new ProviderError(`${spec.label}: response was not JSON`, { provider, status: res.status });
  }
  return data;
}

function httpKind(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'credits';
  if (status === 429) return 'rate_limit';
  if (status === 400 || status === 404 || status === 422) return 'bad_request';
  return 'other';
}

function httpProblem(status) {
  switch (httpKind(status)) {
    case 'auth':
      return 'API key was rejected';
    case 'credits':
      return 'out of credits';
    case 'rate_limit':
      return 'rate limit or daily free quota reached';
    case 'bad_request':
      return `request rejected (HTTP ${status}), check the model name`;
    default:
      return `server error (HTTP ${status})`;
  }
}

// Lists the models a key can use, for the settings page. Returns [{ id, note }].
export async function listModels(provider, apiKey, deps = defaultDeps) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new ProviderError(`Unknown provider "${provider}"`, { provider });
  if (!apiKey) throw new ProviderError(`No API key for ${spec.label}`, { provider, kind: 'auth' });

  if (spec.kind === 'anthropic') {
    const client = deps.createAnthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: REQUEST_TIMEOUT_MS });
    const models = [];
    try {
      for await (const m of client.models.list()) models.push({ id: m.id, note: m.display_name ?? '' });
    } catch (err) {
      throw anthropicError(err, spec, provider);
    }
    return models;
  }

  if (spec.kind === 'gemini') {
    const data = await requestJson(
      `${spec.baseUrl}/models?pageSize=1000`,
      { method: 'GET', headers: { 'x-goog-api-key': apiKey }, provider, spec },
      deps,
    );
    return (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), note: m.displayName ?? '' }));
  }

  const data = await requestJson(
    `${spec.baseUrl}/models`,
    { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, provider, spec },
    deps,
  );
  const models = (data.data ?? []).map((m) => {
    const free = m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0;
    return { id: m.id, note: free ? 'free' : '' };
  });
  // Free models first so they are easy to find on OpenRouter.
  return models.sort((a, b) => (b.note === 'free') - (a.note === 'free') || a.id.localeCompare(b.id));
}
