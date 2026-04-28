import { describe, expect, it } from "vitest";
import { computeTreeLayout } from "../../treeLayout";
import { SCHEMA_VERSION, type DataState } from "../../types";
import {
  buildCanvasModel,
  buildPersonInsight,
  filterDataForFocus,
  kinshipRoleFor
} from "./canvasModel";

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

  it("classifies selected-person kinship roles for canvas emphasis", () => {
    const data = dataState();

    expect(kinshipRoleFor(data, "kid", "kid")).toBe("self");
    expect(kinshipRoleFor(data, "kid", "dad")).toBe("parent");
    expect(kinshipRoleFor(data, "dad", "kid")).toBe("child");
    expect(kinshipRoleFor(data, "dad", "mom")).toBe("spouse");
    expect(kinshipRoleFor(data, null, "mom")).toBe("other");
  });

  it("builds a compact story and evidence summary from event facts", () => {
    const data = dataState();
    data.events.residence = {
      id: "residence",
      type: "residence",
      people: ["kid"],
      date: { display: "2022", sortKey: 2022, precision: "year", iso: "2022" },
      place: { name: "Porto" },
      sources: [],
      photos: []
    };

    const insight = buildPersonInsight(data, "kid");

    expect(insight.parents).toBe(2);
    expect(insight.events).toBe(2);
    expect(insight.sourcedEvents).toBe(1);
    expect(insight.missingSources).toBe(1);
    expect(insight.primaryPlace).toBe("Porto");
    expect(insight.storyLines.map((line) => line.text)).toContain("Born 2010.");
    expect(insight.storyLines.map((line) => line.text)).toContain("Child of Dad and Mom.");
    expect(insight.storyLines.some((line) => line.text.includes("needs a source"))).toBe(true);
  });
});
