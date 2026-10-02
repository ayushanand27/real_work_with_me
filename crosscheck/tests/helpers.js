// Test helpers: a fake fetch that answers by URL, and canned API responses
// shaped like the real CrossRef, OpenAlex, arXiv and doi.org replies.

export function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, handler] of routes) {
      const hit = typeof match === 'string' ? String(url).startsWith(match) : match.test(String(url));
      if (!hit) continue;
      const out = typeof handler === 'function' ? await handler(String(url), init) : handler;
      if (out instanceof Error) throw out;
      const { status = 200, json, text, headers = {} } = out;
      const body = json !== undefined ? JSON.stringify(json) : text ?? '';
      return new Response(status === 204 ? null : body, { status, headers });
    }
    throw new TypeError(`fetch failed: no route for ${url}`);
  };
  fn.calls = calls;
  return fn;
}

export const crossrefWork = ({
  title = 'Deep learning',
  authors = [['Yann', 'LeCun'], ['Yoshua', 'Bengio'], ['Geoffrey', 'Hinton']],
  year = 2015,
  doi = '10.1038/nature14539',
  venue = 'Nature',
} = {}) => ({
  DOI: doi,
  title: [title],
  author: authors.map(([given, family]) => ({ given, family, sequence: 'first' })),
  issued: { 'date-parts': [[year, 5, 27]] },
  'container-title': [venue],
  type: 'journal-article',
});

export const crossrefSingle = (opts) => ({ status: 'ok', 'message-type': 'work', message: crossrefWork(opts) });

export const crossrefSearch = (works) => ({
  status: 'ok',
  'message-type': 'work-list',
  message: { 'total-results': works.length, items: works.map(crossrefWork) },
});

export const openalexSearch = (works) => ({
  meta: { count: works.length },
  results: works.map(({ title, authors = [], year, doi = null }) => ({
    id: 'https://openalex.org/W123',
    doi,
    display_name: title,
    publication_year: year,
    authorships: authors.map((name) => ({ author: { display_name: name } })),
    primary_location: { source: { display_name: 'Some Venue' } },
  })),
});

export const arxivFeed = ({ id = '1706.03762', title = 'Attention Is All You Need', authors = ['Ashish Vaswani', 'Noam Shazeer'], published = '2017-06-12T17:57:34Z' } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: id_list=${id}</title>
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/${id}v7</id>
    <published>${published}</published>
    <title>${title}</title>
    ${authors.map((a) => `<author><name>${a}</name></author>`).join('\n    ')}
  </entry>
</feed>`;

export const arxivEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: id_list=2501.99999</title>
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">0</opensearch:totalResults>
</feed>`;

export const arxivError = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format_for_9999.99999</id>
    <title>Error</title>
    <summary>incorrect id format for 9999.99999</summary>
  </entry>
</feed>`;
