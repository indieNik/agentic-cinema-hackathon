/**
 * The Greenlight crew — a small multi-agent network built on Gemini (google-genai).
 *
 *   ┌──────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
 *   │  Comps Analyst   │   │ Audience & Market Analyst │   │ Risk & Competition Analyst│   (fan-out, run in parallel)
 *   └────────┬─────────┘   └────────────┬─────────────┘   └────────────┬─────────────┘
 *            │  each agent runs a Gemini function-calling loop whose only tool is
 *            │  `search_web` → Parallel Search API (live web, cited excerpts)
 *            └──────────────────────────┬──────────────────────────────┘
 *                              ┌────────▼────────┐
 *                              │ Head of Development │  (fan-in: structured JSON memo)
 *                              └─────────────────┘
 *
 * Every step is streamed to the UI as an event so the user can watch the crew work.
 */
import { GoogleGenAI, Type } from '@google/genai';
import { searchWeb } from './parallel.js';

export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MAX_TOOL_ROUNDS = Number(process.env.MAX_TOOL_ROUNDS || 2);

let ai = null;
function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  ai ??= new GoogleGenAI({ apiKey });
  return ai;
}

const searchTool = {
  functionDeclarations: [
    {
      name: 'search_web',
      description:
        'Search the live web through the Parallel Search API. Returns titles, URLs, publish dates and relevant excerpts. ' +
        'Batch 2–5 concrete queries per call (film titles, years, "box office", "budget", "streaming", "in development", "rights").',
      parameters: {
        type: Type.OBJECT,
        properties: {
          objective: { type: Type.STRING, description: 'What you are trying to learn, in one sentence.' },
          queries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '2–5 concrete search queries.' },
        },
        required: ['objective', 'queries'],
      },
    },
  ],
};

const HOUSE_STYLE = `You are part of a film & TV studio's development team. Today's date is ${new Date().toISOString().slice(0, 10)}.
Work like a senior analyst: specific titles, years, numbers, platforms — never vague. Prefer recent (last 5 years) evidence.
Research with the search_web tool first (at most ${MAX_TOOL_ROUNDS} calls, batch your queries), then write your findings.
Cite the URL you relied on inline after each claim like (source: https://...). If something cannot be verified, say so plainly.
Keep the findings under 350 words, in tight markdown bullets.`;

export const SPECIALISTS = [
  {
    id: 'comps',
    name: 'Comps Analyst',
    role: 'Finds the comparable titles a financier will ask about',
    system: `${HOUSE_STYLE}
You are the COMPS ANALYST. Identify 4–6 comparable titles (same genre, premise, tone or audience), released in the last ~8 years where possible.
For each comp: title, year, format, approximate budget, box office or streaming performance (viewership, ranking), critical/audience reception, and in one clause WHY it is a comp.
Close with a one-line read: does the comp set suggest a healthy, crowded, or dead market for this pitch?`,
  },
  {
    id: 'market',
    name: 'Audience & Market Analyst',
    role: 'Sizes the audience and finds the right platform and moment',
    system: `${HOUSE_STYLE}
You are the AUDIENCE & MARKET ANALYST. Determine the primary and secondary audience (demographic + psychographic), current demand signals for this genre/theme (trends, recent hits or flops, streamer appetite, festival/awards angle),
the best-fit platform (theatrical / streamer / premium cable / hybrid) and timing. Recommend a positioning line and a realistic budget band.`,
  },
  {
    id: 'risk',
    name: 'Risk & Competition Analyst',
    role: 'Finds what could kill the project before it starts',
    system: `${HOUSE_STYLE}
You are the RISK & COMPETITION ANALYST. Look for: similar projects announced or in development (competition for the same slot), underlying IP / life-rights / true-story issues, cultural or legal sensitivities,
production-difficulty risks (VFX, animals, children, period, locations), and audience fatigue. Rate each risk low/medium/high and suggest a concrete mitigation.`,
  },
];

