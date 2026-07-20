import { describe, it, expect } from "vitest";
import { secondsToBeat, beatToSeconds, type BPMMap, type StopMap } from "./timing";

const NO_STOPS: StopMap = [];

describe("secondsToBeat", () => {
    describe("single constant BPM", () => {
        const bpms: BPMMap = [[0, 120]]; // 2 beats per second

        it("maps offset to beat 0", () => {
            expect(secondsToBeat(1.5, 1.5, bpms, NO_STOPS)).toBe(0);
        });

        it("advances linearly after beat 0", () => {
            expect(secondsToBeat(2.5, 1.5, bpms, NO_STOPS)).toBeCloseTo(2);
            expect(secondsToBeat(11.5, 1.5, bpms, NO_STOPS)).toBeCloseTo(20);
        });

        it("extrapolates backward before beat 0 (count-in)", () => {
            expect(secondsToBeat(0.5, 1.5, bpms, NO_STOPS)).toBeCloseTo(-2);
            expect(secondsToBeat(0, 1.5, bpms, NO_STOPS)).toBeCloseTo(-3);
        });
    });

    describe("BPM changes", () => {
        // 60 BPM for beats 0-4 (4s), then 120 BPM
        const bpms: BPMMap = [[0, 60], [4, 120]];

        it("stays linear inside the first segment", () => {
            expect(secondsToBeat(2, 0, bpms, NO_STOPS)).toBeCloseTo(2);
            expect(secondsToBeat(4, 0, bpms, NO_STOPS)).toBeCloseTo(4);
        });

        it("uses the new BPM after the change", () => {
            // 4s reaches beat 4; the next second at 120 BPM covers 2 beats
            expect(secondsToBeat(5, 0, bpms, NO_STOPS)).toBeCloseTo(6);
        });

        it("is continuous across the boundary", () => {
            const justBefore = secondsToBeat(4 - 1e-6, 0, bpms, NO_STOPS);
            const justAfter  = secondsToBeat(4 + 1e-6, 0, bpms, NO_STOPS);
            expect(justAfter - justBefore).toBeLessThan(1e-4);
        });

        it("handles three segments", () => {
            const three: BPMMap = [[0, 60], [2, 120], [4, 60]];
            // 2s -> beat 2; +1s at 120 -> beat 4; +1s at 60 -> beat 5
            expect(secondsToBeat(4, 0, three, NO_STOPS)).toBeCloseTo(5);
        });
    });

    describe("stops", () => {
        // 60 BPM, 1s pause at beat 2
        const bpms: BPMMap = [[0, 60]];
        const stops: StopMap = [[2, 1]];

        it("advances normally before the stop", () => {
            expect(secondsToBeat(1.5, 0, bpms, stops)).toBeCloseTo(1.5);
        });

        it("holds the beat during the pause", () => {
            expect(secondsToBeat(2.2, 0, bpms, stops)).toBe(2);
            expect(secondsToBeat(2.9, 0, bpms, stops)).toBe(2);
        });

        it("resumes after the pause", () => {
            expect(secondsToBeat(3.0, 0, bpms, stops)).toBeCloseTo(2);
            expect(secondsToBeat(3.5, 0, bpms, stops)).toBeCloseTo(2.5);
        });

        it("handles multiple stops", () => {
            const multi: StopMap = [[1, 0.5], [2, 0.5]];
            // beat 1 at t=1, pause to 1.5; beat 2 at t=2.5, pause to 3.0; then linear
            expect(secondsToBeat(0.5, 0, bpms, multi)).toBeCloseTo(0.5);
            expect(secondsToBeat(1.25, 0, bpms, multi)).toBe(1);
            expect(secondsToBeat(2.0, 0, bpms, multi)).toBeCloseTo(1.5);
            expect(secondsToBeat(2.75, 0, bpms, multi)).toBe(2);
            expect(secondsToBeat(4.0, 0, bpms, multi)).toBeCloseTo(3);
        });

        it("handles a stop after a BPM change", () => {
            const bpms2: BPMMap = [[0, 60], [2, 120]];
            const stops2: StopMap = [[3, 1]];
            // beat 2 at t=2; beat 3 at t=2.5 (120 BPM); pause to 3.5; then 120 BPM
            expect(secondsToBeat(3.0, 0, bpms2, stops2)).toBe(3);
            expect(secondsToBeat(4.0, 0, bpms2, stops2)).toBeCloseTo(4);
        });
    });

    describe("beatToSeconds (inverse)", () => {
        it("round-trips with secondsToBeat across BPM changes and stops", () => {
            const bpms: BPMMap = [[0, 108.0], [115.6, 126.6], [212.5, 86.3]];
            const stops: StopMap = [[170.1, 0.197], [192.2, 0.262], [214.7, 0.338]];
            for (const beat of [0, 1, 50, 115.6, 116, 170, 171, 200, 212.5, 213, 270]) {
                const t = beatToSeconds(beat, 3.174271, bpms, stops);
                expect(secondsToBeat(t, 3.174271, bpms, stops)).toBeCloseTo(beat, 4);
            }
        });

        it("maps beat 0 to the offset and negatives before it", () => {
            const bpms: BPMMap = [[0, 120]];
            expect(beatToSeconds(0, 1.5, bpms, [])).toBe(1.5);
            expect(beatToSeconds(-2, 1.5, bpms, [])).toBeCloseTo(0.5);
        });

        it("accounts for stop durations", () => {
            const bpms: BPMMap = [[0, 60]];
            const stops: StopMap = [[2, 1]];
            expect(beatToSeconds(1, 0, bpms, stops)).toBeCloseTo(1);
            expect(beatToSeconds(3, 0, bpms, stops)).toBeCloseTo(4); // 3s of beats + 1s pause
        });
    });

    it("monotonically non-decreasing over a dense sweep (real song data shape)", () => {
        const bpms: BPMMap = [[0, 108.0], [115.6, 126.6], [212.5, 86.3]];
        const stops: StopMap = [
            [170.1, 0.197], [192.2, 0.262], [214.7, 0.338], [225.2, 0.575], [232.6, 0.303],
        ];
        let prev = -Infinity;
        for (let t = 0; t < 300; t += 0.05) {
            const b = secondsToBeat(t, 3.174271, bpms, stops);
            expect(b).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = b;
        }
    });
});
