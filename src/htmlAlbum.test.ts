import { describe, it, expect } from "vitest";
import { exportHtmlAlbum } from "./htmlAlbum";
import { parseDate } from "./dates";
import type { DataState } from "./types";
import { SCHEMA_VERSION } from "./types";

function emptyData(): DataState {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: "t",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    people: {},
    events: {},
    sources: {}
  };
}

describe("exportHtmlAlbum", () => {
  it("produces a valid HTML5 document", () => {
    const html = exportHtmlAlbum(emptyData());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes the default title", () => {
    const html = exportHtmlAlbum(emptyData());
    expect(html).toContain("<title>Family album</title>");
  });

  it("uses a custom title", () => {
    const html = exportHtmlAlbum(emptyData(), { title: "The Smiths" });
    expect(html).toContain("<title>The Smiths</title>");
    expect(html).toContain(">The Smiths<");
  });

  it("escapes HTML in names", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "<script>alert('xss')</script>", gender: "M" };
    const html = exportHtmlAlbum(d);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders each person as a card", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" };
    d.people.b = { id: "b", name: "Bob", gender: "M" };
    const html = exportHtmlAlbum(d);
    expect(html).toContain("person-card");
    expect(html).toContain(">Alice<");
    expect(html).toContain(">Bob<");
  });

  it("includes birth and death years in the lifespan", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["a"],
      date: parseDate("1950"),
      sources: [],
      photos: []
    };
    d.events.de = {
      id: "de",
      type: "death",
      people: ["a"],
      date: parseDate("2020"),
      sources: [],
      photos: []
    };
    const html = exportHtmlAlbum(d);
    expect(html).toContain("1950 – 2020");
  });

  it("lists parents, spouses, and children", () => {
    const d = emptyData();
    d.people.dad = { id: "dad", name: "Dad Smith", gender: "M" };
    d.people.mom = { id: "mom", name: "Mom Smith", gender: "F" };
    d.people.kid = { id: "kid", name: "Kid Smith", gender: "U" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["kid", "dad", "mom"],
      sources: [],
      photos: []
    };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["dad", "mom"],
      sources: [],
      photos: []
    };
    const html = exportHtmlAlbum(d);
    // Kid card should list parents (strip tags for assertions)
    const stripped = html.replace(/<[^>]+>/g, "|");
    expect(stripped).toMatch(/Parents:\|\s*Dad Smith/);
    expect(stripped).toMatch(/Parents:\|\s*Dad Smith, Mom Smith/);
    // The Dad card lists Kid as child and Mom as spouse
    expect(stripped).toMatch(/Spouse:\|\s*Mom Smith/);
    expect(stripped).toMatch(/Children:\|\s*Kid Smith/);
  });

  it("embeds a data URL photo directly", () => {
    const d = emptyData();
    d.people.a = {
      id: "a",
      name: "Alice",
      gender: "F",
      photo: "data:image/png;base64,iVBORw0K"
    };
    const html = exportHtmlAlbum(d);
    expect(html).toContain("data:image/png;base64,iVBORw0K");
  });

  it("resolves blob photo ids from the provided map", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F", photo: "photo_abc" };
    const html = exportHtmlAlbum(d, {
      resolvedPhotos: new Map([["photo_abc", "data:image/png;base64,XXX"]])
    });
    expect(html).toContain("data:image/png;base64,XXX");
  });

  it("renders an empty-note message when there's no tree to draw", () => {
    const html = exportHtmlAlbum(emptyData());
    expect(html).toContain("empty-note");
  });

  it("produces a self-contained document (no external resources)", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" };
    const html = exportHtmlAlbum(d);
    // No external fetches
    expect(html).not.toContain("<link rel");
    expect(html).not.toContain("<script ");
  });

  it("includes a tree SVG when there are people", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" };
    const html = exportHtmlAlbum(d);
    expect(html).toContain("<svg");
    expect(html).toContain("album-tree-svg");
  });
});
