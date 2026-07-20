// DJ song/chart data model.
//
// A song lives in its own folder under src/games/dj/songs/<id>/:
//   index.ts   — default-exports a SongDef (timing data + chart list)
//   charts.ts  — the note data (by convention; index.ts imports it)
//   audio      — either a file under public/songs/<id>/ referenced by URL,
//                or a shared platform asset (the collection's default song).
//
// Songs are auto-discovered by ./registry.ts; adding a song = adding a folder.

import type { BPMMap, StopMap } from "../../../platform/timing";
import type { NoteEvent } from "../notes";

export interface ChartDef {
    /** Stable id, unique within the song (best-score key: `<song>.<chart>`). */
    id: string;
    /** Display name, e.g. "recorded take", "authored". */
    name: string;
    events: NoteEvent[];
}

export interface SongDef {
    /** Stable id (folder name by convention). */
    id: string;
    title: string;
    artist: string;
    /** URL of the audio asset (public path). */
    audioFile: string;
    /** Seconds into the audio where beat 0 occurs. */
    offset: number;
    bpms: BPMMap;
    stops: StopMap;
    lengthBeats: number;
    /** Where the select-screen preview starts, in audio seconds. */
    previewSeconds?: number;
    /** At least one. */
    charts: ChartDef[];
}
