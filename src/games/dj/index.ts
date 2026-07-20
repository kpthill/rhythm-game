// DJ — turntable scratch rhythm game (v2, vertical two-lane rework).
//
// Notes fall top-to-bottom toward a shared hit line. Left lane = player 1's
// spinner + A/B; right lane = player 2's spinner + A/B. One player straddles
// both lanes — this is the normal way the game plays, not an expert mode.
// Five verbs: tap, hold, double (A+B), scratch (spinner pulse, direction
// matters), spin (sustained spinner turning). See docs/specs/dj.md.
//
// States: SONG_SELECT → CHART_SELECT → PLAYING → RESULT
// (A replays, B steps back; songs live in ./songs/<id>/, see songs/types.ts).

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { AudioManager } from "../../platform/audio";
import { secondsToBeat, beatToSeconds } from "../../platform/timing";
import { SONGS } from "./songs/registry";
import type { SongDef, ChartDef } from "./songs/types";
import { chartStats } from "./chartstats";
import { sampleP2, resetP2Input, type LaneInput } from "./input2p";
import { newGestureState, resetGestureState, sampleGesture, type GestureState, type GestureResult } from "./gesture";
import { stepSustain, type SustainEvent } from "./sustain";
import { newRecording, recordFrame, finishRecording, truncateRecording, type Recording, type RecordingResult } from "./recorder";
import { newRunStats, accuracy, gradeRun, loadBest, saveBest, type RunStats, type BestScore, type GradeLabel } from "./score";
import type { Lane, NoteEvent, ActiveNote, ScratchDir, RGB } from "./notes";
import {
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS, PERFECT_FRACTION, SUSTAIN_GRACE_BEATS,
    NOTE_TOP, HIT_Y, noteY, clampedNoteY,
    LANE_W, laneOriginX, laneCenterX, colAX, colBX,
    NOTE_W, NOTE_H, SCRATCH_R, SCRATCH_BAR_H, HOLD_TAIL_W,
    COLOR_A, COLOR_B, COLOR_SCRATCH_CW, COLOR_SCRATCH_CCW, COLOR_SPIN,
    lerpColor,
} from "./notes";

// ── Constants ────────────────────────────────────────────────────────────────

const W = 336;
const H = 262;

// Scoring
const POINTS_PERFECT = 300;
const POINTS_GOOD    = 100;
const STRAY_PENALTY  = 200;   // unnecessary input: hurts score, never life

// DDR-like life: start at half, misses hurt, strings of good hits earn it back.
const LIFE_START      = 0.5;
const LIFE_MISS       = 0.08;
const LIFE_REGAIN     = 0.015; // per hit, once a streak is going
const REGAIN_MIN_COMBO = 4;    // hits needed before a streak starts regaining life

// Song select
const PREVIEW_DELAY_MS = 500;  // linger on a song this long before its preview plays

// Platter geometry (two platters, one per lane)
const PLATTER_CY = 226;
const PLATTER_R  = 19;

// Volume control (P2 up/down — free, the charts only use P2 left/right/A/B)
const VOLUME_PER_SEC      = 0.7;  // full range in ~1.4s of holding
const VOLUME_INDICATOR_MS = 900;  // how long the indicator lingers after a change

// ── State ────────────────────────────────────────────────────────────────────

type GameState = "SONG_SELECT" | "CHART_SELECT" | "PLAYING" | "RESULT" | "RECORDING" | "REC_DONE";

interface Judgment { text: string; frame: number; }

/** A brief flash on the hit line where a note was judged. */
interface HitFlash {
    x: number;
    w: number;
    frame: number;
    kind: "perfect" | "good" | "miss";
    color: RGB;
}

interface LaneState {
    lane: Lane;
    activeNotes: ActiveNote[];
    chartIndex: number;
    gesture: GestureState;
    platterAngle: number;
    platterSpeed: number;
    /** Platter rim flashes briefly after a correct spinner hit. */
    platterFlashFrame: number;
    prevBothHeld: boolean;
    /** 0..1 — ramps up while a spin note is actively sustaining; tints the whole stream. */
    tint: number;
    lastGesture: GestureResult | null;
    judgments: Judgment[];
    hitFlashes: HitFlash[];
}

let ctx: GameContext;
let p: p5;

// DJ owns its audio (multiple songs), separate from the collection's shared
// AudioManager so the mothballed prototypes keep their preloaded track.
let djAudio: AudioManager;

// Song/chart selection
let songSel  = 0;
let chartSel = 0;
let selectedSong: SongDef | null = null;
let selectedChart: ChartDef | null = null;
let laneEvents: Record<Lane, NoteEvent[]> = { left: [], right: [] };
let navLatch = false;

// Preview playback (song select)
let previewToken = 0;
let previewReady = false;
let previewStartMs = 0;

let state: GameState = "SONG_SELECT";
let score  = 0;
let combo  = 0;
let life   = LIFE_START;
let failed = false;

// Run stats + over-the-song trace for the results screen
let stats: RunStats = newRunStats();
let runTrace: { life: number; acc: number }[] = [];
let lastTraceBeat = -Infinity;
let finalGrade: GradeLabel = "D";
let newBest = false;
let bestScore: BestScore | null = null;

let leftState: LaneState;
let rightState: LaneState;

let volumeShownAtMs = -Infinity;

// Count-in bookkeeping (metronome ticks on beats -4..-1 before the first notes)
let prevPlayWholeBeat = 999;

// Chart recorder (dev-only; see recorder.ts)
let recording: Recording | null = null;
let recResult: RecordingResult | null = null;
let recClipboardOk = false;
let recSavedName: string | null = null;
let recPrevWholeBeat = -1;
let recKeyHandler: ((e: KeyboardEvent) => void) | null = null;

// Practice tools (dev keyboard): rewind + section loop. Using either marks the
// run as practice — no best-score records.
let practiceMode = false;
let loopStartBeat: number | null = null;
let loopEndBeat: number | null = null;

// Saved takes offered as extra charts on the chart-select screen (dev only)
let devTakes: ChartDef[] = [];
let devTakesFor = "";

