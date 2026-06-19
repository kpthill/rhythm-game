// StepMania-style beat/time conversion.
//
// OFFSET: seconds into the audio where beat 0 occurs (the song's first downbeat).
// BPMS:   sorted [[beatStart, bpm], ...] — first entry must start at beat 0.
// STOPS:  sorted [[beat, pauseSeconds], ...] — time advances but beat position holds.

export type BPMMap  = ReadonlyArray<[beat: number, bpm: number]>;
export type StopMap = ReadonlyArray<[beat: number, seconds: number]>;

/** Convert audio playback position to a beat coordinate (called every frame). */
export function secondsToBeat(
    audioSeconds: number,
    offset: number,
    bpms: BPMMap,
    stops: StopMap,
): number {
    const t = audioSeconds - offset;   // seconds relative to beat 0

    // Before beat 0 (intro): extrapolate backward using the first BPM
    if (t <= 0) return t * (bpms[0][1] / 60);

    let elapsed = 0;   // seconds accounted for so far
    let beat    = 0;   // beat position reached so far

    for (let i = 0; i < bpms.length; i++) {
        const bpm     = bpms[i][1];
        const segEnd  = i + 1 < bpms.length ? bpms[i + 1][0] : Infinity;

        // Process stops that fall inside this BPM segment
        const segStops = (stops as Array<[number, number]>)
            .filter(([sb]) => sb >= beat && sb < segEnd)
            .sort((a, b) => a[0] - b[0]);

        let cur = beat;
        for (const [stopBeat, stopDur] of segStops) {
            const dtToStop = (stopBeat - cur) * (60 / bpm);
            if (elapsed + dtToStop >= t) return cur + (t - elapsed) * (bpm / 60);
            elapsed += dtToStop;
            if (elapsed + stopDur >= t)  return stopBeat;   // time is inside the pause
            elapsed += stopDur;
            cur = stopBeat;
        }

        // Remaining beats until the next BPM change
        const dtToSeg = (segEnd - cur) * (60 / bpm);
        if (elapsed + dtToSeg >= t) return cur + (t - elapsed) * (bpm / 60);
        elapsed += dtToSeg;
        beat = segEnd;
        if (!isFinite(beat)) break;
    }

    // Past all defined segments: extend with the last BPM
    return beat + (t - elapsed) * (bpms[bpms.length - 1][1] / 60);
}
