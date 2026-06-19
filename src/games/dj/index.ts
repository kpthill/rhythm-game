// DJ — turntable scratch rhythm game.
//
// The game showcases the spinner (rotary) input:
//   HIT notes    : tap A or B as the note crosses the hit line.
//   SCRATCH notes: spin CW or CCW (shown by an arrow on the note). If no
//                  spinner is connected the player may use RIGHT (CW) or
//                  LEFT (CCW) joystick flick as a fallback.
//
// States: PLAYING → RESULT (then A to replay).

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHART } from "./chart";
import type { ActiveNote, ScratchDir } from "./notes";
import {
    LANE_Y, HIT_X, NOTE_W, NOTE_H,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS,
    COLOR_HIT_A, COLOR_HIT_B, COLOR_SCRATCH_CW, COLOR_SCRATCH_CCW,
    noteX,
} from "./notes";

// ── Constants ──────────────────────────────────────────────────────────────────

const W = 336;
const H = 262;

// Turntable geometry
const TT_CX  = 50;   // center x of platter
const TT_CY  = 90;   // center y of platter
const TT_R   = 40;   // outer radius of platter
const TT_R_INNER = 14; // label circle radius

// Scratch detection thresholds
const SCRATCH_STEPS_THRESHOLD = 3;   // spinner steps needed per frame burst
const FLICK_FRAMES_WINDOW     = 12;  // frames in which direction must be held for fallback

// Scoring
const POINTS_PERFECT = 300;
const POINTS_GOOD    = 100;
const LIFE_MISS      = 0.08;

// Lane layout
const LANE_TOP    = LANE_Y - NOTE_H * 1.6;
const LANE_BOTTOM = LANE_Y + NOTE_H * 1.6;
const LANE_RIGHT  = 334;

// ── State ─────────────────────────────────────────────────────────────────────

type GameState = "PLAYING" | "RESULT";

interface Judgment { text: string; frame: number; }

let ctx: GameContext;
let p: p5;

let state: GameState = "PLAYING";
let activeNotes: ActiveNote[] = [];
let chartIndex    = 0;
let score         = 0;
let combo         = 0;
let life          = 1.0;
let failed        = false;
let judgments: Judgment[] = [];

// Turntable visual angle (accumulated from spinner/fallback)
let platterAngle = 0;

// Fallback flick tracking (keyboard/joystick substitute for spinner)
let flickFrames = 0;

// Direction flick latch (to detect new presses for the fallback)
let prevLeft  = false;
let prevRight = false;

// ── Helpers ────────────────────────────────────────────────────────────────────

function pushJudgment(text: string): void {
    judgments.push({ text, frame: p.frameCount });
}

function registerHit(points: number, quality: string): void {
    combo++;
    score += points * combo;
    pushJudgment(quality);
}

function registerMiss(): void {
    combo = 0;
    life = Math.max(0, life - LIFE_MISS);
    pushJudgment("MISS");
}

function resetGame(): void {
    activeNotes = [];
    chartIndex  = 0;
    score       = 0;
    combo       = 0;
    life        = 1.0;
    failed      = false;
    judgments   = [];
    platterAngle = 0;
    flickFrames  = 0;
    prevLeft     = false;
    prevRight    = false;
    state        = "PLAYING";
    void ctx.audio.play(0);
}

// ── Game logic ─────────────────────────────────────────────────────────────────

function spawnNotes(currentBeat: number): void {
    while (chartIndex < CHART.length) {
        const ev = CHART[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            activeNotes.push({ event: ev, hit: false, missed: false });
            chartIndex++;
        } else break;
    }
}

/**
 * Determine whether the player has produced a scratch in the given direction
 * this frame. Two input modes:
 *  1. Spinner connected: check spinnerDelta sign + magnitude.
 *  2. Fallback: a LEFT/RIGHT joystick flick that was pressed this frame.
 */
function detectScratch(input: InputSnapshot, dir: ScratchDir): boolean {
    if (input.spinnerConnected) {
        // Positive delta = CW, negative = CCW
        if (dir === "CW"  && input.spinnerDelta >= SCRATCH_STEPS_THRESHOLD) return true;
        if (dir === "CCW" && input.spinnerDelta <= -SCRATCH_STEPS_THRESHOLD) return true;
        return false;
    }
    // Fallback: a new flick in the correct direction
    if (dir === "CW"  && input.direction === "RIGHT" && !prevRight) return true;
    if (dir === "CCW" && input.direction === "LEFT"  && !prevLeft)  return true;
    return false;
}