function newLaneState(lane: Lane): LaneState {
    return {
        lane,
        activeNotes: [],
        chartIndex: 0,
        gesture: newGestureState(),
        platterAngle: 0,
        platterSpeed: 0,
        platterFlashFrame: -Infinity,
        prevBothHeld: false,
        tint: 0,
        lastGesture: null,
        judgments: [],
        hitFlashes: [],
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pushJudgment(ls: LaneState, text: string): void {
    ls.judgments.push({ text, frame: p.frameCount });
}

/** The horizontal region a note occupies at the hit line, plus its base color. */
function noteRegion(ls: LaneState, ev: NoteEvent): { x: number; w: number; color: RGB } {
    const x0 = laneOriginX(ls.lane);
    switch (ev.kind) {
        case "tap":
        case "hold": {
            const cx = ev.button === "B" ? colBX(ls.lane) : colAX(ls.lane);
            return { x: cx - NOTE_W / 2 - 3, w: NOTE_W + 6, color: ev.button === "B" ? COLOR_B : COLOR_A };
        }
        case "double": {
            const left  = colAX(ls.lane) - NOTE_W / 2 - 3;
            const right = colBX(ls.lane) + NOTE_W / 2 + 3;
            return { x: left, w: right - left, color: [235, 235, 255] };
        }
        case "scratch":
            return { x: x0 + 2, w: LANE_W - 4, color: ev.scratch === "CCW" ? COLOR_SCRATCH_CCW : COLOR_SCRATCH_CW };
        case "spin":
            return { x: x0 + 2, w: LANE_W - 4, color: COLOR_SPIN };
    }
}

/** Flash the judged note's region of the hit line (gold for PERFECT, note color for GOOD, red for MISS). */
function pushHitFlash(ls: LaneState, ev: NoteEvent, kind: HitFlash["kind"]): void {
    const { x, w, color } = noteRegion(ls, ev);
    ls.hitFlashes.push({ x, w, frame: p.frameCount, kind, color });
    if ((ev.kind === "scratch" || ev.kind === "spin") && kind !== "miss") {
        ls.platterFlashFrame = p.frameCount;
    }
}

function registerHit(ls: LaneState, perfect: boolean): void {
    combo++;
    score += (perfect ? POINTS_PERFECT : POINTS_GOOD) * combo;
    if (perfect) stats.perfect++; else stats.good++;
    stats.maxCombo = Math.max(stats.maxCombo, combo);
    // Life comes back through strings of good hits, not one-off pokes.
    if (combo >= REGAIN_MIN_COMBO) life = Math.min(1, life + LIFE_REGAIN);
    pushJudgment(ls, perfect ? "PERFECT" : "GOOD");
}

function registerMiss(ls: LaneState): void {
    combo = 0;
    stats.missed++;
    life = Math.max(0, life - LIFE_MISS);
    pushJudgment(ls, "MISS");
}

/** Unnecessary input: costs score (never life), noted dimly. */
function registerStray(ls: LaneState): void {
    stats.stray++;
    score = Math.max(0, score - STRAY_PENALTY);
    pushJudgment(ls, "STRAY");
}

/** Current beat of the selected song, from DJ's own audio clock. */
function songBeatNow(): number {
    if (!selectedSong) return 0;
    return secondsToBeat(djAudio.currentSeconds, selectedSong.offset, selectedSong.bpms, selectedSong.stops);
}

/** Best-score key for the current song+chart. */
function chartKey(): string {
    return `${selectedSong?.id ?? "?"}.${selectedChart?.id ?? "?"}`;
}

function resetGame(): void {
    if (!selectedSong || !selectedChart) { state = "SONG_SELECT"; return; }
    laneEvents = {
        left:  selectedChart.events.filter(e => e.lane === "left"),
        right: selectedChart.events.filter(e => e.lane === "right"),
    };
    leftState  = newLaneState("left");
    rightState = newLaneState("right");
    resetP2Input();
    score   = 0;
    combo   = 0;
    life    = LIFE_START;
    failed  = false;
    stats   = newRunStats();
    runTrace = [];
    lastTraceBeat = -Infinity;
    newBest = false;
    practiceMode = false;
    loopStartBeat = null;
    loopEndBeat = null;
    state   = "PLAYING";
    prevPlayWholeBeat = 999;
    djAudio.stop();
    void djAudio.play(0);
}

/** Jump playback to `seconds` and rebuild lane state there (practice tool). */
function seekTo(seconds: number): void {
    if (!selectedSong) return;
    const target = Math.max(0, seconds);
    djAudio.stop();
    void djAudio.play(target);
    const beat = secondsToBeat(target, selectedSong.offset, selectedSong.bpms, selectedSong.stops);
    prevPlayWholeBeat = Math.floor(beat);
    for (const ls of [leftState, rightState]) {
        ls.activeNotes = [];
        ls.judgments = [];
        ls.hitFlashes = [];
        ls.prevBothHeld = false;
        ls.tint = 0;
        resetGestureState(ls.gesture);
        const events = laneEvents[ls.lane];
        let i = 0;
        while (i < events.length && events[i].beat < beat) i++;
        ls.chartIndex = i;
    }
}

/** Fetch saved takes for the chart-select screen (dev server endpoint). */
function refreshTakes(song: SongDef): void {
    devTakes = [];
    devTakesFor = song.id;
    if (!import.meta.env.DEV) return;
    void fetch(`/__dj/takes?song=${song.id}`)
        .then(r => r.json())
        .then(async (data: { takes?: Array<{ name: string }> }) => {
            if (devTakesFor !== song.id) return;
            const takes: ChartDef[] = [];
            for (const t of (data.takes ?? []).slice(0, 8)) {
                const take = await (await fetch(`/__dj/takes/${song.id}/${t.name}`)).json();
                if (Array.isArray(take.events)) {
                    takes.push({
                        id: `take:${t.name}`,
                        name: t.name.replace(/^take-/, "◦ ").replace(/\.json$/, ""),
                        events: take.events as NoteEvent[],
                    });
                }
            }
            if (devTakesFor === song.id) devTakes = takes;
        })
        .catch(() => { /* dev server without the endpoint — picker just stays empty */ });
}

function laneInputFromP1(input: InputSnapshot): LaneInput {
    return {
        direction: input.direction,
        aHeld: input.aHeld,
        bHeld: input.bHeld,
        aPressed: input.aPressed,
        bPressed: input.bPressed,
        spinnerConnected: input.spinnerConnected,
        spinnerDelta: input.spinnerDelta,
    };
}

// ── Game logic ───────────────────────────────────────────────────────────────

function spawnNotes(ls: LaneState, currentBeat: number): void {
    const events = laneEvents[ls.lane];
    while (ls.chartIndex < events.length) {
        const ev = events[ls.chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            ls.activeNotes.push({ event: ev, result: "pending" });
            ls.chartIndex++;
        } else break;
    }
}

function applyHit(ls: LaneState, note: ActiveNote, beatDiff: number): void {
    const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * PERFECT_FRACTION;
    note.result = "hit";
    registerHit(ls, perfect);
    pushHitFlash(ls, note.event, perfect ? "perfect" : "good");
}

function applyMiss(ls: LaneState, note: ActiveNote): void {
    note.result = "missed";
    registerMiss(ls);
    pushHitFlash(ls, note.event, "miss");
}

/** Apply a sustain state-machine transition to the lane's scoring. */
function applySustainEvent(ls: LaneState, note: ActiveNote, event: SustainEvent): void {
    switch (event) {
        case "completed": {
            note.result = "hit";
            const perfect = note.entryGrade === "PERFECT";
            registerHit(ls, perfect);
            pushHitFlash(ls, note.event, perfect ? "perfect" : "good");
            break;
        }
        case "entered":
            // Entering a sustain is a correct input — light the line right away.
            pushHitFlash(ls, note.event, note.entryGrade === "PERFECT" ? "perfect" : "good");
            break;
        case "failed":
            note.result = "missed";
            registerMiss(ls);
            pushHitFlash(ls, note.event, "miss");
            break;
        default:
            break; // lapsed / recovered: reflected on the note itself, not scored
    }
}

/** Brief synthesized scratch blip — no audio asset needed, built on DJ's AudioContext. */
function triggerScratchFX(dir: ScratchDir): void {
    const audioCtx = djAudio.context;
    const now = audioCtx.currentTime;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    const startFreq = dir === "CW" ? 480 : 360;
    const endFreq   = dir === "CW" ? 130 : 620;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.09);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(djAudio.output);
    osc.start(now);
    osc.stop(now + 0.12);
}

function evaluateLane(ls: LaneState, currentBeat: number, laneInput: LaneInput, nowMs: number): void {
    const gr = sampleGesture(ls.gesture, laneInput, nowMs, currentBeat, SUSTAIN_GRACE_BEATS);
    ls.lastGesture = gr;

    const bothHeldNow = laneInput.aHeld && laneInput.bHeld;
    const doubleEdge = bothHeldNow && !ls.prevBothHeld;
    ls.prevBothHeld = bothHeldNow;

    let spinActive = false;

    for (const note of ls.activeNotes) {
        const ev = note.event;
        if (note.result !== "pending") continue;
        const beatDiff = currentBeat - ev.beat;

        switch (ev.kind) {
            case "tap": {
                const pressed = ev.button === "B" ? laneInput.bPressed : laneInput.aPressed;
                if (pressed && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) applyHit(ls, note, beatDiff);
                else if (beatDiff > HIT_WINDOW_BEATS) applyMiss(ls, note);
                break;
            }
            case "double": {
                if (doubleEdge && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) applyHit(ls, note, beatDiff);
                else if (beatDiff > HIT_WINDOW_BEATS) applyMiss(ls, note);
                break;
            }
            case "scratch": {
                const dir = ev.scratch ?? "CW";
                const triggered = dir === "CW" ? gr.scratchCW : gr.scratchCCW;
                if (triggered && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                    applyHit(ls, note, beatDiff);
                    triggerScratchFX(dir);
                } else if (beatDiff > HIT_WINDOW_BEATS) applyMiss(ls, note);
                break;
            }
            case "hold": {
                const engaged = ev.button === "B" ? laneInput.bHeld : laneInput.aHeld;
                applySustainEvent(ls, note, stepSustain(note, currentBeat, beatDiff, engaged, engaged));
                break;
            }
            case "spin": {
                // Onset (and recovery from a lapse) is a timed input — a fresh
                // acceleration pulse; staying engaged only needs the low-bar
                // activity detector.
                applySustainEvent(ls, note, stepSustain(note, currentBeat, beatDiff, gr.spinPulse, gr.spinning));
                break;
            }
        }

        if (ev.kind === "spin" && note.sustain === "active") spinActive = true;
    }

    // ── Stray inputs (score-only penalty) ───────────────────────────────────
    // A press or scratch pulse with no matching note anywhere in reach.
    // Ignored before beat 0 (players fiddle during the count-in).
    if (currentBeat >= 0) {
        const reachable = (n: ActiveNote): boolean => {
            const end = n.event.beat + (n.event.durationBeats ?? 0);
            return currentBeat >= n.event.beat - HIT_WINDOW_BEATS && currentBeat <= end + HIT_WINDOW_BEATS;
        };
        const buttonTarget = (button: "A" | "B"): boolean =>
            ls.activeNotes.some(n => n.result === "pending" && reachable(n) && (
                n.event.kind === "double" ||
                ((n.event.kind === "tap" || n.event.kind === "hold") && n.event.button === button)
            ));
        const spinnerTarget = (dir: ScratchDir): boolean =>
            ls.activeNotes.some(n => n.result === "pending" && reachable(n) && (
                n.event.kind === "spin" ||
                (n.event.kind === "scratch" && (n.event.scratch ?? "CW") === dir)
            ));

        if (laneInput.aPressed && !buttonTarget("A")) registerStray(ls);
        if (laneInput.bPressed && !buttonTarget("B")) registerStray(ls);
        if (gr.scratchCW && !spinnerTarget("CW"))   registerStray(ls);
        if (gr.scratchCCW && !spinnerTarget("CCW")) registerStray(ls);
    }

    // Lane coloring: ramp the whole stream's tint toward COLOR_SPIN while a spin note sustains.
    const tintTarget = spinActive ? 1 : 0;
    ls.tint += (tintTarget - ls.tint) * 0.15;

    // Platter momentum: smoothly chase the gesture drive so it visibly slows down, not snaps to 0.
    const drive = gr.visualDelta * 0.02;
    ls.platterSpeed += (drive - ls.platterSpeed) * 0.25;
    ls.platterAngle += ls.platterSpeed;

    // Cull stale notes.
    ls.activeNotes = ls.activeNotes.filter(n => {
        const endBeat = n.event.beat + (n.event.durationBeats ?? 0);
        return currentBeat - endBeat < 1.5;
    });
}

// ── Rendering ────────────────────────────────────────────────────────────────

function drawBackground(): void {
    p.background(10, 8, 20);
    p.stroke(28, 24, 46);
    p.strokeWeight(0.5);
    for (let x = 0; x < W; x += 24) p.line(x, 0, x, H);
    for (let y = 0; y < H; y += 24) p.line(0, y, W, y);

    // Center divider between the two lanes
    p.stroke(50, 42, 80);
    p.strokeWeight(1);
    p.line(W / 2, NOTE_TOP - 8, W / 2, HIT_Y + 6);
}

function tintedColor(base: RGB, tint: number): RGB {
    return lerpColor(base, COLOR_SPIN, tint * 0.6);
}

function drawLanePanel(ls: LaneState, currentBeat: number): void {
    const x0 = laneOriginX(ls.lane);
    const bg = lerpColor([18, 14, 32], [46, 20, 58], ls.tint);

    p.noStroke();
    p.fill(bg[0], bg[1], bg[2]);
    p.rect(x0, NOTE_TOP - 6, LANE_W, HIT_Y - NOTE_TOP + 12, 3);

    p.stroke(40, 35, 65);
    p.strokeWeight(0.5);
    const startBeat = Math.floor(currentBeat);
    for (let b = startBeat; b <= currentBeat + LOOKAHEAD_BEATS + 1; b++) {
        const y = noteY(b, currentBeat);
        if (y >= NOTE_TOP - 2 && y <= HIT_Y) p.line(x0, y, x0 + LANE_W, y);
    }

    const hit = lerpColor([160, 130, 240], COLOR_SPIN, ls.tint);
    p.stroke(hit[0], hit[1], hit[2]);
    p.strokeWeight(2);
    p.line(x0 - 2, HIT_Y, x0 + LANE_W + 2, HIT_Y);
    p.noFill();
    p.stroke(hit[0], hit[1], hit[2], 40);
    p.strokeWeight(7);
    p.line(x0 - 2, HIT_Y, x0 + LANE_W + 2, HIT_Y);
}

/** A small direction chevron (▶ / ◀) used to decorate scratch bars. */
function drawChevron(cx: number, cy: number, sign: 1 | -1, s = 3.5): void {
    p.triangle(cx - sign * s, cy - s, cx - sign * s, cy + s, cx + sign * s, cy);
}

function drawTapNote(ev: NoteEvent, currentBeat: number, aX: number, bX: number, tint: number): void {
    const y = clampedNoteY(ev.beat, currentBeat);
    if (y < NOTE_TOP - NOTE_H || y > HIT_Y + NOTE_H) return;
    const x = ev.button === "B" ? bX : aX;
    const [r, g, b] = tintedColor(ev.button === "B" ? COLOR_B : COLOR_A, tint);
    p.fill(r, g, b);
    p.stroke(255, 255, 255, 160);
    p.strokeWeight(1.5);
    p.rect(x - NOTE_W / 2, y - NOTE_H / 2, NOTE_W, NOTE_H, 4);
    p.noStroke();
    p.fill(10, 8, 20);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(7);
    p.text(ev.button ?? "A", x, y);
}

function drawHoldNote(ev: NoteEvent, note: ActiveNote, currentBeat: number, aX: number, bX: number, tint: number): void {
    const duration = ev.durationBeats ?? 0;
    const headY = clampedNoteY(ev.beat, currentBeat);
    const tailY = clampedNoteY(ev.beat + duration, currentBeat);
    if (tailY > HIT_Y + NOTE_H && headY > HIT_Y + NOTE_H) return;
    const x = ev.button === "B" ? bX : aX;
    const [r, g, b] = tintedColor(ev.button === "B" ? COLOR_B : COLOR_A, tint);
    const active = note.sustain === "active";
    const lapsed = note.sustain === "lapsed";
    const blink  = Math.floor(p.frameCount / 4) % 2 === 0;

    // Approaching holds stay BRIGHT (cabinet colors are dimmer than dev
    // screens; a pale approach washes out). State is signalled by the
    // boundary instead: white while approaching, gold while held.
    p.noStroke();
    if (lapsed) p.fill(235, 60, 60, blink ? 220 : 90);   // dropped: flash red, re-press to recover
    else        p.fill(r, g, b, active ? 235 : 200);
    p.rect(x - HOLD_TAIL_W / 2, tailY, HOLD_TAIL_W, Math.max(0, headY - tailY), 3);

    if (lapsed) p.fill(235, 60, 60);
    else        p.fill(r, g, b);
    if (active)      p.stroke(255, 215, 90);            // held: gold boundary
    else if (lapsed) p.stroke(255, 255, 255, blink ? 230 : 140);
    else             p.stroke(255, 255, 255, 210);      // approaching: white boundary
    p.strokeWeight(active ? 2.5 : 1.5);
    p.rect(x - NOTE_W / 2, headY - NOTE_H / 2, NOTE_W, NOTE_H, 4);
    p.noStroke();
    p.fill(10, 8, 20);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(7);
    p.text(ev.button ?? "A", x, headY);
}

function drawDoubleNote(ev: NoteEvent, currentBeat: number, aX: number, bX: number, tint: number): void {
    const y = clampedNoteY(ev.beat, currentBeat);
    if (y < NOTE_TOP - NOTE_H || y > HIT_Y + NOTE_H) return;
    const left  = aX - NOTE_W / 2;
    const right = bX + NOTE_W / 2;
    const midX  = (left + right) / 2;
    const [ra, ga, ba] = tintedColor(COLOR_A, tint);
    const [rb, gb, bb] = tintedColor(COLOR_B, tint);

    p.noStroke();
    p.fill(ra, ga, ba);
    p.rect(left, y - NOTE_H / 2, midX - left, NOTE_H, 4, 0, 0, 4);
    p.fill(rb, gb, bb);
    p.rect(midX, y - NOTE_H / 2, right - midX, NOTE_H, 0, 4, 4, 0);

    p.noFill();
    p.stroke(255, 255, 255, 180);
    p.strokeWeight(1.5);
    p.rect(left, y - NOTE_H / 2, right - left, NOTE_H, 4);

    p.noStroke();
    p.fill(10, 8, 20);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(6.5);
    p.text("A+B", midX, y);
}

/** Scratch: a full-lane-width bar under the button notes — scratches can
 *  coincide with taps/holds (other hand). Direction = color + chevrons:
 *  CW/right = green ▶▶▶, CCW/left = yellow ◀◀◀. */
function drawScratchBar(ev: NoteEvent, currentBeat: number, x0: number): void {
    const y = clampedNoteY(ev.beat, currentBeat);
    if (y < NOTE_TOP - SCRATCH_BAR_H || y > HIT_Y + SCRATCH_BAR_H) return;
    const dir = ev.scratch ?? "CW";
    const [r, g, b] = dir === "CW" ? COLOR_SCRATCH_CW : COLOR_SCRATCH_CCW;

    p.fill(r, g, b, 210);
    p.stroke(255, 255, 255, 110);
    p.strokeWeight(1);
    p.rect(x0 + 2, y - SCRATCH_BAR_H / 2, LANE_W - 4, SCRATCH_BAR_H, 3);

    p.noStroke();
    p.fill(10, 8, 20);
    const sign = dir === "CW" ? 1 : -1;
    for (let i = 1; i <= 4; i++) {
        drawChevron(x0 + (LANE_W * i) / 5, y, sign);
    }
}

/** Spin: lights up the whole track for its duration — a translucent full-width
 *  region with edge rails, a strongly decorated onset bar, and a spoked badge
 *  that slows as the spin approaches a stall. */
function drawSpinNote(ev: NoteEvent, note: ActiveNote, currentBeat: number, x0: number, cX: number, health: number): void {
    const duration = ev.durationBeats ?? 0;
    const headY = clampedNoteY(ev.beat, currentBeat);
    // The duration region extends upward from the head; keep it inside the fall area.
    const tailY = Math.max(clampedNoteY(ev.beat + duration, currentBeat), NOTE_TOP - 4);
    const active = note.sustain === "active";
    const lapsed = note.sustain === "lapsed";
    const warn = active && health < 0.5;
    const blink = Math.floor(p.frameCount / 4) % 2 === 0;
    const [sr, sg, sb] = COLOR_SPIN;

    // Full-track duration region
    p.noStroke();
    if (lapsed) p.fill(235, 60, 60, blink ? 110 : 50);   // stalled: flash red, fresh spin to recover
    else        p.fill(sr, sg, sb, active ? 80 : 45);
    p.rect(x0 + 1, tailY, LANE_W - 2, Math.max(0, headY - tailY), 3);

    // Edge rails make the continuation readable even at low alpha
    p.stroke(lapsed ? 235 : sr, lapsed ? 60 : sg, lapsed ? 60 : sb, active || lapsed ? 200 : 130);
    p.strokeWeight(1.5);
    p.line(x0 + 1, tailY, x0 + 1, headY);
    p.line(x0 + LANE_W - 1, tailY, x0 + LANE_W - 1, headY);

    // Strong onset bar at the head
    const headColor: RGB = lapsed || warn ? [230, 70, 70] : COLOR_SPIN;
    p.noStroke();
    p.fill(headColor[0], headColor[1], headColor[2], lapsed && !blink ? 150 : 235);
    p.rect(x0 + 1, headY - 3, LANE_W - 2, 6, 2);

    // Spoked badge at the center of the onset
    p.fill(headColor[0], headColor[1], headColor[2], lapsed && !blink ? 150 : 235);
    p.stroke(255, 255, 255, lapsed && blink ? 255 : 180);
    p.strokeWeight(lapsed ? 2.5 : 1.5);
    p.ellipse(cX, headY, SCRATCH_R * 2, SCRATCH_R * 2);

    if (lapsed) {
        // A stalled spin is an active question — demand a fresh spin.
        p.noStroke();
        p.fill(255, 255, 255, blink ? 255 : 180);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(7);
        p.text("SPIN!", cX, headY);
        return;
    }

    // Rotating spokes suggest "keep spinning"; they visibly slow as `health` drops.
    p.stroke(10, 8, 20);
    p.strokeWeight(1.5);
    const spinRate = active ? 0.5 + health * 3.5 : 4;
    const spokeAngle = (currentBeat * spinRate) % (Math.PI * 2);
    for (let i = 0; i < 3; i++) {
        const a = spokeAngle + i * ((Math.PI * 2) / 3);
        p.line(cX, headY, cX + Math.cos(a) * SCRATCH_R * 0.65, headY + Math.sin(a) * SCRATCH_R * 0.65);
    }
}

function drawNotes(ls: LaneState, currentBeat: number): void {
    const aX = colAX(ls.lane);
    const bX = colBX(ls.lane);
    const cX = laneCenterX(ls.lane);
    const x0 = laneOriginX(ls.lane);
    const health = ls.lastGesture?.spinHealth ?? 1;
    const pending = ls.activeNotes.filter(n => n.result === "pending");

    // Layered: spinner-hand notes span the full track and sit UNDER the
    // button notes — a scratch/spin can coincide with a tap/hold (other hand).
    for (const note of pending) {
        if (note.event.kind === "spin") drawSpinNote(note.event, note, currentBeat, x0, cX, health);
    }
    for (const note of pending) {
        if (note.event.kind === "scratch") drawScratchBar(note.event, currentBeat, x0);
    }
    for (const note of pending) {
        const ev = note.event;
        switch (ev.kind) {
            case "tap":    drawTapNote(ev, currentBeat, aX, bX, ls.tint); break;
            case "hold":   drawHoldNote(ev, note, currentBeat, aX, bX, ls.tint); break;
            case "double": drawDoubleNote(ev, currentBeat, aX, bX, ls.tint); break;
        }
    }
}

const FLASH_FRAMES = 18;

/** Judgment flashes on the hit line itself — eyes are on the line during play. */
function drawHitFlashes(ls: LaneState): void {
    ls.hitFlashes = ls.hitFlashes.filter(f => p.frameCount - f.frame < FLASH_FRAMES);
    for (const f of ls.hitFlashes) {
        const age = (p.frameCount - f.frame) / FLASH_FRAMES; // 0..1
        const fade = 1 - age;
        const grow = 8 + age * 16;

        let color: RGB;
        let peak: number;
        if (f.kind === "perfect")   { color = [255, 240, 140]; peak = 240; } // gold burst
        else if (f.kind === "good") { color = f.color;          peak = 190; }
        else                        { color = [235, 60, 60];    peak = 160; } // miss: red

        p.noStroke();
        p.fill(color[0], color[1], color[2], peak * fade * 0.45);
        p.rect(f.x, HIT_Y - grow / 2, f.w, grow, 3);
        p.fill(color[0], color[1], color[2], peak * fade);
        p.rect(f.x, HIT_Y - 2, f.w, 4, 2);
    }
}

function drawPlatter(ls: LaneState): void {
    const cx = laneCenterX(ls.lane);
    const cy = PLATTER_CY;
    const r  = PLATTER_R;

    p.noStroke();
    p.fill(5, 4, 12, 180);
    p.ellipse(cx + 2, cy + 2, r * 2 + 3, r * 2 + 3);

    // Rim: brightens briefly after a correct spinner hit (input feedback).
    const flashAge = p.frameCount - ls.platterFlashFrame;
    const flash = flashAge < 12 ? 1 - flashAge / 12 : 0;
    let rim = lerpColor([80, 70, 110], COLOR_SPIN, ls.tint);
    rim = lerpColor(rim, [255, 250, 200], flash);
    p.stroke(rim[0], rim[1], rim[2]);
    p.strokeWeight(2.5 + flash * 1.5);
    p.fill(18, 14, 30);
    p.ellipse(cx, cy, r * 2, r * 2);

    p.noFill();
    p.strokeWeight(0.5);
    for (let gr = 6; gr < r - 3; gr += 4) {
        const alpha = p.map(gr, 6, r - 3, 25, 70);
        p.stroke(70, 60, 100, alpha);
        p.ellipse(cx, cy, gr * 2, gr * 2);
    }

    const lx = cx + Math.cos(ls.platterAngle) * (r - 4);
    const ly = cy + Math.sin(ls.platterAngle) * (r - 4);
    p.stroke(150, 120, 210, 200);
    p.strokeWeight(1.5);
    p.line(cx, cy, lx, ly);

    p.noStroke();
    p.fill(200, 190, 220);
    p.ellipse(cx, cy, 3, 3);

}

/** Count-in numbers (4·3·2·1) over the beats before the song's downbeat. */
function drawCountIn(currentBeat: number): void {
    if (currentBeat < -4 || currentBeat >= 0) return;
    const count = -Math.floor(currentBeat);              // -4.0..-3.01 → 4, … -1.0..-0.01 → 1
    const phase = 1 - (currentBeat - Math.floor(currentBeat)); // 1 → 0 within the beat
    const alpha = 120 + 135 * phase;
    p.noStroke();
    p.fill(220, 210, 255, alpha);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(26 + 6 * phase);
    p.text(count.toString(), W / 2, 96);
}

/** Small VOL bar top-center, shown briefly while/after P2 up/down adjusts the volume. */
function drawVolumeIndicator(nowMs: number): void {
    const age = nowMs - volumeShownAtMs;
    if (age > VOLUME_INDICATOR_MS) return;
    const alpha = 230 * Math.min(1, 2 * (1 - age / VOLUME_INDICATOR_MS));

    const bw = 60;
    const bx = W / 2 - bw / 2;
    const by = 6;

    p.noStroke();
    p.fill(25, 20, 45, alpha);
    p.rect(bx - 22, by - 3, bw + 28, 11, 3);
    p.fill(160, 150, 200, alpha);
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(5.5);
    p.text("VOL", bx - 18, by + 2);
    p.fill(60, 55, 90, alpha);
    p.rect(bx, by, bw, 5, 2);
    p.fill(140, 210, 160, alpha);
    p.rect(bx, by, bw * djAudio.volume, 5, 2);
}

function drawJudgments(ls: LaneState): void {
    ls.judgments = ls.judgments.filter(j => p.frameCount - j.frame < 40);
    const cx = laneCenterX(ls.lane);
    for (const j of ls.judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 16, 40, 255, 0);
        const dy    = p.map(age, 0, 40, 0, -12);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(10);
        p.noStroke();
        if (j.text.startsWith("PERFECT"))  p.fill(255, 240, 80, alpha);
        else if (j.text === "GOOD")         p.fill(80, 220, 120, alpha);
        else if (j.text === "STRAY")        p.fill(150, 140, 170, alpha * 0.8);
        else                                p.fill(255, 80, 80, alpha);
        p.text(j.text, cx, NOTE_TOP + 10 + dy);
    }
}

