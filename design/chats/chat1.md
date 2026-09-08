# Emirates NBD AI agents demo

_Started 2026-09-04 16:03 UTC_

---

## User

I'm building a client-facing demo for Emirates NBD, a UAE bank. The
audience is their Head of Collections, Chief Risk Officer, and Head of
Financial Remediation. The pitch: a fleet of AI agents that sits on top
of their existing systems (Finacle core banking, collections system,
dialer, AECB bureau feed) and works the delinquency book autonomously,
with a hard compliance floor for CBUAE conduct rules.

I've attached a working HTML prototype with all the content and
structure. Rebuild it as a polished, presentation-grade prototype with
six views: Proposition, Agent Fleet, Architecture, Live Agent Demo,
Journey Simulator, and Impact & Plan.

Keep all the content. What I need is a stronger visual system:
- Institutional and restrained. This is a bank risk committee, not a
  startup pitch. No gradients-as-decoration, no glow effects.
- Use the ENBD brand colours from the web capture, not my placeholder
  palette.
- The architecture diagram and the DPD journey track are the two hero
  visuals — give them room and make them legible from across a
  meeting room.
- Dense data tables should feel like something a risk function would
  trust, not a marketing site.

Start with just the Proposition view. Don't build the others yet.

## Assistant

I'll read your prototype first.

_[tool: read_file]_

Official ENBD palette: Blue #072447 + white primary, accent blue #2765FF, secondary greys. Building the Proposition view on that.

_[tool: dc_write]_

_[tool: web_search]_

The tab button has a duplicated `style` attribute — fixing.

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Proposition view is up. Notes:

- **Palette** is ENBD's official brand set — Blue #072447 and white as primaries, accent blue #2765FF used only for state (active tab, "the shift", figures), plus secondary greys. No gradients or glows. There was no web capture in the attachment, so I pulled from ENBD's published brand assets; if you have the capture, drop it in and I'll reconcile.
- **Shift from your prototype:** light institutional ground with a navy hero band, rather than dark UI. Reads as committee material, and the lever table now looks like a risk-function exhibit (navy header, tabular numerals, hairline rules, zebra rows) instead of a card.
- **No logo** — text wordmark only; I won't recreate the ENBD lockup.
- Two tweaks: public figures/disclaimer on-off, and an "Accountable" column on the lever table for internal runs.
- Other five tabs are stubbed with a placeholder. Say the word and I'll do Architecture next since the diagram is a hero visual.

## User

Can you use this design system/pallet to match to Emirates NBD?

## Assistant

Let me sample the actual colors from the capture.

_[tool: run_script]_

_[tool: run_script]_

Sampled: nav navy **#072448**, CTA blue **#2665FF**, white utility strip with grey #757575 meta — and a geometric sans in the nav/headlines. Applying the two-tier header structure and matching type.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the type and remaining navy values.

_[tool: run_script]_

_[tool: ready_for_verification]_

Matched to the capture:

- **Navy #072448** (sampled from their nav bar and Know-more button) and **CTA blue #2665FF** — both exact, replacing my earlier approximations.
- **Two-tier header** mirroring the site: white utility strip with grey #757575 items and one navy active chip, then the navy master bar with the tab row beneath.
- **Type**: Outfit for headings, nav and stat figures — the geometric sans closest to their headline face; Helvetica for body, IBM Plex Mono for data labels.

No logo mark recreated — wordmark text only. If you can export their actual logo SVG from the brand-assets page, drop it in and I'll place it properly.

## User

now apply the same system across the remaining five views

## Assistant

_[tool: read_skill_prompt]_

Building all five views now — one large template addition plus the logic.

_[tool: dc_html_str_replace]_

Now the logic — data, live agent tool loop, simulator and impact model.

_[tool: dc_js_str_replace]_

Now the renderVals payload.

_[tool: dc_js_str_replace]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: run_script]_

_[tool: ready_for_verification]_

All six views are in, same system throughout.

- **Architecture** and **Journey track** are the two hero visuals: the diagram is redrawn light-on-white at full bleed (1560px container) with 12–20px type inside the SVG so it reads across a room; the DPD track is now a 104px band with a live DPD readout above it.
- **Colour discipline** — one ladder instead of the old rainbow: navy, slate, brand blue, steel for the agents; crimson #A8323C reserved exclusively for the compliance floor and escalation; deep green #1E6B4F for the integration surface and passed gates. Nothing else.
- **Live agent demo** now runs on real model calls with real tool use (the old code pointed at an API endpoint that couldn't work in the browser) — the compliance panel, pipeline and tool trace all update from actual behaviour, including escalation.
- Tables, feeds and traces are hairline-ruled, zebra-striped, tabular-numeral — no card chrome.

One thing to flag: the Live Agent view depends on model calls, so it needs connectivity in the room. Worth having the Journey Simulator as the fallback if the pitch is offline.

