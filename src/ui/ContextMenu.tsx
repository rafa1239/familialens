import { useEffect, useRef } from "react";

export type MenuItem =
  | { kind: "action"; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { kind: "separator" };

export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Clamp to viewport
  const style: React.CSSProperties = { left: x, top: y };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) el.style.left = `${vw - rect.width - 8}px`;
    if (rect.bottom > vh) el.style.top = `${vh - rect.height - 8}px`;
  }, []);

  return (
    <div ref={ref} className="context-menu" style={style} role="menu">
      {items.map((item, i) => {
        if (item.kind === "separator") {
          return <div key={`sep-${i}`} className="context-sep" />;
        }
        return (
          <button
            key={`it-${i}`}
            className={`context-item ${item.danger ? "danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
