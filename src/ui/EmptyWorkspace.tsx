import { useStore } from "../store";

/**
 * First-run experience. Shown when the dataset is completely empty.
 * Covers the whole workspace (not just one view) and invites the user
 * to create their first person — ideally themselves.
 *
 * Also offers a "Load demo family" button to instantly populate the
 * workspace with the Santos-Dupont family (8 people, 3 generations,
 * 7 cities across 4 continents) — great for exploring features.
 */
export function EmptyWorkspace({
  onOpenNarrative
}: {
  onOpenNarrative?: () => void;
}) {
  const addPerson = useStore((s) => s.addPerson);
  const selectPerson = useStore((s) => s.selectPerson);
  const loadDemo = useStore((s) => s.loadDemo);
  const pushToast = useStore((s) => s.pushToast);

  const startWithSelf = () => {
    const id = addPerson({ name: "Me", gender: "U" });
    selectPerson(id);
    pushToast("Created. Edit the name, add your birth year, then link relatives.", "success");
  };

  const handleLoadDemo = () => {
    loadDemo();
    pushToast(
      "Demo family loaded — the Santos-Dupont family, 3 generations across 7 cities. Try the Atlas!",
      "success"
    );
  };

  return (
    <div className="empty-workspace">
      <div className="empty-card">
        <div className="empty-illustration">
          <svg width="140" height="150" viewBox="0 0 140 150" fill="none">
            {/* Trunk */}
            <path
              d="M 70 150 L 70 85"
              stroke="var(--edge-parent, #a09080)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {/* Lower branches */}
            <path
              d="M 70 90 Q 70 75 40 70"
              stroke="var(--edge-parent, #a09080)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 70 90 Q 70 75 100 70"
              stroke="var(--edge-parent, #a09080)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            {/* Upper branches */}
            <path
              d="M 70 85 Q 70 55 55 40"
              stroke="var(--edge-parent, #a09080)"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 70 85 Q 70 55 85 40"
              stroke="var(--edge-parent, #a09080)"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Leaves / people */}
            <circle cx="40" cy="65" r="13" fill="var(--male)" opacity="0.75" />
            <circle cx="100" cy="65" r="13" fill="var(--female)" opacity="0.75" />
            <circle cx="55" cy="35" r="11" fill="var(--unknown)" opacity="0.7" />
            <circle cx="85" cy="35" r="11" fill="var(--unknown)" opacity="0.7" />
            <circle cx="70" cy="15" r="9" fill="var(--accent)" opacity="0.8" />
          </svg>
        </div>
        <h1 className="empty-title">Your family tree starts here</h1>
        <p className="empty-subtitle">
          FamiliaLens grows one person at a time. Start with yourself,
          then link parents, partners, and children as you remember them.
        </p>
        <div className="empty-actions">
          <button className="primary big" onClick={startWithSelf}>
            Start with yourself
          </button>
          {onOpenNarrative && (
            <button className="ghost big" onClick={onOpenNarrative}>
              Tell me your family
            </button>
          )}
        </div>
        <div className="empty-divider">
          <span>or</span>
        </div>
        <button className="demo-load-btn" onClick={handleLoadDemo}>
          Explore with a demo family
        </button>
        <p className="demo-load-hint">
          8 people · 3 generations · Lisbon → Paris → Buenos Aires → NYC → Tokyo
        </p>
        <div className="empty-hints">
          <div className="hint">
            <kbd>N</kbd> new person
          </div>
          <div className="hint">
            <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd>/<kbd>4</kbd> timeline · tree · map · atlas
          </div>
          <div className="hint">
            Right-click to link
          </div>
          <div className="hint">
            or import a GEDCOM
          </div>
        </div>
      </div>
    </div>
  );
}
