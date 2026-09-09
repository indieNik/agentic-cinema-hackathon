/**
 * Parallel Search API client (partner integration, used at runtime by every specialist agent).
 * Docs: https://docs.parallel.ai/search-api/search-quickstart
 *
 * One call = one `search_web` tool invocation from a Gemini agent. We keep the request
 * small and predictable: a natural-language objective + 2–5 concrete queries.
 */
import Parallel from 'parallel-web';

const MODE = process.env.PARALLEL_MODE || 'advanced'; // turbo | fast | basic | advanced
const MAX_RESULTS = Number(process.env.PARALLEL_MAX_RESULTS || 8);
const MAX_CHARS_PER_RESULT = 1500;
const MAX_CHARS_TOTAL = 12000;

let client = null;
function getClient() {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    throw new Error('PARALLEL_API_KEY is not set. Create a key at https://platform.parallel.ai');
  }
  client ??= new Parallel({ apiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

/**
 * @param {{objective: string, queries: string[], sessionId?: string}} args
 * @returns {Promise<{searchId: string, sessionId: string, results: Array<{url:string,title:string,publishDate:string|null,excerpts:string[]}>}>}
 */
export async function searchWeb({ objective, queries, sessionId }) {
  const cleanQueries = (queries || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 5);
  if (!cleanQueries.length) throw new Error('search_web needs at least one query');

  if (process.env.PARALLEL_MOCK === '1' && process.env.NODE_ENV !== 'production') {
    return mockSearch(cleanQueries);
  }

  const res = await getClient().search({
    objective: objective || null,
    search_queries: cleanQueries,
    mode: MODE,
    max_chars_total: MAX_CHARS_TOTAL,
    session_id: sessionId || null,
    advanced_settings: {
      max_results: MAX_RESULTS,
      excerpt_settings: { max_chars_per_result: MAX_CHARS_PER_RESULT },
    },
  });

  return {
    searchId: res.search_id,
    sessionId: res.session_id,
    results: (res.results || []).map((r) => ({
      url: r.url,
      title: r.title || r.url,
      publishDate: r.publish_date || null,
      excerpts: (r.excerpts || []).map((e) => e.slice(0, MAX_CHARS_PER_RESULT)),
    })),
  };
}

/** Local-dev fixture only (PARALLEL_MOCK=1, never in production). Lets the UI be built without spending credits. */
function mockSearch(queries) {
  return {
    searchId: 'mock',
    sessionId: 'mock',
    results: queries.slice(0, 3).map((q, i) => ({
      url: `https://example.com/mock/${i}`,
      title: `Mock result for "${q}"`,
      publishDate: '2026-01-01',
      excerpts: [`This is a local development fixture for the query "${q}". No real data.`],
    })),
  };
}
