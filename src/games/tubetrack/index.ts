// TubeTrack — Run-3-style rhythm tube game.
//
// Camera looks DOWN a cylindrical tube. Notes ride the tube wall toward the camera —
// large ring = near camera = the hit plane. A runner/reticle is anchored at 6-o'clock
// on the front ring. The player ROTATES THE TUBE (spinner or joystick fallback) to
// line each note under the runner, then presses A as it reaches the front ring.
//
// States: SELECT → PLAYING → RESULT. The host handles title and hold-START quit.

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHARTS } from "./chart";
import type { NoteEvent } from "./notes";
import type { ActiveNote } from "./notes";
import {
    CX, CY,
    FRONT_RING_RADIUS,
    DEPTH_RING_COUNT,
    RUNNER_ANGLE,
    LOOKAHEAD_BEATS,
    HIT_WINDOW_BEATS,
    ALIGN_TOLERANCE,
    NOTE_COLOR,
    noteScreenRadius,
} from "./notes";

// ── State ──────────────────────────────────────────────────────────────────────

type GameState = "SELECT" | "PLAYING" | "RESULT";

interface Judgment {
    text: string;
    frame: number;
    /** Screen x,y where to draw the popup */
    x: number;
    y: number;
}

// Module-level (reset on init so no cross-game pollution)
let ctx: GameContext;
let p: p5;

let gameState: GameState = "SELECT";
let activeChart: NoteEvent[] = CHARTS[0].notes;
let activeNotes: ActiveNote[] = [];
let chartIndex = 0;

let score = 0;
let combo = 0;
let life = 1.0;
let failed = false;
let judgments: Judgment[] = [];

let selectedChart = 0;
let menuLatch = false;

// Tube rotation angle: the tube is drawn with all notes rotated by tubeRotation.
// The runner stays fixed at RUNNER_ANGLE; we shift the tube so notes appear
// to move under the runner as the player spins.
let tubeRotation = 0;

// Joystick rotation speed (radians per second, used when no spinner)
const JOYSTICK_ROT_SPEED = Math.PI * 1.8;  // ~0.9 rev/s

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Screen coordinates of a point at angle+radius on the tube face. */
function tubePoint(angle: number, r: number): [number, number] {
    return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
}

/**
 * Effective screen angle of a note given the current tube rotation.
 * The tube rotates, so a note's visual angle = note.tubeAngle + tubeRotation.
 */
function noteScreenAngle(noteAngle: number): number {
    return noteAngle + tubeRotation;
}

/**
 * Angular distance between two angles, result in (-π, π].
 */