function drawHUD(currentBeat: number): void {
    p.noStroke();
    p.fill(200, 195, 220);
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), W - 4, 2);

    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 2);
    }

    // Life bar spans both lanes
    const barX = laneOriginX("left");
    const barW = laneOriginX("right") + LANE_W - barX;
    const barY = PLATTER_CY + PLATTER_R + 6;
    p.fill(35, 28, 55);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5 ? p.color(80, 200, 120) : life > 0.25 ? p.color(230, 180, 40) : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);
    p.noStroke();
    p.fill(100, 90, 130);
    p.textAlign(p.LEFT, p.BASELINE);
    p.textSize(6);
    p.text("LIFE", barX, barY - 1);

    p.textAlign(p.RIGHT, p.BOTTOM);
    p.textSize(7);
    p.fill(80, 75, 110);
    p.text(`♪${Math.floor(currentBeat)}`, W - 4, H - 3);

    if (practiceMode || loopStartBeat !== null) {
        p.textAlign(p.LEFT, p.BOTTOM);
        p.textSize(6.5);
        p.fill(230, 180, 60);
        const loop = loopStartBeat !== null
            ? `  LOOP ♪${loopStartBeat}–${loopEndBeat ?? "…"}`
            : "";
        p.text(`PRACTICE${loop}`, 4, H - 3);
    }

    if (currentBeat < 5) {
        p.textAlign(p.CENTER, p.BOTTOM);
        p.textSize(6.5);
        p.fill(100, 90, 130, 200);
        p.text("A/B=tap  hold=sustain  A+B=double  SPIN/L-R=scratch,hold=spin", W / 2, H - 12);
    }

    drawJudgments(leftState);
    drawJudgments(rightState);
}

