import { describe, it, expect } from "vitest";
import { parseNarrative, parseChildrenList } from "./parseNarrative";

function countStatements(text: string, kind: string): number {
  const r = parseNarrative(text);
  return r.statements.filter((s) => s.kind === kind).length;
}

// ─── Birth ──────────────────────────────────────────

describe("parseNarrative — birth", () => {
  it("parses 'X was born in YEAR'", () => {
    const r = parseNarrative("Maria was born in 1898.");
    expect(r.unmatched).toEqual([]);
    const births = r.statements.filter((s) => s.kind === "birth");
    expect(births).toHaveLength(1);
    expect(births[0]).toMatchObject({
      kind: "birth",
      person: "Maria",
      date: "1898"
    });
  });

  it("parses 'X was born in YEAR in PLACE'", () => {
    const r = parseNarrative("Maria was born in 1898 in Lisbon.");
    const births = r.statements.filter((s) => s.kind === "birth");
    expect(births[0]).toMatchObject({
      kind: "birth",
      person: "Maria",
      date: "1898",
      place: "Lisbon"
    });
  });

  it("parses 'X was born in PLACE in YEAR'", () => {
    const r = parseNarrative("Maria was born in Lisbon in 1898.");
    const births = r.statements.filter((s) => s.kind === "birth");
    expect(births[0]).toMatchObject({
      kind: "birth",
      person: "Maria",
      place: "Lisbon",
      date: "1898"
    });
  });

  it("parses 'X was born on DATE in PLACE'", () => {
    const r = parseNarrative("Maria was born on 15 March 1898 in Lisbon.");
    const births = r.statements.filter((s) => s.kind === "birth");
    expect(births[0]).toMatchObject({
      kind: "birth",
      person: "Maria",
      date: "15 March 1898",
      place: "Lisbon"
    });
  });

  it("parses 'X was born in PLACE' (no date)", () => {
    const r = parseNarrative("Maria was born in Lisbon.");
    const births = r.statements.filter((s) => s.kind === "birth");
    expect(births[0]).toMatchObject({
      kind: "birth",
      person: "Maria",
      place: "Lisbon"
    });
    expect(births[0]).not.toHaveProperty("date");
  });

  it("handles multi-word names and accented names", () => {
    const r = parseNarrative("María Silva Pereira was born in 1898.");
    const births = r.statements.filter((s) => s.kind === "birth");
    expect(births[0].person).toBe("María Silva Pereira");
  });

  it("handles hyphenated names", () => {
    const r = parseNarrative("Jean-Luc Picard was born in 2305.");
    expect(r.statements.some((s) => s.kind === "person" && s.name === "Jean-Luc Picard")).toBe(true);
  });
});

// ─── Death ──────────────────────────────────────────

describe("parseNarrative — death", () => {
  it("parses 'X died in YEAR'", () => {
    const r = parseNarrative("João died in 1975.");
    const deaths = r.statements.filter((s) => s.kind === "death");
    expect(deaths[0]).toMatchObject({ kind: "death", person: "João", date: "1975" });
  });

  it("parses 'X died in YEAR in PLACE'", () => {
    const r = parseNarrative("João died in 1975 in Madrid.");
    const deaths = r.statements.filter((s) => s.kind === "death");
    expect(deaths[0]).toMatchObject({
      kind: "death",
      person: "João",
      date: "1975",
      place: "Madrid"
    });
  });

  it("parses 'X died on DATE in PLACE'", () => {
    const r = parseNarrative("João died on 3 October 1975 in Lisbon.");
    const deaths = r.statements.filter((s) => s.kind === "death");
    expect(deaths[0].date).toBe("3 October 1975");
    expect(deaths[0].place).toBe("Lisbon");
  });
});

// ─── Marriage ───────────────────────────────────────

describe("parseNarrative — marriage", () => {
  it("parses 'X married Y in YEAR'", () => {
    const r = parseNarrative("Maria married João in 1920.");
    const m = r.statements.filter((s) => s.kind === "marriage");
    expect(m[0]).toMatchObject({
      kind: "marriage",
      a: "Maria",
      b: "João",
      date: "1920"
    });
  });

  it("parses 'X and Y married in YEAR in PLACE'", () => {
    const r = parseNarrative("Maria and João married in 1920 in Porto.");
    const m = r.statements.filter((s) => s.kind === "marriage");
    expect(m[0]).toMatchObject({
      kind: "marriage",
      a: "Maria",
      b: "João",
      date: "1920",
      place: "Porto"
    });
  });

  it("parses 'X and Y got married in YEAR'", () => {
    const r = parseNarrative("Maria and João got married in 1920.");
    const m = r.statements.filter((s) => s.kind === "marriage");
    expect(m).toHaveLength(1);
  });

  it("parses 'X married Y' (no date)", () => {
    const r = parseNarrative("Maria married João.");
    const m = r.statements.filter((s) => s.kind === "marriage");
    expect(m).toHaveLength(1);
    expect(m[0]).not.toHaveProperty("date");
  });

  it("emits both spouses as person statements", () => {
    const r = parseNarrative("Maria married João in 1920.");
    const names = r.statements
      .filter((s) => s.kind === "person")
      .map((s: any) => s.name);
    expect(names).toContain("Maria");
    expect(names).toContain("João");
  });
});

