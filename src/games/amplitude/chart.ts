// Amplitude multi-lane gem chart for the shared song (vendored).
// Song timing (OFFSET/BPMS/STOPS/SONG_LENGTH_BEATS) lives in platform/song.ts.
//
// Authoring model: each lane runs a sequence of PHRASES. A phrase is a short run
// of gems on the same lane that the player tries to clear without a miss; clearing
// the whole phrase "captures" the lane. Phrase ids are unique per (lane) and are
// generated below so the engine can track per-phrase completion.

import type { GemEvent, Button } from "./notes";

const A: Button = "A";
const B: Button = "B";

// A phrase: a lane id, a start beat, and a list of (offsetBeat, button) gems.
interface PhraseDef {
    lane: number;
    start: number;
    gems: [number, Button][];   // [beatOffset, button]
}

// DRUMS = lane 0, BASS = lane 1, LEAD = lane 2.
// Phrases are spread across the song so the player chooses which lane to grab.
const PHRASES: PhraseDef[] = [
    // ── Intro: drums establish (108 BPM) ──────────────────────────────────────
    { lane: 0, start: 5,  gems: [[0, A], [2, A], [4, A], [6, A]] },
    { lane: 1, start: 13, gems: [[0, A], [2, B], [4, A], [6, B]] },
    { lane: 0, start: 21, gems: [[0, A], [1, A], [2, A], [4, A], [6, A]] },
    { lane: 2, start: 29, gems: [[0, A], [2, A], [3, B], [5, A]] },

    // ── Build (108 BPM, beats ~35–70) ─────────────────────────────────────────
    { lane: 1, start: 37, gems: [[0, A], [2, B], [4, A], [5, B], [6, A]] },
    { lane: 0, start: 45, gems: [[0, A], [1, B], [2, A], [3, B], [5, A]] },
    { lane: 2, start: 53, gems: [[0, A], [2, B], [4, A], [6, B]] },
    { lane: 1, start: 61, gems: [[0, A], [2, A], [4, B], [6, A]] },

    // ── Groove (108 BPM, beats ~70–113) ───────────────────────────────────────
    { lane: 2, start: 69, gems: [[0, A], [1, B], [3, A], [4, B], [6, A]] },
    { lane: 0, start: 77, gems: [[0, A], [1, A], [2, B], [4, A], [6, B]] },
    { lane: 1, start: 85, gems: [[0, A], [2, B], [3, A], [5, B]] },
    { lane: 2, start: 93, gems: [[0, A], [2, A], [4, B], [5, A], [6, B]] },
    { lane: 0, start: 101, gems: [[0, A], [2, B], [4, A], [6, A]] },
    { lane: 1, start: 109, gems: [[0, A], [1, B], [2, A], [4, B]] },

    // ── Section 2: 126.6 BPM (beats ~117–211), faster ─────────────────────────
    { lane: 2, start: 117, gems: [[0, A], [2, A], [4, B], [6, A]] },
    { lane: 0, start: 125, gems: [[0, A], [1, B], [2, A], [3, B], [4, A], [6, B]] },
    { lane: 1, start: 133, gems: [[0, A], [2, B], [4, A], [6, B]] },
    { lane: 2, start: 141, gems: [[0, A], [1, A], [3, B], [4, A], [6, B]] },
    { lane: 0, start: 149, gems: [[0, A], [2, A], [4, B], [6, A]] },
    { lane: 1, start: 157, gems: [[0, A], [1, B], [2, A], [4, B], [6, A]] },
    { lane: 2, start: 165, gems: [[0, A], [2, B], [4, A], [6, B]] },
    { lane: 0, start: 173, gems: [[0, A], [1, A], [2, B], [4, A]] },
    { lane: 1, start: 181, gems: [[0, A], [2, B], [4, A], [6, B]] },
    { lane: 2, start: 189, gems: [[0, A], [1, B], [3, A], [5, B]] },
    { lane: 0, start: 197, gems: [[0, A], [2, A], [4, B], [6, A]] },
    { lane: 1, start: 205, gems: [[0, A], [1, B], [2, A], [3, B], [4, A]] },

    // ── Section 3: 86.3 BPM finale (beats ~213–268), sparse + dramatic ─────────
    { lane: 2, start: 217, gems: [[0, A], [2, B], [4, A]] },
    { lane: 0, start: 226, gems: [[0, A], [1, A], [2, B], [3, A]] },
    { lane: 1, start: 234, gems: [[0, A], [3, B], [5, A]] },
    { lane: 2, start: 241, gems: [[0, A], [2, A], [4, B], [6, A]] },
    { lane: 0, start: 249, gems: [[0, A], [2, B], [4, A]] },
    { lane: 1, start: 257, gems: [[0, A], [4, B]] },
    { lane: 2, start: 263, gems: [[0, A], [2, A]] },
];

// Flatten phrases into a beat-sorted gem list with globally-unique phrase ids.
function buildChart(): { gems: GemEvent[]; phraseCount: number } {
    const gems: GemEvent[] = [];
    PHRASES.forEach((ph, phraseId) => {
        for (const [off, btn] of ph.gems) {
            gems.push({ beat: ph.start + off, lane: ph.lane, button: btn, phrase: phraseId });
        }
    });
    gems.sort((a, b) => a.beat - b.beat);
    return { gems, phraseCount: PHRASES.length };
}

const built = buildChart();
export const CHART_GEMS: GemEvent[] = built.gems;
export const PHRASE_COUNT: number = built.phraseCount;

// Per-phrase metadata (lane + total gem count) for capture tracking.
export const PHRASE_META: { lane: number; total: number }[] = PHRASES.map(ph => ({
    lane: ph.lane,
    total: ph.gems.length,
}));
