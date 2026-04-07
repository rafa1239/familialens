import { Operation } from "./types";
import { createId, nowIso } from "./ids";

export function makeOp(
  clientId: string,
  type: string,
  payload: Record<string, unknown>
): Operation {
  return {
    id: createId("op"),
    ts: nowIso(),
    clientId,
    type,
    payload
  };
}