// ── Screens: SONG_SELECT / CHART_SELECT ──────────────────────────────────────

/** Latched up/down navigation shared by the select screens. Returns -1/0/+1. */
function navStep(input: InputSnapshot): number {
    const up = input.direction === "UP" || input.direction === "UP_LEFT" || input.direction === "UP_RIGHT";
    const dn = input.direction === "DOWN" || input.direction === "DOWN_LEFT" || input.direction === "DOWN_RIGHT";
    if (!up && !dn) { navLatch = false; return 0; }
    if (navLatch) return 0;
    navLatch = true;
    return up ? -1 : 1;
}

/** Kick off loading + (delayed) preview of the highlighted song. */
function cueSongPreview(song: SongDef): void {
    const token = ++previewToken;
    previewReady = false;
    previewStartMs = p.millis() + PREVIEW_DELAY_MS;
    djAudio.stop();
    void djAudio.load(song.audioFile).then(() => {
        if (previewToken === token) previewReady = true;
    });
}

function fmtLength(song: SongDef): string {
    const secs = Math.max(0, beatToSeconds(song.lengthBeats, song.offset, song.bpms, song.stops));
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtBpm(song: SongDef): string {
    const values = song.bpms.map(([, bpm]) => bpm);
    const lo = Math.round(Math.min(...values));
    const hi = Math.round(Math.max(...values));
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** Best score across a song's charts (for the song list). */
function songBest(song: SongDef): BestScore | null {
    let best: BestScore | null = null;
    for (const chart of song.charts) {
        const b = loadBest(`${song.id}.${chart.id}`);
        if (b && (!best || b.score > best.score)) best = b;
    }
    return best;
}

function drawSelectFrame(title: string, hint: string): void {
    drawBackground();
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(220, 210, 255);
    p.textSize(13);
    p.text(title, W / 2, 20);
    p.fill(90, 82, 118);
    p.textSize(7);
    p.text(hint, W / 2, H - 10);
}

function frameSongSelect(input: InputSnapshot): void {
    const n = SONGS.length;
    if (n === 0) {
        drawSelectFrame("SELECT SONG", "");
        p.fill(200, 100, 100);
        p.textSize(10);
        p.text("No songs found", W / 2, 120);
        return;
    }

    const step = navStep(input);
    if (step !== 0) {
        songSel = (songSel + step + n) % n;
        cueSongPreview(SONGS[songSel]);
    }
    const song = SONGS[songSel];

    // Delayed preview once the audio is decoded
    if (previewReady && !djAudio.playing && p.millis() >= previewStartMs) {
        void djAudio.play(song.previewSeconds ?? song.offset);
    }

    drawSelectFrame("SELECT SONG", "UP/DOWN — browse   ·   A / START — choose");

    // Song list (left column)
    p.textAlign(p.LEFT, p.CENTER);
    const listTop = 44;
    for (let i = 0; i < n; i++) {
        const y = listTop + i * 20;
        const sel = i === songSel;
        if (sel) {
            p.noStroke();
            p.fill(40, 30, 70);
            p.rect(8, y - 8, 172, 17, 3);
        }
        p.fill(sel ? 235 : 130, sel ? 220 : 122, sel ? 255 : 160);
        p.textSize(sel ? 9.5 : 8.5);
        p.text((sel ? "▶ " : "  ") + song0Title(SONGS[i]), 14, y);
    }

    // Info panel (right column)
    const ix = 192;
    p.noStroke();
    p.fill(20, 16, 36);
    p.rect(ix - 4, 40, W - ix - 6, 150, 4);
    p.textAlign(p.LEFT, p.TOP);
    p.fill(235, 225, 255);
    p.textSize(8.5);
    p.text(wrapText(song.title, 24), ix + 4, 48);
    p.fill(140, 130, 170);
    p.textSize(7);
    p.text(song.artist, ix + 4, 74);

    p.fill(170, 160, 200);
    p.textSize(7.5);
    p.text(`♪ ${fmtBpm(song)} BPM`, ix + 4, 94);
    p.text(`⏱ ${fmtLength(song)}`, ix + 4, 108);
    p.text(`${song.charts.length} chart${song.charts.length === 1 ? "" : "s"}`, ix + 4, 122);

    const best = songBest(song);
    if (best) {
        p.fill(255, 220, 90);
        p.text(`best ${best.score.toString().padStart(7, "0")} · ${best.grade}`, ix + 4, 140);
    }

    if (djAudio.playing) {
        p.fill(120, 200, 150);
        p.textSize(6.5);
        p.text("♫ preview", ix + 4, 172);
    }

    if (input.aPressed || input.startPressed) {
        chartSel = 0;
        navLatch = true; // don't carry a held direction into the next screen
        selectedSong = song; // the song is chosen; chart select refines it (R can record now)
        refreshTakes(song);
        state = "CHART_SELECT";
    }
}

/** First line of a song title, truncated for the list column. */
function song0Title(song: SongDef): string {
    return song.title.length > 26 ? song.title.slice(0, 25) + "…" : song.title;
}

/** Naive wrap: break a string into lines of at most `chars`. */
function wrapText(text: string, chars: number): string {
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
        if (cur && (cur + " " + w).length > chars) { lines.push(cur); cur = w; }
        else cur = cur ? cur + " " + w : w;
    }
    if (cur) lines.push(cur);
    return lines.join("\n");
}

function frameChartSelect(input: InputSnapshot): void {
    const song = SONGS[songSel];
    if (!song) { state = "SONG_SELECT"; return; }
    const options = [...song.charts, ...devTakes];
    const n = options.length;
    chartSel = Math.min(chartSel, n - 1);

    const step = navStep(input);
    if (step !== 0) chartSel = (chartSel + step + n) % n;
    const chart = options[chartSel];
    const cs = chartStats(chart.events, song.lengthBeats);

    // Preview keeps playing from song select; late-arriving decode still starts it.
    if (previewReady && !djAudio.playing && p.millis() >= previewStartMs) {
        void djAudio.play(song.previewSeconds ?? song.offset);
    }

    drawSelectFrame(song0Title(song), "UP/DOWN — chart   ·   A / START — play   ·   B — back");

    // Chart list
    p.textAlign(p.LEFT, p.CENTER);
    const listTop = 48;
    for (let i = 0; i < n; i++) {
        const y = listTop + i * 20;
        const sel = i === chartSel;
        const c = options[i];
        if (sel) {
            p.noStroke();
            p.fill(40, 30, 70);
            p.rect(8, y - 8, 164, 17, 3);
        }
        p.fill(sel ? 235 : 130, sel ? 220 : 122, sel ? 255 : 160);
        p.textSize(sel ? 9.5 : 8.5);
        p.text((sel ? "▶ " : "  ") + c.name, 14, y);
        p.textSize(7);
        p.fill(sel ? 170 : 100, sel ? 160 : 92, sel ? 200 : 128);
        p.textAlign(p.RIGHT, p.CENTER);
        p.text(`${c.events.length}♪`, 168, y);
        p.textAlign(p.LEFT, p.CENTER);
    }

    // Stats panel
    const ix = 186;
    p.noStroke();
    p.fill(20, 16, 36);
    p.rect(ix - 4, 40, W - ix - 6, 160, 4);
    p.textAlign(p.LEFT, p.TOP);
    p.fill(235, 225, 255);
    p.textSize(8.5);
    p.text(chart.name, ix + 4, 48);

    const rows: Array<[string, string]> = [
        ["notes",    `${cs.total}`],
        ["taps",     `${cs.byKind.tap}`],
        ["holds",    `${cs.byKind.hold}`],
        ["doubles",  `${cs.byKind.double}`],
        ["scratches", `${cs.byKind.scratch}`],
        ["spins",    `${cs.byKind.spin}`],
        ["density",  `${cs.density.toFixed(2)}/beat`],
        ["peak",     `${cs.peakDensity.toFixed(2)}/beat`],
    ];
    p.textSize(6.5);
    for (let i = 0; i < rows.length; i++) {
        const y = 64 + i * 11;
        p.fill(120, 110, 150);
        p.text(rows[i][0], ix + 4, y);
        p.fill(190, 180, 220);
        p.text(rows[i][1], ix + 62, y);
    }

    const best = loadBest(`${song.id}.${chart.id}`);
    if (best) {
        p.fill(255, 220, 90);
        p.textSize(7);
        p.text(`best ${best.score.toString().padStart(7, "0")} · ${best.grade}`, ix + 4, 158);
    }

    if (input.bPressed) {
        navLatch = true;
        state = "SONG_SELECT";
        return;
    }
    if (input.aPressed || input.startPressed) {
        selectedSong = song;
        selectedChart = chart;
        navLatch = true;
        resetGame();
    }
}

// ── Screen: PLAYING ──────────────────────────────────────────────────────────

function framePlaying(input: InputSnapshot): void {
    const cb = songBeatNow();
    const nowMs = p.millis();

    const p1Lane = laneInputFromP1(input);
    const p2Lane = sampleP2();

    // P2 up/down is free (the charts only use P2 left/right/A/B), so it doubles
    // as a live volume control.
    if (p2Lane.direction === "UP" || p2Lane.direction === "DOWN") {
        const dv = (p2Lane.direction === "UP" ? 1 : -1) * VOLUME_PER_SEC * (p.deltaTime / 1000);
        djAudio.volume += dv;
        ctx.audio.volume = djAudio.volume; // keep the collection-wide volume in sync
        volumeShownAtMs = nowMs;
    }

    spawnNotes(leftState, cb);
    spawnNotes(rightState, cb);
    evaluateLane(leftState, cb, p1Lane, nowMs);
    evaluateLane(rightState, cb, p2Lane, nowMs);

    // Count-in: four metronome ticks before beat 0 so the first notes aren't
    // a cold open (the song has a few seconds of intro before its downbeat).
    const whole = Math.floor(cb);
    if (whole !== prevPlayWholeBeat) {
        prevPlayWholeBeat = whole;
        if (whole >= -4 && whole <= -1) tickMetronome(whole === -1);
    }

    drawBackground();
    drawLanePanel(leftState, cb);
    drawLanePanel(rightState, cb);
    drawNotes(leftState, cb);
    drawNotes(rightState, cb);
    drawHitFlashes(leftState);
    drawHitFlashes(rightState);
    drawPlatter(leftState);
    drawPlatter(rightState);
    drawHUD(cb);
    drawCountIn(cb);
    drawVolumeIndicator(nowMs);

    // Section loop (practice): jump back once the end of the range passes,
    // with a one-beat run-up.
    if (selectedSong && loopStartBeat !== null && loopEndBeat !== null && cb >= loopEndBeat) {
        seekTo(beatToSeconds(loopStartBeat - 1, selectedSong.offset, selectedSong.bpms, selectedSong.stops));
    }

    // Life/accuracy trace for the results graph (a sample every 2 beats).
    if (cb >= 0 && cb - lastTraceBeat >= 2) {
        lastTraceBeat = cb;
        runTrace.push({ life, acc: accuracy(stats) });
    }

    if (life <= 0 && !failed) {
        finishRun(true);
    } else if (selectedSong && cb >= selectedSong.lengthBeats) {
        finishRun(false);
    }
}

/** Transition to the results screen: grade the run, record bests. */
function finishRun(died: boolean): void {
    failed = died;
    runTrace.push({ life, acc: accuracy(stats) });
    finalGrade = gradeRun(stats, failed);
    bestScore = loadBest(chartKey());
    // Death doesn't set records.
    newBest = !failed && !practiceMode && saveBest(chartKey(), { score, grade: finalGrade, accuracy: accuracy(stats) });
    if (newBest) bestScore = { score, grade: finalGrade, accuracy: accuracy(stats) };
    djAudio.stop();
    state = "RESULT";
}

// ── Screen: RESULT ───────────────────────────────────────────────────────────

function frameResult(input: InputSnapshot): void {
    drawBackground();

    const cx = W / 2;
    const px = cx - 152;
    const py = 10;
    const pw = 304;
    const ph = 242;

    p.noStroke();
    p.fill(25, 20, 45);
    p.rect(px, py, pw, ph, 8);
    p.stroke(failed ? 200 : 140, failed ? 70 : 110, failed ? 70 : 220);
    p.strokeWeight(1.5);
    p.noFill();
    p.rect(px, py, pw, ph, 8);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);

    // Headline + grade (FAILED overrides everything)
    p.textSize(18);
    p.fill(failed ? 220 : 100, failed ? 60 : 230, failed ? 60 : 120);
    p.text(failed ? "FAIL" : "CLEAR!", cx - 60, py + 22);

    p.textSize(failed ? 15 : 26);
    p.fill(failed ? 220 : 255, failed ? 60 : 240, failed ? 60 : 80);
    p.text(finalGrade, cx + 66, py + 22);

    // Score + best
    p.textSize(12);
    p.fill(220, 210, 255);
    p.text(`SCORE  ${score.toString().padStart(7, "0")}`, cx, py + 46);
    p.textSize(7.5);
    if (newBest) {
        p.fill(255, 220, 90);
        p.text("★ NEW BEST ★", cx, py + 60);
    } else if (bestScore) {
        p.fill(130, 120, 160);
        p.text(`best ${bestScore.score.toString().padStart(7, "0")}  ·  ${bestScore.grade}`, cx, py + 60);
    }

    // Stats breakdown
    const rows: Array<[string, string, RGB]> = [
        ["PERFECT",   `${stats.perfect}`,  [255, 240, 80]],
        ["GOOD",      `${stats.good}`,     [80, 220, 120]],
        ["MISS",      `${stats.missed}`,   [255, 80, 80]],
        ["STRAY",     `${stats.stray}`,    [150, 140, 170]],
        ["MAX COMBO", `${stats.maxCombo}×`, [180, 160, 220]],
        ["ACCURACY",  `${(accuracy(stats) * 100).toFixed(1)}%`, [220, 210, 255]],
    ];
    const statTop = py + 76;
    for (let i = 0; i < rows.length; i++) {
        const [label, value, color] = rows[i];
        const y = statTop + i * 13;
        p.textAlign(p.RIGHT, p.CENTER);
        p.textSize(8);
        p.fill(120, 110, 150);
        p.text(label, cx - 8, y);
        p.textAlign(p.LEFT, p.CENTER);
        p.fill(color[0], color[1], color[2]);
        p.text(value, cx + 8, y);
    }

    // Life (green) + accuracy (violet) over the song
    const gx = px + 24;
    const gy = statTop + rows.length * 13 + 8;
    const gw = pw - 48;
    const gh = 34;
    p.noStroke();
    p.fill(14, 11, 26);
    p.rect(gx, gy, gw, gh, 3);
    p.stroke(50, 42, 80);
    p.strokeWeight(0.5);
    p.line(gx, gy + gh / 2, gx + gw, gy + gh / 2);
    if (runTrace.length > 1) {
        const plot = (get: (s: { life: number; acc: number }) => number, r: number, g: number, b: number) => {
            p.stroke(r, g, b, 220);
            p.strokeWeight(1);
            p.noFill();
            p.beginShape();
            for (let i = 0; i < runTrace.length; i++) {
                const x = gx + (i / (runTrace.length - 1)) * gw;
                const y = gy + gh - get(runTrace[i]) * (gh - 2) - 1;
                p.vertex(x, y);
            }
            p.endShape();
        };
        plot(s => s.acc, 210, 120, 255);
        plot(s => s.life, 80, 200, 120);
    }
    p.noStroke();
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(6);
    p.fill(80, 200, 120);
    p.text("LIFE", gx + 2, gy + 6);
    p.fill(210, 120, 255);
    p.text("ACC", gx + 20, gy + 6);

    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(8);
    p.fill(110, 100, 140);
    p.text("A — replay   ·   B — charts   ·   hold START — exit", cx, py + ph - 12);

    if (input.aPressed) resetGame();
    else if (input.bPressed) {
        navLatch = true;
        if (selectedSong) refreshTakes(selectedSong);
        state = "CHART_SELECT";
    }
}

