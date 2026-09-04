import { Hero, Meter, Panel, SectionHead, StanceCard } from '../components/primitives';
import { GATES, ROADMAP } from '../data/content';
import { useImpactModel } from '../hooks/useImpactModel';

export function ImpactView() {
  const impact = useImpactModel();

  return (
    <div>
      <Hero
        eyebrow="06 · THE CASE"
        title="What moves, and what it is worth."
        lede="Adjust the assumptions. The model is deliberately conservative — no benefit is claimed from late-stage or legal recovery, and no headcount reduction is assumed beyond redeployment of early-bucket capacity."
        ledeWidth={880}
      />

      <div className="shell view" style={{ paddingTop: 44 }}>
        <div className="impact-grid">
          <Panel title="ASSUMPTIONS — ILLUSTRATIVE PORTFOLIO" wideHead>
            <div className="assumptions">
              {impact.sliders.map((s) => (
                <div className="assumption" key={s.key}>
                  <div className="assumption__head">
                    <label className="assumption__label" htmlFor={`slider-${s.key}`}>
                      {s.label}
                    </label>
                    <b className="assumption__value">{s.display}</b>
                  </div>
                  <input
                    id={`slider-${s.key}`}
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={s.value}
                    onChange={(e) => impact.set(s.key, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <div className="stack">
            <div className="headline">
              <div className="headline__figure">{impact.bigSaving}</div>
              <div className="headline__label">
                ANNUAL REDUCTION IN BALANCES ROLLING PAST 90 DPD
                <br />
                AT THE ASSUMPTIONS SET ON THE LEFT
              </div>
            </div>

            <div className="tiles">
              <div className="tile">
                <div className="tile__figure">{impact.bigContact}</div>
                <div className="tile__label">
                  EFFECTIVE CONTACT RATE
                  <br />
                  WITH 24/7 OMNICHANNEL
                </div>
              </div>
              <div className="tile">
                <div className="tile__figure">{impact.bigCost}</div>
                <div className="tile__label">
                  EARLY-BUCKET COST
                  <br />
                  TO COLLECT, INDEXED
                </div>
              </div>
            </div>

            <Panel title="WHERE THE MOVEMENT COMES FROM" wideHead>
              <div className="bars">
                {impact.bars.map((b) => (
                  <Meter key={b.label} {...b} />
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <SectionHead title="Twelve weeks to a decision, not a programme" meta="4 PHASES · 1 GO/NO-GO" />
        <p className="section-lede" style={{ maxWidth: 840 }}>
          The proposal is a proof against ENBD's own book, with a go/no-go gate at the end — not a
          multi-year transformation.
        </p>

        <div className="roadmap">
          {ROADMAP.map((r) => (
            <div className="roadmap__row" key={r.phase}>
              <div className="roadmap__phase">{r.phase}</div>
              <div>
                <h4 className="roadmap__title">{r.title}</h4>
                <p className="roadmap__body">{r.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid-3">
          {GATES.map((g) => (
            <StanceCard key={g.kicker} compact kickerColor="var(--grey)" {...g} />
          ))}
        </div>
      </div>
    </div>
  );
}