function angleDiff(a: number, b: number): number {
    let d = ((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return d;
}

function pushJudgment(text: string): void {
    // Show judgment at the runner position on the front ring
    const [x, y] = tubePoint(RUNNER_ANGLE, FRONT_RING_RADIUS - 20);
    judgments.push({ text, frame: p.frameCount, x, y });
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

function startChart(chart: NoteEvent[]): void {
    activeChart = chart;
    activeNotes = [];
    chartIndex = 0;
    score = 0;
    combo = 0;
    life = 1.0;
    failed = false;
    judgments = [];
    tubeRotation = 0;
    gameState = "PLAYING";
    void ctx.audio.play(0);
}

// ── Game logic ─────────────────────────────────────────────────────────────────

function updateRotation(input: InputSnapshot, dt: number): void {
    if (input.spinnerConnected) {
        // Each step = 1/24 revolution (standard spinner resolution)
        tubeRotation += input.spinnerDelta * ((Math.PI * 2) / 24);
    } else {
        // Joystick fallback: LEFT/RIGHT rotate the tube
        const dtSec = dt / 1000;
        if (input.direction === "LEFT"  || input.direction === "DOWN_LEFT"  || input.direction === "UP_LEFT") {
            tubeRotation -= JOYSTICK_ROT_SPEED * dtSec;
        } else if (input.direction === "RIGHT" || input.direction === "DOWN_RIGHT" || input.direction === "UP_RIGHT") {
            tubeRotation += JOYSTICK_ROT_SPEED * dtSec;
        }
    }
}

function spawnNotes(currentBeat: number): void {
    while (chartIndex < activeChart.length) {
        const ev = activeChart[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            activeNotes.push({ event: ev, hit: false, missed: false });
            chartIndex++;
        } else break;
    }
}

function evaluateNotes(currentBeat: number, input: InputSnapshot): void {
    for (const note of activeNotes) {
        if (note.hit || note.missed) continue;
        const { event: ev } = note;
        const beatDiff = currentBeat - ev.beat;

        // Check angular alignment: the note's visual angle vs runner angle
        const screenAngle = noteScreenAngle(ev.tubeAngle);
        const aligned = Math.abs(angleDiff(screenAngle, RUNNER_ANGLE)) <= ALIGN_TOLERANCE;

        if (input.aPressed && aligned && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
            const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.5;
            registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", note);
        } else if (beatDiff > HIT_WINDOW_BEATS) {
            registerMiss(note);
        }
    }
    // Cull old notes (past the hit window by a safe margin)
    activeNotes = activeNotes.filter(n => currentBeat - n.event.beat < LOOKAHEAD_BEATS + 1);
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function drawTube(): void {
    p.background(8, 5, 20);

    // Depth rings: concentric circles from center outward to front ring
    // Smaller = deeper; front ring is the biggest (FRONT_RING_RADIUS)
    p.noFill();
    for (let i = 0; i <= DEPTH_RING_COUNT; i++) {
        const t = i / DEPTH_RING_COUNT;
        const r = t * FRONT_RING_RADIUS;
        const alpha = p.map(t, 0, 1, 12, 55);
        p.stroke(50, 40, 110, alpha);
        p.strokeWeight(i === DEPTH_RING_COUNT ? 0 : 0.5);  // skip front ring here; drawn separately
        if (r > 0) p.ellipse(CX, CY, r * 2, r * 2);
    }

    // Longitudinal guide lines along the tube wall at 8 angular positions
    const guideAngles = [0, Math.PI/4, Math.PI/2, (3*Math.PI)/4,
                         Math.PI, (5*Math.PI)/4, (3*Math.PI)/2, (7*Math.PI)/4];
    p.strokeWeight(0.5);
    for (const a of guideAngles) {
        const rotA = a + tubeRotation;
        p.stroke(35, 28, 70, 120);
        p.line(CX, CY,
               CX + Math.cos(rotA) * FRONT_RING_RADIUS,
               CY + Math.sin(rotA) * FRONT_RING_RADIUS);
    }

    // Front ring (hit plane) — bright and prominent
    p.stroke(120, 90, 200);
    p.strokeWeight(2);
    p.noFill();
    p.ellipse(CX, CY, FRONT_RING_RADIUS * 2, FRONT_RING_RADIUS * 2);

    // Runner marker at fixed 6-o'clock on the front ring
    const [rx, ry] = tubePoint(RUNNER_ANGLE, FRONT_RING_RADIUS);
    // Outer glow
    p.fill(200, 255, 200, 60);
    p.noStroke();
    p.ellipse(rx, ry, 20, 20);
    // Inner dot
    p.fill(160, 255, 160);
    p.ellipse(rx, ry, 10, 10);
    // Tick line from ring inward to mark alignment zone
    const [ix, iy] = tubePoint(RUNNER_ANGLE, FRONT_RING_RADIUS - 14);
    p.stroke(160, 255, 160, 180);
    p.strokeWeight(1.5);
    p.line(rx, ry, ix, iy);
}

function drawNotes(currentBeat: number): void {
    const [nr, ng, nb] = NOTE_COLOR;

    for (const note of activeNotes) {
        if (note.missed) continue;
        if (note.hit) continue;

        const { event: ev } = note;
        const r = noteScreenRadius(ev.beat, currentBeat);

        // Only draw notes that are between vanishing point and just past the front ring
        if (r < 1 || r > FRONT_RING_RADIUS + 18) continue;

        const screenAngle = noteScreenAngle(ev.tubeAngle);
        const clampedR = Math.min(r, FRONT_RING_RADIUS);
        const [nx, ny] = tubePoint(screenAngle, clampedR);

        // Note size grows as it approaches the camera (front ring)
        const noteSize = p.map(r, 0, FRONT_RING_RADIUS, 4, 14);

        // Bright flash when very close to hit plane
        const nearFront = r > FRONT_RING_RADIUS * 0.85;
        const alpha = nearFront ? 255 : p.map(r, 0, FRONT_RING_RADIUS * 0.6, 120, 220);

        // Check alignment for visual feedback
        const screenAngleNorm = noteScreenAngle(ev.tubeAngle);
        const aligned = Math.abs(angleDiff(screenAngleNorm, RUNNER_ANGLE)) <= ALIGN_TOLERANCE;

        if (aligned && nearFront) {
            // Highlight: bright with glow
            p.fill(255, 255, 180, 80);
            p.noStroke();
            p.ellipse(nx, ny, noteSize + 8, noteSize + 8);
            p.fill(255, 255, 120);
            p.stroke(255, 255, 255, 200);
        } else {
            p.fill(nr, ng, nb, alpha);
            p.stroke(255, 255, 255, alpha * 0.6);
        }
        p.strokeWeight(1.2);
        p.ellipse(nx, ny, noteSize, noteSize);
    }
}

function drawInputIndicator(input: InputSnapshot): void {
    // Small indicator bottom-left: shows rotation direction and A button
    const ox = 10, oy = 245;
    p.noStroke();
    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(7);

    if (input.spinnerConnected) {
        p.fill(input.spinnerDelta !== 0 ? 200 : 60, 150, 200);
        p.text("SPIN", ox, oy);
    } else {
        const leftActive = input.direction === "LEFT" || input.direction === "DOWN_LEFT" || input.direction === "UP_LEFT";
        const rightActive = input.direction === "RIGHT" || input.direction === "DOWN_RIGHT" || input.direction === "UP_RIGHT";
        p.fill(leftActive ? 200 : 60);
        p.text("◄", ox, oy);
        p.fill(rightActive ? 200 : 60);
        p.text("►", ox + 14, oy);
    }

    // A button
    p.fill(input.aHeld ? 120 : 40, input.aHeld ? 200 : 40, input.aHeld ? 255 : 80);
    p.ellipse(ox + 34, oy, 9, 9);
    p.fill(input.aHeld ? 255 : 100);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(6);
    p.text("A", ox + 34, oy);
}

function drawHUD(): void {
    // Life bar across the bottom below the tube
    const barW = FRONT_RING_RADIUS * 2;
    const barX = CX - FRONT_RING_RADIUS;
    const barY = CY + FRONT_RING_RADIUS + 8;
    p.noStroke();
    p.fill(30, 22, 50);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5
        ? p.color(80, 200, 120)
        : life > 0.25
            ? p.color(230, 180, 40)
            : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    // Score top-right
    p.fill(200, 195, 220);
    p.noStroke();
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), 334, 4);

    // Combo top-left
    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 4);
    }

    // Judgment popups
    judgments = judgments.filter(j => p.frameCount - j.frame < 55);
    for (const j of judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 28, 55, 255, 0);
        const dy = p.map(age, 0, 55, 0, -16);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(11);
        if (j.text === "PERFECT")      p.fill(255, 240, 80, alpha);
        else if (j.text === "GOOD")    p.fill(80, 220, 120, alpha);
        else                           p.fill(255, 80, 80, alpha);
        p.noStroke();
        p.text(j.text, j.x, j.y + dy);
    }
}

