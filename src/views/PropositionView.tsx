import { Hero, SectionHead, StanceCard } from '../components/primitives';
import { FIGURES, LEVERS, PROPOSITION, STANCES } from '../data/content';

interface Props {
  showFigures: boolean;
  showOwners: boolean;
}

export function PropositionView({ showFigures, showOwners }: Props) {
  return (
    <div>
      <Hero
        lead
        eyebrow="01 · THE PROPOSITION"
        title={PROPOSITION.title}
        lede={PROPOSITION.lede}
      />

      {showFigures && (
        <section className="statband">
          <div className="shell" style={{ padding: '0 var(--gutter)' }}>
            <div className="statband__grid">
              {FIGURES.map((f) => (
                <div className="statband__cell" key={f.value}>
                  <div className="statband__figure">{f.value}</div>
                  <div className="statband__label">
                    {f.label.split('\n').map((line, i) => (
                      <span key={i}>
                        {i > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="shell view view--lead">
        <div className="grid-3 grid-3--spaced">
          {STANCES.map((s) => (
            <StanceCard key={s.kicker} {...s} />
          ))}
        </div>

        <SectionHead
          flush
          title="Mapped to the collections value chain, lever by lever"
          meta="9 LEVERS · 6 AGENTS"
        />
        <p className="section-lede">
          The framework ENBD's risk function already uses. Each lever gets an agent, not a slideware
          recommendation.
        </p>

        <div className="table-frame">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th style={{ width: 230 }}>LEVER</th>
                <th style={{ width: 230 }}>AGENT</th>
                <th>WHAT CHANGES</th>
                {showOwners && <th style={{ width: 170 }}>ACCOUNTABLE</th>}
              </tr>
            </thead>
            <tbody>
              {LEVERS.map((row) => (
                <tr key={row.no}>
                  <td className="is-index">{row.no}</td>
                  <td className="is-key">{row.lever}</td>
                  <td>
                    <span className="tag">{row.agent}</span>
                  </td>
                  <td>{row.change}</td>
                  {showOwners && <td className="is-owner">{row.owner}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showFigures && (
          <p className="note">{PROPOSITION.footnote}</p>
        )}
      </div>
    </div>
  );
}
