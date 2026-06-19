// The collection's shared song asset, plus its StepMania timing description.
// Most games reuse this; a game may load its own track via its own AudioManager.
//
// Kevin MacLeod – "In the Hall of the Mountain King" (CC BY 4.0)

import type { AudioManager } from "./audio";
import { secondsToBeat, type BPMMap, type StopMap } from "./timing";

export const SONG_FILE = "/audio/song.mp3";

// Seconds into the audio where beat 0 occurs (first aubio-detected downbeat).
export const OFFSET = 3.174271;

export const BPMS: BPMMap = [
    [0,     108.0],  //   3.2s  opening
    [115.6, 126.6],  //  67.4s  accelerating section
    [212.5,  86.3],  // 113.3s  finale
];

// Pauses detected by aubio (gaps > 1.4× local average interval), offset-adjusted.
export const STOPS: StopMap = [
    [170.1, 0.197],
    [192.2, 0.262],
    [214.7, 0.338],
    [225.2, 0.575],
    [232.6, 0.303],
];

// Last aubio beat ≈ beat 267.5; add a short outro buffer.
export const SONG_LENGTH_BEATS = 276;

/** Current beat position of the shared song, given the shared AudioManager. */
export function beatAt(audio: AudioManager): number {
    return secondsToBeat(audio.currentSeconds, OFFSET, BPMS, STOPS);
}
