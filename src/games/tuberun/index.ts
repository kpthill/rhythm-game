// Runner (v2) — a continuous-terrain rhythm platformer inside a tube.
//
// The camera looks down a cylindrical tube drawn as concentric rings receding
// to a vanishing point. A ribbon of terrain (see terrain.ts) is painted across
// the rings toward the centre; the runner avatar stands on its near end. You
// STEER (joystick L/R, or spinner) to keep the runner on the drifting ribbon,
// and JUMP (A) to clear the gaps. Being off the ribbon while grounded — or
// landing off it — is an instant fall; death rewinds the song to the last
// checkpoint and resumes.
//
// This is milestone M1 (terrain core) plus a basic jump pulled forward from M2.
// B-action (destroy) and scoring are M2 — omitted here.
//
// State machine: TITLE → PLAYING → RESULT
// PLAYING sub-phases: "run" → "dying" → "respawn" → "run"

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { OFFSET } from "../../platform/song";
import {
    W, H, CX, CY,
    FRONT_RING_RADIUS, VP_RADIUS, LOOKAHEAD_BEATS,
    RIBBON_HALF_WIDTH, STEER_SPEED, SPINNER_RAD_PER_STEP,
    JUMP_BEATS, JUMP_LIFT_PX,
    TERRAIN,
    radiusAtBeat, ribbonCenter, inGap, lastCheckpoint,
} from "./terrain";

// ── Module-level state (reset in init) ────────────────────────────────────────

let ctx: GameContext;
let p: p5;

type GameState = "TITLE" | "PLAYING" | "RESULT";
let gameState: GameState = "TITLE";

type RunPhase = "run" | "dying" | "respawn";
let runPhase: RunPhase = "run";
let phaseStartMs = 0;   // p.millis() at the current sub-phase start
let frozenBeat = 0;     // beat to render while audio is stopped (dying)

// Runner angular position on the tube (radians, world space). The runner is
// pinned to screen-bottom; the tube rotates under it. tubeAngle IS the runner's
// world angle, so "on ribbon" ⇔ |tubeAngle − ribbonCenter| ≤ half-width.
let tubeAngle = Math.PI / 2;

// Jump state.
let jumpBeat = -99;     // beat the current jump began (parabolic arc)
let jumpArmed = true;   // require an A release before the next jump

// Checkpoint audio times, captured as the run crosses each checkpoint beat.
let cpSeconds: number[] = [];
let cpCaptured: boolean[] = [];

// Result framing.
let clearedRun = false;
let furthestBeat = 0;

// Death/respawn timing.
const DEATH_MS = 480;    // fall animation before the rewind
const RESPAWN_MS = 750;  // "CHECKPOINT" banner + grace before control returns

// Title pulse / misc.
let bannerBeat = 0;

// ── Small math helpers ────────────────────────────────────────────────────────

