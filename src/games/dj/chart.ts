// DJ chart for the shared song (v2, vendored).
//
// Two independent lane streams — left (P1) and right (P2) — authored as two
// parts of one arrangement. Each lane showcases all five verbs (tap, hold,
// double, scratch, spin). Two-hand rule: within a single lane, a buttons-group
// event (tap/hold/double) never temporally overlaps a spinner-group event
// (scratch/spin) — one hand can't do both at once. Across lanes, simultaneous
// action is the point (that's the two-lane design), so left/right timings
// freely overlap each other.
//
// Song structure (see platform/song.ts):
//   beats   0–115.6 : 108.0 BPM opening
//   beats 115.6–212.5: 126.6 BPM mid
//   beats 212.5–276 : 86.3 BPM finale

import type { NoteEvent, Lane, Button, ScratchDir } from "./notes";
import { HIT_WINDOW_BEATS } from "./notes";

const tap    = (lane: Lane, beat: number, button: Button): NoteEvent => ({ lane, beat, kind: "tap", button });
const hold   = (lane: Lane, beat: number, button: Button, durationBeats: number): NoteEvent =>
    ({ lane, beat, kind: "hold", button, durationBeats });
const dbl    = (lane: Lane, beat: number): NoteEvent => ({ lane, beat, kind: "double" });
const sc     = (lane: Lane, beat: number, dir: ScratchDir): NoteEvent => ({ lane, beat, kind: "scratch", scratch: dir });
const spin   = (lane: Lane, beat: number, durationBeats: number): NoteEvent => ({ lane, beat, kind: "spin", durationBeats });

const A = "A" as const;
const B = "B" as const;
const CW  = "CW"  as const;
const CCW = "CCW" as const;

// ── Left lane (P1) ───────────────────────────────────────────────────────────

const LEFT_1: NoteEvent[] = [
    // Intro taps
    tap(  "left", 3,  A), tap("left", 5, A), tap("left", 7, B), tap("left", 9, B), tap("left", 11, A),
    // First hold
    hold( "left", 13, A, 2),
    tap(  "left", 17, B), tap("left", 19, A),
    // Scratch intro
    sc(   "left", 23, CW), sc("left", 25, CCW),
    // First spin
    spin( "left", 29, 4),
    tap(  "left", 37, A), tap("left", 39, B),
    dbl(  "left", 41),
    tap(  "left", 43, A), tap("left", 45, B),
    sc(   "left", 49, CW), sc("left", 51, CCW), sc("left", 53, CW),
    hold( "left", 57, B, 2),
    tap(  "left", 61, A), tap("left", 63, B),
    dbl(  "left", 65),
    sc(   "left", 69, CW), sc("left", 71, CCW),
    spin( "left", 75, 3),
    tap(  "left", 81, A), tap("left", 83, B), tap("left", 85, A),
    dbl(  "left", 87),
    sc(   "left", 91, CW), sc("left", 93, CCW),
    hold( "left", 97, A, 2),
    tap(  "left", 101, B), tap("left", 103, A),
    sc(   "left", 107, CW), sc("left", 109, CCW),
    tap(  "left", 111, A),
];

const LEFT_2: NoteEvent[] = [
    tap( "left", 117, A), tap("left", 119, B), tap("left", 121, A),
    dbl( "left", 123),
    sc(  "left", 127, CW), sc("left", 129, CCW),
    spin("left", 133, 4),
    tap( "left", 141, A), tap("left", 142.5, B), tap("left", 144, A),
    dbl( "left", 146),
    sc(  "left", 150, CW), sc("left", 152, CCW), sc("left", 154, CW),
    hold("left", 158, B, 3),
    tap( "left", 165, A), tap("left", 167, B),
    dbl( "left", 169),
    sc(  "left", 173, CCW),
    spin("left", 177, 4),
    tap( "left", 185, A), tap("left", 186.5, B), tap("left", 188, A),
    dbl( "left", 190),
    sc(  "left", 194, CW), sc("left", 196, CCW),
    hold("left", 200, A, 3),
    tap( "left", 207, B),
];

const LEFT_3: NoteEvent[] = [
    tap( "left", 213, A),
    sc(  "left", 216, CW),
    tap( "left", 218, B),
    sc(  "left", 221, CCW),
    hold("left", 224, A, 3),
    tap( "left", 231, B),
    dbl( "left", 234),
    sc(  "left", 238, CW), sc("left", 240, CCW),
    spin("left", 244, 5),
    tap( "left", 253, A), tap("left", 255, B),
    dbl( "left", 258),
    sc(  "left", 262, CW), sc("left", 264, CCW),
    hold("left", 268, B, 3),
    tap( "left", 275, A),
];

// ── Right lane (P2) ──────────────────────────────────────────────────────────

