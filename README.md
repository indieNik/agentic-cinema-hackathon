# Greenlight

**From logline to greenlight memo in about a minute.**
A multi-agent development crew, built on Gemini, that researches a film or series pitch on the live web with the **Parallel Search API** and writes the memo a studio executive would.

> Built in one night for **Agentic Cinema: The Blockbuster Hackathon** (Google Cloud), **Parallel track**.

- **Live demo:** https://greenlight-p2jahd237a-uc.a.run.app
- **Video:** VIDEO_URL
- **Source:** https://github.com/indieNik/agentic-cinema-hackathon

## The problem

Before anything gets a greenlight, someone has to answer the financier's questions: *what are the comps, who is the audience, what did similar titles make, what is already in development, what could kill this?* Development executives spend hours per pitch on this research, and independent writers and producers usually can't afford to do it at all. They pitch blind.

## What Greenlight does

Paste a logline (plus optional title, format and budget tier). A crew of agents goes to work, and you watch them do it:

| Agent | Job | Tool |
|---|---|---|
| **Comps Analyst** | Finds 4–6 comparable titles with year, budget, performance, reception | `search_web` → Parallel |
| **Audience & Market Analyst** | Audience, demand signals, platform fit, timing, positioning, budget band | `search_web` → Parallel |
| **Risk & Competition Analyst** | Competing projects in development, rights/IP issues, sensitivities, production risk | `search_web` → Parallel |
| **Head of Development** | Reads the three reports and writes a structured, cited memo with a verdict | Gemini structured output |

The three specialists run **in parallel** (fan-out); the Head of Development synthesizes (fan-in). Every search, result and status change is streamed to the UI over Server-Sent Events, so the crew's work is visible and auditable. The memo ends with a **GREENLIGHT / DEVELOP / PASS** verdict, a confidence score, comps table, audience and positioning, risks with mitigations, next steps and sources. One click copies it as Markdown.

## Architecture

```
Browser (vanilla JS, SSE)
   │  POST /api/greenlight {logline, title, format, budgetTier}
   ▼
Cloud Run  ── Express (server/index.js)
   │
   ├─ runCrew()  (server/agents.js)
   │     ├─ Comps Analyst ──────┐   each: Gemini function-calling loop
   │     ├─ Audience & Market ──┼─► tool `search_web` ──► Parallel Search API (server/parallel.js)
   │     ├─ Risk & Competition ─┘   ≤2 search rounds, 2–5 queries per round, shared Parallel session
   │     └─ Head of Development ─► Gemini JSON-schema response → memo
   │
   └─ secrets: GEMINI_API_KEY, PARALLEL_API_KEY injected from Secret Manager (never in the image)
```

**Google Cloud:** Gemini (`gemini-3.5-flash`) via the `@google/genai` SDK (function calling + structured output), Cloud Run, Cloud Build, Secret Manager, Cloud IAM (the service identity may read exactly two secrets).
**Partner:** Parallel Search API via the official `parallel-web` SDK — it is the crew's *only* research tool and is called at runtime on every request (see `server/parallel.js` and the `search_web` tool in `server/agents.js`).

## Run it locally

```bash
git clone https://github.com/indieNik/agentic-cinema-hackathon && cd agentic-cinema-hackathon
npm install
cp .env.example .env     # add GEMINI_API_KEY (Google AI Studio) and PARALLEL_API_KEY (platform.parallel.ai)
npm run dev              # http://localhost:8080
```

`PARALLEL_MOCK=1 npm run dev` serves canned search results for UI work without spending credits (ignored in production).

## Deploy to Cloud Run

```bash
GCLOUD_ACCOUNT=you@example.com GCLOUD_PROJECT=your-project GEMINI_API_KEY=... PARALLEL_API_KEY=... ./deploy.sh
```

The script enables the APIs, stores both keys in Secret Manager, grants the Cloud Run service account `secretmanager.secretAccessor` on those two secrets only, builds the image with Cloud Build and deploys with the secrets mounted as environment variables. Re-running it with no keys just redeploys.

## API

`POST /api/greenlight` → `text/event-stream`. Events: `run_start`, `agent_status` (`waiting|thinking|searching|done`), `search` (objective + queries), `search_result` (count + sources), `search_error`, `memo` (the structured memo + specialist reports + timing), `error`, `done`.
`GET /healthz` reports which integrations are configured.

## What we learned

- Letting each specialist choose its own queries (rather than templating them) produced noticeably better comps: the Risk analyst searched for *"in development"* and *"life rights"* on its own.
- Parallel's excerpt-first results are a good fit for agents: a few thousand characters of relevant text per source instead of full pages, so a whole run stays within one model context.
- A shared Parallel `session_id` across the crew, plus disabling tool calls on the final round, made runs predictable enough to demo live.

## Project layout

```
server/index.js     Express + SSE endpoint, rate limit
server/agents.js    the crew: specialists, tool loop, memo schema, orchestration
server/parallel.js  Parallel Search API client (partner integration)
public/             UI — index.html, styles.css, app.js (no framework, no build)
deploy.sh           Cloud Run + Secret Manager deploy
docs/decisions/     ADRs
```

MIT licensed.
