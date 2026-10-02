// Finds references in a text and checks each one against real bibliographic
// databases (CrossRef, doi.org, arXiv, OpenAlex). No AI model is involved, so
// these verdicts can't be hallucinated themselves.

import { containsWord, contentWords, normalize, titleCoverage, truncate } from './text.js';

export const MAX_CITATIONS = 30;
const CONCURRENCY = 3;
const LOOKUP_TIMEOUT_MS = 20_000;
const LINK_TIMEOUT_MS = 10_000;

const CROSSREF = 'https://api.crossref.org';
const OPENALEX = 'https://api.openalex.org';
const ARXIV = 'https://export.arxiv.org/api/query';
const DOI_HANDLES = 'https://doi.org/api/handles';

const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>`]+/gi;
const ARXIV_RE = /\barxiv(?:\.org\/(?:abs|pdf)\/|\s*:\s*|\s+)(\d{4}\.\d{4,5})(?:v\d+)?/gi;
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const YEAR_RE = /\b(19\d{2}|20\d{2})[a-z]?\b/;
const LIST_MARKER = String.raw`(?:[-*•]\s+|\d+[.)]\s+|\[\d+\]\s*)`;
const AUTHOR_COMMA_RE = new RegExp(String.raw`^${LIST_MARKER}?[A-Z][A-Za-z'’\-]+,\s+(?:[A-Z]\.|[A-Z][a-z]+)`);
const AUTHOR_INITIAL_RE = new RegExp(String.raw`^${LIST_MARKER}?(?:[A-Z]\.\s*)+[A-Z][a-z]+`);
const LISTED_ET_AL_RE = new RegExp(String.raw`^${LIST_MARKER}[A-Z][A-Za-z'’\-]+ et al\.`);
const QUOTED_TITLE_RE = /["“]([^"”]{12,300})["”]|\*([^*]{12,300})\*|_([^_]{12,300})_/;
const APA_TITLE_RE = /\((?:19|20)\d{2}[a-z]?\)\.?\s+([^.?!]{12,300})[.?!]/;

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export function extractCitations(text) {
  const found = [];
  const seen = new Set();
  const add = (type, value, context) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key) || found.length >= MAX_CITATIONS) return;
    seen.add(key);
    found.push({ id: found.length + 1, type, value, context: context.trim() });
  };

  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const hits = findIdentifiers(line);
    for (const hit of hits) add(hit.type, hit.value, line);
    if (hits.length === 0 && looksLikeReference(line)) add('reference', line.trim(), line);
  }
  return found;
}

// Identifiers in one line, in the order they appear.
function findIdentifiers(line) {
  const hits = [];
  for (const match of line.matchAll(DOI_RE)) {
    const doi = cleanTrailing(match[0]);
    const arxivDoi = doi.match(/^10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i);
    hits.push(arxivDoi ? { index: match.index, type: 'arxiv', value: arxivDoi[1] } : { index: match.index, type: 'doi', value: doi });
  }
  for (const match of line.matchAll(ARXIV_RE)) {
    hits.push({ index: match.index, type: 'arxiv', value: match[1] });
  }
  for (const match of line.matchAll(URL_RE)) {
    const url = cleanTrailing(match[0]);
    let host;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    // DOI and arXiv links are picked up by the patterns above, with better checks.
    if (/(^|\.)doi\.org$/.test(host) || /(^|\.)arxiv\.org$/.test(host)) {
      hits.push({ index: match.index, type: 'skip' });
      continue;
    }
    hits.push({ index: match.index, type: 'url', value: url });
  }
  return hits.sort((a, b) => a.index - b.index).filter((hit) => hit.type !== 'skip');
}

