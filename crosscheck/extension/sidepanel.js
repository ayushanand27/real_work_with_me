import { loadSettings } from './lib/settings.js';
import { resolveModels, runCheck } from './lib/pipeline.js';
import { STATUS_INFO } from './lib/claims.js';
import { CITATION_STATUS } from './lib/citations.js';
import { el } from './lib/dom.js';

const $ = (id) => document.getElementById(id);

const CLAIM_BORDER = {
  agreed: 'b-green',
  disputed: 'b-amber',
  doubtful: 'b-amber',
  refuted: 'b-red',
  unverified: 'b-grey',
  unchecked: 'b-grey',
};
const CITATION_BORDER = {
  found: 'b-green',
  mismatch: 'b-amber',
  partial: 'b-amber',
  not_found: 'b-red',
  unreachable: 'b-red',
  error: 'b-grey',
  skipped: 'b-grey',
};
const TYPE_LABEL = { doi: 'DOI', arxiv: 'arXiv', url: 'Link', reference: 'Reference' };

let mode = 'verify';
let controller = null;

function setMode(next) {
  mode = next;
  $('tab-verify').setAttribute('aria-selected', String(mode === 'verify'));
  $('tab-ask').setAttribute('aria-selected', String(mode === 'ask'));
  $('text-wrap').hidden = mode === 'ask';
  $('question-label').textContent = mode === 'ask' ? 'Your question' : 'Question it answers (optional)';
  $('question').rows = mode === 'ask' ? 4 : 2;
  $('question').placeholder =
    mode === 'ask'
      ? 'Ask anything. The main model answers, then the other models check every claim in the answer.'
      : 'What was asked? This helps the checkers understand the claims.';
  $('run').textContent = mode === 'ask' ? 'Ask & check' : 'Check';
}

async function refreshSetupHint() {
  const { main } = resolveModels(await loadSettings());
  $('setup-hint').hidden = Boolean(main);
}

function setProgress(message) {
  $('progress').textContent = message ?? '';
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}

function resetResults() {
  showError('');
  $('results').hidden = true;
  for (const id of ['summary', 'notices', 'answer', 'answer-meta', 'claims', 'citations', 'checkers']) {
    $(id).replaceChildren();
  }
  for (const id of ['answer-section', 'claims-section', 'citations-section', 'checkers-section']) {
    $(id).hidden = true;
  }
}

async function run() {
  const text = $('text').value.trim();
  const question = $('question').value.trim();
  if (mode === 'verify' && !text) return showError('Paste some text to check.');
  if (mode === 'ask' && !question) return showError('Type a question.');

  controller?.abort();
  const mine = new AbortController();
  controller = mine;
  resetResults();
  $('run').disabled = true;
  $('cancel').hidden = false;

  try {
    const settings = await loadSettings();
    const result = await runCheck({
      text,
      question,
      mode,
      settings,
      signal: mine.signal,
      onProgress: (event) => {
        if (controller !== mine) return;
        if (event.stage === 'answered') showAnswer(event.answer, event.answeredBy);
        if (event.message) setProgress(event.message);
      },
    });
    if (controller !== mine) return;
    setProgress('');
    render(result);
  } catch (err) {
    if (controller !== mine) return;
    if (mine.signal.aborted || err?.kind === 'cancelled') setProgress('Cancelled.');
    else {
      setProgress('');
      showError(err?.message ?? String(err));
    }
  } finally {
    if (controller === mine) {
      controller = null;
      $('run').disabled = false;
      $('cancel').hidden = true;
    }
  }
}

function showAnswer(answer, answeredBy) {
  $('results').hidden = false;
  $('answer-section').hidden = false;
  $('answer').textContent = answer;
  $('answer-meta').textContent = answeredBy ? `Answered by ${answeredBy}` : '';
}

function render(result) {
  $('results').hidden = false;

  if (result.answer) showAnswer(result.answer, result.answeredBy);

  for (const notice of result.notices) $('notices').append(el('div', { class: 'notice', text: notice }));

  renderSummary(result);

  if (result.claims.length) {
    $('claims-section').hidden = false;
    $('claims').replaceChildren(...result.claims.map(renderClaim));
  }
  if (result.citations.length) {
    $('citations-section').hidden = false;
    $('citations').replaceChildren(...result.citations.map(renderCitation));
  }
  if (result.checkers.length || result.extractedBy) {
    $('checkers-section').hidden = false;
    const rows = [];
    if (result.extractedBy) {
      rows.push(el('li', { class: 'item b-grey', text: `${result.extractedBy}: found the claims` }));
    }
    for (const c of result.checkers) {
      rows.push(
        el('li', { class: `item ${c.ok ? 'b-green' : 'b-red'}` }, [
          el('div', { text: `${c.label}: ${c.ok ? 'checked the claims' : 'failed'}` }),
          c.error ? el('div', { class: 'meta', text: c.error }) : null,
        ]),
      );
    }
    $('checkers').replaceChildren(...rows);
  }

  if (!result.claims.length && !result.citations.length && !result.notices.length) {
    $('notices').append(el('div', { class: 'notice', text: 'Nothing to check was found in this text.' }));
  }
}

