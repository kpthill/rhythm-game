import { describe, it, expect, beforeEach } from "vitest";
import {
    newRunStats, accuracy, perfectRate, gradeRun,
    loadBest, saveBest, resetSessionBests, type RunStats,
} from "./score";

function stats(perfect: number, good: number, missed: number, over: Partial<RunStats> = {}): RunStats {
    return { ...newRunStats(), perfect, good, missed, ...over };
}

describe("accuracy / perfectRate", () => {
    it("empty run counts as fully accurate (nothing judged yet)", () => {
        expect(accuracy(newRunStats())).toBe(1);
    });

    it("computes hit and perfect rates", () => {
        const s = stats(60, 30, 10);
        expect(accuracy(s)).toBeCloseTo(0.9);
        expect(perfectRate(s)).toBeCloseTo(60 / 90);
    });
});

describe("gradeRun", () => {
    it("FAILED overrides everything", () => {
        expect(gradeRun(stats(100, 0, 0), true)).toBe("FAILED");
    });

    it("SSS: full combo, everything perfect", () => {
        expect(gradeRun(stats(100, 0, 0), false)).toBe("SSS");
        expect(gradeRun(stats(99, 1, 0), false)).toBe("SSS");
    });

    it("SS: full combo, mostly perfect", () => {
        expect(gradeRun(stats(85, 15, 0), false)).toBe("SS");
    });

    it("full combo with low perfect share is an S, not SS", () => {
        expect(gradeRun(stats(70, 30, 0), false)).toBe("S");
    });

    it("S: near-full combo, most notes properly timed", () => {
        expect(gradeRun(stats(70, 27, 3), false)).toBe("S");
    });

    it("A: few dropped notes", () => {
        expect(gradeRun(stats(50, 42, 8), false)).toBe("A");
    });

    it("A: more drops offset by a higher perfect share", () => {
        expect(gradeRun(stats(70, 17, 13), false)).toBe("A");
    });

    it("B is the common grade", () => {
        expect(gradeRun(stats(30, 50, 20), false)).toBe("B");
    });

    it("C: you struggled", () => {
        expect(gradeRun(stats(20, 40, 40), false)).toBe("C");
    });

    it("D: barely scraped through", () => {
        expect(gradeRun(stats(5, 30, 65), false)).toBe("D");
    });

    it("grades are relative to note count, not raw totals", () => {
        // Same rates at very different song sizes → same grade
        expect(gradeRun(stats(9, 0, 1), false)).toBe(gradeRun(stats(900, 0, 100), false));
    });
});

describe("best-score storage", () => {
    // Node has no localStorage — these tests exercise the session-scoped
    // fallback path, which is exactly what an un-persisting cabinet would use.
    beforeEach(() => {
        resetSessionBests();
        globalThis.localStorage?.clear?.();
    });

    it("returns null with nothing stored", () => {
        expect(loadBest("nope")).toBeNull();
    });

    it("stores and retrieves a best", () => {
        expect(saveBest("song1", { score: 1000, grade: "B", accuracy: 0.8 })).toBe(true);
        expect(loadBest("song1")?.score).toBe(1000);
    });

    it("only overwrites with a higher score", () => {
        saveBest("song1", { score: 1000, grade: "B", accuracy: 0.8 });
        expect(saveBest("song1", { score: 500, grade: "C", accuracy: 0.6 })).toBe(false);
        expect(loadBest("song1")?.score).toBe(1000);
        expect(saveBest("song1", { score: 2000, grade: "A", accuracy: 0.9 })).toBe(true);
        expect(loadBest("song1")?.score).toBe(2000);
    });

    it("keeps charts separate", () => {
        saveBest("song1", { score: 1000, grade: "B", accuracy: 0.8 });
        expect(loadBest("song2")).toBeNull();
    });
});
