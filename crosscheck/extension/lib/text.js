// Small text helpers shared by the citation checker.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'by',
  'at', 'from', 'as', 'is', 'are', 'via', 'into', 'its', 'their', 'using',
]);

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function contentWords(s) {
  return normalize(s).split(' ').filter((w) => w && !STOPWORDS.has(w));
}

// Share of the title's content words that also appear in `text`.
// 1.0 means every meaningful word of the title is present.
export function titleCoverage(title, text) {
  const titleWords = contentWords(title);
  if (titleWords.length === 0) return 0;
  const textWords = new Set(contentWords(text));
  const hits = titleWords.filter((w) => textWords.has(w)).length;
  return hits / titleWords.length;
}

export function containsWord(text, word) {
  const w = normalize(word);
  if (!w) return false;
  return ` ${normalize(text)} `.includes(` ${w} `);
}

export function truncate(s, max) {
  const str = String(s ?? '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
