import { describe, it, expect } from "vitest";
import { chartStats } from "./chartstats";
import type { NoteEvent } from "./notes";

const tap  = (beat: number): NoteEvent => ({ lane: "left", beat, kind: "tap", button: "A" });
const sc   = (beat: number): NoteEvent => ({ lane: "left", beat, kind: "scratch", scratch: "CW" });
const spin = (beat: number): NoteEvent => ({ lane: "left", beat, kind: "spin", durationBeats: 2 });

describe("chartStats", () => {
    it("handles an empty chart", () => {
        const s = chartStats([], 100);
        expect(s.total).toBe(0);
        expect(s.density).toBe(0);
        expect(s.peakDensity).toBe(0);
    });

    it("counts by kind", () => {
        const s = chartStats([tap(1), tap(2), sc(3), spin(4)], 100);
        expect(s.total).toBe(4);
        expect(s.byKind.tap).toBe(2);
        expect(s.byKind.scratch).toBe(1);
        expect(s.byKind.spin).toBe(1);
        expect(s.byKind.hold).toBe(0);
    });

    it("computes average density", () => {
        const s = chartStats([tap(0), tap(10), tap(20), tap(30)], 40);
        expect(s.density).toBeCloseTo(0.1);
    });

    it("finds the densest window", () => {
        // 4 sparse notes plus a burst of 8 notes within 4 beats
        const events = [tap(0), tap(20), tap(40), tap(60)];
        for (let i = 0; i < 8; i++) events.push(sc(80 + i * 0.5));
        const s = chartStats(events, 100);
        // Window catches the burst (8) plus nothing else: 8 notes / 8 beats = 1
        expect(s.peakDensity).toBeCloseTo(1);
    });
});