function evaluateNotes(currentBeat: number, input: InputSnapshot): void {
    for (const note of activeNotes) {
        if (note.hit || note.missed) continue;
        const { event: ev } = note;
        const beatDiff = currentBeat - ev.beat;

        if (ev.type === "hit") {
            const btn = ev.button ?? "A";
            const pressed = btn === "A" ? input.aPressed : input.bPressed;
            if (pressed && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.55;
                registerHit(perfect ? POINTS_PERFECT : POINTS_GOOD, perfect ? "PERFECT" : "GOOD");
                note.hit = true;
            } else if (beatDiff > HIT_WINDOW_BEATS) {
                registerMiss();
                note.missed = true;
            }
        } else {
            // scratch note
            const dir = ev.scratch ?? "CW";
            const scratched = detectScratch(input, dir);
            if (scratched && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.55;
                registerHit(perfect ? POINTS_PERFECT : POINTS_GOOD, perfect ? "PERFECT!" : "GOOD");
                note.hit = true;
            } else if (beatDiff > HIT_WINDOW_BEATS) {
                registerMiss();
                note.missed = true;
            }
        }
    }

    // Cull stale notes
    activeNotes = activeNotes.filter(n => currentBeat - n.event.beat < LOOKAHEAD_BEATS + 1);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function drawBackground(): void {
    p.background(10, 8, 20);

    // Subtle grid lines
    p.stroke(30, 25, 50);
    p.strokeWeight(0.5);
    for (let x = 0; x < W; x += 24) {
        p.line(x, 0, x, H);
    }
    for (let y = 0; y < H; y += 24) {
        p.line(0, y, W, y);
    }
}

/** Draw the spinning platter + tonearm. */
function drawTurntable(input: InputSnapshot): void {
    // Update platter rotation
    if (input.spinnerConnected) {
        // spinnerDelta is steps; convert to radians (roughly 2π / 360 steps per rev)
        platterAngle += input.spinnerDelta * (Math.PI * 2 / 360);
    } else {
        // Fallback: animate slowly by direction
        if (input.direction === "LEFT")  platterAngle -= 0.04;
        if (input.direction === "RIGHT") platterAngle += 0.04;
    }

    const cx = TT_CX;
    const cy = TT_CY;
    const r  = TT_R;

    // Shadow
    p.noStroke();
    p.fill(5, 4, 12, 180);
    p.ellipse(cx + 3, cy + 3, r * 2 + 4, r * 2 + 4);

    // Outer rim
    p.stroke(80, 70, 110);
    p.strokeWeight(3);
    p.fill(18, 14, 30);
    p.ellipse(cx, cy, r * 2, r * 2);

    // Grooves (concentric rings on the platter, rotated)
    p.noFill();
    p.strokeWeight(0.5);
    for (let gr = 8; gr < r - 4; gr += 5) {
        const alpha = p.map(gr, 8, r - 4, 30, 80);
        p.stroke(70, 60, 100, alpha);
        p.ellipse(cx, cy, gr * 2, gr * 2);
    }

    // Platter rotation indicator line (like a groove start mark)
    const lx = cx + Math.cos(platterAngle) * (r - 5);
    const ly = cy + Math.sin(platterAngle) * (r - 5);
    p.stroke(140, 110, 200, 180);
    p.strokeWeight(1.5);
    p.line(cx, cy, lx, ly);

    // Center label circle
    p.strokeWeight(1);
    p.stroke(60, 50, 90);
    p.fill(40, 30, 65);
    p.ellipse(cx, cy, TT_R_INNER * 2, TT_R_INNER * 2);

    // Label text
    p.noStroke();
    p.fill(160, 140, 200);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(6);
    p.text("DJ", cx, cy - 3);
    p.text("RCADE", cx, cy + 4);

    // Spindle pin
    p.fill(200, 190, 220);
    p.noStroke();
    p.ellipse(cx, cy, 4, 4);

    // Tonearm
    const armBaseX = cx + r + 8;
    const armBaseY = cy - r + 4;
    const armAngle = -0.6 + (platterAngle * 0.005 % 0.4);  // slight drift
    const armLen   = 28;
    const armTipX  = armBaseX + Math.cos(armAngle + Math.PI) * armLen;
    const armTipY  = armBaseY + Math.sin(armAngle + Math.PI) * armLen;

    p.stroke(150, 140, 170);
    p.strokeWeight(2);
    p.line(armBaseX, armBaseY, armTipX, armTipY);
    p.fill(180, 160, 200);
    p.noStroke();
    p.ellipse(armBaseX, armBaseY, 6, 6);
    p.ellipse(armTipX, armTipY, 3, 3);

    // Spinner connected indicator
    p.textAlign(p.LEFT, p.BOTTOM);
    p.textSize(6);
    p.noStroke();
    p.fill(input.spinnerConnected ? 80 : 60, input.spinnerConnected ? 200 : 60, 100);
    p.text(input.spinnerConnected ? "SPIN" : "KEYS", 8, H - 4);
}

function drawLane(currentBeat: number): void {
    // Lane background
    p.noStroke();
    p.fill(18, 14, 32);
    p.rect(HIT_X - 5, LANE_TOP, LANE_RIGHT - HIT_X + 10, LANE_BOTTOM - LANE_TOP, 3);

    // Beat tick marks
    p.stroke(40, 35, 65);
    p.strokeWeight(0.5);
    const startBeat = Math.floor(currentBeat);
    for (let b = startBeat; b <= currentBeat + LOOKAHEAD_BEATS + 1; b++) {
        const x = noteX(b, currentBeat);
        if (x >= HIT_X - 2 && x <= LANE_RIGHT) {
            p.line(x, LANE_TOP, x, LANE_BOTTOM);
        }
    }

    // Hit line
    p.stroke(160, 130, 240);
    p.strokeWeight(2);
    p.line(HIT_X, LANE_TOP - 4, HIT_X, LANE_BOTTOM + 4);

    // Hit zone glow
    p.noFill();
    p.stroke(160, 130, 240, 40);
    p.strokeWeight(8);
    p.line(HIT_X, LANE_TOP - 4, HIT_X, LANE_BOTTOM + 4);
}

function drawNotes(currentBeat: number): void {
    for (const note of activeNotes) {
        if (note.missed) continue;
        const { event: ev } = note;
        const x = noteX(ev.beat, currentBeat);
        if (x < HIT_X - NOTE_W * 2 || x > LANE_RIGHT + NOTE_W) continue;

        const cx = p.constrain(x, HIT_X, LANE_RIGHT);
        const cy = LANE_Y;

        if (ev.type === "hit") {
            if (note.hit) continue;
            const [r, g, b_] = ev.button === "B" ? COLOR_HIT_B : COLOR_HIT_A;
            // Draw a pill/rectangle
            p.fill(r, g, b_);
            p.stroke(255, 255, 255, 160);
            p.strokeWeight(1.5);
            p.rect(cx - NOTE_W / 2, cy - NOTE_H / 2, NOTE_W, NOTE_H, 4);
            // Button label
            p.noStroke();
            p.fill(10, 8, 20);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(8);
            p.text(ev.button ?? "A", cx, cy);
        } else {
            // scratch note
            const dir = ev.scratch ?? "CW";
            const [r, g, b_] = dir === "CW" ? COLOR_SCRATCH_CW : COLOR_SCRATCH_CCW;
            p.fill(r, g, b_, note.hit ? 80 : 220);
            p.stroke(255, 255, 255, 120);
            p.strokeWeight(1.5);
            p.ellipse(cx, cy, NOTE_W + 4, NOTE_W + 4);

            if (!note.hit) {
                // Arrow indicating direction
                p.noStroke();
                p.fill(10, 8, 20);
                drawArrow(cx, cy, dir);
            }
        }
    }
}

/** Draw a small CW or CCW arrow inside a scratch note circle. */
function drawArrow(cx: number, cy: number, dir: ScratchDir): void {
    const r = 5;
    // Draw arc stub + arrowhead
    p.noFill();
    p.stroke(10, 8, 20);
    p.strokeWeight(1.5);
    if (dir === "CW") {
        // Arc from left to bottom (clockwise)
        p.arc(cx, cy, r * 2, r * 2, Math.PI, Math.PI * 1.8);
        // Arrowhead at end of arc (pointing down-right for CW)
        p.fill(10, 8, 20);
        p.noStroke();
        p.triangle(
            cx + r * 0.6, cy + r * 0.8,
            cx + r * 1.1, cy + r * 0.2,
            cx + r * 0.0, cy + r * 0.5,
        );
    } else {
        // Arc from right to bottom (counter-clockwise)
        p.arc(cx, cy, r * 2, r * 2, -Math.PI * 0.2, 0);
        p.fill(10, 8, 20);
        p.noStroke();
        p.triangle(
            cx - r * 0.6, cy + r * 0.8,
            cx - r * 1.1, cy + r * 0.2,
            cx - r * 0.0, cy + r * 0.5,
        );
    }
}

function drawHUD(currentBeat: number): void {
    // Score (top right)
    p.noStroke();
    p.fill(200, 195, 220);
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), W - 4, 4);

    // Combo (top left, beside turntable area)
    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 4);
    }

    // Life bar (below lane)
    const barY  = LANE_BOTTOM + 8;
    const barX  = HIT_X;
    const barW  = LANE_RIGHT - HIT_X;
    p.fill(35, 28, 55);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5
        ? p.color(80, 200, 120)
        : life > 0.25
            ? p.color(230, 180, 40)
            : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    // "LIFE" label
    p.noStroke();
    p.fill(100, 90, 130);
    p.textAlign(p.LEFT, p.BASELINE);
    p.textSize(6);
    p.text("LIFE", barX, barY - 1);

    // Beat counter (bottom right)
    p.textAlign(p.RIGHT, p.BOTTOM);
    p.textSize(7);
    p.fill(80, 75, 110);
    p.text(`♩${Math.floor(currentBeat)}`, W - 4, H - 4);

    // Judgment text (centered over lane)
    judgments = judgments.filter(j => p.frameCount - j.frame < 45);
    for (const j of judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 20, 45, 255, 0);
        const dy    = p.map(age, 0, 45, 0, -14);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(12);
        if (j.text.startsWith("PERFECT"))  p.fill(255, 240, 80, alpha);
        else if (j.text === "GOOD")         p.fill(80, 220, 120, alpha);
        else                                p.fill(255, 80, 80, alpha);
        p.text(j.text, HIT_X + 80, LANE_Y - 30 + dy);
    }

    // Hint (if within first 5 beats)
    if (currentBeat < 5) {
        p.textAlign(p.CENTER, p.BOTTOM);
        p.textSize(7);
        p.fill(100, 90, 130, 200);
        p.text("A/B = tap   SPIN or LEFT/RIGHT = scratch", W / 2, LANE_TOP - 5);
    }
}

