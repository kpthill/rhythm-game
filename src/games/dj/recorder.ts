// DJ chart recorder (dev-only) — "record a take" chart authoring.
//
// While recording, the song plays with no judging: the charter performs the
// chart on the real controls and this module quantizes the performance into
// source text using chart.ts's own helpers (tap/hold/dbl/sc/spin), ready to
// paste straight into chart.ts.
//
// Heuristics (all beats quantized to the 1/2-beat grid):
//   button press  <  HOLD_MIN_BEATS → tap    (A+B taps landing on the same
//   button press  >= HOLD_MIN_BEATS → hold    quantized beat merge into dbl)
//   spinner activity span <  SPIN_MIN_BEATS → scratch (direction = net sign)
//   spinner activity span >= SPIN_MIN_BEATS → spin
//
// Joystick LEFT/RIGHT feeds the same span tracker as real spinner steps
// (mirroring gesture.ts's fallback), so a take can be performed entirely on
// the dev keyboard.

import type { Button, Lane, NoteEvent, ScratchDir } from "./notes";
import type { LaneInput } from "./input2p";

const QUANT_BEATS       = 0.5;
const HOLD_MIN_BEATS    = 0.75;
const SPIN_MIN_BEATS    = 1.5;
const SPAN_CLOSE_BEATS  = 0.5; // inactivity gap that ends a spinner span
const SCRATCH_MIN_STEPS = 3;   // |net steps| below this is jitter — dropped
const FALLBACK_STEPS    = 4;   // synthetic steps/frame while a joystick direction is held (mirrors gesture.ts)

const q    = (b: number): number => Math.round(b / QUANT_BEATS) * QUANT_BEATS;
const qDur = (d: number, min: number): number => Math.max(min, q(d));

interface RecNote {
    beat: number; // quantized
    kind: "tap" | "hold" | "double" | "scratch" | "spin";
    button?: Button;
    durationBeats?: number;
    dir?: ScratchDir;
}

interface Span { startBeat: number; lastBeat: number; net: number; }

export interface LaneRecorder {
    lane: Lane;
    notes: RecNote[];
    aDownBeat: number | null;
    bDownBeat: number | null;
    span: Span | null;
}

export interface Recording {
    left: LaneRecorder;
    right: LaneRecorder;
    /** Newest-last human-readable capture log, for the recording HUD. */
    log: string[];
}

export interface RecordingResult {
    /** charts.ts-ready source text. */
    source: string;
    /** The take as playable note events (both lanes, sorted by beat). */
    events: NoteEvent[];
    leftCount: number;
    rightCount: number;
}

export function newRecording(): Recording {
    const laneRec = (lane: Lane): LaneRecorder =>
        ({ lane, notes: [], aDownBeat: null, bDownBeat: null, span: null });
    return { left: laneRec("left"), right: laneRec("right"), log: [] };
}

function pushNote(rec: Recording, lr: LaneRecorder, n: RecNote): void {
    lr.notes.push(n);
    const side = lr.lane === "left" ? "L" : "R";
    const what =
        n.kind === "tap"     ? `tap ${n.button}` :
        n.kind === "hold"    ? `hold ${n.button} x${n.durationBeats}` :
        n.kind === "scratch" ? `scratch ${n.dir}` :
        n.kind === "spin"    ? `spin x${n.durationBeats}` :
        "double";
    rec.log.push(`♪${n.beat}  ${side}  ${what}`);
    if (rec.log.length > 6) rec.log.shift();
}

function closeButton(rec: Recording, lr: LaneRecorder, button: Button, downBeat: number, upBeat: number): void {
    const held = upBeat - downBeat;
    if (held >= HOLD_MIN_BEATS) {
        pushNote(rec, lr, { beat: q(downBeat), kind: "hold", button, durationBeats: qDur(held, 1) });
    } else {
        pushNote(rec, lr, { beat: q(downBeat), kind: "tap", button });
    }
}

function closeSpan(rec: Recording, lr: LaneRecorder, span: Span): void {
    if (Math.abs(span.net) < SCRATCH_MIN_STEPS) return; // jitter
    const dur = span.lastBeat - span.startBeat;
    if (dur >= SPIN_MIN_BEATS) {
        pushNote(rec, lr, { beat: q(span.startBeat), kind: "spin", durationBeats: qDur(dur, 2) });
    } else {
        pushNote(rec, lr, { beat: q(span.startBeat), kind: "scratch", dir: span.net > 0 ? "CW" : "CCW" });
    }
}

/**
 * Punch-in: drop everything recorded at/after `beat` and clear open press/span
 * state, so the charter can re-perform from there.
 */
export function truncateRecording(rec: Recording, beat: number): void {
    for (const lr of [rec.left, rec.right]) {
        lr.notes = lr.notes.filter(n => n.beat < beat);
        lr.aDownBeat = null;
        lr.bDownBeat = null;
        lr.span = null;
    }
    rec.log.push(`✂ punched in at ♪${Math.round(beat * 2) / 2}`);
    if (rec.log.length > 6) rec.log.shift();
}