/** Angular difference a−b normalised to [-PI, PI]. */
function angleDiff(a: number, b: number): number {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** Height of the jump arc (0 grounded, peaks ~1 mid-arc). */
function jumpPhase(currentBeat: number): number {
    const t = (currentBeat - jumpBeat) / JUMP_BEATS;
    if (t < 0 || t > 1) return 0;
    return Math.sin(t * Math.PI);
}

/** Airborne = high enough in the arc to clear a hole / ignore the floor. */
function isAirborne(currentBeat: number): boolean {
    return jumpPhase(currentBeat) > 0.05;
}

/** World angle → on-screen angle (runner sits at screen-bottom = +PI/2). */
function screenAngle(worldAngle: number): number {
    return worldAngle - tubeAngle + Math.PI / 2;
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────

function startRun(): void {
    gameState = "PLAYING";
    runPhase = "run";
    phaseStartMs = p.millis();
    tubeAngle = ribbonCenter(TERRAIN, 0);
    jumpBeat = -99;
    jumpArmed = true;
    clearedRun = false;
    furthestBeat = 0;
    frozenBeat = 0;

    // Checkpoint 0 is beat 0; its audio time is the song OFFSET. Others are
    // captured live as the player reaches them.
    cpSeconds = TERRAIN.checkpoints.map(() => OFFSET);
    cpCaptured = TERRAIN.checkpoints.map((_, i) => i === 0);

    ctx.audio.stop();
    void ctx.audio.play(OFFSET);   // start playing from beat 0
}

/** Capture the live audio time for any checkpoint the run has now reached. */
function captureCheckpoints(cb: number): void {
    for (let i = 0; i < TERRAIN.checkpoints.length; i++) {
        if (!cpCaptured[i] && cb >= TERRAIN.checkpoints[i]) {
            cpSeconds[i] = ctx.audio.currentSeconds;
            cpCaptured[i] = true;
        }
    }
}

/** Grounded + off the ribbon (or over a hole) = fell. */
function isFalling(cb: number): boolean {
    if (cb < 0) return false;             // pre-song lead-in
    if (isAirborne(cb)) return false;     // jumps are immune
    if (inGap(TERRAIN, cb)) return true;  // no floor here at all
    const off = Math.abs(angleDiff(tubeAngle, ribbonCenter(TERRAIN, cb)));
    return off > RIBBON_HALF_WIDTH;
}

/** Rewind the song + terrain to the last checkpoint and resume. */
function rewindToCheckpoint(): void {
    const cpBeat = lastCheckpoint(TERRAIN, frozenBeat);
    let idx = 0;
    for (let i = 0; i < TERRAIN.checkpoints.length; i++) {
        if (TERRAIN.checkpoints[i] === cpBeat) idx = i;
    }
    tubeAngle = ribbonCenter(TERRAIN, cpBeat);   // respawn centred on the path
    jumpBeat = -99;
    jumpArmed = true;
    ctx.audio.stop();
    void ctx.audio.play(cpSeconds[idx]);
}

// ── Steering (shared by run + respawn phases) ─────────────────────────────────

let prevSpinnerAngle = 0;
let spinnerInit = false;

function applySteering(input: InputSnapshot, dt: number): void {
    if (input.spinnerConnected) {
        // Prefer per-step delta; fall back to absolute angle wrap if needed.
        if (input.spinnerDelta !== 0) {
            tubeAngle += input.spinnerDelta * SPINNER_RAD_PER_STEP;
        } else if (spinnerInit) {
            tubeAngle += angleDiff(input.spinnerAngle, prevSpinnerAngle);
        }
        prevSpinnerAngle = input.spinnerAngle;
        spinnerInit = true;
    }
    // Joystick is always live (primary control). Direction chases the ribbon:
    // press toward the side of the screen the ribbon sits on to slide onto it.
    const d = input.direction;
    const left = d === "LEFT" || d === "UP_LEFT" || d === "DOWN_LEFT";
    const right = d === "RIGHT" || d === "UP_RIGHT" || d === "DOWN_RIGHT";
    const step = STEER_SPEED * (dt / 1000);
    if (left) tubeAngle += step;   // ribbon left of centre ⇔ (center−tubeAngle)>0
    if (right) tubeAngle -= step;
}

// ── Rendering: tube, ribbon, obstacles, runner ────────────────────────────────

function drawTube(cb: number): void {
    p.background(9, 7, 16);

    // Approach rings at 1-beat intervals, scrolling toward the front.
    const scroll = ((cb % 1) + 1) % 1;
    p.noFill();
    p.strokeWeight(1);
    for (let kk = 0; kk <= LOOKAHEAD_BEATS + 1; kk++) {
        const r = radiusAtBeat(cb + kk - scroll, cb);
        if (r < VP_RADIUS || r > FRONT_RING_RADIUS + 1) continue;
        const a = p.map(r, VP_RADIUS, FRONT_RING_RADIUS, 12, 42);
        p.stroke(48, 40, 92, a);
        p.ellipse(CX, CY, r * 2, r * 2);
    }

    // Radial guide lines fixed to the tube wall (rotate with tubeAngle).
    p.strokeWeight(0.5);
    p.stroke(38, 30, 74, 70);
    for (let i = 0; i < 8; i++) {
        const ang = screenAngle((i * Math.PI * 2) / 8);
        p.line(
            CX + Math.cos(ang) * VP_RADIUS, CY + Math.sin(ang) * VP_RADIUS,
            CX + Math.cos(ang) * FRONT_RING_RADIUS, CY + Math.sin(ang) * FRONT_RING_RADIUS,
        );
    }

    // Front ring (the floor plane) with a soft beat pulse.
    const beatFrac = ((cb % 1) + 1) % 1;
    const pulse = beatFrac < 0.12 ? 1 - beatFrac / 0.12 : 0;
    p.noFill();
    p.stroke(90 + pulse * 60, 80 + pulse * 60, 150 + pulse * 40);
    p.strokeWeight(2);
    p.ellipse(CX, CY, FRONT_RING_RADIUS * 2, FRONT_RING_RADIUS * 2);

    // Vanishing point.
    p.noStroke();
    p.fill(120, 110, 190, 120);
    p.ellipse(CX, CY, VP_RADIUS * 2, VP_RADIUS * 2);
}

function ribbonEdge(beat: number, side: number, cb: number): { x: number; y: number } {
    const r = radiusAtBeat(beat, cb);
    const s = screenAngle(ribbonCenter(TERRAIN, beat) + side * RIBBON_HALF_WIDTH);
    return { x: CX + Math.cos(s) * r, y: CY + Math.sin(s) * r };
}

/** Paint the ribbon across the rings; gaps read as holes (background shows). */
function drawRibbon(cb: number): void {
    const step = 0.2;
    const far = cb + LOOKAHEAD_BEATS;

    // Filled band (draw far→near so nearer segments overlap cleanly).
    p.noStroke();
    for (let b = far - step; b >= cb; b -= step) {
        const b1 = b + step;
        const mid = b + step / 2;
        if (inGap(TERRAIN, mid)) continue;
        const oL = ribbonEdge(b1, -1, cb);
        const oR = ribbonEdge(b1, +1, cb);
        const iR = ribbonEdge(b, +1, cb);
        const iL = ribbonEdge(b, -1, cb);
        const depth = (b - cb) / LOOKAHEAD_BEATS;   // 0 near … 1 far
        const shade = 1 - depth * 0.55;
        p.fill(40 * shade, 150 * shade, 165 * shade);
        p.quad(oL.x, oL.y, oR.x, oR.y, iR.x, iR.y, iL.x, iL.y);
    }

    // Bright edge rails, broken at gaps, so curves + holes read clearly.
    p.strokeWeight(1.5);
    p.stroke(120, 240, 235);
    for (let b = cb; b < far; b += step) {
        const b1 = Math.min(b + step, far);
        if (inGap(TERRAIN, b + step / 2)) continue;
        for (const side of [-1, 1]) {
            const a0 = ribbonEdge(b, side, cb);
            const a1 = ribbonEdge(b1, side, cb);
            p.line(a0.x, a0.y, a1.x, a1.y);
        }
    }

    // Gap lips: a warm tick at each hole edge so "JUMP HERE" reads.
    p.stroke(255, 150, 70);
    p.strokeWeight(2);
    for (const g of TERRAIN.gaps) {
        for (const lip of [g.at - g.half, g.at + g.half]) {
            if (lip < cb || lip > far) continue;
            const l = ribbonEdge(lip, -1, cb);
            const r = ribbonEdge(lip, +1, cb);
            p.line(l.x, l.y, r.x, r.y);
        }
    }
}

/** Obstacles: small pillars standing on the ribbon (visual only in M1). */
function drawObstacles(cb: number): void {
    for (const ob of TERRAIN.obstacles) {
        if (ob.beat < cb - 0.3 || ob.beat > cb + LOOKAHEAD_BEATS) continue;
        const r = radiusAtBeat(ob.beat, cb);
        const s = screenAngle(ribbonCenter(TERRAIN, ob.beat) + ob.offset);
        const bx = CX + Math.cos(s) * r;
        const by = CY + Math.sin(s) * r;
        // Raise "outward" (toward the front / larger radius) so it stands up.
        const depth = (ob.beat - cb) / LOOKAHEAD_BEATS;
        const size = p.map(depth, 0, 1, 11, 3);
        const ox = Math.cos(s) * size * 0.7;
        const oy = Math.sin(s) * size * 0.7;
        p.noStroke();
        p.fill(230, 90, 90);
        p.push();
        p.translate(bx + ox, by + oy);
        p.rectMode(p.CENTER);
        p.rect(0, 0, size, size, 1);
        p.fill(255, 200, 120);
        p.rect(0, -size * 0.15, size * 0.5, size * 0.5, 1);
        p.pop();
    }
    p.rectMode(p.CORNER);
}

/**
 * Draw the runner avatar — a small readable figure standing at screen-bottom.
 * mode: normal running, airborne (tucked), or falling (dying tumble).
 */
function drawRunner(cb: number, mode: "run" | "air" | "fall", fallT: number): void {
    const jph = jumpPhase(cb);
    let feetR = FRONT_RING_RADIUS - jph * JUMP_LIFT_PX;
    let tumble = 0;
    let alpha = 255;
    if (mode === "fall") {
        feetR = FRONT_RING_RADIUS + fallT * 70;   // drop off the front
        tumble = fallT * Math.PI * 1.5;
        alpha = 255 * (1 - fallT);
    }
    const fx = CX;                 // screen-bottom: cos(PI/2)=0
    const fy = CY + feetR;

    // Ground shadow (skip while high in the air).
    if (mode !== "fall" && jph < 0.6) {
        p.noStroke();
        p.fill(0, 0, 0, 70 * (1 - jph));
        p.ellipse(CX, CY + FRONT_RING_RADIUS, 11, 4);
    }

    const airborne = mode === "air" || jph > 0.05;
    const body: [number, number, number] =
        mode === "fall" ? [255, 90, 90]
        : airborne ? [130, 225, 255]
        : [210, 195, 255];

    p.push();
    p.translate(fx, fy);
    p.rotate(tumble);           // "up" is -y (toward the tube centre)
    p.stroke(body[0], body[1], body[2], alpha);
    p.strokeWeight(2);
    p.noFill();

    // Torso.
    p.line(0, -6, 0, -13);
    // Head.
    p.fill(body[0], body[1], body[2], alpha);
    p.noStroke();
    p.ellipse(0, -16, 6, 6);
    p.stroke(body[0], body[1], body[2], alpha);
    p.strokeWeight(2);
    p.noFill();

    if (airborne) {
        // Tucked pose.
        p.line(0, -6, -3, -1);
        p.line(0, -6, 3, -1);
        p.line(0, -11, -5, -13);
        p.line(0, -11, 5, -13);
    } else {
        // Running pose: legs + arms swing with the beat.
        const swing = Math.sin(cb * Math.PI * 2) * 4;
        p.line(0, -6, -swing, 0);
        p.line(0, -6, swing, 0);
        p.line(0, -11, swing * 0.8, -8);
        p.line(0, -11, -swing * 0.8, -8);
    }
    p.pop();
}

/** Steering aid: a chevron at the bottom pointing to the ribbon when off-path. */
function drawSteerHint(cb: number): void {
    if (cb < 0 || inGap(TERRAIN, cb)) return;
    const off = angleDiff(ribbonCenter(TERRAIN, cb), tubeAngle);
    if (Math.abs(off) <= RIBBON_HALF_WIDTH) return;
    const dir = off > 0 ? -1 : 1;   // off>0 ⇒ ribbon on screen-left ⇒ point/steer left
    const x = CX + dir * 30;
    const y = CY + FRONT_RING_RADIUS + 10;
    p.noStroke();
    p.fill(255, 90, 90, 220);
    p.triangle(x + dir * 6, y, x - dir * 3, y - 5, x - dir * 3, y + 5);
}

// ── HUD ────────────────────────────────────────────────────────────────────────

function drawHUD(cb: number): void {
    // Progress bar (distance framing for the runner fantasy).
    const barW = 240;
    const bx = CX - barW / 2;
    const by = H - 10;
    const prog = Math.max(0, Math.min(1, cb / TERRAIN.endBeat));
    p.noStroke();
    p.fill(28, 24, 46);
    p.rect(bx, by, barW, 4, 2);
    p.fill(120, 220, 210);
    p.rect(bx, by, barW * prog, 4, 2);
    // Checkpoint pips.
    for (const c of TERRAIN.checkpoints) {
        const px = bx + barW * Math.min(1, c / TERRAIN.endBeat);
        p.fill(cb >= c ? p.color(255, 220, 120) : p.color(70, 64, 96));
        p.ellipse(px, by + 2, 4, 4);
    }

    p.textAlign(p.LEFT, p.TOP);
    p.textSize(8);
    p.fill(150, 140, 185);
    p.text("RUNNER", 4, 4);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(`${Math.max(0, Math.floor(cb))} / ${TERRAIN.endBeat}`, W - 4, 4);
}

function drawBanner(text: string, col: [number, number, number], up: boolean): void {
    const t = (p.millis() - phaseStartMs) / 1000;
    const dy = up ? -Math.min(14, t * 40) : 0;
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(16);
    p.fill(col[0], col[1], col[2]);
    p.noStroke();
    p.text(text, CX, CY - 46 + dy);
}

// ── Screens ─────────────────────────────────────────────────────────────────────

function drawTitle(input: InputSnapshot): void {
    p.background(9, 7, 16);
    bannerBeat += 0.03;
    p.noFill();
    for (let r = 18; r <= FRONT_RING_RADIUS; r += 16) {
        const a = p.map(r, 0, FRONT_RING_RADIUS, 12, 50);
        p.stroke(60, 50, 110, a);
        p.strokeWeight(r >= FRONT_RING_RADIUS - 1 ? 2 : 0.5);
        p.ellipse(CX, CY, r * 2, r * 2);
    }
    // Demo runner on the front ring.
    tubeAngle = Math.PI / 2;
    jumpBeat = -99;
    drawRunner(bannerBeat, "run", 0);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(220, 210, 255);
    p.textSize(26);
    p.text("RUNNER", CX, 44);
    p.fill(140, 160, 200);
    p.textSize(9);
    p.text("stay on the ribbon · jump the gaps", CX, 66);

    p.fill(120, 200, 190);
    p.textSize(11);
    p.text("PRESS A TO RUN", CX, H - 58);
    p.fill(95, 88, 125);
    p.textSize(8);
    p.text("Joystick L/R (or spinner) to steer", CX, H - 40);
    p.text("A to jump   ·   hold START to quit", CX, H - 28);

    if (input.aPressed) startRun();
}

function drawPlaying(input: InputSnapshot, dt: number): void {
    const now = p.millis();

    if (runPhase === "run") {
        const cb = ctx.beatNow();
        furthestBeat = Math.max(furthestBeat, cb);
        captureCheckpoints(cb);
        applySteering(input, dt);

        // Jump input (edge-triggered; require an A release between jumps).
        if (input.aPressed && jumpArmed && !isAirborne(cb)) {
            jumpBeat = cb;
            jumpArmed = false;
        }
        if (!input.aHeld) jumpArmed = true;

        // Death check.
        if (isFalling(cb)) {
            frozenBeat = cb;
            ctx.audio.stop();
            runPhase = "dying";
            phaseStartMs = now;
        }

        drawTube(cb);
        drawRibbon(cb);
        drawObstacles(cb);
        drawSteerHint(cb);
        drawRunner(cb, isAirborne(cb) ? "air" : "run", 0);
        drawHUD(cb);

        if (cb >= TERRAIN.endBeat) {
            clearedRun = true;
            ctx.audio.stop();
            gameState = "RESULT";
        }
        return;
    }

    if (runPhase === "dying") {
        const t = Math.min(1, (now - phaseStartMs) / DEATH_MS);
        drawTube(frozenBeat);
        drawRibbon(frozenBeat);
        drawObstacles(frozenBeat);
        drawRunner(frozenBeat, "fall", t);
        drawHUD(frozenBeat);
        drawBanner("FELL", [255, 100, 100], false);
        if (t >= 1) {
            rewindToCheckpoint();
            runPhase = "respawn";
            phaseStartMs = now;
        }
        return;
    }

    // runPhase === "respawn": banner + grace, steering allowed, no death.
    const cbRaw = ctx.beatNow();
    const cpBeat = lastCheckpoint(TERRAIN, frozenBeat);
    const cb = ctx.audio.playing ? cbRaw : cpBeat;   // guard audio warm-up
    applySteering(input, dt);
    drawTube(cb);
    drawRibbon(cb);
    drawObstacles(cb);
    drawSteerHint(cb);
    drawRunner(cb, "run", 0);
    drawHUD(cb);
    drawBanner("CHECKPOINT", [255, 220, 120], true);
    if (now - phaseStartMs >= RESPAWN_MS) {
        runPhase = "run";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(9, 7, 16);
    p.noFill();
    p.stroke(140, 110, 220);
    p.strokeWeight(2);
    p.ellipse(CX, CY, FRONT_RING_RADIUS * 2, FRONT_RING_RADIUS * 2);

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(220, 210, 255);
    p.textSize(22);
    p.text(clearedRun ? "CLEAR!" : "RUN ENDED", CX, CY - 24);
    p.textSize(11);
    p.fill(150, 200, 190);
    const pct = Math.round(Math.min(1, furthestBeat / TERRAIN.endBeat) * 100);
    p.text(`DISTANCE  ${pct}%`, CX, CY + 6);
    p.textSize(9);
    p.fill(140, 130, 170);
    p.text("A to run again   ·   hold START to exit", CX, CY + 30);

    if (input.aPressed) gameState = "TITLE";
}

// ── Module export ───────────────────────────────────────────────────────────────

const runner: GameModule = {
    id: "tuberun",
    title: "Runner",
    author: "kpthill",

    init(c) {
        ctx = c;
        p = c.p;
        gameState = "TITLE";
        runPhase = "run";
        tubeAngle = Math.PI / 2;
        jumpBeat = -99;
        jumpArmed = true;
        clearedRun = false;
        furthestBeat = 0;
        bannerBeat = 0;
        spinnerInit = false;
        prevSpinnerAngle = 0;
    },

    frame(input: InputSnapshot, dt: number) {
        switch (gameState) {
            case "TITLE":   drawTitle(input);         break;
            case "PLAYING": drawPlaying(input, dt);   break;
            case "RESULT":  drawResult(input);        break;
        }
    },

    teardown() {
        ctx.audio.stop();
    },
};

export default runner;