const memoSchema = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ['GREENLIGHT', 'DEVELOP', 'PASS'], description: 'GREENLIGHT = pursue now; DEVELOP = promising but needs work; PASS = do not pursue.' },
    confidence: { type: Type.INTEGER, description: '0–100 confidence in the verdict.' },
    headline: { type: Type.STRING, description: 'One punchy sentence explaining the verdict.' },
    title: { type: Type.STRING, description: 'Working title (keep the given one, or propose one).' },
    logline: { type: Type.STRING, description: 'A polished, market-ready one-sentence logline.' },
    summary: { type: Type.STRING, description: '2–3 sentence executive summary of the opportunity.' },
    comps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          year: { type: Type.INTEGER },
          budget: { type: Type.STRING, description: 'e.g. "$25M" or "undisclosed"' },
          performance: { type: Type.STRING, description: 'e.g. "$180M WW box office" or "#1 on Netflix, 3 weeks"' },
          whyComparable: { type: Type.STRING },
          sourceUrl: { type: Type.STRING },
        },
        required: ['title', 'year', 'budget', 'performance', 'whyComparable', 'sourceUrl'],
      },
    },
    audience: {
      type: Type.OBJECT,
      properties: {
        primary: { type: Type.STRING },
        secondary: { type: Type.STRING },
        platform: { type: Type.STRING, description: 'Recommended platform and why, one sentence.' },
        positioning: { type: Type.STRING, description: 'The marketing one-liner, e.g. "X meets Y".' },
      },
      required: ['primary', 'secondary', 'platform', 'positioning'],
    },
    budgetBand: { type: Type.STRING, description: 'Recommended budget band with one-clause rationale.' },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    risks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          risk: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
          mitigation: { type: Type.STRING },
        },
        required: ['risk', 'severity', 'mitigation'],
      },
    },
    nextSteps: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3–5 concrete next actions for the writer/producer.' },
    sources: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING } }, required: ['title', 'url'] },
      description: 'The 6–10 most load-bearing sources, deduplicated.',
    },
  },
  required: ['verdict', 'confidence', 'headline', 'title', 'logline', 'summary', 'comps', 'audience', 'budgetBand', 'strengths', 'risks', 'nextSteps', 'sources'],
};

