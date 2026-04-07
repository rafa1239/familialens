export type ImportFormat = "json" | "gedcom";

export function detectFormat(fileName: string, content: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ged") || lower.endsWith(".gedcom")) return "gedcom";
  if (content.includes("0 HEAD") && content.includes("1 GEDC")) return "gedcom";
  return "json";
}
