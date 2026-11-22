export interface WeightedItem {
  weight: number;
  done: boolean;
}

/**
 * RG-05 : l'avancement d'une tâche avec sous-tâches est la moyenne pondérée de ses sous-tâches.
 * Renvoie null s'il n'y a pas de sous-tâche (l'avancement reste alors saisi manuellement).
 */
export function weightedProgress(items: WeightedItem[]): number | null {
  if (items.length === 0) return null;
  const total = items.reduce((s, i) => s + Math.max(1, i.weight), 0);
  const done = items.filter((i) => i.done).reduce((s, i) => s + Math.max(1, i.weight), 0);
  return Math.round((done / total) * 100);
}

/** Taux de réalisation (en %) : tâches terminées / tâches affectées. */
export function completionRate(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Moyenne d'une évaluation (5 critères notés de 1 à 5). */
export function evaluationAverage(e: {
  attendance: number;
  quality: number;
  autonomy: number;
  communication: number;
  deadlines: number;
}): number {
  const sum = e.attendance + e.quality + e.autonomy + e.communication + e.deadlines;
  return Math.round((sum / 5) * 10) / 10;
}
