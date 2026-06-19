// Saber — Beat Saber-lite for the RCade arcade cabinet.
// Single-lane: notes fly down toward a hit line at the bottom of the canvas.
// Each note shows a hand (A=blue, B=orange) and a slash direction (joystick arrow).
// To hit: hold/flick the joystick in the note's direction AND press the matching button
// within ±0.5 beats. "Both" notes require A+B simultaneously.
//
// States: PLAYING → RESULT. No chart select (single chart).

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHART_SABER } from "./chart";
import type { NoteEvent, ActiveNote, Button } from "./notes";
import {
    BUTTON_COLOR, BOTH_COLOR,
    CX, HIT_LINE_Y, LANE_TOP_Y,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS,
    DIRECTION_ARROW,
    noteY,
} from "./notes";

// ── Constants ──────────────────────────────────────────────────────────────────

const LANE_WIDTH = 60;
const NOTE_RADIUS = 14;
const ARROW_SIZE = 8;

// ── Module-level state (reset in init/startGame) ──────────────────────────────

type State = "PLAYING" | "RESULT";

interface Judgment { text: string; frame: number; }

let ctx: GameContext;
let p: p5;

let state: State = "PLAYING";
let activeNotes: ActiveNote[] = [];
let chartIndex = 0;
let score = 0;
let combo = 0;
let life = 1.0;
let failed = false;
let judgments: Judgment[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function pushJudgment(text: string): void {
    judgments.push({ text, frame: p.frameCount });
}

function registerHit(points: number, quality: string, note: ActiveNote): void {
    combo++;
    score += points * combo;
    pushJudgment(quality);
    note.hit = true;
}

function registerMiss(note: ActiveNote): void {
    combo = 0;
    life = Math.max(0, life - 0.08);
    pushJudgment("MISS");
    note.missed = true;
}

function startGame(): void {
    activeNotes = [];
    chartIndex = 0;
    score = 0;
    combo = 0;
    life = 1.0;
    failed = false;
    judgments = [];
    state = "PLAYING";
    void ctx.audio.play(0);
}

// ── Game Logic ─────────────────────────────────────────────────────────────────

function spawnNotes(currentBeat: number): void {
    while (chartIndex < CHART_SABER.length) {
        const ev = CHART_SABER[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            activeNotes.push({ event: ev, hit: false, missed: false });
            chartIndex++;
        } else {
            break;
        }
    }
}

function evaluateNotes(currentBeat: number, input: InputSnapshot): void {
    for (const note of activeNotes) {
        if (note.hit || note.missed) continue;
        const { event: ev } = note;
        const beatDiff = currentBeat - ev.beat;

        const dirMatch = input.direction === ev.direction;
        const withinWindow = Math.abs(beatDiff) <= HIT_WINDOW_BEATS;

        if (ev.both) {
            // Both-button note: A+B pressed simultaneously with correct direction
            const bothPressed = input.aPressed && input.bPressed;
            const aOrB = input.aPressed || input.bPressed;
            if (withinWindow && dirMatch && bothPressed) {
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.6;
                registerHit(perfect ? 500 : 200, perfect ? "PERFECT" : "GOOD", note);
            } else if (beatDiff > HIT_WINDOW_BEATS) {
                registerMiss(note);
            } else if (withinWindow && aOrB && !bothPressed) {
                // Player pressed only one — don't auto-miss yet, let them add the other
            }
        } else {
            const buttonPressed = ev.button === "A" ? input.aPressed : input.bPressed;
            if (withinWindow && dirMatch && buttonPressed) {
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.6;
                registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", note);
            } else if (beatDiff > HIT_WINDOW_BEATS) {
                registerMiss(note);
            }
        }
    }
    // Prune old notes
    activeNotes = activeNotes.filter(n => currentBeat - n.event.beat < LOOKAHEAD_BEATS + 1);
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function drawArrow(x: number, y: number, ev: NoteEvent): void {
    const [adx, ady] = DIRECTION_ARROW[ev.direction];
    const len = ARROW_SIZE;

    // Arrow shaft
    const tipX = x + adx * len;
    const tipY = y + ady * len;
    const tailX = x - adx * (len * 0.5);
    const tailY = y - ady * (len * 0.5);

    p.strokeWeight(2.5);
    p.stroke(255, 255, 255, 200);
    p.line(tailX, tailY, tipX, tipY);

    // Arrowhead (two small lines forming a V)
    const headLen = 5;
    // Perpendicular components for the arrowhead wings
    const px2 = -ady;
    const py2 = adx;

    p.line(tipX, tipY, tipX - adx * headLen + px2 * headLen * 0.6,
                       tipY - ady * headLen + py2 * headLen * 0.6);
    p.line(tipX, tipY, tipX - adx * headLen - px2 * headLen * 0.6,
                       tipY - ady * headLen - py2 * headLen * 0.6);
}

function drawNote(note: ActiveNote, currentBeat: number): void {
    if (note.hit || note.missed) return;
    const { event: ev } = note;
    const y = noteY(ev.beat, currentBeat);

    if (y < LANE_TOP_Y - NOTE_RADIUS || y > HIT_LINE_Y + NOTE_RADIUS * 2) return;

    const [cr, cg, cb] = ev.both ? BOTH_COLOR : BUTTON_COLOR[ev.button as Button];

    // Note body
    p.fill(cr, cg, cb);
    p.stroke(255, 255, 255, 180);
    p.strokeWeight(2);
    p.ellipse(CX, y, NOTE_RADIUS * 2, NOTE_RADIUS * 2);

    // Inner lighter highlight ring
    p.noFill();
    p.stroke(255, 255, 255, 60);
    p.strokeWeight(1);
    p.ellipse(CX, y, NOTE_RADIUS * 1.3, NOTE_RADIUS * 1.3);

    // Button label (A or B) — small text inside note
    p.noStroke();
    p.fill(255, 255, 255, 220);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(9);
    if (ev.both) {
        p.text("AB", CX, y + 1);
    } else {
        p.text(ev.button, CX, y + 1);
    }

    // Direction arrow on top of note
    drawArrow(CX, y, ev);
}

function drawLane(currentBeat: number): void {
    p.background(10, 6, 20);

    // Lane track lines
    const laneLeft  = CX - LANE_WIDTH / 2;
    const laneRight = CX + LANE_WIDTH / 2;

    // Scrolling beat lines
    const beatPx = (HIT_LINE_Y - LANE_TOP_Y) / LOOKAHEAD_BEATS;
    const scroll = (currentBeat % 1) * beatPx;
    for (let k = 0; k < LOOKAHEAD_BEATS + 1; k++) {
        const ly = HIT_LINE_Y - k * beatPx + scroll;
        if (ly < LANE_TOP_Y || ly > HIT_LINE_Y + 5) continue;
        const alpha = p.map(ly, LANE_TOP_Y, HIT_LINE_Y, 20, 55);
        p.stroke(60, 50, 100, alpha);
        p.strokeWeight(0.5);
        p.line(laneLeft, ly, laneRight, ly);
    }

    // Lane side rails
    p.stroke(60, 50, 110, 140);
    p.strokeWeight(1.5);
    p.line(laneLeft, LANE_TOP_Y, laneLeft, HIT_LINE_Y + 6);
    p.line(laneRight, LANE_TOP_Y, laneRight, HIT_LINE_Y + 6);

    // Hit line
    p.stroke(160, 130, 240);
    p.strokeWeight(2.5);
    p.line(laneLeft - 4, HIT_LINE_Y, laneRight + 4, HIT_LINE_Y);

    // Hit zone brackets
    p.stroke(180, 150, 255, 200);
    p.strokeWeight(2);
    const bw = 8, bh = 10;
    // Left bracket
    p.line(laneLeft - 4,      HIT_LINE_Y - bh, laneLeft - 4,      HIT_LINE_Y);
    p.line(laneLeft - 4,      HIT_LINE_Y,      laneLeft - 4 + bw, HIT_LINE_Y);
    // Right bracket
    p.line(laneRight + 4,     HIT_LINE_Y - bh, laneRight + 4,     HIT_LINE_Y);
    p.line(laneRight + 4,     HIT_LINE_Y,      laneRight + 4 - bw,HIT_LINE_Y);

    // Center target dot
    p.fill(180, 150, 255, 120);
    p.noStroke();
    p.ellipse(CX, HIT_LINE_Y, 6, 6);
}

function drawInputIndicator(input: InputSnapshot): void {
    const ox = 10, oy = 220, pip = 5;
    p.noStroke();

    // D-pad indicator
    const arms: [string, number, number][] = [
        ["UP",    0,       -pip * 1.6],
        ["DOWN",  0,        pip * 1.6],
        ["LEFT", -pip * 1.6, 0],
        ["RIGHT", pip * 1.6, 0],
    ];
    for (const [dir, dx, dy] of arms) {
        const active = input.direction === dir ||
            (dir === "UP"    && (input.direction === "UP_LEFT"   || input.direction === "UP_RIGHT")) ||
            (dir === "DOWN"  && (input.direction === "DOWN_LEFT" || input.direction === "DOWN_RIGHT")) ||
            (dir === "LEFT"  && (input.direction === "UP_LEFT"   || input.direction === "DOWN_LEFT")) ||
            (dir === "RIGHT" && (input.direction === "UP_RIGHT"  || input.direction === "DOWN_RIGHT"));
        p.fill(active ? 220 : 45);
        p.rect(ox + dx - 2.5, oy + dy - 2.5, 5, 5, 1);
    }

    // Button A (blue)
    p.fill(input.aHeld ? BUTTON_COLOR.A : [40, 40, 55]);
    p.ellipse(ox + 24, oy, 9, 9);
    p.fill(255, 255, 255, 180);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(6);
    p.text("A", ox + 24, oy + 0.5);

    // Button B (orange)
    p.fill(input.bHeld ? BUTTON_COLOR.B : [40, 40, 55]);
    p.ellipse(ox + 36, oy, 9, 9);
    p.fill(255, 255, 255, 180);
    p.text("B", ox + 36, oy + 0.5);
}

function drawHUD(): void {
    // Life bar (above hit line, left)
    const barW = 110;
    const barX = CX - LANE_WIDTH / 2 - barW - 8;
    const barY = HIT_LINE_Y - 8;
    p.noStroke();
    p.fill(30, 22, 48);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5
        ? p.color(80, 200, 120)
        : life > 0.25
            ? p.color(230, 180, 40)
            : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    // Score (top right)
    p.fill(200, 195, 220);
    p.noStroke();
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), 334, 4);

    // Combo (top left)
    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 4);
    }

    // Judgment popups — shown centered above the hit line
    judgments = judgments.filter(j => p.frameCount - j.frame < 50);
    for (const j of judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 25, 50, 255, 0);
        const dy = p.map(age, 0, 50, 0, -18);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(13);
        if (j.text === "PERFECT")     p.fill(255, 240, 80, alpha);
        else if (j.text === "GOOD")   p.fill(80, 220, 120, alpha);
        else                          p.fill(255, 80, 80, alpha);
        p.noStroke();
        p.text(j.text, CX, HIT_LINE_Y - 30 + dy);
    }
}

