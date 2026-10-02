import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkCitations,
  cleanTrailing,
  extractCitations,
  guessTitle,
  looksLikeReference,
  parseArxivEntry,
} from '../extension/lib/citations.js';
import {
  arxivEmpty,
  arxivError,
  arxivFeed,
  crossrefSearch,
  crossrefSingle,
  fakeFetch,
  openalexSearch,
} from './helpers.js';

const CROSSREF = 'https://api.crossref.org';
const OPENALEX = 'https://api.openalex.org';
const ARXIV = 'https://export.arxiv.org/api/query';
const HANDLES = 'https://doi.org/api/handles';

// ---------------------------------------------------------------- extraction

test('cleanTrailing keeps balanced parentheses and drops sentence punctuation', () => {
  assert.equal(cleanTrailing('10.1016/S0140-6736(20)30183-5).'), '10.1016/S0140-6736(20)30183-5');
  assert.equal(cleanTrailing('10.1038/nature14539.'), '10.1038/nature14539');
  assert.equal(cleanTrailing('https://example.com/page),'), 'https://example.com/page');
  assert.equal(cleanTrailing('https://en.wikipedia.org/wiki/Python_(language)'), 'https://en.wikipedia.org/wiki/Python_(language)');
});

test('extractCitations finds DOIs, arXiv IDs, links and reference lines', () => {
  const text = [
    'Deep learning took off (LeCun et al., doi:10.1038/nature14539).',
    'See https://doi.org/10.1038/nature14539 again and arXiv:1706.03762v5 for transformers.',
    'Also https://arxiv.org/abs/2005.14165 and the DataCite DOI 10.48550/arXiv.2303.08774.',
    'The docs are at https://docs.python.org/3/library/asyncio.html.',
    '',
    '1. Smith, J., & Doe, A. (2021). Quantum gardening for beginners. Journal of Imaginary Results, 4(2), 1-10.',
    'Vaswani et al. (2017) changed NLP forever.',
  ].join('\n');

  const found = extractCitations(text);
  assert.deepEqual(
    found.map((c) => [c.type, c.value]),
    [
      ['doi', '10.1038/nature14539'],
      ['arxiv', '1706.03762'],
      ['arxiv', '2005.14165'],
      ['arxiv', '2303.08774'],
      ['url', 'https://docs.python.org/3/library/asyncio.html'],
      ['reference', '1. Smith, J., & Doe, A. (2021). Quantum gardening for beginners. Journal of Imaginary Results, 4(2), 1-10.'],
    ],
  );
  assert.ok(found.every((c, i) => c.id === i + 1));
});

test('looksLikeReference accepts common styles and rejects prose', () => {
  assert.ok(looksLikeReference('Vaswani, A., Shazeer, N., et al. (2017). Attention is all you need. In NeurIPS.'));
  assert.ok(looksLikeReference('A. Vaswani et al., "Attention is all you need," in Proc. NeurIPS, 2017, pp. 5998-6008.'));
  assert.ok(looksLikeReference('- Brown et al. Language models are few-shot learners. NeurIPS 2020.'));
  assert.ok(!looksLikeReference('In 2017 the transformer architecture changed natural language processing.'));
  assert.ok(!looksLikeReference('Vaswani et al. (2017) changed NLP forever.'));
});

test('guessTitle reads quoted, italic and APA-style titles', () => {
  assert.equal(guessTitle('A. Vaswani et al., "Attention is all you need," in NeurIPS, 2017.'), 'Attention is all you need');
  assert.equal(guessTitle('Vaswani, A. (2017). Attention is all you need. NeurIPS.'), 'Attention is all you need');
  assert.equal(guessTitle('Vaswani 2017, *Attention Is All You Need*, NeurIPS'), 'Attention Is All You Need');
  assert.equal(guessTitle('Vaswani 2017 NeurIPS'), null);
});

test('parseArxivEntry handles found, empty and error feeds', () => {
  assert.deepEqual(parseArxivEntry(arxivFeed()), {
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    year: 2017,
    venue: 'arXiv',
  });
  assert.equal(parseArxivEntry(arxivEmpty), null);
  assert.equal(parseArxivEntry(arxivError), null);
});

// ------------------------------------------------------------------ checking

const check = (text, routes, opts = {}) => checkCitations(extractCitations(text), opts, { fetch: fakeFetch(routes) });

test('a real DOI with no title nearby is "found" and shows the real record', async () => {
  const [result] = await check('See doi:10.1038/nature14539', [
    [`${CROSSREF}/works/10.1038/nature14539`, { json: crossrefSingle() }],
  ]);
  assert.equal(result.status, 'found');
  assert.equal(result.title, 'Deep learning');
  assert.equal(result.year, 2015);
  assert.equal(result.link, 'https://doi.org/10.1038/nature14539');
});

test('a real DOI attached to the wrong title is a "mismatch"', async () => {
  const [result] = await check('Smith, J. (2020). "Quantum effects in sourdough bread rising." doi:10.1038/nature14539', [
    [`${CROSSREF}/works/10.1038/nature14539`, { json: crossrefSingle() }],
  ]);
  assert.equal(result.status, 'mismatch');
  assert.match(result.notes[0], /belongs to a different work/);
});

test('a DOI with matching title but wrong year is a "mismatch"', async () => {
  const [result] = await check('LeCun, Y., Bengio, Y., & Hinton, G. (2009). "Deep learning." Nature. doi:10.1038/nature14539', [
    [`${CROSSREF}/works/10.1038/nature14539`, { json: crossrefSingle() }],
  ]);
  assert.equal(result.status, 'mismatch');
  assert.match(result.notes.join(' '), /Year differs: the real work is from 2015, the text says 2009/);
});

