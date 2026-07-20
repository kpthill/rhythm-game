// Kevin MacLeod – "In the Hall of the Mountain King" (CC BY 4.0)
//
// The collection's original shared song. The audio is the platform asset at
// public/audio/song.mp3 (also used by the mothballed prototypes); new songs
// should put their audio under public/songs/<id>/ instead.

import type { SongDef } from "../types";
import { CHART_RECORDED, CHART_AUTHORED } from "./charts";

const song: SongDef = {
    id: "mountain-king",
    title: "In the Hall of the Mountain King",
    artist: "Kevin MacLeod",
    audioFile: "/audio/song.mp3",

    // Timing from aubio analysis (see tools/analyze.py).
    offset: 3.174271,
    bpms: [
        [0,     108.0],  //   3.2s  opening
        [115.6, 126.6],  //  67.4s  accelerating section
        [212.5,  86.3],  // 113.3s  finale
    ],
    // Pauses detected by aubio (gaps > 1.4× local average interval), offset-adjusted.
    stops: [
        [170.1, 0.197],
        [192.2, 0.262],
        [214.7, 0.338],
        [225.2, 0.575],
        [232.6, 0.303],
    ],
    // Last aubio beat ≈ beat 267.5; add a short outro buffer.
    lengthBeats: 276,

    previewSeconds: 64, // the accelerating section — the song's signature build

    charts: [
        { id: "rec",      name: "recorded take", events: CHART_RECORDED },
        { id: "authored", name: "authored",      events: CHART_AUTHORED },
    ],
};

export default song;
