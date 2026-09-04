import { TABS, type ViewId } from '../data/content';

interface HeaderProps {
  view: ViewId;
  onSelect: (id: ViewId) => void;
  showFigures: boolean;
  onToggleFigures: () => void;
  showOwners: boolean;
  onToggleOwners: () => void;
}

/**
 * Two-tier header mirroring the ENBD site: a white utility strip with grey meta
 * items and one navy active chip, then the navy master bar with the tab row.
 *
 * The two switches on the right of the utility strip are presenter controls —
 * public figures on or off, and the accountable-owner column for internal runs.
 * They are styled as utility-strip items so they add no chrome.
 */
export function Header({
  view,
  onSelect,
  showFigures,
  onToggleFigures,
  showOwners,
  onToggleOwners,
}: HeaderProps) {
  return (
    <header>
      <div className="utility">
        <div className="utility__inner">
          <div className="utility__group">
            <div className="utility__item utility__item--active">Group Risk</div>
            <div className="utility__item">Financial Remediation</div>
            <div className="utility__item">Collections Strategy</div>
          </div>
          <div className="utility__status">
            <button
              type="button"
              className="utility__toggle"
              aria-pressed={showFigures}
              onClick={onToggleFigures}
            >
              <span className="utility__box" aria-hidden="true" />
              PUBLIC FIGURES
            </button>
            <button
              type="button"
              className="utility__toggle"
              aria-pressed={showOwners}
              onClick={onToggleOwners}
            >
              <span className="utility__box" aria-hidden="true" />
              ACCOUNTABLE COLUMN
            </button>
            <span className="utility__pip" aria-hidden="true" />
            <span>WORKING PROTOTYPE</span>
          </div>
        </div>
      </div>

      <div className="masthead">
        <div className="shell">
          <div className="masthead__row">
            <div className="masthead__brand">
              <div className="masthead__wordmark">Emirates NBD</div>
              <div className="masthead__divider" aria-hidden="true" />
              <div>
                <div className="masthead__title">Autonomous Collections Agent Fleet</div>
                <div className="masthead__sub">
                  GROUP FINANCIAL REMEDIATION · RISK COMMITTEE REVIEW
                </div>
              </div>
            </div>
          </div>
          <nav className="tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={'tabs__tab' + (tab.id === view ? ' tabs__tab--active' : '')}
                aria-current={tab.id === view ? 'page' : undefined}
                onClick={() => onSelect(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
