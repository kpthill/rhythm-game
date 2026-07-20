// Auto-discovers every song under src/games/dj/songs/<id>/index.ts via Vite's
// import.meta.glob. Adding a song = creating a folder that default-exports a
// SongDef. No edits here.

import type { SongDef } from "./types";
import { validateTwoHandRule } from "../validate";

const modules = import.meta.glob<{ default: SongDef }>("./*/index.ts", {
    eager: true,
});

export const SONGS: SongDef[] = Object.values(modules)
    .map((m) => m.default)
    .filter((s): s is SongDef => Boolean(s && s.id && s.charts?.length))
    .sort((a, b) => a.title.localeCompare(b.title));

// Dev-time sanity: warn (don't fail) on two-hand-rule violations — recorded
// takes may legitimately bend the rule, but authored charts shouldn't.
if (import.meta.env?.DEV) {
    for (const song of SONGS) {
        for (const chart of song.charts) {
            for (const problem of validateTwoHandRule(chart.events)) {
                console.warn(`[dj/${song.id}/${chart.id}] ${problem}`);
            }
        }
    }
}