function drawScratchIndicator(input: InputSnapshot): void {
    // Show current spinner activity as an animated glow on the hit line
    const mag = input.spinnerConnected
        ? Math.abs(input.spinnerDelta)
        : (input.direction === "LEFT" || input.direction === "RIGHT" ? 4 : 0);
    if (mag < 1) return;
    const alpha = p.map(mag, 1, 8, 60, 200);
    const col   = input.spinnerDelta >= 0 ? COLOR_SCRATCH_CW : COLOR_SCRATCH_CCW;
    p.noFill();
    p.stroke(col[0], col[1], col[2], alpha);
    p.strokeWeight(6);
    p.line(HIT_X, LANE_TOP - 6, HIT_X, LANE_BOTTOM + 6);
}

// ── Screen: PLAYING ────────────────────────────────────────────────────────────

function framePlaying(input: InputSnapshot): void {
    const cb = ctx.beatNow();

    // Update fallback flick state (must run before evaluateNotes)
    const leftNow  = input.direction === "LEFT";
    const rightNow = input.direction === "RIGHT";
    if (leftNow && !prevLeft)   { flickFrames = FLICK_FRAMES_WINDOW; }
    if (rightNow && !prevRight) { flickFrames = FLICK_FRAMES_WINDOW; }
    if (flickFrames > 0) flickFrames--;
    prevLeft  = leftNow;
    prevRight = rightNow;

    // Game logic
    spawnNotes(cb);
    evaluateNotes(cb, input);

    // Draw
    drawBackground();
    drawTurntable(input);
    drawLane(cb);
    drawNotes(cb);
    drawScratchIndicator(input);
    drawHUD(cb);

    // Life out = fail
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

// ── Screen: RESULT ─────────────────────────────────────────────────────────────

function frameResult(input: InputSnapshot): void {
    drawBackground();

    const cx = W / 2;
    const cy = H / 2;

    // Panel
    p.noStroke();
    p.fill(25, 20, 45);
    p.rect(cx - 100, cy - 55, 200, 110, 8);
    p.stroke(140, 110, 220);
    p.strokeWeight(1.5);
    p.noFill();
    p.rect(cx - 100, cy - 55, 200, 110, 8);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);

    // Result title
    p.textSize(22);
    p.fill(failed ? 220 : 100, failed ? 60 : 230, failed ? 60 : 120);
    p.text(failed ? "FAIL" : "CLEAR!", cx, cy - 30);

    // Score
    p.textSize(13);
    p.fill(220, 210, 255);
    p.text(`SCORE  ${score.toString().padStart(7, "0")}`, cx, cy + 2);

    // Grade
    const grade =
        score > 50000 ? "S" :
        score > 30000 ? "A" :
        score > 15000 ? "B" :
        score > 5000  ? "C" : "D";
    p.textSize(20);
    p.fill(255, 240, 80);
    p.text(grade, cx, cy + 26);

    // Prompt
    p.textSize(8);
    p.fill(110, 100, 140);
    p.text("A to replay   ·   hold START to exit", cx, cy + 50);

    if (input.aPressed) resetGame();
}

// ── Module ─────────────────────────────────────────────────────────────────────

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
        activeNotes = [];
        judgments   = [];
        ctx.audio.stop();
    },
};

export default dj;
