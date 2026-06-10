#!/usr/bin/env python3
"""Analyze an MP3 and output chart authoring data.

Usage:
    python tools/analyze.py public/audio/song.mp3
    python tools/analyze.py public/audio/song.mp3 --bpm 160

Output:
    - BPMS change list  (paste into chart.ts)
    - STOPS list        (paste into chart.ts)
    - Primary beat positions at 3 density levels (use as t(...) coordinates)
    - Beat-by-beat detail table for manual inspection
"""

import subprocess
import sys
import argparse
import statistics


def get_beats(mp3_path: str) -> list[float]:
    result = subprocess.run(
        ["aubio", "beat", mp3_path],
        capture_output=True, text=True, check=True
    )
    return [float(line.strip()) for line in result.stdout.strip().split("\n") if line.strip()]


def rolling_avg(values: list[float], window: int = 8) -> list[float]:
    out = []
    half = window // 2
    for i in range(len(values)):
        lo, hi = max(0, i - half), min(len(values), i + half + 1)
        out.append(statistics.mean(values[lo:hi]))
    return out


def segment_by_tempo(
    intervals: list[float],
    threshold: float = 0.12,
    min_beats: int = 12,
) -> list[tuple[int, int, float]]:
    """Return list of (start_idx, end_idx_exclusive, avg_interval_s) for each stable-tempo run.

    Uses a wide rolling window and requires a minimum run length before committing to a new segment,
    so that transient aubio fluctuations don't create spurious BPM change points.
    """
    if not intervals:
        return []
    smoothed = rolling_avg(intervals, window=16)
    segments = []
    seg_start = 0
    baseline = smoothed[0]
    pending_start: int | None = None  # index where a potential new segment began

    for i in range(1, len(intervals)):
        change = abs(smoothed[i] - baseline) / baseline
        if change > threshold:
            if pending_start is None:
                pending_start = i
            elif i - pending_start >= min_beats:
                # Sustained change — commit the segment that ended at pending_start
                avg = statistics.mean(intervals[seg_start:pending_start])
                segments.append((seg_start, pending_start, avg))
                seg_start = pending_start
                baseline = statistics.mean(smoothed[pending_start:i])
                pending_start = None
        else:
            pending_start = None  # tempo stabilised, reset

    avg = statistics.mean(intervals[seg_start:])
    segments.append((seg_start, len(intervals), avg))
    return _merge_similar(segments, tolerance=0.05)


def _merge_similar(
    segments: list[tuple[int, int, float]], tolerance: float = 0.05
) -> list[tuple[int, int, float]]:
    """Merge adjacent segments whose average intervals differ by less than tolerance."""
    if not segments:
        return segments
    merged = [segments[0]]
    for seg in segments[1:]:
        prev = merged[-1]
        if abs(seg[2] - prev[2]) / prev[2] < tolerance:
            # Extend previous segment, recompute avg as weighted mean
            n_prev = prev[1] - prev[0]
            n_cur = seg[1] - seg[0]
            new_avg = (prev[2] * n_prev + seg[2] * n_cur) / (n_prev + n_cur)
            merged[-1] = (prev[0], seg[1], new_avg)
        else:
            merged.append(seg)
    return merged