function briefText(brief) {
  return [
    `PITCH`,
    brief.title ? `Working title: ${brief.title}` : null,
    `Logline: ${brief.logline}`,
    brief.format ? `Format: ${brief.format}` : null,
    brief.genre ? `Genre: ${brief.genre}` : null,
    brief.budgetTier ? `Intended budget tier: ${brief.budgetTier}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Run one specialist: a Gemini function-calling loop with `search_web` (Parallel) as the only tool. */
async function runSpecialist(spec, brief, emit, sessionRef) {
  const client = getAI();
  const contents = [{ role: 'user', parts: [{ text: `${briefText(brief)}\n\nResearch this pitch and report your findings.` }] }];
  const sources = new Map();
  let searches = 0;
  emit({ type: 'agent_status', agent: spec.id, status: 'thinking' });

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const allowTools = round < MAX_TOOL_ROUNDS;
    const res = await client.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: spec.system,
        tools: [searchTool],
        // Final round: the tool is declared (so the transcript stays valid) but calling it is disabled.
        toolConfig: { functionCallingConfig: { mode: allowTools ? 'AUTO' : 'NONE' } },
        temperature: 0.4,
      },
    });

    const calls = allowTools ? res.functionCalls || [] : [];
    if (!calls.length) {
      let text = (res.text || '').trim();
      if (!text) {
        // Rare: the model returned nothing usable. Ask once more, tools off.
        contents.push({ role: 'user', parts: [{ text: 'Write your findings now, based on everything above.' }] });
        const retry = await client.models.generateContent({ model: MODEL, contents, config: { systemInstruction: spec.system, temperature: 0.4 } });
        text = (retry.text || '').trim();
      }
      emit({ type: 'agent_status', agent: spec.id, status: 'done', findings: text, searches, sources: sources.size });
      return { id: spec.id, name: spec.name, findings: text, sources: [...sources.values()] };
    }

    // Keep the model turn (with its functionCall parts) in the transcript, then answer every call.
    contents.push(res.candidates[0].content);
    const responseParts = [];
    for (const call of calls) {
      const objective = String(call.args?.objective || '');
      const queries = Array.isArray(call.args?.queries) ? call.args.queries.map(String) : [];
      searches += 1;
      emit({ type: 'agent_status', agent: spec.id, status: 'searching' });
      emit({ type: 'search', agent: spec.id, objective, queries });
      try {
        const r = await searchWeb({ objective, queries, sessionId: sessionRef.id });
        sessionRef.id ||= r.sessionId;
        for (const x of r.results) sources.set(x.url, { url: x.url, title: x.title, publishDate: x.publishDate });
        emit({
          type: 'search_result',
          agent: spec.id,
          count: r.results.length,
          results: r.results.map((x) => ({ url: x.url, title: x.title, publishDate: x.publishDate })),
        });
        responseParts.push({ functionResponse: { name: call.name, response: { results: r.results } } });
      } catch (err) {
        emit({ type: 'search_error', agent: spec.id, message: err.message });
        responseParts.push({ functionResponse: { name: call.name, response: { error: err.message } } });
      }
    }
    contents.push({ role: 'user', parts: responseParts });
    emit({ type: 'agent_status', agent: spec.id, status: 'thinking' });
  }
  throw new Error(`${spec.name} did not finish`);
}

/** Fan-in: the Head of Development turns the specialists' findings into a structured memo. */
async function writeMemo(brief, reports, emit) {
  emit({ type: 'agent_status', agent: 'head', status: 'thinking' });
  const client = getAI();
  const allSources = new Map();
  for (const r of reports) for (const s of r.sources) allSources.set(s.url, s);

  const prompt = `${briefText(brief)}

=== SPECIALIST REPORTS ===
${reports.map((r) => `--- ${r.name} ---\n${r.findings}`).join('\n\n')}

=== SOURCES SEEN (url — title) ===
${[...allSources.values()].slice(0, 40).map((s) => `${s.url} — ${s.title}`).join('\n')}

Write the greenlight memo now.`;

  const res = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `You are the HEAD OF DEVELOPMENT at a studio. Today's date is ${new Date().toISOString().slice(0, 10)}.
Synthesize your team's research into a decisive, honest greenlight memo. Be specific: names, years, numbers.
Verdict rules — GREENLIGHT: clear audience, healthy comps, manageable risk. DEVELOP: real promise but a fixable gap (premise, budget, rights, timing). PASS: crowded/dead market or a fatal risk.
Only cite URLs that appear in the sources list. Never invent titles or numbers; if the team could not verify something, reflect that in confidence.`,
      responseMimeType: 'application/json',
      responseSchema: memoSchema,
      temperature: 0.3,
    },
  });
  const memo = JSON.parse(res.text);
  memo.confidence = Math.max(0, Math.min(100, Number(memo.confidence) || 0));
  emit({ type: 'agent_status', agent: 'head', status: 'done' });
  return memo;
}

/**
 * Orchestrate the crew. `emit` receives every event (used for the SSE stream).
 * @param {{logline:string,title?:string,format?:string,genre?:string,budgetTier?:string}} brief
 */
export async function runCrew(brief, emit) {
  const started = Date.now();
  const sessionRef = { id: null }; // one Parallel session per run, shared by the crew
  emit({ type: 'run_start', model: MODEL, agents: SPECIALISTS.map(({ id, name, role }) => ({ id, name, role })) });

  const reports = await Promise.all(SPECIALISTS.map((spec) => runSpecialist(spec, brief, emit, sessionRef)));
  const memo = await writeMemo(brief, reports, emit);

  emit({
    type: 'memo',
    memo,
    reports: reports.map((r) => ({ id: r.id, name: r.name, findings: r.findings })),
    meta: { model: MODEL, durationMs: Date.now() - started, searches: reports.reduce((n, r) => n + r.sources.length, 0) },
  });
  return memo;
}
