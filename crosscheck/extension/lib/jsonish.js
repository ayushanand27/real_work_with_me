// Models are asked for JSON but often wrap it in prose or ``` fences, or leave
// trailing commas. This pulls out the first JSON object they produced.

export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const candidates = [];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    for (const attempt of [candidate, stripTrailingCommas(candidate)]) {
      try {
        const value = JSON.parse(attempt);
        if (value && typeof value === 'object') return value;
      } catch {
        // try the next form
      }
    }
  }
  return null;
}

function stripTrailingCommas(s) {
  return s.replace(/,\s*([}\]])/g, '$1');
}
