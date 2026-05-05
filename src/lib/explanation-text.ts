import strategyNotes from "@/data/strategy_notes.json";
import { getPrimaryKeywords } from "./card-data";
import type { ModelCard, TacticalTag } from "./types";
import type { Strategy } from "./strategy-pools";

type StrategyNotes = {
  keywords: Record<string, string[]>;
  masters: Record<string, string[]>;
  strategyTags?: Record<string, string[]>;
};

const NOTES = strategyNotes as StrategyNotes;

export function curatedNotesFor(model?: ModelCard, master?: ModelCard): string[] {
  const notes: string[] = [];
  if (model) {
    notes.push(...(NOTES.masters[model.name] ?? []));
    for (const keyword of getPrimaryKeywords(model)) {
      notes.push(...(NOTES.keywords[keyword] ?? []));
    }
  }
  if (master && master.id !== model?.id) {
    notes.push(...(NOTES.masters[master.name] ?? []));
    for (const keyword of getPrimaryKeywords(master)) {
      notes.push(...(NOTES.keywords[keyword] ?? []));
    }
  }
  return uniqueSentences(notes);
}

export function strategyNotesFor(strategy?: Strategy): string[] {
  if (!strategy) return [];
  return uniqueSentences(strategy.tags.flatMap((tag) => NOTES.strategyTags?.[tag] ?? []));
}

export function formatTags(tags: TacticalTag[]): string {
  const unique = Array.from(new Set(tags));
  if (unique.length === 0) return "flex table job";
  return unique.map((tag) => tag.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ");
}

export function uniqueSentences(lines: string[]): string[] {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
