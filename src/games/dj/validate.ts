// DJ chart validation — the two-hand rule.
//
// Within a single lane, a buttons-group event's timing window must never
// overlap a spinner-group event's window — one hand can't operate both at
// once. This is a dev-time sanity check over authored charts, not a runtime
// gameplay constraint. (Recorded takes may legitimately violate it — a human
// performed them, so they were at least physically possible — which is why
// violations warn instead of failing.)

import type { NoteEvent, Lane } from "./notes";
import { HIT_WINDOW_BEATS } from "./notes";

function eventSpan(ev: NoteEvent): [number, number] {
    const isSustain = ev.kind === "hold" || ev.kind === "spin";
    const start = ev.beat - HIT_WINDOW_BEATS;
    const end   = ev.beat + (isSustain ? (ev.durationBeats ?? 0) : 0) + HIT_WINDOW_BEATS;
    return [start, end];
}

function isButtonsGroup(ev: NoteEvent): boolean {
    return ev.kind === "tap" || ev.kind === "hold" || ev.kind === "double";
}

export function validateTwoHandRule(events: NoteEvent[]): string[] {
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
