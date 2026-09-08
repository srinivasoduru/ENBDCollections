# Emirates NBD — Autonomous Collections Agent Fleet

A presentation-grade prototype for a Group Financial Remediation risk committee review: a fleet of
AI agents that sits on top of the existing ENBD estate — DCORE, core banking, the dialer and the
AECB bureau feed — and works the delinquency book as deferrals unwind, inside a hard compliance
floor for CBUAE conduct rules.

Six views, five of them on the tab row:

| View                | What it does                                                                        |
| ------------------- | ----------------------------------------------------------------------------------- |
| 01 Proposition      | The argument, and the nine collections levers mapped agent by agent                  |
| 02 Agent Fleet      | The six agents, their remits and their tool sets                                     |
| 03 Architecture     | The estate diagram and the eight typed functions the agents can call                 |
| 04 Live Agent       | A real conversation with a real model making real tool calls                         |
| 05 Journey Sim      | One account across ninety days, executed by the fleet                                |
| 06 Impact & Plan    | An assumptions model, a twelve-week plan and three go/no-go gates — built, but hidden from the tab row for the CRO session |

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

For the version you would present from:

```bash
npm run build
npm run preview    # http://localhost:4173
```

`dev` and `preview` both serve the app and its model proxy from one process, so there is no second
server to start in the room.

## The Live Agent view

The agent reasons live and decides for itself which tools to call. The conversation-state pipeline,
the compliance panel and the tool trace are all driven by its actual behaviour — including when it
correctly refuses to continue and escalates to a human officer.

Everything behind the view runs server-side. The browser sends a string and renders what comes
back; it holds no credentials, defines no tools, executes no tools, and computes none of the
panels. The API is complete enough to drive from `curl` with the front end deleted:

```bash
npm run server                                   # standalone on :3001
curl -s localhost:3001/api/status
curl -s -X POST localhost:3001/api/session -H 'content-type: application/json' \
  -d '{"personaId":"hardship"}'
curl -s -X POST localhost:3001/api/turn -H 'content-type: application/json' \
  -d '{"sessionId":"…","text":"My company let me go last month."}'
curl -s localhost:3001/api/session/…/trace       # full decision trace
```

`npm run dev` and `npm run preview` mount the same Express app as Vite middleware, so the demo is
still a single process with no CORS in the way.

### Before a conversation exists

Two decisions are taken before any outbound contact is placed, and both are visible in the Live
Agent view because in a demo they are the point — the most compliant call is the one never made.

**Contact eligibility.** The clock slider sets the hour the contact is attempted. Outside the CBUAE
window of 09:00–20:00 the contact is refused *before placement*: no session opens, the model is
never invoked, and the agent cannot talk its way past it because it is never asked.

**Contact suppression.** Maya's self-cure score is 0.86, so the Segment Agent suppresses outreach
entirely — no call, no collector queue, no dialer time, just a reminder and a payment link. A
presenter override opens the conversation anyway for demonstration.

### Identity before disclosure

The agent does not know who answered. Its opening turn may not name a product, a balance or arrears
at all: it identifies itself as an AI assistant (CBUAE AI Guidance Note) and asks only whether it is
speaking with the account holder. If a third party answers, the contact ends without disclosing
anything. Disclosing account detail before confirmation is a blocked reply, not a warning.

### Hardship is a hard stop, not a better offer

`get_offer_matrix` has no hardship variant, by design. Enhanced terms — longer tenor, larger waiver,
lower settlement floor — exist, but the Remediation Agent prepares them for an approving officer
*after* handover, as an officer pack the customer never hears. A more generous offer is not the
response to hardship; stopping is.

### The pre-flight gate

Every customer turn is screened *before* the model sees it. Deterministic patterns run first
(`server/compliance/patterns.ts` — English and Arabic, kept in one file so Legal can review it as a
single artifact). If they are silent, a fast classifier catches paraphrase: "my situation has
changed a lot since I took this out" carries no keyword and an unmistakable meaning.

On a hit the model is **never invoked for that turn**. The server locks the session and returns a
fixed handoff string — not model-generated, so it cannot negotiate, restate the balance or ask a
follow-up question.

Order is the security property, not an optimisation. The classifier is consulted only when the
patterns are silent, so it can add escalations but never veto one — an instruction embedded in the
customer's message cannot talk the gate out of a pattern hit.

Screening failures escalate (fail closed), but are filed as `other` with `source: system`, never as
a customer signal the customer did not give. A timeout must not appear in the audit as a hardship
disclosure.

With no credentials configured at all there is no classifier and no model, so screening runs on
patterns alone rather than escalating every turn — the trace records which applied.

