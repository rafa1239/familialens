import { useEffect, useRef } from "react";

type EscapeEntry = {
  id: symbol;
  onEscape: () => void;
};

const stack: EscapeEntry[] = [];
let isListening = false;

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;

  const top = stack[stack.length - 1];
  if (!top) return;

  event.preventDefault();
  event.stopPropagation();
  top.onEscape();
}

function syncListener() {
  if (stack.length > 0 && !isListening) {
    document.addEventListener("keydown", handleDocumentKeyDown);
    isListening = true;
    return;
  }

  if (stack.length === 0 && isListening) {
    document.removeEventListener("keydown", handleDocumentKeyDown);
    isListening = false;
  }
}

export function useEscapeKey(onEscape: () => void, enabled = true) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;

    const id = Symbol("escape-key-handler");
    const entry: EscapeEntry = {
      id,
      onEscape: () => onEscapeRef.current()
    };

    stack.push(entry);
    syncListener();

    return () => {
      const index = stack.findIndex((item) => item.id === id);
      if (index !== -1) stack.splice(index, 1);
      syncListener();
    };
  }, [enabled]);
}