// ── Screen: RECORDING (dev-only chart authoring — see recorder.ts) ───────────

function startRecording(): void {
    recording = newRecording();
    recResult = null;
    recClipboardOk = false;
    recPrevWholeBeat = -1;
    djAudio.stop();
    state = "RECORDING";
    void djAudio.play(0);
}

function stopRecording(): void {
    if (!recording) return;
    recResult = finishRecording(recording, songBeatNow());
    recording = null;
    djAudio.stop();
    state = "REC_DONE";

    console.log("[dj recorder]\n" + recResult.source);
    copyTakeToClipboard();
    saveTakeToDisk();
}

/** Persist the finished take via the dev server's takes endpoint. */
function saveTakeToDisk(): void {
    recSavedName = null;
    if (!import.meta.env.DEV || !selectedSong || !recResult) return;
    void fetch("/__dj/takes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            songId: selectedSong.id,
            savedAt: new Date().toISOString(),
            counts: { left: recResult.leftCount, right: recResult.rightCount },
            events: recResult.events,
            source: recResult.source,
        }),
    })
        .then(r => r.json())
        .then((d: { name?: string }) => { recSavedName = d.name ?? null; })
        .catch(() => { /* no endpoint — clipboard/console still have the take */ });
}

/**
 * Copy the finished take. The async clipboard API needs a secure context and
 * clipboard-permitting frame (the rcade emulator provides neither), so fall
 * back to execCommand("copy"), which works anywhere inside a user gesture.
 */
