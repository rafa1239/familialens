import type { EventType } from "./types";

export const EVENT_META: Record<
  EventType,
  { label: string; color: string; short: string }
> = {
  birth:      { label: "Birth",       color: "#6aad80", short: "born" },
  death:      { label: "Death",       color: "#8a8278", short: "died" },
  marriage:   { label: "Marriage",    color: "#d4943c", short: "married" },
  divorce:    { label: "Divorce",     color: "#cf5f52", short: "divorced" },
  baptism:    { label: "Baptism",     color: "#7aa6c4", short: "baptised" },
  burial:     { label: "Burial",      color: "#6b6157", short: "buried" },
  migration:  { label: "Migration",   color: "#5b8cc9", short: "moved" },
  residence:  { label: "Residence",   color: "#5aadca", short: "lived" },
  occupation: { label: "Occupation",  color: "#9a74b8", short: "worked as" },
  education:  { label: "Education",   color: "#a8a060", short: "studied" },
  custom:     { label: "Event",       color: "#5cba9e", short: "event" }
};

export const EVENT_TYPES: EventType[] = [
  "birth",
  "death",
  "marriage",
  "divorce",
  "baptism",
  "burial",
  "migration",
  "residence",
  "occupation",
  "education",
  "custom"
];
