// Tube Run — a Run-3-style rhythm platformer inside a rotating tube.
//
// The camera looks forward down a cylindrical tube rendered as concentric
// ellipses shrinking toward a vanishing point.  The runner sits at a fixed
// angular position on the outermost (front) ring; the tube ROTATES so the
// runner rides on the floor.
//
// Beat events:
//   "gap"    → the floor is missing at the current angle; ROTATE to safety.
//   "jump"   → an obstacle is on the floor; press A to jump over it.
//   "tunnel" → the tube narrows to a specific safe arc; ROTATE to it.
//
// State machine: SELECT → PLAYING → RESULT
// Rotation input: spinnerDelta (preferred) or joystick LEFT/RIGHT fallback.

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHARTS } from "./chart";
import type { ActiveEvent } from "./notes";
import {
    CX, CY, W, H,
    FRONT_RING_RADIUS, VP_RADIUS, BEAT_PX,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS,
    SAFE_ARC_HALF, RUNNER_DOT_R,
    JUDGMENT_COLOR, eventRadius,
} from "./notes";

// ── Module-level state (reset in init / teardown) ─────────────────────────────

let ctx: GameContext;
let p: p5;

type GameState = "SELECT" | "PLAYING" | "RESULT";
let gameState: GameState = "SELECT";

// Chart
let activeEvents: ActiveEvent[] = [];
let chartIndex  = 0;       // next event to spawn

// Scores / life
let score  = 0;
let combo  = 0;
let life   = 1.0;
let failed = false;

// Tube rotation (radians; 0 = runner at 3-o'clock, PI/2 = runner at 6-o'clock)
// Runner is visually pinned at the bottom of the canvas.  We rotate the TUBE
// world, not the runner.  tubeAngle is the current rotation of the tube.
// The safe angle on each event is in TUBE space; we compare with tubeAngle.
let tubeAngle = Math.PI / 2;  // default: runner at 6-o'clock (bottom)

// Jump state
let jumpBeat     = -99;    // beat when jump started
const JUMP_BEATS = 0.8;    // how long the jump lasts (in beats)
let jumpHeld     = false;

// Visual beat pulse
let lastBeat = 0;

// Menu
let selectedChart = 0;
let menuLatch     = false;

