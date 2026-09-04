# Emirates NBD — Autonomous Collections Agent Fleet

A presentation-grade prototype for a Group Financial Remediation risk committee review: a fleet of
AI agents that sits on top of the existing ENBD estate — Finacle, the collections system, the dialer
and the AECB bureau feed — and works the delinquency book, inside a hard compliance floor for CBUAE
conduct rules.

Six views, reachable from the tab row:

| View                | What it does                                                                        |
| ------------------- | ----------------------------------------------------------------------------------- |
| 01 Proposition      | The argument, and the nine collections levers mapped agent by agent                  |
| 02 Agent Fleet      | The six agents, their remits and their tool sets                                     |
| 03 Architecture     | The estate diagram and the eight typed functions the agents can call                 |
| 04 Live Agent       | A real conversation with a real model making real tool calls                         |
| 05 Journey Sim      | One account across ninety days, executed by the fleet                                |
| 06 Impact & Plan    | An assumptions model, a twelve-week plan and three go/no-go gates                    |

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

Model calls are proxied through the server so the API key never reaches the browser:

```bash
cp .env.example .env     # then add ANTHROPIC_API_KEY
```

The model defaults to `claude-opus-5`; override with `AGENT_MODEL`.

**Without a key, or if the network drops mid-pitch, the view degrades instead of dying.** It falls
back to an in-browser script that drives the same tool functions, so the panels still move and a
hardship or dispute signal still escalates correctly. The session badge reads `LIVE MODEL` or
`OFFLINE SCRIPT`, and the footnote under the view changes with it — nobody in the room is misled
about which one they are watching.

Account data, payments and letter issuance are simulated in all modes. In production the compliance
floor would be enforced server-side by the orchestrator rather than relying on the agent to call the
escalation tool itself.

## Presenter controls

Two switches sit in the white utility strip:

- **PUBLIC FIGURES** — the band of published ENBD figures and the accompanying disclaimer, on or off.
- **ACCOUNTABLE COLUMN** — adds the accountable-owner column to the lever table, for internal runs.

## Layout

```
src/
  shared/      personas, tool definitions and handlers, system prompt, offline script
               — the domain layer, imported by both the browser and the server
  data/        view content: levers, fleet, tool table, roadmap, simulation script
  hooks/       live agent session, journey simulation, impact model
  components/  header, layout primitives, architecture diagram
  views/       the six views
  styles/      design tokens and the component stylesheet
server/        the Anthropic Messages API proxy and its Vite middleware
design/        the original Claude Design handoff — transcripts and .dc.html prototypes
```

`src/shared/tools.ts` is the single definition of what the agents can do. The server runs it for
live sessions and the browser runs it for offline ones, so a tool trace means the same thing either
way.

## Design system

Colours are ENBD's own: navy `#072448`, CTA blue `#2665FF`, a white utility strip with `#757575`
meta. Type is Outfit for headings, nav and figures, Helvetica for body, IBM Plex Mono for data
labels — bundled locally rather than fetched from Google, so the deck keeps its typography offline.

One colour ladder is used throughout, with two reservations that are never broken: crimson `#A8323C`
means the compliance floor or an escalation, and deep green `#1E6B4F` means the integration surface
or a passed gate. Nothing else uses either. No gradients, no glows.
