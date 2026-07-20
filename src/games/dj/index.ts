// DJ — turntable scratch rhythm game (v2, vertical two-lane rework).
//
// Notes fall top-to-bottom toward a shared hit line. Left lane = player 1's
// spinner + A/B; right lane = player 2's spinner + A/B. One player straddles
// both lanes — this is the normal way the game plays, not an expert mode.
// Five verbs: tap, hold, double (A+B), scratch (spinner pulse, direction
// matters), spin (sustained spinner turning). See docs/specs/dj.md.
//
// States: PLAYING → RESULT (then A to replay).

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHART } from "./chart";
import { sampleP2, resetP2Input, type LaneInput } from "./input2p";
import { newGestureState, resetGestureState, sampleGesture, type GestureState, type GestureResult } from "./gesture";
import { stepSustain, type SustainEvent } from "./sustain";
import { newRecording, recordFrame, finishRecording, type Recording, type RecordingResult } from "./recorder";
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

// Scoring (carried over from v1)
const POINTS_PERFECT = 300;
const POINTS_GOOD    = 100;
const LIFE_MISS       = 0.08;
const LIFE_REGAIN     = 0.012; // slow regain on successful hits

// Platter geometry (two platters, one per lane)
const PLATTER_CY = 226;
const PLATTER_R  = 19;

// Volume control (P2 up/down — free, the charts only use P2 left/right/A/B)
const VOLUME_PER_SEC      = 0.7;  // full range in ~1.4s of holding
const VOLUME_INDICATOR_MS = 900;  // how long the indicator lingers after a change

// ── State ────────────────────────────────────────────────────────────────────

type GameState = "PLAYING" | "RESULT" | "RECORDING" | "REC_DONE";

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

const LANE_EVENTS: Record<Lane, NoteEvent[]> = {
    left:  CHART.filter(e => e.lane === "left"),
    right: CHART.filter(e => e.lane === "right"),
};

let ctx: GameContext;
let p: p5;

let state: GameState = "PLAYING";
let score  = 0;
let combo  = 0;
let life   = 1.0;
let failed = false;

let leftState: LaneState;
let rightState: LaneState;

let volumeShownAtMs = -Infinity;

// Count-in bookkeeping (metronome ticks on beats -4..-1 before the first notes)
let prevPlayWholeBeat = 999;

// Chart recorder (dev-only; see recorder.ts)
let recording: Recording | null = null;
let recResult: RecordingResult | null = null;
let recClipboardOk = false;
let recPrevWholeBeat = -1;
let recKeyHandler: ((e: KeyboardEvent) => void) | null = null;

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

function registerHit(ls: LaneState, points: number, label: string): void {
    combo++;
    score += points * combo;
    life = Math.min(1, life + LIFE_REGAIN);
    pushJudgment(ls, label);
}

function registerMiss(ls: LaneState): void {
    combo = 0;
    life = Math.max(0, life - LIFE_MISS);
    pushJudgment(ls, "MISS");
}

