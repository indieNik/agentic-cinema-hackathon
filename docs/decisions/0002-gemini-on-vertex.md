# ADR 0002: Gemini on Vertex AI instead of a Google AI Studio key

Date: 2026-10-23 · Status: accepted

## Context
Every Gemini call (the specialists' tool loop, its empty-reply retry, and the Head of Development's JSON-schema memo) went through `getAI()` with a Google AI Studio key (`GEMINI_API_KEY`, Secret Manager `greenlight-gemini-api-key` in production). That key's prepaid credit ran out on 2026-10-05 and it has answered HTTP 402 since, so the public demo could not run. Google Cloud credits pay for Vertex AI but not for AI Studio usage.

## Decision
1. `getAI()` stays the only Gemini client and chooses a backend with `GENAI_BACKEND`. `vertex` (the default) builds `new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: VERTEX_LOCATION })` and authenticates with Application Default Credentials, which on Cloud Run is the service's own identity. `studio` keeps the AI Studio key path as a revert.
2. Project ids come only from the environment (`VERTEX_PROJECT`, passed through `deploy.sh`), because this repo is public. The Vertex project is a different project from the one that hosts the service; the service account is granted `roles/aiplatform.user` there.
3. For local runs whose ADC login has no access to the Vertex project, `VERTEX_ACCESS_TOKEN` (from `gcloud auth print-access-token`) is wrapped in a `google-auth-library` `OAuth2Client`. It is never set in production.
4. Default model `gemini-2.5-flash`. On Vertex in us-central1, `gemini-3.5-flash` and `gemini-3.8-flash` return 404 (checked 2026-10-23).
5. `writeMemo` normalises the parsed memo (`normaliseMemo()`): Vertex JSON mode can return a list where the schema asks for a string, and the UI expects strings.
6. Parallel stays exactly as it was: the `search_web` function tool is the crew's only research tool. Vertex supports the same function calling and response schemas, so the two-stage design of ADR 0001 is unchanged.
7. `deploy.sh` no longer mounts or grants access to the Gemini secret unless `GENAI_BACKEND=studio`.

## Consequences
- No Gemini key in the running service; one secret (Parallel) remains.
- Gemini spend lands on the Vertex project's billing account instead of the AI Studio key's project.
- The AI Studio secret still exists in Secret Manager and can be deleted by its owner once the revert path is no longer wanted.