function copyTakeToClipboard(): void {
    if (!recResult) return;
    const text = recResult.source;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text)
            .then(() => { recClipboardOk = true; })
            .catch(() => { recClipboardOk = legacyCopy(text); });
    } else {
        recClipboardOk = legacyCopy(text);
    }
}

function legacyCopy(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* not supported */ }
    ta.remove();
    return ok;
}

/** Short metronome blip (through the master gain, so volume applies). */
function tickMetronome(accent: boolean): void {
    const audioCtx = djAudio.context;
    const now  = audioCtx.currentTime;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(accent ? 0.1 : 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain).connect(djAudio.output);
    osc.start(now);
    osc.stop(now + 0.05);
}

function frameRecording(input: InputSnapshot): void {
    const rec = recording;
    if (!rec) { state = "PLAYING"; return; }
    const cb = songBeatNow();

    recordFrame(rec, rec.left,  laneInputFromP1(input), cb);
    recordFrame(rec, rec.right, sampleP2(), cb);

    const whole = Math.floor(cb);
    if (cb >= 0 && whole !== recPrevWholeBeat) {
        recPrevWholeBeat = whole;
        tickMetronome(whole % 4 === 0);
    }

    // Beats render as lines scrolling down the lanes (same as play mode).
    drawBackground();
    drawLanePanel(leftState, cb);
    drawLanePanel(rightState, cb);

    const pulse = (Math.sin(p.millis() / 250) + 1) / 2;
    p.noStroke();
    p.fill(235, 50 + pulse * 50, 60);
    p.ellipse(14, 14, 9, 9);
    p.fill(240, 230, 250);
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(9);
    p.text("REC", 22, 14);

    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(7);
    p.fill(150, 140, 190);
    p.text(`L ${rec.left.notes.length}   ·   R ${rec.right.notes.length}`, W / 2, 14);

    p.textAlign(p.RIGHT, p.CENTER);
    p.textSize(8);
    p.fill(160, 150, 200);
    p.text(`♪ ${Math.max(0, whole)}`, W - 6, 14);

    // Recent captures, newest brightest
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(6.5);
    for (let i = 0; i < rec.log.length; i++) {
        p.fill(190, 180, 230, 90 + (i / Math.max(1, rec.log.length - 1)) * 165);
        p.text(rec.log[i], 10, 34 + i * 10);
    }

    p.textAlign(p.CENTER, p.BOTTOM);
    p.textSize(6.5);
    p.fill(120, 110, 150);
    p.text("perform the take — R = stop & save  ·  , = punch in −10s", W / 2, H - 6);

    if (selectedSong && cb >= selectedSong.lengthBeats) stopRecording();
}

