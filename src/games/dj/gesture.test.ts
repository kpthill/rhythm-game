import { describe, it, expect } from "vitest";
import { newGestureState, sampleGesture, type GestureState, type GestureResult } from "./gesture";
import type { LaneInput } from "./input2p";

// ── Simulation harness ───────────────────────────────────────────────────────
// Drives sampleGesture frame by frame at 60fps / 120 BPM (2 beats per second),
// mirroring how the game loop calls it.

const FRAME_MS = 1000 / 60;
const BEATS_PER_MS = 2 / 1000; // 120 BPM
const GRACE = 0.5;             // stall grace used by the tests, in beats

function idle(): Omit<LaneInput, never> {
    return {
        direction: null,
        aHeld: false, bHeld: false, aPressed: false, bPressed: false,
        spinnerConnected: true,
        spinnerDelta: 0,
    };
}

class Sim {
    g: GestureState = newGestureState();
    t = 1000; // arbitrary start time
    last!: GestureResult;

    /** Advance one frame with the given input overrides. */
    frame(over: Partial<LaneInput> = {}): GestureResult {
        this.t += FRAME_MS;
        const input: LaneInput = { ...idle(), ...over };
        this.last = sampleGesture(this.g, input, this.t, this.t * BEATS_PER_MS, GRACE);
        return this.last;
    }

    /** Advance n idle frames. */
    idleFrames(n: number): GestureResult {
        for (let i = 0; i < n; i++) this.frame();
        return this.last;
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("sampleGesture — spinner input", () => {
    it("a quick CW burst registers a CW scratch", () => {
        const sim = new Sim();
        sim.frame({ spinnerDelta: 3 });
        const r = sim.frame({ spinnerDelta: 3 });
        expect(r.scratchCW).toBe(true);
        expect(r.scratchCCW).toBe(false);
    });

    it("a quick CCW burst registers a CCW scratch", () => {
        const sim = new Sim();
        sim.frame({ spinnerDelta: -4 });
        const r = sim.frame({ spinnerDelta: -4 });
        expect(r.scratchCCW).toBe(true);
        expect(r.scratchCW).toBe(false);
    });

    it("small alternating jitter registers nothing", () => {
        const sim = new Sim();
        for (let i = 0; i < 20; i++) {
            const r = sim.frame({ spinnerDelta: i % 2 === 0 ? 1 : -1 });
            expect(r.scratchCW).toBe(false);
            expect(r.scratchCCW).toBe(false);
        }
    });

    it("motion outside the accumulation window is forgotten", () => {
        const sim = new Sim();
        sim.frame({ spinnerDelta: 5 });
        sim.idleFrames(10); // > 100ms of idle
        const r = sim.frame({ spinnerDelta: 1 });
        expect(r.scratchCW).toBe(false);
    });
});

describe("sampleGesture — spinning / stall detection", () => {
    it("continuous motion keeps `spinning` true with full health", () => {
        const sim = new Sim();
        for (let i = 0; i < 30; i++) sim.frame({ spinnerDelta: 2 });
        expect(sim.last.spinning).toBe(true);
        expect(sim.last.spinHealth).toBeCloseTo(1, 1);
    });

    it("health decays after motion stops, then spinning goes false past the grace", () => {
        const sim = new Sim();
        for (let i = 0; i < 10; i++) sim.frame({ spinnerDelta: 2 });

        // Idle within the grace window: still spinning, but decaying
        sim.idleFrames(10); // ~167ms ≈ 0.33 beats < GRACE
        expect(sim.last.spinning).toBe(true);
        expect(sim.last.spinHealth).toBeLessThan(1);
        expect(sim.last.spinHealth).toBeGreaterThan(0);

        // Idle past the grace: stalled
        sim.idleFrames(10); // total ~0.67 beats > GRACE
        expect(sim.last.spinning).toBe(false);
        expect(sim.last.spinHealth).toBe(0);
    });

    it("is not spinning before any input ever arrives", () => {
        const sim = new Sim();
        const r = sim.idleFrames(5);
        expect(r.spinning).toBe(false);
    });
});

describe("sampleGesture — joystick fallback", () => {
    it("tapping RIGHT registers a CW scratch", () => {
        const sim = new Sim();
        sim.frame({ direction: "RIGHT" });
        const r = sim.frame({ direction: "RIGHT" });
        expect(r.scratchCW).toBe(true);
    });

    it("tapping LEFT registers a CCW scratch", () => {
        const sim = new Sim();
        sim.frame({ direction: "LEFT" });
        const r = sim.frame({ direction: "LEFT" });
        expect(r.scratchCCW).toBe(true);
    });

    it("holding a direction sustains `spinning`", () => {
        const sim = new Sim();
        for (let i = 0; i < 60; i++) sim.frame({ direction: "RIGHT" });
        expect(sim.last.spinning).toBe(true);
        // ... and it stalls once released past the grace
        sim.idleFrames(25);
        expect(sim.last.spinning).toBe(false);
    });

    it("the fallback works even when the spinner reports connected", () => {
        const sim = new Sim();
        sim.frame({ direction: "RIGHT", spinnerConnected: true });
        const r = sim.frame({ direction: "RIGHT", spinnerConnected: true });
        expect(r.scratchCW).toBe(true);
    });

    it("fallback contributes to visualDelta", () => {
        const sim = new Sim();
        const r = sim.frame({ direction: "LEFT" });
        expect(r.visualDelta).toBeLessThan(0);
    });
});