// ── Screens ────────────────────────────────────────────────────────────────────

function drawSelect(input: InputSnapshot): void {
    p.background(8, 5, 20);

    // Decorative rings
    p.noFill();
    for (let r = 20; r <= FRONT_RING_RADIUS; r += 20) {
        p.stroke(50, 40, 100, p.map(r, 0, FRONT_RING_RADIUS, 15, 55));
        p.strokeWeight(r === FRONT_RING_RADIUS ? 1.5 : 0.5);
        p.ellipse(CX, CY, r * 2, r * 2);
    }
    // Runner dot
    const [rx, ry] = tubePoint(RUNNER_ANGLE, FRONT_RING_RADIUS);
    p.fill(160, 255, 160);
    p.noStroke();
    p.ellipse(rx, ry, 8, 8);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(140, 130, 170);
    p.textSize(9);
    p.text("TUBE TRACK", CX, 28);

    p.fill(220, 210, 255);
    p.textSize(13);
    p.text("SELECT CHART", CX, 50);

    for (let i = 0; i < CHARTS.length; i++) {
        const y = 95 + i * 32;
        const sel = i === selectedChart;
        p.fill(sel ? 230 : 100, sel ? 215 : 100, sel ? 255 : 135);
        p.textSize(sel ? 14 : 11);
        p.text((sel ? "> " : "  ") + CHARTS[i].name, CX, y);
    }

    p.fill(100, 90, 130);
    p.textSize(8);
    p.text("UP/DN to choose   A to play", CX, 195);
    p.text("Rotate tube to align notes · press A on beat", CX, 207);

    // Menu navigation
    const dirUp   = input.direction === "UP";
    const dirDown  = input.direction === "DOWN";
    if (!dirUp && !dirDown) menuLatch = false;
    else if (!menuLatch) {
        menuLatch = true;
        if (dirUp)   selectedChart = (selectedChart - 1 + CHARTS.length) % CHARTS.length;
        if (dirDown) selectedChart = (selectedChart + 1) % CHARTS.length;
    }

    if (input.aPressed) startChart(CHARTS[selectedChart].notes);
}