function frameRecDone(input: InputSnapshot): void {
    drawBackground();
    const cx = W / 2;
    const cy = H / 2;

    p.noStroke();
    p.fill(25, 20, 45);
    p.rect(cx - 110, cy - 50, 220, 100, 8);
    p.stroke(235, 80, 80);
    p.strokeWeight(1.5);
    p.noFill();
    p.rect(cx - 110, cy - 50, 220, 100, 8);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(15);
    p.fill(240, 230, 250);
    p.text("TAKE CAPTURED", cx, cy - 28);

    p.textSize(9);
    p.fill(190, 180, 230);
    p.text(`${recResult?.leftCount ?? 0} left  ·  ${recResult?.rightCount ?? 0} right`, cx, cy - 8);

    p.textSize(7);
    p.fill(140, 210, 160);
    const saved = recSavedName ? `saved to takes/ (${recSavedName})` : null;
    const copied = recClipboardOk ? "copied to clipboard" : "in the console — press C to copy";
    p.text(saved ? `${saved}  ·  ${copied}` : copied, cx, cy + 10);

    p.textSize(7);
    p.fill(110, 100, 140);
    p.text("R = re-record  ·  T = play take  ·  C = copy  ·  A = play chart", cx, cy + 32);

    if (input.aPressed) resetGame();
}

