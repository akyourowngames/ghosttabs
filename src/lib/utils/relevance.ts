export interface RelevanceInfo {
  label: string;
  cls: string;
}

/** Relevance tiers (Phase 5.5): 0.8+ Highly, 0.5+ Related, else Low. */
export function relevanceLabel(r: number): RelevanceInfo {
  if (r >= 0.8)
    return {
      label: "Highly relevant",
      cls: "bg-success/10 text-success border-success/20",
    };
  if (r >= 0.5)
    return {
      label: "Related",
      cls: "bg-warning/10 text-warning border-warning/20",
    };
  return {
    label: "Low relevance",
    cls: "bg-muted/40 text-muted-foreground border-border",
  };
}
