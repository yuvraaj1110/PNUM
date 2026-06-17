# Lapras — DGS Agentic Software Engineering Submission Packet

**Candidate:** Yuvraaj Suri · suriy@purdue.edu  
**Links:** [linkedin.com/in/yuvraajsuri](https://linkedin.com/in/yuvraajsuri) · [github.com/yuvraaj1110](https://github.com/yuvraaj1110)

**Lapras** is a real-time plumbing fleet-dispatch platform: a single-screen dispatcher portal with a live fleet map, real-time job board, one-click job intake, proximity-based dispatch assist, an agentic dispatch copilot (LLM tool-calling with human-in-the-loop assignment approval), analytics KPIs, audit timeline, and a standalone MCP server exposing the same five fleet-ops tools. Built with Next.js 15, React 19, TypeScript, and Supabase (Postgres + Realtime + Auth).

> **Class-year caveat:** I am a Purdue CS undergraduate on track to graduate **May 2028** — not yet a senior. The posting accepts senior undergraduate or graduate applicants; I state this up front so reviewers can decide.

---

## Four Required Components

This folder maps directly to the submission brief:

| Brief requirement | File / location |
|---|---|
| **Business Statement** | [`01-business-statement.md`](01-business-statement.md) — problem, features, business value, KPI definitions |
| **Logical Structure Document** | [`02-logical-structure.md`](02-logical-structure.md) — layered architecture, Mermaid diagrams, component inventory |
| **Technical Implementation Guide** | [`03-technical-implementation-guide.md`](03-technical-implementation-guide.md) — stack, data model, API/MCP contracts, scoring algorithm, frontend |
| **Application Code** | [`application/`](application/) — full source for manual review; canonical repo at [`../PNUM/`](../PNUM/) |

**Supporting docs:**

- [`SETUP.md`](SETUP.md) — prerequisites, environment variables, database migration order, run commands
- [`gemini-regeneration-test.md`](gemini-regeneration-test.md) — step-by-step protocol to test whether an LLM can rebuild the app from these Markdown files alone
- [`regeneration-test-notes.md`](regeneration-test-notes.md) — recorded results from the self-run Gemini regeneration test

---

## Reviewer Quick-Start

```bash
cd application          # or cd ../PNUM
cp .env.example .env.local   # fill in Supabase + LLM keys (see SETUP.md)
npm install
# Apply SQL migrations in order (see SETUP.md §3)
npm run dev             # http://localhost:3000
npm run mcp             # MCP server (stdio)
npm run simulate        # optional: animate technician GPS on the map
npm test                # vitest: scoring, analytics, audit, supabase-key
```

Full setup instructions: [`SETUP.md`](SETUP.md).

---

## Agentic Engineering

This project was built and iteratively refactored using **agentic coding tools** (Claude Code). The three numbered Markdown documents are written to regeneration-grade specificity — an LLM should be able to rebuild the schema, API/MCP layer, scoring algorithm, and frontend from the text alone. See [`gemini-regeneration-test.md`](gemini-regeneration-test.md) for the validation protocol.

---

## Contact

**Yuvraaj Suri** · suriy@purdue.edu · Purdue University, Computer Science (May 2028)

---

## Submission Checklist

Before zipping or uploading, verify:

| Item | Location | Status |
|---|---|---|
| Business Statement | `01-business-statement.md` | Required |
| Logical Structure | `02-logical-structure.md` | Required |
| Technical Implementation Guide | `03-technical-implementation-guide.md` | Required |
| Application Code | `application/` | Required |
| Setup guide | `SETUP.md` | Supporting |
| Gemini regeneration test | `regeneration-test-notes.md` | Self-test record (26/30 pass) |

**To zip for submission:**

```bash
cd /path/to/PNUMPARENT
zip -r lapras-dgs-submission.zip lapras-dgs-packet \
  -x "*/node_modules/*" "*/.next/*" "*/.env.local" "*/.git/*"
```

**Never include:** `.env.local`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, or any secrets.

**Reviewer entry point:** start with this `README.md`, then the three numbered docs (`01` → `02` → `03`), then `application/` for source review.
