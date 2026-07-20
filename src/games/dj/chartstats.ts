// DJ chart summary statistics, for the select screens.

import type { NoteEvent, NoteKind } from "./notes";

export interface ChartStats {
    total: number;
    byKind: Record<NoteKind, number>;
    /** Average notes per beat over the song. */
    density: number;
    /** Peak notes per beat over any PEAK_WINDOW_BEATS window. */
    peakDensity: number;
}

export const PEAK_WINDOW_BEATS = 8;

export function chartStats(events: NoteEvent[], lengthBeats: number): ChartStats {
    const byKind: Record<NoteKind, number> = { tap: 0, hold: 0, double: 0, scratch: 0, spin: 0 };
    for (const ev of events) byKind[ev.kind]++;

    const total = events.length;
    const density = lengthBeats > 0 ? total / lengthBeats : 0;

    // Peak density: slide an 8-beat window across the (sorted) events.
    const beats = events.map(e => e.beat).sort((a, b) => a - b);
    let peak = 0;
    let lo = 0;
    for (let hi = 0; hi < beats.length; hi++) {
        while (beats[hi] - beats[lo] > PEAK_WINDOW_BEATS) lo++;
        peak = Math.max(peak, hi - lo + 1);
    }
    const peakDensity = peak / PEAK_WINDOW_BEATS;

    return { total, byKind, density, peakDensity };
}