// ── Screens ────────────────────────────────────────────────────────────────────

function drawPlaying(input: InputSnapshot): void {
    const cb = ctx.beatNow();

    drawLane(cb);
    spawnNotes(cb);
    evaluateNotes(cb, input);

    // Draw notes back-to-front (farthest first = top of lane)
    for (let i = activeNotes.length - 1; i >= 0; i--) {
        drawNote(activeNotes[i], cb);
    }

    drawInputIndicator(input);
    drawHUD();

    if (life <= 0) {
        failed = true;
        ctx.audio.stop();
        state = "RESULT";
    }
    if (cb >= SONG_LENGTH_BEATS) {
        ctx.audio.stop();
        state = "RESULT";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(10, 6, 20);

    // Draw a simple lane silhouette for context
    const laneLeft  = CX - LANE_WIDTH / 2;
    const laneRight = CX + LANE_WIDTH / 2;
    p.stroke(40, 32, 70, 100);
    p.strokeWeight(1);
    p.line(laneLeft,  LANE_TOP_Y, laneLeft,  HIT_LINE_Y);
    p.line(laneRight, LANE_TOP_Y, laneRight, HIT_LINE_Y);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);

    // Result header
    p.fill(220, 210, 255);
    p.textSize(20);
    p.text(failed ? "FAIL" : "CLEAR!", CX, 85);

    // Score
    p.textSize(13);
    p.fill(180, 165, 215);
    p.text(`SCORE`, CX, 116);
    p.fill(240, 235, 255);
    p.textSize(16);
    p.text(score.toString().padStart(7, "0"), CX, 136);

    // Final combo hint
    p.textSize(10);
    p.fill(140, 130, 170);
    p.text(`MAX COMBO  ${combo}×`, CX, 158);

    // Prompt
    p.fill(100, 90, 130);
    p.textSize(8);
    p.text("A to replay   ·   hold START to exit", CX, 200);

    if (input.aPressed) {
        startGame();
    }
}

// ── Module ─────────────────────────────────────────────────────────────────────

const saber: GameModule = {
    id: "saber",
    title: "Saber",
    author: "kpthill",
    init(c) {
        ctx = c;
        p = c.p;
        startGame();
    },
    frame(input) {
        switch (state) {
            case "PLAYING": drawPlaying(input); break;
            case "RESULT":  drawResult(input);  break;
        }
    },
    teardown() {
        activeNotes = [];
        judgments = [];
        ctx.audio.stop();
    },
};

export default saber;