function resetGame(): void {
    leftState  = newLaneState("left");
    rightState = newLaneState("right");
    resetP2Input();
    score   = 0;
    combo   = 0;
    life    = 1.0;
    failed  = false;
    state   = "PLAYING";
    prevPlayWholeBeat = 999;
    void ctx.audio.play(0);
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
    const events = LANE_EVENTS[ls.lane];
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
    registerHit(ls, perfect ? POINTS_PERFECT : POINTS_GOOD, perfect ? "PERFECT" : "GOOD");
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
            const grade = note.entryGrade ?? "GOOD";
            registerHit(ls, grade === "PERFECT" ? POINTS_PERFECT : POINTS_GOOD, grade);
            pushHitFlash(ls, note.event, grade === "PERFECT" ? "perfect" : "good");
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

/** Brief synthesized scratch blip — no audio asset needed, built on the shared AudioContext. */
function triggerScratchFX(dir: ScratchDir): void {
    const audioCtx = ctx.audio.context;
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
    osc.connect(gain).connect(ctx.audio.output);
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
    p.rect(bx, by, bw * ctx.audio.volume, 5, 2);
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

    if (currentBeat < 5) {
        p.textAlign(p.CENTER, p.BOTTOM);
        p.textSize(6.5);
        p.fill(100, 90, 130, 200);
        p.text("A/B=tap  hold=sustain  A+B=double  SPIN/L-R=scratch,hold=spin", W / 2, H - 12);
    }

    drawJudgments(leftState);
    drawJudgments(rightState);
}

// ── Screen: PLAYING ──────────────────────────────────────────────────────────

function framePlaying(input: InputSnapshot): void {
    const cb = ctx.beatNow();
    const nowMs = p.millis();

    const p1Lane = laneInputFromP1(input);
    const p2Lane = sampleP2();

    // P2 up/down is free (the charts only use P2 left/right/A/B), so it doubles
    // as a live volume control.
    if (p2Lane.direction === "UP" || p2Lane.direction === "DOWN") {
        const dv = (p2Lane.direction === "UP" ? 1 : -1) * VOLUME_PER_SEC * (p.deltaTime / 1000);
        ctx.audio.volume += dv;
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

    if (life <= 0 && !failed) {
        failed = true;
        ctx.audio.stop();
        state = "RESULT";
    }
    if (cb >= SONG_LENGTH_BEATS) {
        ctx.audio.stop();
        state = "RESULT";
    }
}

// ── Screen: RESULT ───────────────────────────────────────────────────────────

function frameResult(input: InputSnapshot): void {
    drawBackground();

    const cx = W / 2;
    const cy = H / 2;

    p.noStroke();
    p.fill(25, 20, 45);
    p.rect(cx - 100, cy - 55, 200, 110, 8);
    p.stroke(140, 110, 220);
    p.strokeWeight(1.5);
    p.noFill();
    p.rect(cx - 100, cy - 55, 200, 110, 8);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);

    p.textSize(22);
    p.fill(failed ? 220 : 100, failed ? 60 : 230, failed ? 60 : 120);
    p.text(failed ? "FAIL" : "CLEAR!", cx, cy - 30);

    p.textSize(13);
    p.fill(220, 210, 255);
    p.text(`SCORE  ${score.toString().padStart(7, "0")}`, cx, cy + 2);

    const grade =
        score > 50000 ? "S" :
        score > 30000 ? "A" :
        score > 15000 ? "B" :
        score > 5000  ? "C" : "D";
    p.textSize(20);
    p.fill(255, 240, 80);
    p.text(grade, cx, cy + 26);

    p.textSize(8);
    p.fill(110, 100, 140);
    p.text("A to replay   ·   hold START to exit", cx, cy + 50);

    if (input.aPressed) resetGame();
}

// ── Screen: RECORDING (dev-only chart authoring — see recorder.ts) ───────────

function startRecording(): void {
    recording = newRecording();
    recResult = null;
    recClipboardOk = false;
    recPrevWholeBeat = -1;
    ctx.audio.stop();
    state = "RECORDING";
    void ctx.audio.play(0);
}

function stopRecording(): void {
    if (!recording) return;
    recResult = finishRecording(recording, ctx.beatNow());
    recording = null;
    ctx.audio.stop();
    state = "REC_DONE";

    console.log("[dj recorder]\n" + recResult.source);
    copyTakeToClipboard();
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
    const audioCtx = ctx.audio.context;
    const now  = audioCtx.currentTime;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(accent ? 0.1 : 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain).connect(ctx.audio.output);
    osc.start(now);
    osc.stop(now + 0.05);
}

function frameRecording(input: InputSnapshot): void {
    const rec = recording;
    if (!rec) { state = "PLAYING"; return; }
    const cb = ctx.beatNow();

    recordFrame(rec, rec.left,  laneInputFromP1(input), cb);
    recordFrame(rec, rec.right, sampleP2(), cb);

    const whole = Math.floor(cb);
    if (cb >= 0 && whole !== recPrevWholeBeat) {
        recPrevWholeBeat = whole;
        tickMetronome(whole % 4 === 0);
    }

    drawBackground();

    // Beat flash + pulsing REC badge
    if (cb >= 0 && cb - whole < 0.15) {
        p.noStroke();
        p.fill(255, 255, 255, 22);
        p.rect(0, 0, W, H);
    }
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
    p.text("perform the take — R = stop & copy", W / 2, H - 6);

    if (cb >= SONG_LENGTH_BEATS) stopRecording();
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
    p.text(recClipboardOk ? "copied to clipboard (also in console)" : "in the console — press C to copy", cx, cy + 10);

    p.textSize(7);
    p.fill(110, 100, 140);
    p.text("R = record again  ·  C = copy  ·  A = play  ·  hold START = exit", cx, cy + 32);

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
        resetGame();

        // Dev-only chart recorder: R toggles record mode (cabinet has no keyboard).
        if (import.meta.env.DEV) {
            recKeyHandler = (e: KeyboardEvent) => {
                if (e.repeat) return;
                if (e.key === "r" || e.key === "R") {
                    if (state === "RECORDING") stopRecording();
                    else startRecording();
                } else if ((e.key === "c" || e.key === "C") && state === "REC_DONE") {
                    copyTakeToClipboard();
                }
            };
            window.addEventListener("keydown", recKeyHandler);
        }
    },

    frame(input: InputSnapshot, _dt: number): void {
        switch (state) {
            case "PLAYING":   framePlaying(input);   break;
            case "RESULT":    frameResult(input);    break;
            case "RECORDING": frameRecording(input); break;
            case "REC_DONE":  frameRecDone(input);   break;
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
        ctx.audio.stop();
    },
};

export default dj;
