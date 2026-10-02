// Runs one full check: (optionally) get an answer, extract claims, have every
// checker model judge them, and verify citations against real databases.

import { PROVIDERS, ProviderError, callModel } from './providers.js';
import {
  CHECK_SYSTEM,
  EXTRACT_SYSTEM,
  aggregateVotes,
  buildCheckPrompt,
  buildExtractPrompt,
  parseClaims,
  parseVerdicts,
} from './claims.js';
import { checkCitations, extractCitations } from './citations.js';

export const ANSWER_SYSTEM = `Answer the question accurately and concisely.
State facts plainly so they can be checked. If you are not sure about something, say so instead of guessing.
If you cite sources, give real ones with a DOI or URL where you can.`;

export function modelLabel({ provider, model }) {
  return `${PROVIDERS[provider]?.label ?? provider} · ${model}`;
}

export function resolveModels(settings) {
  const keys = settings.keys ?? {};
  const usable = (m) => Boolean(m && m.provider && m.model && keys[m.provider]);
  const checkers = (settings.checkers ?? []).filter((c) => c.enabled !== false && usable(c));
  let main = usable(settings.mainModel) ? settings.mainModel : null;
  if (!main && checkers.length) main = checkers[0];
  return { main, checkers };
}

const defaultDeps = { callModel, checkCitations };

export async function runCheck({ text, question = '', mode = 'verify', settings, signal, onProgress = () => {} }, deps = defaultDeps) {
  const notices = [];
  const { main, checkers } = resolveModels(settings);
  const keyOf = (m) => settings.keys[m.provider];
  const ask = (m, system, prompt) =>
    deps.callModel({ provider: m.provider, model: m.model, apiKey: keyOf(m), system, prompt, signal });

  let answer = null;
  let answeredBy = null;
  if (mode === 'ask') {
    if (!main) throw new ProviderError('Add an API key in Settings to ask a question.', { kind: 'auth' });
    onProgress({ stage: 'answering', message: `Asking ${modelLabel(main)}…` });
    answer = await ask(main, ANSWER_SYSTEM, question);
    answeredBy = main;
    text = answer;
    onProgress({ stage: 'answered', answer, answeredBy: modelLabel(main) });
  }

  const citationList = extractCitations(text);
  onProgress({ stage: 'citations', message: `Checking ${citationList.length} citation(s) against real databases…` });
  const citationsPromise = deps.checkCitations(citationList, {
    mailto: settings.mailto ?? '',
    checkLinks: Boolean(settings.checkLinks),
    signal,
  });
  // Awaited below; this only stops an early exit from leaving it unhandled.
  citationsPromise.catch(() => {});

  let claims = [];
  const checkerResults = [];

  if (!main) {
    notices.push('Add at least one API key in Settings to check claims. Citations were still checked: that needs no key.');
  } else {
    onProgress({ stage: 'extracting', message: `Finding factual claims with ${modelLabel(main)}…` });
    try {
      claims = await extractClaims(ask, main, text, question);
      if (claims.length === 0) notices.push('No checkable factual claims found in this text.');
    } catch (err) {
      if (err?.kind === 'cancelled') throw err;
      notices.push(`Could not extract claims: ${err?.message ?? err}`);
    }
  }

  if (claims.length && checkers.length === 0) {
    notices.push('No checker models are set up, so claims were listed but not checked. Add one in Settings.');
  }

  if (claims.length && checkers.length) {
    if (answeredBy && checkers.some((c) => c.provider === answeredBy.provider && c.model === answeredBy.model)) {
      notices.push(`${modelLabel(answeredBy)} wrote the answer and also checked it, so its vote is less independent.`);
    }
    if (checkers.length === 1) {
      notices.push('Only one checker model is set up. Add models from other companies for a real cross-check.');
    }

    onProgress({ stage: 'checking', message: `Asking ${checkers.length} model(s) to check ${claims.length} claim(s)…` });
    const prompt = buildCheckPrompt(claims, question);
    const settled = await Promise.allSettled(checkers.map((c) => ask(c, CHECK_SYSTEM, prompt)));

    settled.forEach((outcome, i) => {
      const checker = checkers[i];
      const label = modelLabel(checker);
      if (outcome.status === 'rejected') {
        if (outcome.reason?.kind === 'cancelled') throw outcome.reason;
        checkerResults.push({ label, ok: false, error: outcome.reason?.message ?? String(outcome.reason) });
        return;
      }
      const verdicts = parseVerdicts(outcome.value, claims);
      if (!verdicts) {
        checkerResults.push({ label, ok: false, error: 'Reply was not in the expected format' });
        return;
      }
      checkerResults.push({ label, ok: true, verdicts });
    });

    const working = checkerResults.filter((r) => r.ok);
    if (working.length === 0) notices.push('None of the checker models answered. See the errors below.');
  }

  const checkedClaims = claims.map((claim) => {
    const votes = checkerResults
      .filter((r) => r.ok)
      .map((r) => ({ checker: r.label, ...r.verdicts.get(claim.id) }));
    return { ...claim, ...aggregateVotes(votes), votes };
  });

  const citations = await citationsPromise;
  onProgress({ stage: 'done' });

  return {
    answer,
    answeredBy: answeredBy ? modelLabel(answeredBy) : null,
    extractedBy: main ? modelLabel(main) : null,
    claims: checkedClaims,
    checkers: checkerResults.map(({ label, ok, error }) => ({ label, ok, error: error ?? null })),
    citations,
    notices,
  };
}

async function extractClaims(ask, main, text, question) {
  const prompt = buildExtractPrompt(text, question);
  const first = parseClaims(await ask(main, EXTRACT_SYSTEM, prompt));
  if (first) return first;
  // One retry: models occasionally add prose around the JSON.
  const second = parseClaims(
    await ask(main, EXTRACT_SYSTEM, `${prompt}\n\nReply with the JSON object only. No other text.`),
  );
  if (second) return second;
  throw new ProviderError(`${modelLabel(main)} did not return claims in the expected format. Try another main model.`, {
    provider: main.provider,
    kind: 'bad_output',
  });
}
