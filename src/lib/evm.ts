/**
 * Canonical EVM calculation — single source of truth.
 * PM view computes at project level; DM/DH views call this same function
 * and aggregate results across projects rather than re-deriving the formula.
 */

export type EvmTask = {
  plannedCost: { toNumber?: () => number } | number | null;
  estimatedHours: number | null;
  baselineDays: number;
  baselineStart: Date | string;
  baselineFinish: Date | string;
  percentComplete: number;
  status?: string | null;
};

export type EvmEntry = {
  amount: number;
};

export type EvmResult = {
  spi: number | null;
  cpi: number | null;
  pvNow: number;
  evNow: number;
  totalAC: number;
  bac: number;
  eac: number | null;
  cv: number;
  sv: number;
  pvHours: number;
  evHours: number;
  svHours: number;
  schedCompletionPct: number | null;
  taskCount: number;
};

function toNumber(v: EvmTask["plannedCost"]): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  return Number(v);
}

function taskHours(t: EvmTask): number {
  return t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 1) * 8;
}

function taskPlannedCost(t: EvmTask, bac: number, totalBaseHours: number): number {
  const pc = toNumber(t.plannedCost);
  if (pc > 0) return pc;
  const th = taskHours(t);
  return bac > 0 && totalBaseHours > 0 ? (bac * th) / totalBaseHours : 0;
}

function pvAt(tasks: EvmTask[], bac: number, totalBaseHours: number, msNow: number): number {
  return tasks.reduce((s, t) => {
    const start = new Date(t.baselineStart).getTime();
    const end = new Date(t.baselineFinish).getTime();
    const pc = taskPlannedCost(t, bac, totalBaseHours);
    if (msNow <= start) return s;
    if (msNow >= end) return s + pc;
    return s + pc * ((msNow - start) / (end - start || 1));
  }, 0);
}

/**
 * Compute EVM metrics for a single project from its schedule tasks and cost entries.
 * This is the only place the EVM formula lives — DM and DH views call this, then aggregate.
 */
export function computeEvm(
  tasks: EvmTask[],
  costEntries: EvmEntry[],
  budget: number | null,
): EvmResult {
  const bac = budget ?? 0;
  const nowMs = Date.now();

  if (tasks.length === 0) {
    const totalAC = costEntries.reduce((s, e) => s + e.amount, 0);
    return {
      spi: null, cpi: null,
      pvNow: 0, evNow: 0, totalAC, bac, eac: null,
      cv: 0 - totalAC, sv: 0,
      pvHours: 0, evHours: 0, svHours: 0,
      schedCompletionPct: null, taskCount: 0,
    };
  }

  const totalBaseHours = tasks.reduce((s, t) => s + taskHours(t), 0);

  const pvNow = pvAt(tasks, bac, totalBaseHours, nowMs);
  const evNow = tasks.reduce(
    (s, t) => s + (t.percentComplete === 100 ? taskPlannedCost(t, bac, totalBaseHours) : 0),
    0,
  );
  const totalAC = costEntries.reduce((s, e) => s + e.amount, 0);

  const spi = pvNow > 0 ? evNow / pvNow : null;
  const cpi = totalAC > 0 ? evNow / totalAC : null;
  const eac = cpi !== null && cpi > 0 ? bac / cpi : null;

  const pvHours = tasks.reduce((s, t) => {
    const th = taskHours(t);
    const start = new Date(t.baselineStart).getTime();
    const end = new Date(t.baselineFinish).getTime();
    if (nowMs <= start) return s;
    if (nowMs >= end) return s + th;
    return s + th * ((nowMs - start) / (end - start || 1));
  }, 0);

  const evHours = tasks.reduce((s, t) => s + taskHours(t) * (t.percentComplete / 100), 0);

  const completedTasks = tasks.filter(
    t => t.percentComplete === 100 || t.status === "complete",
  ).length;

  return {
    spi:  spi  !== null ? Math.round(spi  * 1000) / 1000 : null,
    cpi:  cpi  !== null ? Math.round(cpi  * 1000) / 1000 : null,
    pvNow:  Math.round(pvNow  * 100) / 100,
    evNow:  Math.round(evNow  * 100) / 100,
    totalAC: Math.round(totalAC * 100) / 100,
    bac,
    eac:  eac  !== null ? Math.round(eac  * 100) / 100 : null,
    cv:   Math.round((evNow - totalAC) * 100) / 100,
    sv:   Math.round((evNow - pvNow)   * 100) / 100,
    pvHours: Math.round(pvHours),
    evHours: Math.round(evHours),
    svHours: Math.round(evHours - pvHours),
    schedCompletionPct: Math.round((completedTasks / tasks.length) * 100),
    taskCount: tasks.length,
  };
}

/**
 * Portfolio-level helper: re-exported type used by DM/DH views.
 * pvAt is needed by the burndown route for its weekly time-series.
 */
export { pvAt as computePvAt, taskPlannedCost as computeTaskPlannedCost };