/** Feed one frame of one lane's input. Call once per lane per frame while recording. */
export function recordFrame(rec: Recording, lr: LaneRecorder, input: LaneInput, beat: number): void {
    if (beat < -QUANT_BEATS) return; // count-in

    if (input.aPressed && lr.aDownBeat === null) lr.aDownBeat = beat;
    if (!input.aHeld && lr.aDownBeat !== null) { closeButton(rec, lr, "A", lr.aDownBeat, beat); lr.aDownBeat = null; }
    if (input.bPressed && lr.bDownBeat === null) lr.bDownBeat = beat;
    if (!input.bHeld && lr.bDownBeat !== null) { closeButton(rec, lr, "B", lr.bDownBeat, beat); lr.bDownBeat = null; }

    let d = input.spinnerDelta;
    if (input.direction === "LEFT")  d -= FALLBACK_STEPS;
    if (input.direction === "RIGHT") d += FALLBACK_STEPS;

    if (d !== 0) {
        if (lr.span) { lr.span.lastBeat = beat; lr.span.net += d; }
        else lr.span = { startBeat: beat, lastBeat: beat, net: d };
    } else if (lr.span && beat - lr.span.lastBeat > SPAN_CLOSE_BEATS) {
        closeSpan(rec, lr, lr.span);
        lr.span = null;
    }
}

/** Close anything still open, dedupe, and merge same-beat A+B taps into doubles. */
function finalizeLane(rec: Recording, lr: LaneRecorder, endBeat: number): RecNote[] {
    if (lr.aDownBeat !== null) { closeButton(rec, lr, "A", lr.aDownBeat, endBeat); lr.aDownBeat = null; }
    if (lr.bDownBeat !== null) { closeButton(rec, lr, "B", lr.bDownBeat, endBeat); lr.bDownBeat = null; }
    if (lr.span) { closeSpan(rec, lr, lr.span); lr.span = null; }

    const sorted = [...lr.notes].sort((a, b) => a.beat - b.beat);
    const seen = new Set<string>();
    const deduped: RecNote[] = [];
    for (const n of sorted) {
        const key = `${n.kind}:${n.beat}:${n.button ?? ""}:${n.dir ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(n);
    }

    const out: RecNote[] = [];
    for (let i = 0; i < deduped.length; i++) {
        const n = deduped[i];
        if (n.kind === "tap") {
            const j = deduped.findIndex((m, k) => k > i && m.kind === "tap" && m.beat === n.beat && m.button !== n.button);
            if (j !== -1) {
                deduped.splice(j, 1);
                out.push({ beat: n.beat, kind: "double" });
                continue;
            }
        }
        out.push(n);
    }
    return out;
}

function noteSrc(lane: Lane, n: RecNote): string {
    const L = `"${lane}"`;
    switch (n.kind) {
        case "tap":     return `tap(${L}, ${n.beat}, ${n.button}),`;
        case "hold":    return `hold(${L}, ${n.beat}, ${n.button}, ${n.durationBeats}),`;
        case "double":  return `dbl(${L}, ${n.beat}),`;
        case "scratch": return `sc(${L}, ${n.beat}, ${n.dir}),`;
        case "spin":    return `spin(${L}, ${n.beat}, ${n.durationBeats}),`;
    }
}

function toNoteEvent(lane: Lane, n: RecNote): NoteEvent {
    switch (n.kind) {
        case "tap":     return { lane, beat: n.beat, kind: "tap", button: n.button };
        case "hold":    return { lane, beat: n.beat, kind: "hold", button: n.button, durationBeats: n.durationBeats };
        case "double":  return { lane, beat: n.beat, kind: "double" };
        case "scratch": return { lane, beat: n.beat, kind: "scratch", scratch: n.dir };
        case "spin":    return { lane, beat: n.beat, kind: "spin", durationBeats: n.durationBeats };
    }
}

export function finishRecording(rec: Recording, endBeat: number): RecordingResult {
    const left  = finalizeLane(rec, rec.left, endBeat);
    const right = finalizeLane(rec, rec.right, endBeat);
    const block = (name: string, lane: Lane, notes: RecNote[]): string =>
        `const ${name}: NoteEvent[] = [\n${notes.map(n => `    ${noteSrc(lane, n)}`).join("\n")}\n];`;
    const source = [
        `// Recorded take — ${left.length} left / ${right.length} right events, quantized to ${QUANT_BEATS} beat.`,
        `// Paste into the song's charts.ts (uses its tap/hold/dbl/sc/spin helpers).`,
        block("LEFT_REC", "left", left),
        ``,
        block("RIGHT_REC", "right", right),
    ].join("\n");
    const events = [
        ...left.map(n => toNoteEvent("left", n)),
        ...right.map(n => toNoteEvent("right", n)),
    ].sort((a, b) => a.beat - b.beat);
    return { source, events, leftCount: left.length, rightCount: right.length };
}
