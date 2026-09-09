# Devpost submission — copy-paste sheet

Everything below maps 1:1 to the Devpost form fields. Submitted 10 Sep 2026; demo video: https://youtu.be/t5WU0RFd6SE

---

## Project overview

**Project name** (≤60 chars)
```
Greenlight
```

**Elevator pitch** (≤200 chars)
```
A crew of Gemini agents researches your logline on the live web with Parallel Search and writes the greenlight memo a studio exec would — comps, audience, risks, verdict — in about a minute.
```

## Project details

**About the project** (Markdown)
```markdown
## Inspiration
Before anything gets a greenlight, someone has to answer the financier's questions: *What are the comps? Who is the audience? What did similar titles make? What's already in development? What could kill this?* Development executives spend hours per pitch on that research. Independent writers and producers usually can't afford to do it at all — they pitch blind. We wanted to give every screenwriter the research desk of a studio.

## What it does
Paste a logline (plus optional title, format and budget tier) and a development crew goes to work — visibly:

- **Comps Analyst** finds 4–6 comparable titles with year, budget, performance and reception.
- **Audience & Market Analyst** sizes the audience, reads demand signals, recommends platform, timing, positioning and a budget band.
- **Risk & Competition Analyst** hunts for competing projects in development, rights/IP and life-rights issues, sensitivities and production risk.
- **Head of Development** reads the three reports and writes a structured, cited **greenlight memo** with a **GREENLIGHT / DEVELOP / PASS** verdict and a confidence score.

Every search the agents run, every source they read and every status change streams live into the UI, so the memo is auditable rather than magic. One click copies the memo as Markdown.

## How we built it
- **Gemini (google-genai)** powers every agent. The three specialists are Gemini function-calling loops whose only tool is `search_web`; the Head of Development uses Gemini's JSON-schema structured output to produce the memo.
- **Parallel Search API** (official `parallel-web` SDK) is that `search_web` tool — the crew's only window onto the world. Each agent decides its own objective and 2–5 queries; the crew shares one Parallel session per run. Parallel's excerpt-first results mean a whole run fits in one model context.
- The three specialists run **in parallel** (fan-out) and the Head of Development synthesizes (fan-in). Steps stream to the browser over Server-Sent Events.
- **Cloud Run** hosts the Node/Express service, built by **Cloud Build**. Both API keys live in **Secret Manager** and are injected at runtime; the service identity is granted `secretAccessor` on exactly those two secrets (**Cloud IAM**). The image never contains a key.
- Front end is plain HTML/CSS/JS with Material 3 / Apple HIG sensibilities: one accent colour, quiet surfaces, full dark mode, reduced-motion support.

## Challenges we ran into
- Gemini can't combine tools and structured output in one call, so the crew is two-stage: free-form research, then a schema-bound memo.
- Models like to keep searching. Declaring the tool but setting `functionCallingConfig.mode = NONE` on the final round forces them to write findings instead.
- Keeping the whole run under a minute meant capping search rounds and per-result excerpt length rather than page-scraping.

## Accomplishments that we're proud of
In testing, the Risk analyst independently discovered that Apple has an air-traffic-control thriller in development and downgraded a pitch from GREENLIGHT to DEVELOP with a concrete retitle-and-pivot recommendation. That is exactly the call a good exec makes — and it came from live web research, not model memory.

## What we learned
Letting each specialist choose its own queries beats templated searches: the agents searched for "in development", "life rights" and "viewing minutes" on their own. Good tools plus a clear role produce better research than clever prompts.

## What's next for Greenlight
Coverage-style script upload (full screenplay → memo), a Slack/Docs export for studio teams, talent and comps packaging via Parallel's Task API, and per-studio memory of past decisions in BigQuery.
```

**Built with** (tags)
```
gemini, google-genai, google-cloud, cloud-run, cloud-build, secret-manager, cloud-iam, parallel, parallel-search-api, node.js, express, javascript, html, css, server-sent-events
```

**"Try it out" links**
```
https://greenlight-p2jahd237a-uc.a.run.app
https://github.com/indieNik/agentic-cinema-hackathon
```

**Video demo link**
```
https://youtu.be/t5WU0RFd6SE
```

## Additional info

| Field | Answer |
|---|---|
| Submitter type | Individual |
| Organization name | N/A |
| Government employee | No |
| Country of residence | India |
| Canada province | N/A |
| New or existing prior to July 27, 2026 | New |
| Partner track | Parallel |
| People on team | 1 |
| Open source repo URL | https://github.com/indieNik/agentic-cinema-hackathon |
| Hosted project URL | https://greenlight-p2jahd237a-uc.a.run.app |
| First time using IBM / Grafana / ClickHouse / Replit tools | Yes (not used) |
| First time using Parallel tools | Yes |

**What Google Cloud products did you use?**
```
Gemini (gemini-3.5-flash) via the google-genai SDK — function calling for the three research agents and JSON-schema structured output for the memo; Cloud Run (hosting); Cloud Build (container build from source); Secret Manager (API keys injected at runtime); Cloud IAM (least-privilege secret access for the service identity).
```

**All other tools or products**
```
Parallel Search API via the official parallel-web SDK (the agents' only research tool, called at runtime on every request); Node.js 22; Express; vanilla HTML/CSS/JS; Inter (Google Fonts); GitHub.
```

---

## 3-minute demo video — script (aim for 2:15)

Record with QuickTime (File → New Screen Recording, microphone on) at 1280×800 or larger, light mode, then upload to YouTube as **Public** (Unlisted is not accepted). Say the words; don't read the UI.

**0:00 – 0:20 · The problem** (on the landing page)
"Before any film gets a greenlight, someone spends hours answering the same questions: what are the comps, who's the audience, what's already in development, what could kill this. Studios have development execs for that. Independent writers pitch blind. This is Greenlight."

**0:20 – 0:40 · The pitch** (click the *Sci-fi thriller* sample, point at the fields)
"I paste a logline — this one's a limited series about an air-traffic controller landing 400 blind aircraft — pick a format and budget tier, and run the crew."

**0:40 – 1:30 · The crew at work** (crew cards appear)
"Three Gemini agents start in parallel: a comps analyst, an audience-and-market analyst and a risk-and-competition analyst. Each one is a Gemini function-calling loop with a single tool: Parallel's Search API. Watch — they write their own queries…" (hover a query chip) "…and every source they read shows up here, live. That transparency is the point: the memo is auditable. When the specialists finish, the Head of Development reads all three reports and writes the memo."

**1:30 – 2:15 · The memo** (scroll slowly)
"Verdict, confidence, a polished logline. Comparable titles with real performance numbers and links. Audience, platform and positioning. Risks with mitigations — in our tests the risk analyst found a competing Apple project on its own and downgraded the pitch. Next steps, and every source. Copy it as Markdown and it's ready for a producer's inbox."

**2:15 – 2:30 · How it's built** (show README architecture diagram)
"Gemini via google-genai for every agent, Parallel Search for every fact, running on Cloud Run with keys in Secret Manager and least-privilege IAM. Open source, MIT. Thanks."
