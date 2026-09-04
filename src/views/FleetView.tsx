import { Hero, PlainCard, SectionHead } from '../components/primitives';
import { FLEET, FLEET_RATIONALE } from '../data/content';

export function FleetView() {
  return (
    <div>
      <Hero
        eyebrow="02 · THE FLEET"
        title="Six agents, one supervisor, and a hard compliance floor."
        lede="Each agent has a narrow remit and an explicit tool set. None of them is a general-purpose chatbot. The Supervisor Agent can stop any of them mid-action."
        ledeWidth={820}
      />

      <div className="shell view">
        <div className="grid-3 grid-3--spaced">
          {FLEET.map((a) => (
            <article className="agent-card" key={a.glyph}>
              <div className="agent-card__rule" style={{ background: a.color }} />
              <div className="agent-card__body">
                <div className="agent-card__head">
                  <div className="agent-card__glyph" style={{ background: a.color }}>
                    {a.glyph}
                  </div>
                  <div>
                    <div className="agent-card__name">{a.name}</div>
                    <div className="agent-card__lever">{a.lever}</div>
                  </div>
                </div>
                <p className="agent-card__desc">{a.desc}</p>
                <div className="agent-card__tools">
                  {a.tools.map((t) => (
                    <span className="chip-mono" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>

        <SectionHead title="Why a fleet and not one model" />
        <p className="section-lede" style={{ maxWidth: 840 }}>
          Three practical reasons, all of which matter more in a regulated collections context than
          in a service chatbot.
        </p>
        <div className="grid-3">
          {FLEET_RATIONALE.map((r) => (
            <PlainCard key={r.kicker} {...r} />
          ))}
        </div>
      </div>
    </div>
  );
}