// ── Module ───────────────────────────────────────────────────────────────────

const dj: GameModule = {
    id: "dj",
    title: "DJ",
    author: "kpthill",

    init(c: GameContext): void {
        ctx = c;
        p   = c.p;
        djAudio = new AudioManager();
        djAudio.volume = ctx.audio.volume; // inherit the collection-wide volume
        leftState  = newLaneState("left");
        rightState = newLaneState("right");
        selectedSong = null;
        selectedChart = null;
        songSel = 0;
        chartSel = 0;
        state = "SONG_SELECT";
        if (SONGS.length > 0) cueSongPreview(SONGS[0]);

        // Dev-only chart recorder: R toggles record mode (cabinet has no keyboard).
        if (import.meta.env.DEV) {
            recKeyHandler = (e: KeyboardEvent) => {
                if (e.repeat) return;
                if (e.key === "r" || e.key === "R") {
                    if (state === "RECORDING") stopRecording();
                    else if (selectedSong) startRecording();
                } else if ((e.key === "c" || e.key === "C") && state === "REC_DONE") {
                    copyTakeToClipboard();
                } else if ((e.key === "t" || e.key === "T") && state === "REC_DONE" && recResult && selectedSong) {
                    // Play the take just recorded, as a chart.
                    selectedChart = { id: "take:last", name: "last take", events: recResult.events };
                    resetGame();
                    practiceMode = true; // takes aren't record material
                } else if (e.key === ",") {
                    // Go back 10 seconds: replay (PLAYING) or punch in (RECORDING).
                    if (state === "PLAYING" && selectedSong) {
                        practiceMode = true;
                        seekTo(djAudio.currentSeconds - 10);
                    } else if (state === "RECORDING" && recording && selectedSong) {
                        const t = Math.max(0, djAudio.currentSeconds - 10);
                        const b = secondsToBeat(t, selectedSong.offset, selectedSong.bpms, selectedSong.stops);
                        truncateRecording(recording, b);
                        recPrevWholeBeat = Math.floor(b);
                        djAudio.stop();
                        void djAudio.play(t);
                    }
                } else if ((e.key === "l" || e.key === "L") && state === "PLAYING") {
                    // Section loop: first press marks the start, second the end.
                    const b = Math.floor(songBeatNow());
                    if (loopStartBeat === null || loopEndBeat !== null) {
                        loopStartBeat = b;
                        loopEndBeat = null;
                    } else if (b > loopStartBeat) {
                        loopEndBeat = b;
                        practiceMode = true;
                    }
                } else if (e.key === "k" || e.key === "K") {
                    loopStartBeat = null;
                    loopEndBeat = null;
                }
            };
            window.addEventListener("keydown", recKeyHandler);
        }
    },

    frame(input: InputSnapshot, _dt: number): void {
        switch (state) {
            case "SONG_SELECT":  frameSongSelect(input);  break;
            case "CHART_SELECT": frameChartSelect(input); break;
            case "PLAYING":      framePlaying(input);     break;
            case "RESULT":       frameResult(input);      break;
            case "RECORDING":    frameRecording(input);   break;
            case "REC_DONE":     frameRecDone(input);     break;
        }
    },

    teardown(): void {
        if (recKeyHandler) {
            window.removeEventListener("keydown", recKeyHandler);
            recKeyHandler = null;
        }
        recording = null;
        leftState.activeNotes = [];
        leftState.judgments = [];
        leftState.hitFlashes = [];
        rightState.activeNotes = [];
        rightState.judgments = [];
        rightState.hitFlashes = [];
        resetGestureState(leftState.gesture);
        resetGestureState(rightState.gesture);
        ctx.audio.volume = djAudio.volume; // persist volume back to the collection
        djAudio.close();
    },
};

export default dj;
