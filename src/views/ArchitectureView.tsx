import { ArchitectureDiagram } from '../components/ArchitectureDiagram';
import { Hero, SectionHead } from '../components/primitives';
import { TOOL_ROWS } from '../data/content';

export function ArchitectureView() {
  return (
    <div>
      <Hero
        eyebrow="03 · ARCHITECTURE"
        title="The fleet sits above the existing estate. Nothing gets ripped out."
        lede="Every system in the bottom band already exists at ENBD. The agent layer reads from and writes to them through a tool-calling adapter — which is the entire integration scope of a first phase."
      />

      <div className="shell shell--hero" style={{ padding: '44px var(--gutter) 40px' }}>
        <div className="diagram-frame">
          <ArchitectureDiagram />
        </div>
      </div>

      <div className="shell" style={{ padding: '24px var(--gutter) 88px' }}>
        <SectionHead title="The tool set — what the agents can actually do" meta="8 TYPED FUNCTIONS" />
        <p className="section-lede" style={{ maxWidth: 840 }}>
          Narrow, typed functions. The model never sees a card number, never writes SQL, and never
          invents an offer.
        </p>
        <div className="table-frame">
          <table className="table table--tight">
            <thead>
              <tr>
                <th style={{ width: 300 }}>FUNCTION</th>
                <th style={{ width: 220 }}>BACKING SYSTEM</th>
                <th>CONSTRAINT</th>
              </tr>
            </thead>
            <tbody>
              {TOOL_ROWS.map((row) => (
                <tr key={row.fn}>
                  <td>
                    <span className="table__fn">{row.fn}</span>
                  </td>
                  <td>
                    <span className="table__sys">{row.sys}</span>
                  </td>
                  <td>{row.con}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
