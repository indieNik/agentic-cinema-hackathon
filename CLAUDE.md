# Greenlight — working notes for Claude Code

Hackathon entry (Agentic Cinema, Google Cloud, **Parallel track**). Built 10 Sep 2026 in ~75 minutes before the deadline. Read README.md first; this file is about *how we work here*.

## What it is
A multi-agent "development crew" on Gemini that researches a film/series logline with the Parallel Search API and writes a greenlight memo. Node 22, ES modules, Express, vanilla front end, Cloud Run.

## Ground rules (from the hackathon)
- **AI only from Google Cloud.** Use `@google/genai` (google-genai). Never add another AI vendor's SDK or API.
- **Parallel must be used at runtime**, through the official `parallel-web` SDK. It is the crew's only research tool. Do not replace it with Google Search grounding or any other search.
- Keep the repo public, MIT licensed, and runnable from the README alone.

## Layout
- `server/index.js` HTTP: static `public/`, `GET /api/health`, `GET /api/crew`, `POST /api/greenlight` (SSE). In-memory rate limit per IP.
- `server/agents.js` The crew. `SPECIALISTS` (prompts), `searchTool` (function declaration), `runSpecialist` (tool loop), `memoSchema` + `writeMemo` (structured output), `runCrew` (fan-out / fan-in). Every step calls `emit(event)`; the UI depends on those event shapes.
- `server/parallel.js` Thin wrapper over `parallel-web`'s `client.search`. `PARALLEL_MOCK=1` returns fixtures in non-production only.
- `public/` `index.html` (shell + `<template id="agent-card">`), `styles.css` (tokens at the top, light/dark via `prefers-color-scheme`), `app.js` (SSE parsing, crew cards, memo rendering, markdown export).
- `deploy.sh` Cloud Run deploy. Secrets live in Secret Manager as `greenlight-gemini-api-key` and `greenlight-parallel-api-key` (region `us-central1`). The script takes `GCLOUD_ACCOUNT` and `GCLOUD_PROJECT` from the environment and passes `--account/--project` flags; never change the global gcloud config, and never commit account names or project ids.

## Conventions
- No build step, no framework, no TypeScript: speed of change beats tooling for this repo.
- Design: Material 3 / Apple HIG feel. One accent (green), quiet surfaces, 16–24px radii, 200–500ms eased motion, full dark mode, `prefers-reduced-motion` respected. Everything the agents do must be visible in the UI (queries, sources, status) — the transparency is the product.
- Escape all model output before it reaches `innerHTML` (`esc()` in app.js). The memo is model-generated JSON; treat it as untrusted.
- Model id comes from `GEMINI_MODEL` (default `gemini-3.5-flash`). Verified available on this key: 3.5-flash, 3.8-flash, 2.5-flash.
- Keep runs under ~60s: `MAX_TOOL_ROUNDS=2`, 2–5 queries per search, `max_chars_total` 12k per search.

## Local dev
```
cp .env.example .env   # fill keys
npm run dev            # port 8080, --watch, loads .env
PARALLEL_MOCK=1 MAX_TOOL_ROUNDS=1 npm run dev   # cheap UI iteration
```
Smoke test without the UI: `node -e "import('./server/agents.js').then(m=>m.runCrew({logline:'...'},console.log))"`.

## Deploy
`GCLOUD_ACCOUNT=… GCLOUD_PROJECT=… GEMINI_API_KEY=… PARALLEL_API_KEY=… ./deploy.sh` (keys optional after the first run). Cloud Build takes 3–5 minutes. Rotating a key = add a secret version, then redeploy so the new revision picks up `latest`.

## Docs
- `docs/decisions/` ADRs, one per non-obvious decision. Add one when you change architecture, a prompt strategy, or a partner integration.
- `SUBMISSION.md` the Devpost submission copy. Keep it in sync with what the app actually does.
