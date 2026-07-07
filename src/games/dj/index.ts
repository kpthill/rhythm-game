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
import type { Lane, NoteEvent, ActiveNote, ScratchDir, RGB } from "./notes";
import {
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS, PERFECT_FRACTION, SUSTAIN_GRACE_BEATS,
    NOTE_TOP, HIT_Y, noteY, clampedNoteY,
    LANE_W, laneOriginX, laneCenterX, colAX, colBX,
    NOTE_W, NOTE_H, SCRATCH_R, HOLD_TAIL_W,
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

type GameState = "PLAYING" | "RESULT";

interface Judgment { text: string; frame: number; }

interface LaneState {
    lane: Lane;
    activeNotes: ActiveNote[];
    chartIndex: number;
    gesture: GestureState;
    platterAngle: number;
    platterSpeed: number;
    prevBothHeld: boolean;
    /** 0..1 — ramps up while a spin note is actively sustaining; tints the whole stream. */
    tint: number;
    lastGesture: GestureResult | null;
    judgments: Judgment[];
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

function newLaneState(lane: Lane): LaneState {
    return {
        lane,
        activeNotes: [],
        chartIndex: 0,
        gesture: newGestureState(),
        platterAngle: 0,
        platterSpeed: 0,
        prevBothHeld: false,
        tint: 0,
        lastGesture: null,
        judgments: [],
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pushJudgment(ls: LaneState, text: string): void {
    ls.judgments.push({ text, frame: p.frameCount });
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
}

function applyMiss(ls: LaneState, note: ActiveNote): void {
    note.result = "missed";
    registerMiss(ls);
}

/** Shared all-or-nothing sustain judging for hold/spin notes. */
function evaluateSustain(ls: LaneState, note: ActiveNote, currentBeat: number, beatDiff: number, engaged: boolean): void {
    const ev = note.event;
    const endBeat = ev.beat + (ev.durationBeats ?? 0);

    if (!note.sustain || note.sustain === "idle") {
        if (engaged && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
            const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * PERFECT_FRACTION;
            note.entryGrade = perfect ? "PERFECT" : "GOOD";
            note.sustain = "active";
        } else if (beatDiff > HIT_WINDOW_BEATS) {
            note.sustain = "failed";
            note.result = "missed";
            registerMiss(ls);
        }
        return;
    }

    if (note.sustain === "active") {
        if (currentBeat >= endBeat) {
            completeSustain(ls, note);
        } else if (!engaged) {
            if (currentBeat >= endBeat - SUSTAIN_GRACE_BEATS) completeSustain(ls, note);
            else {
                note.sustain = "failed";
                note.result = "missed";
                registerMiss(ls);
            }
        }
    }
}

function completeSustain(ls: LaneState, note: ActiveNote): void {
    note.sustain = "done";
    note.result = "hit";
    const grade = note.entryGrade ?? "GOOD";
    registerHit(ls, grade === "PERFECT" ? POINTS_PERFECT : POINTS_GOOD, grade);
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
                evaluateSustain(ls, note, currentBeat, beatDiff, engaged);
                break;
            }
            case "spin": {
                evaluateSustain(ls, note, currentBeat, beatDiff, gr.spinning);
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

/** Small CW/CCW arrow drawn inside a scratch note. */
function drawArrow(cx: number, cy: number, dir: ScratchDir): void {
    const r = 5;
    p.noFill();
    p.stroke(10, 8, 20);
    p.strokeWeight(1.5);
    if (dir === "CW") {
        p.arc(cx, cy, r * 2, r * 2, Math.PI, Math.PI * 1.8);
        p.fill(10, 8, 20);
        p.noStroke();
        p.triangle(cx + r * 0.6, cy + r * 0.8, cx + r * 1.1, cy + r * 0.2, cx + r * 0.0, cy + r * 0.5);
    } else {
        p.arc(cx, cy, r * 2, r * 2, -Math.PI * 0.2, 0);
        p.fill(10, 8, 20);
        p.noStroke();
        p.triangle(cx - r * 0.6, cy + r * 0.8, cx - r * 1.1, cy + r * 0.2, cx - r * 0.0, cy + r * 0.5);
    }
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

    p.noStroke();
    p.fill(r, g, b, active ? 170 : 110);
    p.rect(x - HOLD_TAIL_W / 2, tailY, HOLD_TAIL_W, Math.max(0, headY - tailY), 3);

    p.fill(r, g, b);
    p.stroke(255, 255, 255, active ? 230 : 140);
    p.strokeWeight(1.5);
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

function drawScratchNote(ev: NoteEvent, currentBeat: number, cX: number): void {
    const y = clampedNoteY(ev.beat, currentBeat);
    if (y < NOTE_TOP - SCRATCH_R || y > HIT_Y + SCRATCH_R) return;
    const dir = ev.scratch ?? "CW";
    const [r, g, b] = dir === "CW" ? COLOR_SCRATCH_CW : COLOR_SCRATCH_CCW;
    p.fill(r, g, b, 220);
    p.stroke(255, 255, 255, 140);
    p.strokeWeight(1.5);
    p.ellipse(cX, y, SCRATCH_R * 2, SCRATCH_R * 2);
    p.noStroke();
    p.fill(10, 8, 20);
    drawArrow(cX, y, dir);
}

function drawSpinNote(ev: NoteEvent, note: ActiveNote, currentBeat: number, cX: number, health: number): void {
    const duration = ev.durationBeats ?? 0;
    const headY = clampedNoteY(ev.beat, currentBeat);
    const tailY = clampedNoteY(ev.beat + duration, currentBeat);
    const active = note.sustain === "active";
    const warn = active && health < 0.5;

    p.noStroke();
    p.fill(COLOR_SPIN[0], COLOR_SPIN[1], COLOR_SPIN[2], active ? 130 : 90);
    p.rect(cX - SCRATCH_R, tailY, SCRATCH_R * 2, Math.max(0, headY - tailY), 4);

    const headColor: RGB = warn ? [230, 70, 70] : COLOR_SPIN;
    p.fill(headColor[0], headColor[1], headColor[2], 230);
    p.stroke(255, 255, 255, 180);
    p.strokeWeight(1.5);
    p.ellipse(cX, headY, SCRATCH_R * 2, SCRATCH_R * 2);

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
    const health = ls.lastGesture?.spinHealth ?? 1;

    for (const note of ls.activeNotes) {
        if (note.result !== "pending") continue;
        const ev = note.event;
        switch (ev.kind) {
            case "tap":     drawTapNote(ev, currentBeat, aX, bX, ls.tint); break;
            case "hold":    drawHoldNote(ev, note, currentBeat, aX, bX, ls.tint); break;
            case "double":  drawDoubleNote(ev, currentBeat, aX, bX, ls.tint); break;
            case "scratch": drawScratchNote(ev, currentBeat, cX); break;
            case "spin":    drawSpinNote(ev, note, currentBeat, cX, health); break;
        }
    }
}

function drawPlatter(ls: LaneState): void {
    const cx = laneCenterX(ls.lane);
    const cy = PLATTER_CY;
    const r  = PLATTER_R;

    p.noStroke();
    p.fill(5, 4, 12, 180);
    p.ellipse(cx + 2, cy + 2, r * 2 + 3, r * 2 + 3);

    const rim = lerpColor([80, 70, 110], COLOR_SPIN, ls.tint);
    p.stroke(rim[0], rim[1], rim[2]);
    p.strokeWeight(2.5);
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

    drawBackground();
    drawLanePanel(leftState, cb);
    drawLanePanel(rightState, cb);
    drawNotes(leftState, cb);
    drawNotes(rightState, cb);
    drawPlatter(leftState);
    drawPlatter(rightState);
    drawHUD(cb);
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

// ── Module ───────────────────────────────────────────────────────────────────

const dj: GameModule = {
    id: "dj",
    title: "DJ",
    author: "kpthill",

    init(c: GameContext): void {
        ctx = c;
        p   = c.p;
        resetGame();
    },

    frame(input: InputSnapshot, _dt: number): void {
        switch (state) {
            case "PLAYING": framePlaying(input); break;
            case "RESULT":  frameResult(input);  break;
        }
    },

    teardown(): void {
        leftState.activeNotes = [];
        leftState.judgments = [];
        rightState.activeNotes = [];
        rightState.judgments = [];
        resetGestureState(leftState.gesture);
        resetGestureState(rightState.gesture);
        ctx.audio.stop();
    },
};

export default dj;
