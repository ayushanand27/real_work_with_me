import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractJson } from '../extension/lib/jsonish.js';
import {
  MAX_CLAIMS,
  aggregateVotes,
  buildCheckPrompt,
  normalizeVerdict,
  parseClaims,
  parseVerdicts,
} from '../extension/lib/claims.js';

test('extractJson handles fences, prose and trailing commas', () => {
  assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! Here it is: {"a": [1, 2,],} Hope that helps.'), { a: [1, 2] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson(undefined), null);
});

test('parseClaims numbers claims, drops blanks and duplicates, caps the count', () => {
  const raw = JSON.stringify({
    claims: [
      { id: 7, text: ' Paris is the capital of France. ' },
      { id: 8, text: '' },
      'The Eiffel Tower is in Paris.',
      { id: 9, text: 'paris is the capital of france.' },
    ],
  });
  assert.deepEqual(parseClaims(raw), [
    { id: 1, text: 'Paris is the capital of France.' },
    { id: 2, text: 'The Eiffel Tower is in Paris.' },
  ]);

  const many = JSON.stringify({ claims: Array.from({ length: 40 }, (_, i) => ({ text: `Fact number ${i}` })) });
  assert.equal(parseClaims(many).length, MAX_CLAIMS);

  assert.deepEqual(parseClaims('{"claims": []}'), []);
  assert.equal(parseClaims('I could not find any.'), null);
});

test('normalizeVerdict maps synonyms and defaults to unsure', () => {
  assert.equal(normalizeVerdict('TRUE'), 'true');
  assert.equal(normalizeVerdict('Supported'), 'true');
  assert.equal(normalizeVerdict('incorrect'), 'false');
  assert.equal(normalizeVerdict('maybe'), 'unsure');
  assert.equal(normalizeVerdict(undefined), 'unsure');
});

test('parseVerdicts fills skipped claims with unsure and clamps confidence', () => {
  const claims = [
    { id: 1, text: 'a' },
    { id: 2, text: 'b' },
  ];
  const raw = JSON.stringify({
    verdicts: [{ id: 1, verdict: 'false', confidence: 1.7, reason: 'Wrong year', correction: 'It was 1969.' }],
  });
  const verdicts = parseVerdicts(raw, claims);
  assert.deepEqual(verdicts.get(1), { verdict: 'false', confidence: 1, reason: 'Wrong year', correction: 'It was 1969.' });
  assert.equal(verdicts.get(2).verdict, 'unsure');
  assert.equal(parseVerdicts('nope', claims), null);
});

test('aggregateVotes', () => {
  const v = (verdict, correction = null) => ({ checker: 'x', verdict, correction });
  assert.equal(aggregateVotes([v('true'), v('true'), v('true')]).status, 'agreed');
  assert.equal(aggregateVotes([v('true'), v('true'), v('unsure')]).status, 'agreed');
  assert.equal(aggregateVotes([v('true'), v('unsure'), v('unsure')]).status, 'unverified');
  assert.equal(aggregateVotes([v('true'), v('false'), v('true')]).status, 'disputed');
  assert.equal(aggregateVotes([v('false'), v('false'), v('unsure')]).status, 'refuted');
  assert.equal(aggregateVotes([v('false'), v('unsure'), v('unsure')]).status, 'doubtful');
  assert.equal(aggregateVotes([]).status, 'unchecked');

  const result = aggregateVotes([v('false', 'It was 1969.'), v('false'), v('true')]);
  assert.equal(result.status, 'disputed');
  assert.deepEqual(result.counts, { true: 1, false: 2, unsure: 0 });
  assert.deepEqual(result.corrections, ['It was 1969.']);
});

test('buildCheckPrompt does not include anything but the claims and question', () => {
  const prompt = buildCheckPrompt([{ id: 1, text: 'Water boils at 100 C at sea level.' }], 'At what temperature does water boil?');
  assert.match(prompt, /<question>\nAt what temperature does water boil\?\n<\/question>/);
  assert.match(prompt, /<claims>\n1\. Water boils at 100 C at sea level\.\n<\/claims>/);
});