// ─── Parent relationships ───────────────────────────

describe("parseNarrative — parents", () => {
  it("parses 'X's father was Y' and infers M gender", () => {
    const r = parseNarrative("Maria's father was João.");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({ kind: "parent", parent: "João", child: "Maria" });
    expect(r.genders["João"]).toBe("M");
  });

  it("parses 'X's mother was Y' and infers F gender", () => {
    const r = parseNarrative("Maria's mother was Ana.");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(1);
    expect(r.genders["Ana"]).toBe("F");
  });

  it("parses 'X's parents were Y and Z'", () => {
    const r = parseNarrative("Maria's parents were João and Ana.");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(2);
    expect(parents.map((p: any) => p.parent).sort()).toEqual(["Ana", "João"]);
  });

  it("parses 'X is the son of Y and Z' with gender", () => {
    const r = parseNarrative("Pedro is the son of João and Maria.");
    expect(r.genders["Pedro"]).toBe("M");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(2);
  });

  it("parses 'X is the daughter of Y' (single parent)", () => {
    const r = parseNarrative("Ana is the daughter of Maria.");
    expect(r.genders["Ana"]).toBe("F");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({ kind: "parent", parent: "Maria", child: "Ana" });
  });

  it("parses 'X is the child of Y'", () => {
    const r = parseNarrative("Alex is the child of Maria.");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(1);
    // No gender inferred from "child"
    expect(r.genders["Alex"]).toBeUndefined();
  });
});

// ─── Children lists ─────────────────────────────────

describe("parseNarrative — children lists", () => {
  it("parses 'X and Y had children: A, B, and C'", () => {
    const r = parseNarrative("Maria and João had children: Ana, Pedro, and Sofia.");
    const parents = r.statements.filter((s) => s.kind === "parent");
    // 3 children × 2 parents each = 6 parent statements
    expect(parents).toHaveLength(6);
    expect(r.people).toContain("Ana");
    expect(r.people).toContain("Pedro");
    expect(r.people).toContain("Sofia");
  });

  it("parses 'X had children: A and B' (single parent)", () => {
    const r = parseNarrative("Maria had children: Ana and Pedro.");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(2);
  });

  it("parses 'X and Y had three children: A, B, C'", () => {
    const r = parseNarrative("Maria and João had three children: Ana, Pedro, and Sofia.");
    const parents = r.statements.filter((s) => s.kind === "parent");
    expect(parents).toHaveLength(6);
  });

  it("strips birth years from children list", () => {
    const r = parseNarrative(
      "Maria had children: Ana (1922), Pedro (1925), and Sofia (1928)."
    );
    expect(r.people).toContain("Ana");
    expect(r.people).toContain("Pedro");
    expect(r.people).toContain("Sofia");
  });
});

// ─── Migration & residence ──────────────────────────

describe("parseNarrative — migration", () => {
  it("parses 'X moved to PLACE in YEAR'", () => {
    const r = parseNarrative("Maria moved to Paris in 1920.");
    const mig = r.statements.filter((s) => s.kind === "migration");
    expect(mig[0]).toMatchObject({
      kind: "migration",
      person: "Maria",
      place: "Paris",
      date: "1920"
    });
  });

  it("parses 'X emigrated to PLACE in YEAR'", () => {
    const r = parseNarrative("João emigrated to Brazil in 1955.");
    const mig = r.statements.filter((s) => s.kind === "migration");
    expect(mig[0].place).toBe("Brazil");
    expect(mig[0].date).toBe("1955");
  });

  it("parses 'X moved to PLACE' (no date)", () => {
    const r = parseNarrative("Maria moved to Paris.");
    const mig = r.statements.filter((s) => s.kind === "migration");
    expect(mig).toHaveLength(1);
  });

  it("parses 'X lived in PLACE' as residence", () => {
    const r = parseNarrative("Maria lived in London.");
    const res = r.statements.filter((s) => s.kind === "residence");
    expect(res[0].place).toBe("London");
  });
});

// ─── Occupation ─────────────────────────────────────