test('a DOI missing from CrossRef but registered at doi.org is "found"', async () => {
  const [result] = await check('Data: 10.5281/zenodo.1234567', [
    [`${CROSSREF}/works/`, { status: 404, text: 'Resource not found.' }],
    [`${HANDLES}/10.5281/zenodo.1234567`, { json: { responseCode: 1, handle: '10.5281/zenodo.1234567' } }],
  ]);
  assert.equal(result.status, 'found');
});

test('a DOI that is registered nowhere is "not_found"', async () => {
  const [result] = await check('doi:10.9999/made.up.2023', [
    [`${CROSSREF}/works/`, { status: 404, text: 'Resource not found.' }],
    [`${HANDLES}/`, { status: 404, json: { responseCode: 100, handle: '10.9999/made.up.2023' } }],
  ]);
  assert.equal(result.status, 'not_found');
  assert.match(result.notes[0], /does not exist/);
});

test('arXiv IDs are looked up on arXiv', async () => {
  const results = await check('Transformers: arXiv:1706.03762. Also arXiv:2501.99999.', [
    [`${ARXIV}?id_list=1706.03762`, { text: arxivFeed() }],
    [`${ARXIV}?id_list=2501.99999`, { text: arxivEmpty }],
  ]);
  assert.equal(results[0].status, 'found');
  assert.equal(results[0].title, 'Attention Is All You Need');
  assert.equal(results[1].status, 'not_found');
});

test('a reference line that matches a real paper is "found"', async () => {
  const [result] = await check('Vaswani, A., Shazeer, N., et al. (2017). Attention is all you need. NeurIPS.', [
    [`${CROSSREF}/works?`, { json: crossrefSearch([{ title: 'Attention is All you Need', authors: [['Ashish', 'Vaswani']], year: 2017, doi: '10.5555/3295222.3295349' }]) }],
  ]);
  assert.equal(result.status, 'found');
  assert.equal(result.link, 'https://doi.org/10.5555/3295222.3295349');
});

test('a reference whose first author is wrong is a "mismatch"', async () => {
  const [result] = await check('Hinton, G. (2017). Attention is all you need. NeurIPS.', [
    [`${CROSSREF}/works?`, { json: crossrefSearch([{ title: 'Attention is All you Need', authors: [['Ashish', 'Vaswani']], year: 2017 }]) }],
  ]);
  assert.equal(result.status, 'mismatch');
  assert.match(result.notes.join(' '), /First author differs/);
});

test('a made-up reference with no close match is "not_found" after trying OpenAlex', async () => {
  const fetch = fakeFetch([
    [`${CROSSREF}/works?`, { json: crossrefSearch([{ title: 'Gardening practices in temperate climates', year: 2019 }]) }],
    [`${OPENALEX}/works?`, { json: openalexSearch([{ title: 'Quantum computing: an overview', year: 2020 }]) }],
  ]);
  const [result] = await checkCitations(
    extractCitations('Smith, J., & Doe, A. (2021). Quantum gardening for beginners. Journal of Imaginary Results.'),
    {},
    { fetch },
  );
  assert.equal(result.status, 'not_found');
  assert.ok(fetch.calls.some((c) => c.url.startsWith(OPENALEX)), 'falls back to OpenAlex');
  assert.ok(fetch.calls.some((c) => c.url.includes('search=Quantum%20gardening%20for%20beginners')), 'searches by title');
});

test('a reference found only in OpenAlex is "found"', async () => {
  const [result] = await check('Doe, A. (2022). "Sparse attention for very long genomic sequences." bioRxiv.', [
    [`${CROSSREF}/works?`, { json: crossrefSearch([]) }],
    [`${OPENALEX}/works?`, { json: openalexSearch([{ title: 'Sparse attention for very long genomic sequences', authors: ['Alice Doe'], year: 2022 }]) }],
  ]);
  assert.equal(result.status, 'found');
});

test('a database outage is reported as "error", never as "not_found"', async () => {
  const [result] = await check('Smith, J., & Doe, A. (2021). Quantum gardening for beginners. Journal of Imaginary Results.', [
    [`${CROSSREF}/works?`, { status: 503, text: 'busy' }],
    [`${OPENALEX}/works?`, { json: openalexSearch([]) }],
  ]);
  assert.equal(result.status, 'error');
});

test('links are skipped unless link checking is on', async () => {
  const [skipped] = await check('See https://example.com/page', []);
  assert.equal(skipped.status, 'skipped');

  const results = await check(
    'See https://example.com/ok and https://example.com/missing and https://no-such-domain.invalid/x and https://example.com/headless',
    [
      ['https://example.com/ok', { status: 200 }],
      ['https://example.com/missing', { status: 404 }],
      ['https://no-such-domain.invalid', new TypeError('fetch failed')],
      ['https://example.com/headless', (url, init) => ({ status: init.method === 'HEAD' ? 405 : 200 })],
    ],
    { checkLinks: true },
  );
  assert.deepEqual(
    results.map((r) => r.status),
    ['found', 'not_found', 'unreachable', 'found'],
  );
});

test('the contact email is sent to CrossRef and OpenAlex when set', async () => {
  const fetch = fakeFetch([
    [`${CROSSREF}/works?`, { json: crossrefSearch([]) }],
    [`${OPENALEX}/works?`, { json: openalexSearch([]) }],
  ]);
  await checkCitations(
    extractCitations('Smith, J., & Doe, A. (2021). Quantum gardening for beginners. Journal of Imaginary Results.'),
    { mailto: 'me@example.com' },
    { fetch },
  );
  assert.ok(fetch.calls.every((c) => c.url.includes('mailto=me%40example.com')));
});
