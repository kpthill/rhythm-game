import { describe, it, expect } from "vitest";
import { validateTwoHandRule } from "./validate";
import { CHART_RECORDED, CHART_AUTHORED } from "./songs/mountain-king/charts";
import type { NoteEvent } from "./notes";

const tap  = (beat: number): NoteEvent => ({ lane: "left", beat, kind: "tap", button: "A" });
const sc   = (beat: number): NoteEvent => ({ lane: "left", beat, kind: "scratch", scratch: "CW" });
const spin = (beat: number, durationBeats: number): NoteEvent => ({ lane: "left", beat, kind: "spin", durationBeats });
const hold = (beat: number, durationBeats: number): NoteEvent =>
    ({ lane: "left", beat, kind: "hold", button: "A", durationBeats });

describe("validateTwoHandRule", () => {
    it("accepts an empty chart", () => {
        expect(validateTwoHandRule([])).toEqual([]);
    });

    it("flags a tap and a scratch at the same beat in the same lane", () => {
        const problems = validateTwoHandRule([tap(10), sc(10)]);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain("tap@10");
        expect(problems[0]).toContain("scratch@10");
    });

    it("accepts a tap and a scratch at the same beat in different lanes", () => {
        const problems = validateTwoHandRule([
            tap(10),
            { lane: "right", beat: 10, kind: "scratch", scratch: "CW" },
        ]);
        expect(problems).toEqual([]);
    });

    it("accepts same-group events at the same beat (both hands not needed)", () => {
        expect(validateTwoHandRule([tap(10), hold(10, 2)])).toEqual([]);
        expect(validateTwoHandRule([sc(10), spin(10, 2)])).toEqual([]);
    });

    it("flags a tap inside a spin's sustain span", () => {
        const problems = validateTwoHandRule([spin(10, 4), tap(12)]);
        expect(problems).toHaveLength(1);
    });

    it("accepts a tap and a scratch that are comfortably separated", () => {
        expect(validateTwoHandRule([tap(10), sc(12)])).toEqual([]);
    });

    it("flags events whose hit windows merely brush each other", () => {
        // Windows are ±HIT_WINDOW_BEATS (0.45): beats 10 and 10.5 overlap.
        const problems = validateTwoHandRule([tap(10), sc(10.5)]);
        expect(problems).toHaveLength(1);
    });
});

/** Structural sanity for a chart: every event is well-formed. */
function checkWellFormed(chart: NoteEvent[]): void {
    for (const ev of chart) {
        expect(["left", "right"]).toContain(ev.lane);
        expect(ev.beat).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(ev.beat)).toBe(true);
        switch (ev.kind) {
            case "tap":
            case "hold":
                expect(ev.button, `${ev.kind}@${ev.beat} needs a button`).toBeDefined();
                break;
            case "scratch":
                expect(ev.scratch, `scratch@${ev.beat} needs a direction`).toBeDefined();
                break;
        }
        if (ev.kind === "hold" || ev.kind === "spin") {
            expect(ev.durationBeats, `${ev.kind}@${ev.beat} needs a duration`).toBeGreaterThan(0);
        }
    }
}

describe("shipped charts", () => {
    it("CHART_RECORDED is well-formed and sorted by beat", () => {
        checkWellFormed(CHART_RECORDED);
        for (let i = 1; i < CHART_RECORDED.length; i++) {
            expect(CHART_RECORDED[i].beat).toBeGreaterThanOrEqual(CHART_RECORDED[i - 1].beat);
        }
    });

    it("CHART_AUTHORED is well-formed and sorted by beat", () => {
        checkWellFormed(CHART_AUTHORED);
        for (let i = 1; i < CHART_AUTHORED.length; i++) {
            expect(CHART_AUTHORED[i].beat).toBeGreaterThanOrEqual(CHART_AUTHORED[i - 1].beat);
        }
    });

    it("CHART_AUTHORED obeys the two-hand rule", () => {
        expect(validateTwoHandRule(CHART_AUTHORED)).toEqual([]);
    });
});