### The post-generation gate

The pre-flight gate screens what the customer says; this screens what the bank says back, which is
where the conduct breach would actually occur. Every reply — including the opening turn — is scanned
before it is sent, for:

- **legal or criminal threats** — court, police, travel ban, cheque case, prosecution, absconding
- **credit-bureau promises** — any claim to remove, clear or fix an AECB record
- **third-party contact** — contacting an employer, sponsor, family member or guarantor
- **off-matrix offers** — a monetary figure the offer matrix did not return for this account
- **premature disclosure** — account detail spoken before the account holder was confirmed
- **narration** — the agent describing its own tool use, or naming a function or system aloud

On a hit the reply is **suppressed** — the customer never sees it — the session escalates and locks,
and the fixed handoff goes out instead. The blocked reply is written to the audit trace marked
`suppressed`, because an examiner needs to know what was stopped, not only what was sent.

The off-matrix check extracts *monetary* figures, not numerals. A naive numeral scan would block
compliant replies full of days past due, tenor in months, percentages and dates, and every false
positive suppresses a good answer and locks the session. Amounts are checked against the values the
matrix actually served this session, the outstanding balance, and any figure the customer proposed —
the agent has to be able to repeat a number in order to decline it.

Once a session escalates it is terminal: further turns return a fixed handoff string without
reaching the model, and there is no unlock path. A human takes over out of band.

```bash
npm test    # 203 tests across both gates and the pre-contact layer
```

Model calls are proxied through the server so the API key never reaches the browser:

```bash
cp .env.example .env     # then add ANTHROPIC_API_KEY
```

The model defaults to `claude-opus-5`; override with `AGENT_MODEL`.

**Without a key, or if the network drops mid-pitch, the view degrades instead of dying.** The server
falls back to a script that drives the same tool handlers, so the panels still move and the gates
still run. The session badge reads `LIVE MODEL` or `OFFLINE SCRIPT`, and the footnote under the view
changes with it — nobody in the room is misled about which one they are watching.

Account data, payments and letter issuance are simulated in all modes. The compliance floor itself
is not simulated: it is enforced by the orchestrator, before and after the model, rather than by the
agent choosing to call the escalation tool.

## Presenter controls

Two switches sit in the white utility strip:

- **PUBLIC FIGURES** — the band of published ENBD figures and the accompanying disclaimer, on or off.
- **ACCOUNTABLE COLUMN** — adds the accountable-owner column to the lever table, for internal runs.

## Layout

```
server/
  app.ts       the Express API — /session, /turn, /session/:id/trace
  index.ts     standalone entry (npm run server)
  middleware.ts mounts the same app into Vite
  agent.ts     turn orchestration and the model tool loop
  compliance/  patterns.ts (Legal reviews this), classifier.ts, preflight.ts,
               output.ts and money.ts (the post-generation gate)
  tools.ts     the seven tool definitions and their handlers
  prompt.ts    the agent's operating instructions
  script.ts    the offline script served when the model is unavailable
  state.ts     projects a session into what the panels render
  store.ts     session store behind an interface, in-memory for now
  handoff.ts   fixed handoff strings, never model-generated
src/
  shared/      api.ts (wire types only, compiles to nothing) and personas
  data/        view content: levers, fleet, tool table, roadmap, simulation script
  hooks/       live agent transport, journey simulation, impact model
  components/  header, layout primitives, architecture diagram
  views/       the six views
  styles/      design tokens and the component stylesheet
design/        the original Claude Design handoff, and ORCHESTRATOR_SPEC.md
```

Tool definitions, the system prompt and the offline script live under `server/` and are not
reachable from the browser — the built client bundle contains no tool schemas, no prompt text and
no credentials.

All three gates in `design/ORCHESTRATOR_SPEC.md` are built: contact eligibility, the pre-flight
gate, and the post-generation gate.

`escalate_to_human` remains available to the model as a redundant path for phrasings the gate did
not anticipate. The compliance panel distinguishes the two: caught by the gate means the model was
never asked.

## Design system

Colours are ENBD's own: navy `#072448`, CTA blue `#2665FF`, a white utility strip with `#757575`
meta. Type is Outfit for headings, nav and figures, Helvetica for body, IBM Plex Mono for data
labels — bundled locally rather than fetched from Google, so the deck keeps its typography offline.

One colour ladder is used throughout, with two reservations that are never broken: crimson `#A8323C`
means the compliance floor or an escalation, and deep green `#1E6B4F` means the integration surface
or a passed gate. Nothing else uses either. No gradients, no glows.