function drawPlaying(input: InputSnapshot, dt: number): void {
    const cb = ctx.beatNow();

    updateRotation(input, dt);
    spawnNotes(cb);
    evaluateNotes(cb, input);

    drawTube();
    drawNotes(cb);
    drawInputIndicator(input);
    drawHUD();

    if (life <= 0) {
        failed = true;
        ctx.audio.stop();
        gameState = "RESULT";
    }
    if (cb >= SONG_LENGTH_BEATS) {
        ctx.audio.stop();
        gameState = "RESULT";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(8, 5, 20);

    // Decorative tube rings
    p.noFill();
    p.stroke(120, 90, 200);
    p.strokeWeight(2);
    p.ellipse(CX, CY, FRONT_RING_RADIUS * 2, FRONT_RING_RADIUS * 2);
    for (let r = 30; r < FRONT_RING_RADIUS; r += 30) {
        p.stroke(50, 40, 110, 40);
        p.strokeWeight(0.5);
        p.ellipse(CX, CY, r * 2, r * 2);
    }

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);

    p.fill(failed ? p.color(220, 60, 60) : p.color(160, 255, 160));
    p.textSize(22);
    p.text(failed ? "FAIL" : "CLEAR!", CX, CY - 28);

    p.fill(220, 210, 255);
    p.textSize(12);
    p.text(`SCORE: ${score}`, CX, CY + 8);

    p.fill(140, 130, 170);
    p.textSize(9);
    p.text("A to replay   ·   hold START to exit", CX, CY + 30);

    if (input.aPressed) {
        gameState = "SELECT";
    }
}

// ── Module ─────────────────────────────────────────────────────────────────────

const tubetrack: GameModule = {
    id: "tubetrack",
    title: "Tube Track",
    author: "kpthill",

    init(c) {
        ctx = c;
        p = c.p;
        gameState = "SELECT";
        selectedChart = 0;
        menuLatch = false;
        tubeRotation = 0;
        activeNotes = [];
        judgments = [];
        score = 0;
        combo = 0;
        life = 1.0;
        failed = false;
        chartIndex = 0;
    },

    frame(input: InputSnapshot, dt: number) {
        switch (gameState) {
            case "SELECT":  drawSelect(input);       break;
            case "PLAYING": drawPlaying(input, dt);  break;
            case "RESULT":  drawResult(input);       break;
        }
    },

    teardown() {
        activeNotes = [];
        judgments = [];
        ctx.audio.stop();
    },
};

export default tubetrack;