const RIGHT_1: NoteEvent[] = [
    tap(  "right", 4,  A), tap("right", 6, A), tap("right", 8, B), tap("right", 10, B), tap("right", 12, A),
    hold( "right", 15, B, 2),
    tap(  "right", 21, B), tap("right", 25, A),
    sc(   "right", 27, CCW), sc("right", 29, CW),
    spin( "right", 33, 4),
    tap(  "right", 41, B), tap("right", 43, A),
    dbl(  "right", 45),
    tap(  "right", 47, B),
    sc(   "right", 51, CCW), sc("right", 53, CW),
    hold( "right", 59, A, 2),
    tap(  "right", 65, B), tap("right", 67, A),
    dbl(  "right", 69),
    sc(   "right", 73, CCW), sc("right", 75, CW),
    spin( "right", 79, 3),
    tap(  "right", 87, A), tap("right", 89, B), tap("right", 91, A),
    dbl(  "right", 93),
    sc(   "right", 97, CCW), sc("right", 99, CW),
    hold( "right", 103, B, 2),
    tap(  "right", 109, A), tap("right", 111, B), tap("right", 113, A),
];

const RIGHT_2: NoteEvent[] = [
    tap( "right", 118, A), tap("right", 120, B),
    dbl( "right", 122),
    sc(  "right", 125, CCW), sc("right", 128, CW),
    spin("right", 131, 4),
    tap( "right", 140, A), tap("right", 141.5, B), tap("right", 143, A),
    hold("right", 146, B, 3),
    tap( "right", 153, A),
    dbl( "right", 155),
    sc(  "right", 159, CCW), sc("right", 161, CW),
    spin("right", 165, 4),
    tap( "right", 173, A), tap("right", 174.5, B), tap("right", 176, A),
    dbl( "right", 178),
    sc(  "right", 182, CCW), sc("right", 184, CW),
    hold("right", 188, A, 3),
    tap( "right", 195, B), tap("right", 197, A),
    dbl( "right", 199),
    sc(  "right", 203, CCW), sc("right", 205, CW),
];

const RIGHT_3: NoteEvent[] = [
    tap( "right", 214, A),
    sc(  "right", 217, CCW),
    tap( "right", 219, B),
    sc(  "right", 222, CW),
    spin("right", 226, 4),
    tap( "right", 236, A),
    dbl( "right", 239),
    hold("right", 243, B, 3),
    tap( "right", 250, A),
    sc(  "right", 254, CCW), sc("right", 256, CW),
    dbl( "right", 260),
    spin("right", 264, 5),
    tap( "right", 273, A), tap("right", 274.5, B),
];

export const CHART: NoteEvent[] = [
    ...LEFT_1, ...LEFT_2, ...LEFT_3,
    ...RIGHT_1, ...RIGHT_2, ...RIGHT_3,
].sort((a, b) => a.beat - b.beat);

// ── Dev-time two-hand-rule validator ─────────────────────────────────────────
// Within a single lane, a buttons-group event's timing window must never
// overlap a spinner-group event's window — one hand can't operate both at
// once. This is a cheap sanity check over the authored chart, not a runtime
// gameplay constraint.

function eventSpan(ev: NoteEvent): [number, number] {
    const isSustain = ev.kind === "hold" || ev.kind === "spin";
    const start = ev.beat - HIT_WINDOW_BEATS;
    const end   = ev.beat + (isSustain ? (ev.durationBeats ?? 0) : 0) + HIT_WINDOW_BEATS;
    return [start, end];
}

function isButtonsGroup(ev: NoteEvent): boolean {
    return ev.kind === "tap" || ev.kind === "hold" || ev.kind === "double";
}

function validateTwoHandRule(events: NoteEvent[]): string[] {
    const problems: string[] = [];
    const byLane: Record<Lane, NoteEvent[]> = { left: [], right: [] };
    for (const ev of events) byLane[ev.lane].push(ev);

    for (const lane of ["left", "right"] as Lane[]) {
        const laneEvents = [...byLane[lane]].sort((a, b) => a.beat - b.beat);
        for (let i = 0; i < laneEvents.length; i++) {
            for (let j = i + 1; j < laneEvents.length; j++) {
                const a = laneEvents[i];
                const b = laneEvents[j];
                if (isButtonsGroup(a) === isButtonsGroup(b)) continue; // same group: no hand conflict
                const [aStart, aEnd] = eventSpan(a);
                const [bStart, bEnd] = eventSpan(b);
                if (aStart < bEnd && bStart < aEnd) {
                    problems.push(
                        `two-hand rule violation on ${lane}: ${a.kind}@${a.beat} overlaps ${b.kind}@${b.beat}`
                    );
                }
            }
        }
    }
    return problems;
}

if (import.meta.env?.DEV) {
    const problems = validateTwoHandRule(CHART);
    for (const p of problems) console.warn(`[dj/chart] ${p}`);
}