// Strips punctuation that ends the sentence rather than the identifier,
// keeping balanced parentheses such as 10.1016/S0140-6736(20)30183-5.
export function cleanTrailing(s) {
  let out = s;
  for (;;) {
    const last = out.at(-1);
    if (/[.,;:!?'"”’*_]/.test(last)) {
      out = out.slice(0, -1);
    } else if (last === ')' && count(out, '(') < count(out, ')')) {
      out = out.slice(0, -1);
    } else if (last === ']' && count(out, '[') < count(out, ']')) {
      out = out.slice(0, -1);
    } else {
      return out;
    }
  }
}

function count(s, ch) {
  return s.split(ch).length - 1;
}

export function looksLikeReference(line) {
  const trimmed = line.trim();
  if (trimmed.length < 30 || trimmed.length > 500) return false;
  if (!YEAR_RE.test(trimmed)) return false;
  if (QUOTED_TITLE_RE.test(trimmed) && /\b[A-Z][a-z]+\b/.test(trimmed)) return true;
  const authorShape =
    AUTHOR_COMMA_RE.test(trimmed) || AUTHOR_INITIAL_RE.test(trimmed) || LISTED_ET_AL_RE.test(trimmed);
  return authorShape && contentWords(trimmed).length >= 6;
}

export function guessTitle(line) {
  const quoted = line.match(QUOTED_TITLE_RE);
  if (quoted) return (quoted[1] ?? quoted[2] ?? quoted[3]).trim().replace(/[,.]$/, '');
  const apa = line.match(APA_TITLE_RE);
  if (apa) return apa[1].trim();
  return null;
}

function guessYear(line) {
  const m = line.match(YEAR_RE);
  return m ? Number(m[1]) : null;
}

function mentionsAuthors(line) {
  return (
    AUTHOR_COMMA_RE.test(line.trim()) ||
    AUTHOR_INITIAL_RE.test(line.trim()) ||
    /\bet al\b/i.test(line)
  );
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

const defaultDeps = { fetch: (...args) => globalThis.fetch(...args) };

export async function checkCitations(citations, { mailto = '', checkLinks = false, signal } = {}, deps = defaultDeps) {
  const ctx = { mailto: mailto.trim(), checkLinks, signal, fetch: deps.fetch };
  return mapLimit(citations, CONCURRENCY, async (citation) => {
    try {
      return { ...citation, ...(await checkOne(citation, ctx)) };
    } catch (err) {
      if (signal?.aborted) throw err;
      return { ...citation, status: 'error', notes: [`Lookup failed: ${err?.message ?? err}`] };
    }
  });
}

async function checkOne(citation, ctx) {
  switch (citation.type) {
    case 'doi':
      return checkDoi(citation, ctx);
    case 'arxiv':
      return checkArxiv(citation, ctx);
    case 'url':
      return checkUrl(citation, ctx);
    default:
      return checkReference(citation, ctx);
  }
}

async function checkDoi({ value, context }, ctx) {
  const res = await get(`${CROSSREF}/works/${encodeDoi(value)}${politeQuery(ctx, '?')}`, ctx);
  if (res.ok) {
    const work = fromCrossref((await res.json()).message);
    return compareWithContext(work, context, `https://doi.org/${value}`);
  }
  if (res.status !== 404) return { status: 'error', notes: [`CrossRef answered HTTP ${res.status}`] };

  // Not in CrossRef. DataCite and other agencies register DOIs too, so ask doi.org itself.
  const handle = await get(`${DOI_HANDLES}/${encodeDoi(value)}`, ctx);
  const body = handle.status === 200 || handle.status === 404 ? await handle.json().catch(() => null) : null;
  if (body?.responseCode === 1) {
    return {
      status: 'found',
      link: `https://doi.org/${value}`,
      notes: ['DOI is registered (not in CrossRef, so title could not be compared)'],
    };
  }
  if (body?.responseCode === 100 || handle.status === 404) {
    return { status: 'not_found', notes: ['This DOI is not registered anywhere: it does not exist'] };
  }
  return { status: 'error', notes: [`doi.org answered HTTP ${handle.status}`] };
}

async function checkArxiv({ value, context }, ctx) {
  const res = await get(`${ARXIV}?id_list=${encodeURIComponent(value)}&max_results=1`, ctx);
  if (!res.ok) return { status: 'error', notes: [`arXiv answered HTTP ${res.status}`] };
  const work = parseArxivEntry(await res.text());
  if (!work) return { status: 'not_found', notes: [`arXiv has no paper ${value}`] };
  return compareWithContext(work, context, `https://arxiv.org/abs/${value}`);
}

export function parseArxivEntry(xml) {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;
  const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? '';
  const title = decodeXml(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  if (!title || title.toLowerCase() === 'error' || id.includes('/api/errors')) return null;
  const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => decodeXml(m[1]).trim());
  const published = entry.match(/<published>(\d{4})/)?.[1];
  return { title, authors, year: published ? Number(published) : null, venue: 'arXiv' };
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function checkUrl({ value }, ctx) {
  if (!ctx.checkLinks) {
    return { status: 'skipped', notes: ['Link checking is off. Turn it on in Settings.'] };
  }
  let res;
  try {
    res = await get(value, ctx, { method: 'HEAD', timeoutMs: LINK_TIMEOUT_MS });
    if ([403, 405, 501].includes(res.status)) res = await get(value, ctx, { timeoutMs: LINK_TIMEOUT_MS });
  } catch (err) {
    if (ctx.signal?.aborted) throw err;
    return { status: 'unreachable', notes: ['Could not reach the site. The domain may not exist.'] };
  }
  if (res.ok) return { status: 'found', link: value, notes: ['Link works. Check the page really says what is claimed.'] };
  if (res.status === 404 || res.status === 410) {
    return { status: 'not_found', notes: [`Page does not exist (HTTP ${res.status})`] };
  }
  return { status: 'error', notes: [`Site answered HTTP ${res.status}; could not confirm the page`] };
}

async function checkReference({ value }, ctx) {
  const title = guessTitle(value);
  const query = truncate(value, 300);

  let best = null;
  const failures = [];
  const crossref = await get(
    `${CROSSREF}/works?rows=5&query.bibliographic=${encodeURIComponent(query)}${politeQuery(ctx, '&')}`,
    ctx,
  );
  if (crossref.ok) {
    const items = (await crossref.json()).message?.items ?? [];
    best = bestMatch(items.map(fromCrossref), value, title);
  } else {
    failures.push(`CrossRef answered HTTP ${crossref.status}`);
  }

  if (!best || best.score < 0.8) {
    const openalex = await get(
      `${OPENALEX}/works?per-page=5&search=${encodeURIComponent(title ?? query)}${politeQuery(ctx, '&')}`,
      ctx,
    );
    if (openalex.ok) {
      const items = (await openalex.json()).results ?? [];
      const candidate = bestMatch(items.map(fromOpenAlex), value, title);
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
    } else {
      failures.push(`OpenAlex answered HTTP ${openalex.status}`);
    }
  }

  if (best && best.score >= 0.8) return compareDetails(best.work, value);
  // Without both databases we can't claim something doesn't exist.
  if (failures.length) return { status: 'error', notes: failures };
  if (best && best.score >= 0.5) {
    return {
      status: 'partial',
      title: best.work.title,
      authors: best.work.authors,
      year: best.work.year,
      venue: best.work.venue,
      link: best.work.link,
      notes: ['No exact match. The closest real paper is shown: the reference may mix up or paraphrase it.'],
    };
  }
  return {
    status: 'not_found',
    notes: [
      'No matching work in CrossRef or OpenAlex. It may be made up, or it may be a book or web page those databases do not cover.',
    ],
  };
}

function bestMatch(works, line, title) {
  let best = null;
  for (const work of works) {
    if (!work.title || contentWords(work.title).length < 2) continue;
    const score = title
      ? Math.min(titleCoverage(work.title, title), titleCoverage(title, work.title))
      : titleCoverage(work.title, line);
    if (!best || score > best.score) best = { work, score };
  }
  return best;
}

// The identifier resolved. If the surrounding text also names a title, make
// sure it is the same work: a real DOI attached to the wrong paper is a
// common way AI citations go wrong.
function compareWithContext(work, context, link) {
  const claimedTitle = guessTitle(context);
  if (claimedTitle) {
    const score = Math.min(titleCoverage(work.title, claimedTitle), titleCoverage(claimedTitle, work.title));
    if (score < 0.5) {
      return {
        status: 'mismatch',
        ...describe(work),
        link,
        notes: [`This identifier is real but belongs to a different work. The text calls it "${truncate(claimedTitle, 120)}".`],
      };
    }
    return { ...compareDetails(work, context), link };
  }
  return {
    status: 'found',
    ...describe(work),
    link,
    notes: ['Exists. Compare the real title with what the text claims.'],
  };
}

function compareDetails(work, line) {
  const notes = [];
  const claimedYear = guessYear(line);
  if (claimedYear && work.year && Math.abs(claimedYear - work.year) > 1) {
    notes.push(`Year differs: the real work is from ${work.year}, the text says ${claimedYear}.`);
  }
  const firstSurname = surname(work.authors?.[0]);
  if (firstSurname && mentionsAuthors(line) && !containsWord(line, firstSurname)) {
    notes.push(`First author differs: the real first author is ${work.authors[0]}.`);
  }
  return {
    status: notes.length ? 'mismatch' : 'found',
    ...describe(work),
    link: work.link,
    notes: notes.length ? notes : ['Real work, details match.'],
  };
}

function describe(work) {
  return { title: work.title, authors: work.authors, year: work.year, venue: work.venue };
}

function surname(name) {
  if (!name) return null;
  const parts = normalize(name).split(' ').filter(Boolean);
  return parts.at(-1) ?? null;
}

function fromCrossref(item = {}) {
  const dateParts =
    item.issued?.['date-parts']?.[0] ??
    item['published-print']?.['date-parts']?.[0] ??
    item['published-online']?.['date-parts']?.[0];
  return {
    title: (Array.isArray(item.title) ? item.title[0] : item.title) ?? '',
    authors: (item.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(' ') || a.name).filter(Boolean),
    year: dateParts?.[0] ?? null,
    venue: (Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title']) ?? '',
    link: item.DOI ? `https://doi.org/${item.DOI}` : item.URL ?? null,
  };
}

function fromOpenAlex(item = {}) {
  return {
    title: item.display_name ?? item.title ?? '',
    authors: (item.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean),
    year: item.publication_year ?? null,
    venue: item.primary_location?.source?.display_name ?? '',
    link: item.doi ?? item.id ?? null,
  };
}

function encodeDoi(doi) {
  return doi.split('/').map(encodeURIComponent).join('/');
}

// CrossRef and OpenAlex give faster, more reliable service to requests that
// include a contact email ("polite pool"). Only sent if the user set one.
function politeQuery(ctx, joiner) {
  return ctx.mailto ? `${joiner}mailto=${encodeURIComponent(ctx.mailto)}` : '';
}

async function get(url, ctx, { method = 'GET', timeoutMs = LOOKUP_TIMEOUT_MS } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return ctx.fetch(url, {
    method,
    redirect: 'follow',
    signal: ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout,
  });
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export const CITATION_STATUS = {
  found: { label: 'Real', hint: 'Found in a real database.' },
  mismatch: { label: 'Wrong details', hint: 'A real work, but the text gets details wrong or attaches it to the wrong title.' },
  partial: { label: 'Close match only', hint: 'Only a similar work exists. The reference may be mixed up.' },
  not_found: { label: 'Not found', hint: 'Could not find this anywhere. Possibly made up.' },
  unreachable: { label: 'Unreachable', hint: 'The site did not respond.' },
  error: { label: 'Could not check', hint: 'The lookup service failed. Try again later.' },
  skipped: { label: 'Skipped', hint: 'Not checked.' },
};
