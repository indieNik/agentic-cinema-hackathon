# Migrate Gemini calls from AI Studio to Vertex AI

Date: 2026-10-22

Status: done 2026-10-23, see `docs/decisions/0002-gemini-on-vertex.md`. The steps below are kept as the record of the plan.

This repo is public and its CLAUDE.md says never to commit account names or project ids. So this note names them by role. The real values are in Nik's private Mission Control repo (`CLAUDE.md`, data facts) and in ignite-ads PR #64.

Why: the shared AI Studio lab key (in Nik's AI Studio lab project) has returned HTTP 402 "prepayment credits are depleted" since 2026-10-05. Local `.env` `GEMINI_API_KEY` is that lab key (see "Billing note" in `CLAUDE.md`). The Cloud Run service reads the Secret Manager secret `greenlight-gemini-api-key`; it may hold the same key or a different one, so check which project owns it before assuming it is the shared one. Vertex AI bills the Free Trial credit on Nik's production billing account (about Rs 24,000 left on 2026-10-09, ends 2026-12-26; after that, spend goes to the card).

## What uses the key in this repo
- SDK: `@google/genai` ^2.21.0 (`package.json`). No old SDK.
- One client: `server/agents.js:23` `getAI()` reads env `GEMINI_API_KEY` and does `new GoogleGenAI({ apiKey })` at `:26`.
- Call sites, all `client.models.generateContent` in `server/agents.js`:
  - `:164` `runSpecialist` tool loop, with the `searchTool` function declaration and `functionCallingConfig` AUTO/NONE.
  - `:182` `runSpecialist` retry with tools off when the reply is empty.
  - `:237` `writeMemo`, JSON mode with `memoSchema`.
- `server/index.js:21` `GET /api/health` reports `gemini: Boolean(process.env.GEMINI_API_KEY)`.
- Key source: env `GEMINI_API_KEY`; Cloud Run `--set-secrets GEMINI_API_KEY=greenlight-gemini-api-key:latest` (`deploy.sh:46`), secret created by `ensure_secret` (`deploy.sh:30`); local `.env` / `.env.example`.
- Models: `GEMINI_MODEL`, default `gemini-3.5-flash` (`server/agents.js:19`, `deploy.sh:45`, `.env.example`).
- Features: function calling (Parallel search is the only research tool; do not replace it with Google Search grounding, per the hackathon rules), JSON mode with a response schema.
- Deploy: Cloud Run service `greenlight` (`SERVICE`), region `us-central1`, project from `GCLOUD_PROJECT`, runtime identity is the project's default compute service account (`deploy.sh:35`).
- Tests: none. Docs that mention the key: `README.md`, `SUBMISSION.md`, `CLAUDE.md`.

## Target
Vertex AI (now branded Gemini Enterprise Agent Platform; the API host is still aiplatform.googleapis.com), in Nik's credit-backed Vertex project (the one IgniteAds uses), location us-central1. Owner login: the Jaggery Point gmail login that owns that project. This still satisfies the hackathon rule "AI only from Google Cloud".

## Steps
1. SDK. Already on `@google/genai`. No package change. `generateContent`, function calling and response schemas are the same on Vertex.
2. Client. Change `getAI()` in `server/agents.js` (the one helper; all three call sites already use it):
   ```js
   function getAI() {
     if (ai) return ai;
     if ((process.env.GENAI_BACKEND || 'vertex') === 'studio') {
       const apiKey = process.env.GEMINI_API_KEY;
       if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
       ai = new GoogleGenAI({ apiKey });
     } else {
       ai = new GoogleGenAI({ vertexai: true, project: process.env.VERTEX_PROJECT, location: process.env.VERTEX_LOCATION || 'us-central1' });
     }
     return ai;
   }
   ```
   Keep the API-key path behind `GENAI_BACKEND=studio`. Env: `GENAI_BACKEND=vertex`, `VERTEX_PROJECT=<Vertex project id>`, `VERTEX_LOCATION=us-central1`. Pass `VERTEX_PROJECT` into `deploy.sh` from the environment, like `GCLOUD_PROJECT`, so no project id is committed. Update `/api/health` to report the backend instead of the key.
3. Credentials.
   - Cloud Run: the default compute service account of the Greenlight project (`<project-number>-compute@developer.gserviceaccount.com`) needs roles/aiplatform.user on the Vertex project (cross-project works). Nik must approve that IAM grant, so ask first and give the exact command: `gcloud projects add-iam-policy-binding <Vertex project id> --member=serviceAccount:<SA> --role=roles/aiplatform.user --account=<Vertex project owner login>`. Find <SA> with `gcloud run services describe greenlight --project <GCLOUD_PROJECT> --region us-central1 --format='value(spec.template.spec.serviceAccountName)'` (empty means the default compute SA).
   - Local dev: ADC on Nik's Mac is a login with no access to the Vertex project. Use a token from `gcloud auth print-access-token --account=<Vertex project owner login>`, passed to the SDK through google-auth-library, or REST with Authorization: Bearer. The token lasts about an hour.
   - Browser: never give it a key or a Google token (it has none today).
4. Models and known differences on Vertex (verified 2026-10-21/22):
   - gemini-2.5-flash works. gemini-3.5-flash is 404 in us-central1, so default to gemini-2.5-flash: change the default in `server/agents.js:19`, `deploy.sh:45`, `.env.example` and the `CLAUDE.md` line. gemini-3.8-flash: check with one call, fall back to gemini-2.5-flash.
   - JSON-mode replies can return lists where AI Studio returned strings, so normalise the parsed memo fields in `writeMemo` before `public/app.js` renders them.
5. Verify, deploy, clean up. Make one real call per call site on Vertex before deploying: a specialist run with at least one search round (`:164`), the empty-reply retry (`:182`), and the memo (`:237`); the smoke test in `CLAUDE.md` covers all three (use `PARALLEL_MOCK=1` to save Parallel spend). Deploy (`GCLOUD_ACCOUNT=... GCLOUD_PROJECT=... VERTEX_PROJECT=... ./deploy.sh`). Then remove `GEMINI_API_KEY=${GEMINI_SECRET}:latest` from `--set-secrets` and the `ensure_secret "$GEMINI_SECRET"` and secretAccessor lines in `deploy.sh`. Ask Nik before deleting the secret `greenlight-gemini-api-key`. Add an ADR in `docs/decisions/` for the switch, and update `README.md` and `SUBMISSION.md` so the repo stays runnable from the README.

## Reference implementations
- order-taking-app `order-taking-backend/services/geminiService.js` and `docs/decisions/0009-gemini-on-vertex.md`: Node `@google/genai` with GENAI_BACKEND on Cloud Run (moved 2026-10-20).
- ai-trading-bot `backend/gemini_model.py`, `client()`: the Python Vertex client helper (same shape).
- ignite-ads PR #64 (https://github.com/indieNik/ignite-ads/pull/64): GENAI_BACKEND=vertex on Cloud Run.