function renderSummary(result) {
  const chips = [];
  const claimCounts = countBy(result.claims, (c) => c.status);
  for (const status of ['refuted', 'disputed', 'doubtful', 'unverified', 'agreed', 'unchecked']) {
    if (claimCounts[status]) {
      chips.push(badge(`${claimCounts[status]} ${STATUS_INFO[status].label.toLowerCase()}`, `s-${status}`));
    }
  }
  const citationCounts = countBy(result.citations, (c) => c.status);
  for (const status of ['not_found', 'mismatch', 'partial', 'unreachable', 'found', 'error', 'skipped']) {
    if (citationCounts[status]) {
      const noun = citationCounts[status] === 1 ? 'citation' : 'citations';
      chips.push(badge(`${citationCounts[status]} ${noun}: ${CITATION_STATUS[status].label.toLowerCase()}`, `s-${status}`));
    }
  }
  $('summary').replaceChildren(...chips);
}

function renderClaim(claim) {
  const info = STATUS_INFO[claim.status];
  const votes = claim.votes.map((v) =>
    badge(`${v.checker.split(' · ')[0]}: ${v.verdict}`, `v-${v.verdict}`, v.checker),
  );
  const reasons = claim.votes.map((v) => {
    const confidence = v.confidence === null || v.confidence === undefined ? '' : ` (${Math.round(v.confidence * 100)}% sure)`;
    return el('li', { text: `${v.checker}: ${v.verdict}${confidence}. ${v.reason || 'No reason given.'}` });
  });

  return el('li', { class: `item ${CLAIM_BORDER[claim.status]}` }, [
    el('div', { class: 'item-head' }, [
      badge(info.label, `s-${claim.status}`, info.hint),
      el('div', { class: 'item-text', text: claim.text }),
    ]),
    votes.length ? el('div', { class: 'votes' }, votes) : null,
    ...claim.corrections.map((c) => el('div', { class: 'correction', text: `A checker says instead: ${c}` })),
    reasons.length
      ? el('details', {}, [el('summary', { text: 'Why' }), el('ul', { class: 'reasons' }, reasons)])
      : null,
  ]);
}

function renderCitation(citation) {
  const info = CITATION_STATUS[citation.status] ?? CITATION_STATUS.error;
  const children = [
    el('div', { class: 'item-head' }, [
      badge(info.label, `s-${citation.status}`, info.hint),
      el('div', { class: 'item-text', text: `${TYPE_LABEL[citation.type]}: ${shorten(citation.value, 220)}` }),
    ]),
  ];

  if (citation.title) {
    const byline = [
      citation.authors?.length ? shortAuthors(citation.authors) : null,
      citation.year ? `(${citation.year})` : null,
      citation.venue || null,
    ]
      .filter(Boolean)
      .join(' ');
    const record = el('div', { class: 'meta' }, [`Real record: "${citation.title}"${byline ? ` by ${byline}` : ''} `]);
    if (isHttpUrl(citation.link)) {
      record.append(el('a', { href: citation.link, target: '_blank', rel: 'noopener noreferrer', text: 'open' }));
    }
    children.push(record);
  }
  for (const note of citation.notes ?? []) children.push(el('div', { class: 'meta', text: note }));
  return el('li', { class: `item ${CITATION_BORDER[citation.status] ?? 'b-grey'}` }, children);
}

function badge(text, cls, title) {
  return el('span', { class: `badge ${cls}`, text, title });
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

function shorten(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function shortAuthors(authors) {
  return authors.length > 3 ? `${authors.slice(0, 3).join(', ')} et al.` : authors.join(', ');
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function takePending() {
  const { pending } = await chrome.storage.session.get('pending');
  if (!pending) return;
  await chrome.storage.session.remove('pending');
  if (Date.now() - pending.at > 60_000) return;
  setMode('verify');
  $('question').value = '';
  $('text').value = pending.text;
  run();
}

$('tab-verify').addEventListener('click', () => setMode('verify'));
$('tab-ask').addEventListener('click', () => setMode('ask'));
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  run();
});
$('cancel').addEventListener('click', () => controller?.abort());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.pending?.newValue) takePending();
  if (area === 'local' && changes.settings) refreshSetupHint();
});

setMode('verify');
refreshSetupHint();
takePending();