def build_game_beats(
    timestamps: list[float],
    segments: list[tuple[int, int, float]],
    ref_game_bpm: float,
    stop_threshold: float = 1.4,
) -> tuple[list[float], list[tuple[float, float]], list[tuple[float, float]]]:
    """
    Convert aubio timestamps to game-beat coordinates using a variable BPM map.

    Returns:
        game_beats  — game-beat position of each aubio timestamp
        bpms        — [(game_beat_start, game_bpm), ...] for chart.ts BPMS export
        stops       — [(game_beat, pause_seconds), ...] for chart.ts STOPS export
    """
    if not segments or not timestamps:
        return [], [], []

    first_musical_bpm = 60.0 / segments[0][2]
    ratio = ref_game_bpm / first_musical_bpm  # game beats per musical beat (constant across sections)

    # game BPM for each segment keeps the same ratio to musical BPM
    seg_game_bpms = [(60.0 / avg_int) * ratio for _, _, avg_int in segments]

    bpms: list[tuple[float, float]] = []
    stops: list[tuple[float, float]] = []
    game_beats: list[float] = [0.0] * len(timestamps)

    # First beat: project backwards from beat 0 using first segment's BPM
    game_beats[0] = timestamps[0] * (seg_game_bpms[0] / 60.0)

    current_gb = game_beats[0]
    seg_idx = 0
    bpms.append((0.0, round(seg_game_bpms[0], 1)))  # BPM applies from beat 0 (start of playback)

    for i in range(len(timestamps) - 1):
        # Advance segment pointer when we cross a segment boundary
        while seg_idx + 1 < len(segments) and i >= segments[seg_idx][1]:
            seg_idx += 1
            bpms.append((round(current_gb, 1), round(seg_game_bpms[seg_idx], 1)))

        gbpm = seg_game_bpms[seg_idx]
        avg_int = segments[seg_idx][2]
        dt = timestamps[i + 1] - timestamps[i]

        if dt > avg_int * stop_threshold:
            # Gap is a pause: advance by the expected interval, then log a stop
            expected_advance = avg_int * gbpm / 60.0
            current_gb += expected_advance
            stop_dur = dt - avg_int
            stops.append((round(current_gb, 2), round(stop_dur, 3)))
            # The next beat resumes from current_gb (no extra advance for pause time)
        else:
            current_gb += dt * gbpm / 60.0

        game_beats[i + 1] = current_gb

    return game_beats, bpms, stops


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze MP3 → chart authoring data")
    parser.add_argument("mp3", help="Path to MP3 file")
    parser.add_argument("--detail", type=int, default=120, help="Number of beats to show in detail table (default: 120)")
    args = parser.parse_args()

    timestamps = get_beats(args.mp3)
    intervals = [timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)]
    first_musical_bpm = 60.0 / statistics.mean(intervals[:min(32, len(intervals))])

    # Use the actual musical BPM so 1 game beat = 1 musical beat (ratio = 1.0).
    ref_bpm = first_musical_bpm

    print(f"Analyzing {args.mp3}")
    print(f"Detected {len(timestamps)} musical beats  ({timestamps[0]:.2f}s – {timestamps[-1]:.2f}s)")
    print(f"First-section BPM: {first_musical_bpm:.1f}")
    print()

    segments = segment_by_tempo(intervals)
    game_beats_raw, bpms_raw, stops_raw = build_game_beats(timestamps, segments, ref_bpm)

    # Apply offset: beat 0 = first detected downbeat (timestamps[0]).
    # Subtract offset_beats = timestamps[0] * (ref_bpm / 60) from all beat positions.
    offset = timestamps[0]
    offset_beats = offset * (ref_bpm / 60.0)

    game_beats = [gb - offset_beats for gb in game_beats_raw]
    bpms = [(0.0, bpms_raw[0][1])] + [(round(b - offset_beats, 1), p) for b, p in bpms_raw[1:]]
    stops = [(round(b - offset_beats, 1), d) for b, d in stops_raw]

    ratio = 1.0  # kept for display purposes only

    # ── OFFSET + BPMS + STOPS ─────────────────────────────────────────────────
    print("=" * 60)
    print("OFFSET, BPMS, STOPS  (paste into chart.ts)")
    print("=" * 60)
    print(f"export const OFFSET = {offset:.6f};")
    print()
    print("export const BPMS: BPMMap = [")
    for k, (beat, bpm) in enumerate(bpms):
        t_approx = timestamps[segments[k][0]] if k < len(segments) else timestamps[-1]
        print(f"    [{beat:.1f}, {bpm:.1f}],  // ~{t_approx:.1f}s")
    print("];")
    print()
    if stops:
        print("export const STOPS: StopMap = [")
        for beat, dur in stops:
            print(f"    [{beat:.1f}, {dur:.3f}],")
        print("];")
    else:
        print("export const STOPS: StopMap = [];")
    print()

    # ── Primary beats ──────────────────────────────────────────────────────────
    print("=" * 60)
    print("Primary beats  (use as t(beat, dir, btn) coordinates)")
    print("=" * 60)

    def show_beats(label: str, indices: list[int]) -> None:
        vals = [f"{game_beats[i]:.1f}" for i in indices if i < len(game_beats)]
        row = "  ".join(vals)
        # Wrap at ~100 chars
        words = row.split("  ")
        line = ""
        lines_out = []
        for w in words:
            if len(line) + len(w) + 2 > 96:
                lines_out.append(line)
                line = w
            else:
                line = (line + "  " + w).lstrip()
        if line:
            lines_out.append(line)
        print(f"\n-- {label} --")
        for ln in lines_out:
            print("  " + ln)

    show_beats("Sparse  (every 2 musical beats)", list(range(0, len(timestamps), 2)))
    show_beats("Medium  (every musical beat)",    list(range(0, len(timestamps), 1)))

    # Dense: interpolate midpoints between consecutive aubio beats
    dense_gbs = []
    for i in range(len(game_beats) - 1):
        dense_gbs.append(game_beats[i])
        dense_gbs.append((game_beats[i] + game_beats[i + 1]) / 2)
    dense_gbs.append(game_beats[-1])
    dense_vals = [f"{gb:.1f}" for gb in dense_gbs]
    row = "  ".join(dense_vals)
    words = row.split("  ")
    line = ""
    lines_out = []
    for w in words:
        if len(line) + len(w) + 2 > 96:
            lines_out.append(line)
            line = w
        else:
            line = (line + "  " + w).lstrip()
    if line:
        lines_out.append(line)
    print("\n-- Dense (interpolated half musical beats ≈ 8th notes) --")
    for ln in lines_out:
        print("  " + ln)

    # ── Detail table ──────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print(f"Beat detail  (first {args.detail} musical beats)")
    print("=" * 60)
    print(f"{'#':>4}  {'t(s)':>8}  {'game_beat':>10}  {'interval':>9}")
    for i, (t, gb) in enumerate(zip(timestamps[:args.detail], game_beats[:args.detail])):
        ivl = f"{intervals[i]:.3f}s" if i < len(intervals) else "—"
        print(f"{i:>4}  {t:>8.3f}  {gb:>10.2f}  {ivl:>9}")

    last_beat = game_beats[-1]
    song_length = round(last_beat) + 8
    print(f"Song end: beat {last_beat:.1f}  (={timestamps[-1]:.1f}s)  →  SONG_LENGTH_BEATS: {song_length}")


if __name__ == "__main__":
    main()
