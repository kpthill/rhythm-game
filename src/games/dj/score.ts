// DJ game — run statistics, song-relative grading, and best-score storage.
//
// Grades are relative to the song (rates over its note count), not raw score
// thresholds:
//   SSS  full combo, (almost) everything PERFECT
//   SS   full combo, mostly PERFECT
//   S    near-full combo, most notes properly timed
//   A    few dropped notes, or more drops offset by a higher PERFECT share
//   B    common   ·   C  you struggled   ·   D  barely scraped through
//   FAILED — death overrides everything.

export interface RunStats {
    /** Notes judged so far (hits + misses). */
    perfect: number;
    good: number;
    missed: number;
    maxCombo: number;
    /** Unnecessary inputs (press/scratch with no matching note) — score-only penalty. */
    stray: number;
}

export function newRunStats(): RunStats {
    return { perfect: 0, good: 0, missed: 0, maxCombo: 0, stray: 0 };
}

export function judgedCount(s: RunStats): number {
    return s.perfect + s.good + s.missed;
}

/** Hit accuracy in [0,1]: judged notes that were hit at all. */
export function accuracy(s: RunStats): number {
    const total = judgedCount(s);
    return total === 0 ? 1 : (s.perfect + s.good) / total;
}

/** Share of hits that were PERFECT, in [0,1]. */
export function perfectRate(s: RunStats): number {
    const hits = s.perfect + s.good;
    return hits === 0 ? 0 : s.perfect / hits;
}

export type GradeLabel = "SSS" | "SS" | "S" | "A" | "B" | "C" | "D" | "FAILED";

export function gradeRun(s: RunStats, failed: boolean): GradeLabel {
    if (failed) return "FAILED";
    const acc = accuracy(s);
    const pr  = perfectRate(s);
    const fullCombo = s.missed === 0 && judgedCount(s) > 0;

    if (fullCombo && pr >= 0.98) return "SSS";
    if (fullCombo && pr >= 0.80) return "SS";
    if (acc >= 0.96 && pr >= 0.65) return "S";
    if (acc >= 0.90 || (acc >= 0.85 && pr >= 0.80)) return "A";
    if (acc >= 0.72) return "B";
    if (acc >= 0.50) return "C";
    return "D";
}

// ── Best-score storage ───────────────────────────────────────────────────────
// Session-scoped always; localStorage when available (cabinet persistence is
// unverified, so treat it as a bonus and never let storage errors surface).

export interface BestScore {
    score: number;
    grade: GradeLabel;
    accuracy: number;
}

const sessionBest = new Map<string, BestScore>();

function storageKey(chartId: string): string {
    return `dj.best.${chartId}`;
}

export function loadBest(chartId: string): BestScore | null {
    const inSession = sessionBest.get(chartId) ?? null;
    try {
        const raw = localStorage.getItem(storageKey(chartId));
        if (raw) {
            const stored = JSON.parse(raw) as BestScore;
            if (!inSession || stored.score > inSession.score) return stored;
        }
    } catch { /* storage unavailable — session-scoped only */ }
    return inSession;
}

/** Record a finished run; returns true when it's a new best. */
export function saveBest(chartId: string, candidate: BestScore): boolean {
    const prev = loadBest(chartId);
    if (prev && prev.score >= candidate.score) return false;
    sessionBest.set(chartId, candidate);
    try {
        localStorage.setItem(storageKey(chartId), JSON.stringify(candidate));
    } catch { /* fine — session best still recorded */ }
    return true;
}

/** Test hook: clear the session-scoped bests. */
export function resetSessionBests(): void {
    sessionBest.clear();
}