// Judgments
interface Judgment { text: string; frame: number; }
let judgments: Judgment[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Current jump height (0 = on ground, peaks at 1). */
function jumpPhase(currentBeat: number): number {
    const elapsed = currentBeat - jumpBeat;
    if (elapsed < 0 || elapsed > JUMP_BEATS) return 0;
    // Parabolic arc peaking at midpoint
    const t = elapsed / JUMP_BEATS;
    return Math.sin(t * Math.PI);
}

/** Is the runner currently airborne? */
function isAirborne(currentBeat: number): boolean {
    return jumpPhase(currentBeat) > 0.05;
}

/** Angular difference, normalised to [-PI, PI]. */
function angleDiff(a: number, b: number): number {
    let d = (a - b) % (Math.PI * 2);
    if (d >  Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

function pushJudgment(text: string): void {
    judgments.push({ text, frame: p.frameCount });
}

function registerHit(points: number, quality: string, ev: ActiveEvent): void {
    combo++;
    score += points * combo;
    pushJudgment(quality);
    ev.resolved = true;
}

function registerMiss(ev: ActiveEvent): void {
    combo = 0;
    life  = Math.max(0, life - 0.1);
    pushJudgment("MISS");
    ev.missed = true;
}

// ── Init / chart start ────────────────────────────────────────────────────────

function startChart(chartIdx: number): void {
    activeEvents = [];
    chartIndex   = 0;
    score        = 0;
    combo        = 0;
    life         = 1.0;
    failed       = false;
    judgments    = [];
    tubeAngle    = Math.PI / 2;
    jumpBeat     = -99;
    jumpHeld     = false;
    lastBeat     = 0;
    selectedChart = chartIdx;
    gameState    = "PLAYING";
    void ctx.audio.play(0);
}

// ── Game logic ────────────────────────────────────────────────────────────────

function spawnEvents(currentBeat: number): void {
    const chart = CHARTS[selectedChart].events;
    while (chartIndex < chart.length) {
        const ev = chart[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            activeEvents.push({ event: ev, resolved: false, missed: false, jumped: false });
            chartIndex++;
        } else break;
    }
}

function evaluateEvents(currentBeat: number, input: InputSnapshot): void {
    for (const ae of activeEvents) {
        if (ae.resolved || ae.missed) continue;
        const { event: ev } = ae;
        const beatDiff = currentBeat - ev.beat;

        // Past the window — MISS
        if (beatDiff > HIT_WINDOW_BEATS) {
            registerMiss(ae);
            continue;
        }
        // Not yet in window
        if (beatDiff < -HIT_WINDOW_BEATS) continue;

        if (ev.type === "jump") {
            // Player must press A (or be mid-jump) to dodge the obstacle
            if (input.aPressed && !jumpHeld) {
                jumpBeat  = currentBeat;
                jumpHeld  = true;
                ae.jumped = true;
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.5;
                registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", ae);
            } else if (isAirborne(currentBeat)) {
                // Already airborne from a prior press — auto-clear if timing is close
                ae.jumped = true;
                registerHit(100, "GOOD", ae);
            }
        } else {
            // "gap" or "tunnel": player must rotate so tubeAngle ≈ ev.safeAngle
            const diff = Math.abs(angleDiff(tubeAngle, ev.safeAngle));
            if (diff <= SAFE_ARC_HALF) {
                const perfect = diff < SAFE_ARC_HALF * 0.4 && Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.5;
                registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", ae);
            }
            // else: keep waiting — player still has time to rotate
        }
    }

    // Prune old events
    activeEvents = activeEvents.filter(ae => currentBeat - ae.event.beat < LOOKAHEAD_BEATS + 2);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/** Draw the tube background: concentric ellipses receding to vanishing point. */
function drawTubeBackground(currentBeat: number): void {
    p.background(10, 6, 20);

    // Beat pulse on the front ring
    const beatFrac = currentBeat % 1;
    const pulse    = beatFrac < 0.12 ? (1 - beatFrac / 0.12) : 0;

    // Draw scroll rings (approach lines at 1-beat intervals)
    const scroll = (currentBeat % 1) * BEAT_PX;
    p.noFill();
    for (let k = 0; k <= LOOKAHEAD_BEATS + 1; k++) {
        const r = FRONT_RING_RADIUS - (k * BEAT_PX - scroll);
        if (r < VP_RADIUS || r > FRONT_RING_RADIUS + 2) continue;
        const alpha = p.map(r, VP_RADIUS, FRONT_RING_RADIUS, 18, 55);
        p.stroke(55, 45, 100, alpha);
        p.strokeWeight(1);
        p.ellipse(CX, CY, r * 2, r * 2);
    }

    // Tube wall radial lines (8 lanes)
    p.strokeWeight(0.5);
    for (let i = 0; i < 8; i++) {
        const angle = tubeAngle + (i * Math.PI * 2) / 8;
        const xa = CX + Math.cos(angle) * VP_RADIUS;
        const ya = CY + Math.sin(angle) * VP_RADIUS;
        const xb = CX + Math.cos(angle) * FRONT_RING_RADIUS;
        const yb = CY + Math.sin(angle) * FRONT_RING_RADIUS;
        p.stroke(40, 30, 80, 100);
        p.line(xa, ya, xb, yb);
    }

    // Front ring (outermost, the "floor")
    const ringR = 220 + pulse * 35;
    const ringG = 170 + pulse * 40;
    const ringB = 255;
    p.stroke(ringR, ringG, ringB);
    p.strokeWeight(2);
    p.noFill();
    p.ellipse(CX, CY, FRONT_RING_RADIUS * 2, FRONT_RING_RADIUS * 2);

    // Vanishing point dot
    p.fill(ringR, ringG, ringB, 120);
    p.noStroke();
    p.ellipse(CX, CY, VP_RADIUS * 2, VP_RADIUS * 2);
}

/** Draw approaching event rings. */
function drawApproachRings(currentBeat: number): void {
    for (const ae of activeEvents) {
        if (ae.resolved || ae.missed) continue;
        const { event: ev } = ae;
        const r = eventRadius(ev.beat, currentBeat);
        if (r < VP_RADIUS || r > FRONT_RING_RADIUS + 20) continue;

        const [cr, cg, cb] = ev.color;
        const beatsLeft = ev.beat - currentBeat;
        const alpha = p.map(beatsLeft, 0, LOOKAHEAD_BEATS, 200, 50);

        if (ev.type === "jump") {
            // Draw a solid ring with obstacle bumps
            p.noFill();
            p.stroke(cr, cg, cb, alpha);
            p.strokeWeight(3);
            p.ellipse(CX, CY, r * 2, r * 2);
            // Obstacle marker: a rectangle protruding outward from floor position
            const floorAngle = Math.PI / 2;  // runner lives at bottom of canvas (6-o'clock)
            const sx = CX + Math.cos(floorAngle) * r;
            const sy = CY + Math.sin(floorAngle) * r;
            p.fill(cr, cg, cb, alpha);
            p.noStroke();
            p.rectMode(p.CENTER);
            p.rect(sx, sy, 10, 6, 2);
            p.rectMode(p.CORNER);
        } else if (ev.type === "gap") {
            // Draw a dashed ring with a gap at the danger zone and safe zone highlighted
            p.noFill();
            p.strokeWeight(3);

            // Draw safe arc in green
            const safeScreen = ev.safeAngle - tubeAngle + Math.PI / 2;
            p.stroke(80, 220, 80, alpha);
            drawArc(CX, CY, r, safeScreen - SAFE_ARC_HALF, safeScreen + SAFE_ARC_HALF);

            // Draw danger arcs in red (rest of the ring)
            p.stroke(cr, cg, cb, alpha * 0.7);
            p.strokeWeight(2);
            drawArc(CX, CY, r, safeScreen + SAFE_ARC_HALF, safeScreen - SAFE_ARC_HALF + Math.PI * 2);

        } else {
            // "tunnel": draw a narrow gap that player must fit through
            p.noFill();
            p.strokeWeight(2);
            const safeScreen = ev.safeAngle - tubeAngle + Math.PI / 2;
            // Walls (danger)
            p.stroke(cr, cg, cb, alpha);
            drawArc(CX, CY, r, safeScreen + SAFE_ARC_HALF, safeScreen - SAFE_ARC_HALF + Math.PI * 2);
            // Safe gap
            p.stroke(80, 255, 80, alpha);
            p.strokeWeight(3);
            drawArc(CX, CY, r, safeScreen - SAFE_ARC_HALF, safeScreen + SAFE_ARC_HALF);
        }
    }
}

/** Draw an arc of a circle (centre cx,cy, radius r, from angle a0 to a1 in radians). */
function drawArc(cx: number, cy: number, r: number, a0: number, a1: number): void {
    // Normalise so a1 > a0
    let end = a1;
    while (end < a0) end += Math.PI * 2;
    const steps = Math.max(2, Math.round(((end - a0) / (Math.PI * 2)) * 48));
    p.beginShape();
    for (let i = 0; i <= steps; i++) {
        const angle = a0 + (i / steps) * (end - a0);
        p.vertex(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    p.endShape();
}

/** Draw the runner avatar at the bottom of the front ring. */
function drawRunner(currentBeat: number): void {
    // Runner is always at screen-bottom of the front ring (6-o'clock = angle PI/2)
    const runnerAngle = Math.PI / 2;
    const jph = jumpPhase(currentBeat);
    // Jump lifts the runner inward (toward center) by up to 22 px
    const jumpLift = jph * 22;
    const r = FRONT_RING_RADIUS - jumpLift;
    const rx = CX + Math.cos(runnerAngle) * r;
    const ry = CY + Math.sin(runnerAngle) * r;

    // Shadow on ring
    p.noStroke();
    p.fill(0, 0, 0, 60);
    p.ellipse(CX + Math.cos(runnerAngle) * FRONT_RING_RADIUS,
              CY + Math.sin(runnerAngle) * FRONT_RING_RADIUS,
              10, 4);

    // Runner body
    const bodyColor: [number, number, number] = jph > 0.05
        ? [120, 220, 255]  // airborne: blue-white
        : [200, 180, 255]; // grounded: lavender
    p.fill(...bodyColor);
    p.stroke(255, 255, 255, 180);
    p.strokeWeight(1.5);
    p.ellipse(rx, ry, RUNNER_DOT_R * 2, RUNNER_DOT_R * 2);

    // Trail when jumping
    if (jph > 0.1) {
        for (let i = 1; i <= 3; i++) {
            const tr = FRONT_RING_RADIUS - (jph - i * 0.08) * 22;
            if (tr > FRONT_RING_RADIUS - 0.5) continue;
            const tx = CX + Math.cos(runnerAngle) * tr;
            const ty = CY + Math.sin(runnerAngle) * tr;
            p.noStroke();
            p.fill(120, 220, 255, 60 - i * 15);
            p.ellipse(tx, ty, (RUNNER_DOT_R - i) * 2, (RUNNER_DOT_R - i) * 2);
        }
    }
}

/** HUD: life bar, score, combo, judgments. */
function drawHUD(): void {
    // Life bar at bottom of canvas
    const barW = 220;
    const barX = CX - barW / 2;
    const barY = H - 14;
    p.noStroke();
    p.fill(30, 24, 50);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5
        ? p.color(80, 200, 120)
        : life > 0.25
            ? p.color(230, 180, 40)
            : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    // Score
    p.fill(200, 195, 220);
    p.noStroke();
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), W - 2, 4);

    // Combo
    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 4);
    }

    // Judgments
    judgments = judgments.filter(j => p.frameCount - j.frame < 55);
    for (const j of judgments) {
        const age   = p.frameCount - j.frame;
        const alpha = p.map(age, 30, 55, 255, 0);
        const dy    = p.map(age, 0, 55, 0, -18);
        const [jr, jg, jb] = JUDGMENT_COLOR[j.text] ?? [200, 200, 200];
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(12);
        p.fill(jr, jg, jb, alpha);
        p.text(j.text, CX, CY + 50 + dy);
    }
}

/** Minimal input indicator: bottom-left. */
function drawInputIndicator(input: InputSnapshot): void {
    const ox = 10, oy = H - 28;
    const pip = 4;

    // D-pad
    const arms: [string, number, number][] = [
        ["UP", 0, -pip * 1.5], ["DOWN", 0, pip * 1.5],
        ["LEFT", -pip * 1.5, 0], ["RIGHT", pip * 1.5, 0],
    ];
    for (const [dir, dx, dy] of arms) {
        const active =
            input.direction === dir ||
            (dir === "UP"    && (input.direction === "UP_LEFT"   || input.direction === "UP_RIGHT")) ||
            (dir === "DOWN"  && (input.direction === "DOWN_LEFT" || input.direction === "DOWN_RIGHT")) ||
            (dir === "LEFT"  && (input.direction === "UP_LEFT"   || input.direction === "DOWN_LEFT")) ||
            (dir === "RIGHT" && (input.direction === "UP_RIGHT"  || input.direction === "DOWN_RIGHT"));
        p.noStroke();
        p.fill(active ? 200 : 40);
        p.rect(ox + dx - 2, oy + dy - 2, 5, 5, 1);
    }
    // A button
    p.fill(input.aHeld ? 80 : 30, input.aHeld ? 180 : 30, input.aHeld ? 255 : 60);
    p.noStroke();
    p.ellipse(ox + 22, oy, 7, 7);
    // Spinner indicator
    if (input.spinnerConnected) {
        p.fill(100, 200, 80);
        p.noStroke();
        p.ellipse(ox + 33, oy, 5, 5);
    }
}

// ── Screens ───────────────────────────────────────────────────────────────────

function drawSelect(input: InputSnapshot): void {
    p.background(10, 6, 20);

    // Decorative concentric rings
    p.noFill();
    for (let r = 20; r <= FRONT_RING_RADIUS; r += 18) {
        const alpha = p.map(r, 0, FRONT_RING_RADIUS, 15, 55);
        p.stroke(60, 50, 110, alpha);
        p.strokeWeight(r === FRONT_RING_RADIUS ? 2 : 0.5);
        p.ellipse(CX, CY, r * 2, r * 2);
    }

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(140, 130, 180);
    p.textSize(9);
    p.text("TUBE RUN", CX, 28);
    p.fill(210, 200, 255);
    p.textSize(14);
    p.text("SELECT CHART", CX, 50);

    // Draw runner at bottom of demo rings
    p.fill(200, 180, 255);
    p.stroke(255, 255, 255, 160);
    p.strokeWeight(1.5);
    p.ellipse(CX, CY + FRONT_RING_RADIUS, RUNNER_DOT_R * 2, RUNNER_DOT_R * 2);

    for (let i = 0; i < CHARTS.length; i++) {
        const y = 100 + i * 32;
        const sel = i === selectedChart;
        p.fill(sel ? 230 : 110, sel ? 215 : 105, sel ? 255 : 145);
        p.textSize(sel ? 15 : 11);
        p.text((sel ? "> " : "  ") + CHARTS[i].name, CX, y);
    }

    p.fill(90, 80, 120);
    p.textSize(8);
    p.text("UP/DN to choose   A to start", CX, 195);
    p.text("Rotate tube with spinner or joystick L/R", CX, 207);
    p.text("Press A to JUMP", CX, 219);

    // Menu navigation
    const dirUp   = input.direction === "UP";
    const dirDown = input.direction === "DOWN";
    if (!dirUp && !dirDown) menuLatch = false;
    else if (!menuLatch) {
        menuLatch = true;
        if (dirUp)   selectedChart = (selectedChart - 1 + CHARTS.length) % CHARTS.length;
        if (dirDown) selectedChart = (selectedChart + 1) % CHARTS.length;
    }

    if (input.aPressed) startChart(selectedChart);
}

function drawPlaying(input: InputSnapshot, dt: number): void {
    const cb = ctx.beatNow();

    // ── Input: tube rotation ──────────────────────────────────────────────────
    if (input.spinnerConnected) {
        // Spinner: each step ~2° rotation (adjust sensitivity)
        tubeAngle += input.spinnerDelta * (Math.PI / 90);
    } else {
        // Joystick fallback: LEFT/RIGHT rotate the tube
        const rotateSpeed = (Math.PI / 180) * 180 * (dt / 1000); // 180°/sec
        if (input.direction === "LEFT"  || input.direction === "UP_LEFT"   || input.direction === "DOWN_LEFT") {
            tubeAngle -= rotateSpeed;
        }
        if (input.direction === "RIGHT" || input.direction === "UP_RIGHT"  || input.direction === "DOWN_RIGHT") {
            tubeAngle += rotateSpeed;
        }
    }

    // ── Input: jump ──────────────────────────────────────────────────────────
    if (input.aPressed && !isAirborne(cb)) {
        jumpBeat = cb;
        jumpHeld = true;
    }
    if (!input.aHeld) jumpHeld = false;

    // ── Beat pulse tracking ───────────────────────────────────────────────────
    const beat = Math.floor(cb);
    if (beat !== Math.floor(lastBeat)) lastBeat = cb;

    // ── Update & render ───────────────────────────────────────────────────────
    spawnEvents(cb);
    evaluateEvents(cb, input);
    drawTubeBackground(cb);
    drawApproachRings(cb);
    drawRunner(cb);
    drawInputIndicator(input);
    drawHUD();

    // Check failure/song end
    if (life <= 0) failed = true;
    if (cb >= SONG_LENGTH_BEATS || (failed && cb - jumpBeat > 2)) {
        ctx.audio.stop();
        gameState = "RESULT";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(10, 6, 20);
    p.noFill();
    p.stroke(140, 110, 220);
    p.strokeWeight(2);
    p.ellipse(CX, CY, FRONT_RING_RADIUS * 2, FRONT_RING_RADIUS * 2);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(220, 210, 255);
    p.textSize(20);
    p.text(failed ? "FAIL" : "CLEAR!", CX, CY - 30);
    p.textSize(12);
    p.text(`SCORE: ${score}`, CX, CY + 4);
    p.textSize(9);
    p.fill(140, 130, 170);
    p.text("A to replay   ·   hold START to exit", CX, CY + 26);

    if (input.aPressed) gameState = "SELECT";
}

// ── Module export ─────────────────────────────────────────────────────────────

const tuberun: GameModule = {
    id: "tuberun",
    title: "Tube Run",
    author: "kpthill",

    init(c) {
        ctx          = c;
        p            = c.p;
        gameState    = "SELECT";
        selectedChart = 0;
        menuLatch    = false;
        tubeAngle    = Math.PI / 2;
        jumpBeat     = -99;
        jumpHeld     = false;
        lastBeat     = 0;
        activeEvents = [];
        judgments    = [];
        score        = 0;
        combo        = 0;
        life         = 1.0;
        failed       = false;
    },

    frame(input: InputSnapshot, dt: number) {
        switch (gameState) {
            case "SELECT":  drawSelect(input);       break;
            case "PLAYING": drawPlaying(input, dt);  break;
            case "RESULT":  drawResult(input);       break;
        }
    },

    teardown() {
        activeEvents = [];
        judgments    = [];
        ctx.audio.stop();
    },
};

export default tuberun;
