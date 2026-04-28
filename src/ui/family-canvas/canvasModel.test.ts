import { describe, expect, it } from "vitest";
import { computeTreeLayout } from "../../treeLayout";
import { SCHEMA_VERSION, type DataState } from "../../types";
import { buildCanvasModel, filterDataForFocus } from "./canvasModel";

function dataState(): DataState {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: "test",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    people: {
      dad: { id: "dad", name: "Dad", gender: "M" },
      mom: { id: "mom", name: "Mom", gender: "F" },
      kid: { id: "kid", name: "Kid", gender: "U" }
    },
    events: {
      marriage: {
        id: "marriage",
        type: "marriage",
        people: ["dad", "mom"],
        sources: ["source-a"],
        photos: []
      },
      birth: {
        id: "birth",
        type: "birth",
        people: ["kid", "dad", "mom"],
        date: { display: "2010", sortKey: 2010, precision: "year", iso: "2010" },
        sources: ["source-a"],
        photos: []
      }
    },
    sources: {
      "source-a": {
        id: "source-a",
        title: "Birth certificate",
        reliability: "primary"
      }
    }
  };
}

describe("family canvas model", () => {
  it("derives relationship and evidence badges from the v7 event model", () => {
    const data = dataState();
    const model = buildCanvasModel(data, computeTreeLayout(data));

    expect(model.nodeById.get("kid")?.badges.parents).toBe(2);
    expect(model.nodeById.get("kid")?.badges.events).toBe(1);
    expect(model.nodeById.get("kid")?.badges.sources).toBe(1);
    expect(model.nodeById.get("dad")?.badges.children).toBe(1);
    expect(model.nodeById.get("dad")?.badges.spouses).toBe(1);
  });

  it("collapses two same-unit parents into one rendered parent edge", () => {
    const data = dataState();
    const model = buildCanvasModel(data, computeTreeLayout(data));

    expect(model.renderedParentEdges).toHaveLength(1);
    expect(model.renderedParentEdges[0].kind).toBe("couple");
  });

  it("filters focus data without keeping relationship events to hidden people", () => {
    const data = dataState();
    const filtered = filterDataForFocus(data, new Set(["kid", "dad"]));

    expect(filtered.people.mom).toBeUndefined();
    expect(filtered.events.birth).toBeUndefined();
    expect(filtered.events.marriage).toBeUndefined();
  });
});
