import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { parseNarrative, type ParsedStatement } from "../parseNarrative";
import { useEscapeKey } from "./useEscapeKey";

const EXAMPLE = `Maria Silva was born in 1898 in Lisbon.
Maria's parents were João Silva and Ana Pereira.
Maria married Pedro Costa in 1920 in Porto.
Maria and Pedro had children: Ana, Carlos, and Sofia.
Maria moved to Paris in 1930.
Maria worked as a teacher.
Maria died in 1975 in Lisbon.`;

/**
 * Conversational input modal.
 *
 * Users write free-form English. As they type, the parser runs on every
 * keystroke (debounced) and shows a live preview of what was understood:
 *   - How many new people detected
 *   - How many events detected (grouped by kind)
 *   - Which sentences the parser couldn't handle
 *
 * On "Apply" the store commits everything as a single undo step.
 */
export function NarrativeInput({ onClose }: { onClose: () => void }) {
  const applyParsedStatements = useStore((s) => s.applyParsedStatements);
  const pushToast = useStore((s) => s.pushToast);
  const existingPeople = useStore((s) => s.data.people);

  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEscapeKey(onClose);

  // Focus on open
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Debounce text → debouncedText
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedText(text), 200);
    return () => window.clearTimeout(id);
  }, [text]);

  // Parse result
  const result = useMemo(() => parseNarrative(debouncedText), [debouncedText]);

  // Count how many people are new vs. matching existing
  const existingNormalized = useMemo(() => {
    const set = new Set<string>();
    for (const p of Object.values(existingPeople)) {
      set.add(
        p.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim()
      );
    }
    return set;
  }, [existingPeople]);

  const newPeopleCount = useMemo(() => {
    return result.people.filter((name) => {
      const key = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return !existingNormalized.has(key);
    }).length;
  }, [result.people, existingNormalized]);

  const reusedCount = result.people.length - newPeopleCount;

  const eventsByKind = useMemo(() => {
    const groups = new Map<string, number>();
    for (const s of result.statements) {
      if (s.kind === "person") continue;
      groups.set(s.kind, (groups.get(s.kind) ?? 0) + 1);
    }
    return Array.from(groups.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
  }, [result.statements]);

  const totalEvents = eventsByKind.reduce((sum, e) => sum + e.count, 0);
  const canApply =
    result.statements.length > 0 && debouncedText.trim().length > 0;

  const handleApply = () => {
    if (!canApply) return;
    const res = applyParsedStatements(result.statements);
    pushToast(
      `Added ${res.peopleCreated} people, ${res.eventsCreated} events.` +
        (res.warnings.length > 0 ? ` ${res.warnings.length} warnings.` : ""),
      "success"
    );
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleApply();
      return;
    }
  };

  const loadExample = () => {
    setText(EXAMPLE);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal narrative-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-header">
          <div>
            <h3>Tell me your family</h3>
            <p className="picker-sub">
              Write freely in English. The app parses dates, places,
              marriages, parents, and children as you type.
            </p>
          </div>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="narrative-body">
          <div className="narrative-editor">
            <textarea
              ref={textareaRef}
              className="narrative-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Maria Silva was born in 1898 in Lisbon..."
              spellCheck={false}
            />
            <div className="narrative-editor-footer">
              <button className="ghost small" onClick={loadExample}>
                Load example
              </button>
              <span className="narrative-char-count">
                {text.length} chars
              </span>
            </div>
          </div>

          <div className="narrative-preview">
            <div className="preview-header">Preview</div>

            {debouncedText.trim() === "" ? (
              <div className="preview-hint">
                Start typing to see what the parser understands.
              </div>
            ) : (
              <>
                <div className="preview-stats">
                  <div className="preview-stat">
                    <div className="preview-stat-value">{result.people.length}</div>
                    <div className="preview-stat-label">People</div>
                    {result.people.length > 0 && (
                      <div className="preview-stat-sub">
                        {newPeopleCount} new · {reusedCount} reused
                      </div>
                    )}
                  </div>
                  <div className="preview-stat">
                    <div className="preview-stat-value">{totalEvents}</div>
                    <div className="preview-stat-label">Events</div>
                  </div>
                </div>

                {eventsByKind.length > 0 && (
                  <div className="preview-section">
                    <div className="preview-section-label">Events</div>
                    <div className="preview-kind-list">
                      {eventsByKind.map((e) => (
                        <div key={e.kind} className="preview-kind-row">
                          <span className={`preview-kind-dot kind-${e.kind}`} />
                          <span className="preview-kind-name">{e.kind}</span>
                          <span className="preview-kind-count">{e.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.people.length > 0 && (
                  <div className="preview-section">
                    <div className="preview-section-label">People detected</div>
                    <div className="preview-people-list">
                      {result.people.map((name) => {
                        const key = name
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .trim();
                        const isNew = !existingNormalized.has(key);
                        return (
                          <span
                            key={name}
                            className={`preview-person ${isNew ? "new" : "reused"}`}
                          >
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {result.unmatched.length > 0 && (
                  <div className="preview-section preview-unmatched">
                    <div className="preview-section-label">
                      ⚠ {result.unmatched.length} unmatched{" "}
                      {result.unmatched.length === 1 ? "sentence" : "sentences"}
                    </div>
                    <ul className="preview-unmatched-list">
                      {result.unmatched.slice(0, 5).map((u, i) => (
                        <li key={i}>&ldquo;{u}&rdquo;</li>
                      ))}
                      {result.unmatched.length > 5 && (
                        <li className="muted">
                          … and {result.unmatched.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="narrative-footer">
          <div className="narrative-hint">
            <span className="kbd">⌘</span>+<span className="kbd">↵</span> to
            apply · <span className="kbd">Esc</span> to close
          </div>
          <button
            className="primary"
            disabled={!canApply}
            onClick={handleApply}
          >
            Apply ({result.statements.filter((s) => s.kind !== "person").length}{" "}
            events)
          </button>
        </div>
      </div>
    </div>
  );
}
