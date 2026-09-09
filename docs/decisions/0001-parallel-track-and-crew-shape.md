# ADR 0001 — Parallel track, and a three-specialist crew with one synthesizer

Date: 2026-09-10 · Status: accepted

## Context
Agentic Cinema requires a Gemini-powered agent that uses one partner's product at runtime for a media & entertainment workflow. Five tracks were available (IBM, Grafana, Parallel, ClickHouse, Replit). We had ~75 minutes to build, deploy, record and submit.

## Decision
1. **Parallel track.** The Search API is a single authenticated HTTPS call with an official SDK, and web research is exactly what a development executive does before a greenlight. IBM and Replit require their tooling *in the build process*; Grafana and ClickHouse need provisioned infrastructure that did not fit the clock.
2. **Fan-out / fan-in crew.** Three specialists (comps, audience & market, risk & competition) run concurrently, each as a Gemini function-calling loop whose only tool is `search_web` (Parallel). A Head of Development agent synthesizes the three reports into a JSON-schema memo. This is a real multi-agent pattern that stays cheap: at most 2 search rounds per specialist, one synthesis call.
3. **Tools off on the final round.** Each specialist's last turn declares the tool but sets `functionCallingConfig.mode = NONE`, so the model must write findings instead of searching again. Empty output triggers one retry.
4. **Streaming everything.** Every status change, query batch and result list is an SSE event. The UI is the audit trail.

## Consequences
- Runs take 30–60 s and cost 3–6 Parallel searches + 4–7 Gemini calls.
- Structured output (responseSchema) cannot be combined with tools in one call, hence the two-stage design.
- Secrets are Cloud Run env vars from Secret Manager; the image never contains a key.