describe("parseNarrative — occupation", () => {
  it("parses 'X worked as a ROLE'", () => {
    const r = parseNarrative("Maria worked as a teacher.");
    const occ = r.statements.filter((s) => s.kind === "occupation");
    expect(occ[0]).toMatchObject({
      kind: "occupation",
      person: "Maria",
      role: "teacher"
    });
  });

  it("parses 'X worked as an engineer'", () => {
    const r = parseNarrative("João worked as an engineer.");
    const occ = r.statements.filter((s) => s.kind === "occupation");
    expect(occ[0].role).toBe("engineer");
  });

  it("parses 'X was a ROLE' (not confusable with 'was born')", () => {
    const r = parseNarrative("Maria was a doctor.");
    const occ = r.statements.filter((s) => s.kind === "occupation");
    expect(occ[0].role).toBe("doctor");
  });

  it("does NOT match 'X was born' as occupation", () => {
    const r = parseNarrative("Maria was born in 1898.");
    const occ = r.statements.filter((s) => s.kind === "occupation");
    expect(occ).toHaveLength(0);
  });
});

// ─── Integration ────────────────────────────────────

describe("parseNarrative — integration", () => {
  it("parses a full short paragraph", () => {
    const text = `
      Maria Silva was born in 1898 in Lisbon.
      She was a teacher.
      Maria married João Pereira in 1920 in Porto.
      Maria and João had children: Ana, Pedro, and Sofia.
      Maria moved to Madrid in 1960.
      Maria died in 1975 in Madrid.
    `;
    // Note: "She was a teacher" will be unmatched (pronoun not supported).
    // But "Maria was a teacher" would match. Let's add that.
    const textWithNames = text.replace("She was", "Maria was");
    const r = parseNarrative(textWithNames);
    expect(r.statements.filter((s) => s.kind === "birth")).toHaveLength(1);
    expect(r.statements.filter((s) => s.kind === "death")).toHaveLength(1);
    expect(r.statements.filter((s) => s.kind === "marriage")).toHaveLength(1);
    expect(r.statements.filter((s) => s.kind === "parent")).toHaveLength(6);
    expect(r.statements.filter((s) => s.kind === "migration")).toHaveLength(1);
    expect(r.statements.filter((s) => s.kind === "occupation")).toHaveLength(1);
    expect(r.people).toContain("Maria Silva");
    expect(r.people).toContain("João Pereira");
  });

  it("reports unmatched sentences", () => {
    const r = parseNarrative(
      "Maria was born in 1898. She was always a dreamer. Maria died in 1975."
    );
    expect(r.unmatched.length).toBeGreaterThan(0);
    // Still parses the two that match
    expect(r.statements.filter((s) => s.kind === "birth")).toHaveLength(1);
    expect(r.statements.filter((s) => s.kind === "death")).toHaveLength(1);
  });

  it("dedupes person mentions", () => {
    const r = parseNarrative(
      "Maria was born in 1898. Maria died in 1975. Maria married João in 1920."
    );
    // "Maria" mentioned multiple times → only once in `people`
    const mariaCount = r.people.filter((n) => n === "Maria").length;
    expect(mariaCount).toBe(1);
  });

  it("returns empty for empty input", () => {
    const r = parseNarrative("");
    expect(r.statements).toEqual([]);
    expect(r.people).toEqual([]);
    expect(r.unmatched).toEqual([]);
  });

  it("splits on semicolons as well as periods", () => {
    const r = parseNarrative(
      "Maria was born in 1898; Maria died in 1975"
    );
    expect(r.statements.filter((s) => s.kind === "birth")).toHaveLength(1);
    expect(r.statements.filter((s) => s.kind === "death")).toHaveLength(1);
  });
});

// ─── Children list helper ───────────────────────────

describe("parseChildrenList", () => {
  it("parses a simple list with 'and'", () => {
    expect(parseChildrenList("Ana, Pedro, and Sofia")).toEqual(["Ana", "Pedro", "Sofia"]);
  });

  it("parses a list without oxford comma", () => {
    expect(parseChildrenList("Ana, Pedro and Sofia")).toEqual(["Ana", "Pedro", "Sofia"]);
  });

  it("strips birth-year suffixes", () => {
    expect(parseChildrenList("Ana (1922), Pedro (1925), and Sofia (1928)")).toEqual([
      "Ana",
      "Pedro",
      "Sofia"
    ]);
  });

  it("ignores non-capitalised items", () => {
    expect(parseChildrenList("ana, pedro")).toEqual([]);
  });

  it("trims whitespace", () => {
    expect(parseChildrenList("  Ana  ,  Pedro  ")).toEqual(["Ana", "Pedro"]);
  });
});
