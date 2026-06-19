// Tower — a spinner-turret RADIAL tower defense where enemies are the notes.
//
// A turret sits at canvas center. Enemies spawn at the edges and converge inward
// along radial paths; a circular FIRING RING at a fixed radius marks the hit-beat.
// AIM the barrel (spinner = continuous; joystick = 8-way snap fallback). A = fire
// on the beat at an enemy crossing the ring within angular tolerance. B = flak for
// FLYER enemies. Enemies that reach the base damage the life bar.
//
// Internal states: SELECT (pick a chart) → PLAYING → RESULT. The host handles the
// title/loading screens and the hold-START quit-to-menu gesture.

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { DIRECTION_ANGLE } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHARTS } from "./chart";
import type { EnemyEvent, ActiveEnemy, EnemyType, SwarmHit } from "./enemies";
import {
    CX, CY, FIRING_RADIUS, SPAWN_RADIUS, BASE_RADIUS,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS, PERFECT_WINDOW_BEATS, AIM_TOLERANCE,
    ENEMY_COLOR, enemyRadius, angleDelta,
} from "./enemies";

type State = "SELECT" | "PLAYING" | "RESULT";

interface Judgment { text: string; frame: number; x: number; y: number; color: [number, number, number]; }

let ctx: GameContext;
let p: p5;

let state: State = "SELECT";
let activeChart: EnemyEvent[] = CHARTS[0].notes;
let activeEnemies: ActiveEnemy[] = [];
let chartIndex = 0;
let score = 0;
let combo = 0;
let maxCombo = 0;
let life = 1.0;
let failed = false;
let judgments: Judgment[] = [];
let selectedChart = 0;
let menuLatch = false;

// Turret barrel angle (radians, p5 convention). Driven continuously by the
// spinner, or snapped to the joystick direction as a fallback.
let barrel = -Math.PI / 2;  // start pointing up
let muzzleFlash = 0;        // frames remaining of fire flash
let shotAngle = barrel;     // angle of last shot (for tracer)
let shotFrame = -100;

// ── Helpers ──────────────────────────────────────────────────────────────────

function posOnRing(angle: number, r: number): [number, number] {
    return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
}

function pushJudgment(text: string, angle: number, color: [number, number, number]): void {
    const [x, y] = posOnRing(angle, FIRING_RADIUS - 16);
    judgments.push({ text, frame: p.frameCount, x, y, color });
}

function registerHit(points: number, quality: string, angle: number, color: [number, number, number]): void {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    const mult = 1 + Math.floor(combo / 10);
    score += points * mult;
    pushJudgment(quality, angle, color);
}

function registerLeak(angle: number): void {
    combo = 0;
    life = Math.max(0, life - 0.12);
    pushJudgment("BREACH", angle, [255, 60, 60]);
}

function startChart(chart: EnemyEvent[]): void {
    activeChart = chart;
    activeEnemies = [];
    chartIndex = 0;
    score = 0;
    combo = 0;
    maxCombo = 0;
    life = 1.0;
    failed = false;
    judgments = [];
    barrel = -Math.PI / 2;
    muzzleFlash = 0;
    state = "PLAYING";
    void ctx.audio.play(0);
}

// ── Aiming ─────────────────────────────────────────────────────────────────────

function updateBarrel(input: InputSnapshot): void {
    if (input.spinnerConnected) {
        // Continuous aim: accumulate signed step delta. Scale so a comfortable
        // flick sweeps a useful arc; tune step→radians.
        barrel += input.spinnerDelta * 0.09;
        // normalize to [-PI, PI]
        while (barrel > Math.PI) barrel -= Math.PI * 2;
        while (barrel < -Math.PI) barrel += Math.PI * 2;
    } else if (input.direction) {
        // Fallback: snap toward the held 8-way direction (eased so it reads).
        const target = DIRECTION_ANGLE[input.direction];
        const d = angleDelta(target, barrel);
        barrel += d * 0.5;
        while (barrel > Math.PI) barrel -= Math.PI * 2;
        while (barrel < -Math.PI) barrel += Math.PI * 2;
    }
}

// ── Game logic ─────────────────────────────────────────────────────────────────

function spawnEnemies(currentBeat: number): void {
    while (chartIndex < activeChart.length) {
        const ev = activeChart[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            const swarmHits: SwarmHit[] = [];
            if (ev.type === "SWARM") {
                const count = ev.count ?? 4;
                const arc = ev.arc ?? Math.PI / 2;
                const step = ev.step ?? 1;
                for (let i = 0; i < count; i++) {
                    const f = count > 1 ? i / (count - 1) - 0.5 : 0;
                    swarmHits.push({
                        beat: ev.beat + i * step,
                        angle: ev.angle + f * arc,
                        hit: false,
                        missed: false,
                    });
                }
            }
            activeEnemies.push({
                event: ev, hit: false, missed: false,
                holdActive: false, holdComplete: false, leaked: false,
                swarm: swarmHits,
            });
            chartIndex++;
        } else break;
    }
}

function aimedAt(targetAngle: number): boolean {
    return Math.abs(angleDelta(barrel, targetAngle)) <= AIM_TOLERANCE;
}

function fireShot(): void {
    muzzleFlash = 5;
    shotAngle = barrel;
    shotFrame = p.frameCount;
}

function evaluateEnemies(currentBeat: number, input: InputSnapshot): void {
    // A single A-press can resolve at most one enemy (the best-aligned candidate).
    let aConsumed = false;
    let bConsumed = false;

    for (const enemy of activeEnemies) {
        if (enemy.hit || enemy.missed || enemy.leaked) continue;
        const ev = enemy.event;
        const beatDiff = currentBeat - ev.beat;

        if (ev.type === "GRUNT") {
            if (input.aPressed && !aConsumed && aimedAt(ev.angle) &&
                Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                aConsumed = true;
                fireShot();
                const perfect = Math.abs(beatDiff) <= PERFECT_WINDOW_BEATS;
                registerHit(perfect ? 300 : 150, perfect ? "PERFECT" : "GOOD",
                    ev.angle, ENEMY_COLOR.GRUNT);
                enemy.hit = true;
            } else if (beatDiff > 1) {
                // reached the base
                registerLeak(ev.angle);
                enemy.leaked = true;
            }

        } else if (ev.type === "FLYER") {
            if (input.bPressed && !bConsumed && aimedAt(ev.angle) &&
                Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                bConsumed = true;
                fireShot();
                const perfect = Math.abs(beatDiff) <= PERFECT_WINDOW_BEATS;
                registerHit(perfect ? 300 : 150, perfect ? "PERFECT" : "GOOD",
                    ev.angle, ENEMY_COLOR.FLYER);
                enemy.hit = true;
            } else if (beatDiff > 1) {
                registerLeak(ev.angle);
                enemy.leaked = true;
            }

        } else if (ev.type === "ARMORED") {
            const dur = ev.duration ?? 2;
            const holdEnd = ev.beat + dur;
            if (!enemy.holdActive) {
                if (input.aPressed && !aConsumed && aimedAt(ev.angle) &&
                    Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                    aConsumed = true;
                    fireShot();
                    enemy.holdActive = true;
                    combo++;
                    if (combo > maxCombo) maxCombo = combo;
                    pushJudgment("LOCK", ev.angle, ENEMY_COLOR.ARMORED);
                } else if (beatDiff > 1) {
                    registerLeak(ev.angle);
                    enemy.leaked = true;
                }
            } else {
                // must keep A held AND keep barrel on it as it presses the ring
                if (!input.aHeld || !aimedAt(ev.angle)) {
                    combo = 0;
                    life = Math.max(0, life - 0.05);
                    pushJudgment("BROKE", ev.angle, [255, 120, 60]);
                    enemy.missed = true;
                } else {
                    if (p.frameCount % 4 === 0) fireShot();
                    if (currentBeat >= holdEnd) {
                        enemy.holdComplete = true;
                        registerHit(400, "PERFECT", ev.angle, ENEMY_COLOR.ARMORED);
                        enemy.hit = true;
                    }
                }
            }

        } else if (ev.type === "SWARM") {
            let allResolved = true;
            for (const sh of enemy.swarm) {
                if (sh.hit || sh.missed) continue;
                allResolved = false;
                const sdiff = currentBeat - sh.beat;
                if (input.aPressed && !aConsumed && aimedAt(sh.angle) &&
                    Math.abs(sdiff) <= HIT_WINDOW_BEATS) {
                    aConsumed = true;
                    fireShot();
                    sh.hit = true;
                    const perfect = Math.abs(sdiff) <= PERFECT_WINDOW_BEATS;
                    registerHit(perfect ? 200 : 100, perfect ? "PERFECT" : "GOOD",
                        sh.angle, ENEMY_COLOR.SWARM);
                } else if (sdiff > 1) {
                    sh.missed = true;
                    registerLeak(sh.angle);
                }
            }
            if (allResolved) enemy.hit = true;
        }
    }

    // cull fully-resolved / long-past enemies
    activeEnemies = activeEnemies.filter(e => {
        const last = e.event.type === "SWARM"
            ? e.event.beat + ((e.event.count ?? 1) - 1) * (e.event.step ?? 1)
            : e.event.beat + (e.event.duration ?? 0);
        return currentBeat - last < LOOKAHEAD_BEATS + 2;
    });
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function drawArena(currentBeat: number): void {
    p.background(10, 12, 22);

    // faint radial grid lines
    p.strokeWeight(0.5);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        p.stroke(30, 38, 60, 120);
        p.line(CX, CY, CX + Math.cos(a) * SPAWN_RADIUS, CY + Math.sin(a) * SPAWN_RADIUS);
    }

    // incoming range rings (subtle, pulse on beat)
    const pulse = 1 - (currentBeat % 1);
    p.noFill();
    for (let r = 30; r < SPAWN_RADIUS; r += 28) {
        p.stroke(40, 55, 90, 60);
        p.strokeWeight(0.75);
        p.ellipse(CX, CY, r * 2, r * 2);
    }

    // FIRING RING — the hit line. Bright + beat pulse.
    p.noFill();
    p.stroke(120, 170, 230, 200 + pulse * 40);
    p.strokeWeight(2);
    p.ellipse(CX, CY, FIRING_RADIUS * 2, FIRING_RADIUS * 2);
    // tick marks on the ring
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const [x0, y0] = posOnRing(a, FIRING_RADIUS - 3);
        const [x1, y1] = posOnRing(a, FIRING_RADIUS + 3);
        p.stroke(80, 110, 160, 120);
        p.strokeWeight(0.75);
        p.line(x0, y0, x1, y1);
    }
}

function drawTurret(): void {
    // base / core
    const flash = muzzleFlash > 0;
    p.noStroke();
    p.fill(30, 40, 62);
    p.ellipse(CX, CY, BASE_RADIUS * 2 + 6, BASE_RADIUS * 2 + 6);
    const lifeCol: [number, number, number] =
        life > 0.5 ? [70, 200, 120] : life > 0.25 ? [230, 180, 40] : [220, 60, 60];
    p.fill(lifeCol[0], lifeCol[1], lifeCol[2]);
    p.ellipse(CX, CY, BASE_RADIUS * 2, BASE_RADIUS * 2);
    p.fill(15, 20, 34);
    p.ellipse(CX, CY, BASE_RADIUS, BASE_RADIUS);

    // barrel
    const len = FIRING_RADIUS - 6;
    const [bx, by] = posOnRing(barrel, len);
    p.stroke(flash ? 255 : 200, flash ? 240 : 215, flash ? 180 : 235);
    p.strokeWeight(4);
    p.line(CX, CY, bx, by);
    // barrel tip
    p.noStroke();
    p.fill(flash ? 255 : 180, flash ? 230 : 200, flash ? 120 : 230);
    p.ellipse(bx, by, flash ? 9 : 6, flash ? 9 : 6);

    // aim cone (shows angular tolerance at the firing ring)
    const [c0x, c0y] = posOnRing(barrel - AIM_TOLERANCE, FIRING_RADIUS);
    const [c1x, c1y] = posOnRing(barrel + AIM_TOLERANCE, FIRING_RADIUS);
    p.stroke(150, 180, 230, 70);
    p.strokeWeight(0.75);
    p.line(CX, CY, c0x, c0y);
    p.line(CX, CY, c1x, c1y);

    if (muzzleFlash > 0) muzzleFlash--;

    // tracer from the last shot
    const tAge = p.frameCount - shotFrame;
    if (tAge < 6) {
        const [tx, ty] = posOnRing(shotAngle, FIRING_RADIUS);
        p.stroke(255, 240, 160, p.map(tAge, 0, 6, 220, 0));
        p.strokeWeight(2);
        p.line(CX, CY, tx, ty);
    }
}

function drawEnemySprite(type: EnemyType, x: number, y: number, size: number, alpha: number, active: boolean): void {
    const [r, g, b] = ENEMY_COLOR[type];
    p.stroke(255, 255, 255, alpha * 0.6);
    p.strokeWeight(1);
    p.fill(r, g, b, alpha);
    if (type === "GRUNT") {
        p.ellipse(x, y, size, size);
    } else if (type === "ARMORED") {
        // hexagon
        p.beginShape();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            p.vertex(x + Math.cos(a) * size * 0.6, y + Math.sin(a) * size * 0.6);
        }
        p.endShape(p.CLOSE);
        if (active) {
            p.noFill();
            p.stroke(255, 255, 255, alpha);
            p.ellipse(x, y, size + 4, size + 4);
        }
    } else if (type === "FLYER") {
        // diamond
        p.beginShape();
        p.vertex(x, y - size * 0.6);
        p.vertex(x + size * 0.6, y);
        p.vertex(x, y + size * 0.6);
        p.vertex(x - size * 0.6, y);
        p.endShape(p.CLOSE);
    } else {
        // SWARM sub-hit: small triangle
        p.triangle(x, y - size * 0.5, x + size * 0.45, y + size * 0.4, x - size * 0.45, y + size * 0.4);
    }
}

function drawEnemies(currentBeat: number): void {
    for (const enemy of activeEnemies) {
        if (enemy.missed || enemy.hit || enemy.leaked) continue;
        const ev = enemy.event;

        if (ev.type === "SWARM") {
            for (const sh of enemy.swarm) {
                if (sh.hit || sh.missed) continue;
                const r = enemyRadius(sh.beat, currentBeat);
                if (r > SPAWN_RADIUS + 6 || r < BASE_RADIUS - 2) continue;
                const [x, y] = posOnRing(sh.angle, r);
                const near = Math.abs(sh.beat - currentBeat) < 0.25;
                drawEnemySprite("SWARM", x, y, near ? 11 : 9, 230, false);
            }
            continue;
        }

        const r = enemyRadius(ev.beat, currentBeat);
        if (r > SPAWN_RADIUS + 6) continue;
        const [x, y] = posOnRing(ev.angle, r);
        const near = Math.abs(ev.beat - currentBeat) < 0.25;

        if (ev.type === "ARMORED" && enemy.holdActive) {
            // engaged: beam from turret to enemy
            const [ex, ey] = posOnRing(ev.angle, FIRING_RADIUS);
            p.stroke(ENEMY_COLOR.ARMORED[0], ENEMY_COLOR.ARMORED[1], ENEMY_COLOR.ARMORED[2], 200);
            p.strokeWeight(3);
            p.line(CX, CY, ex, ey);
            drawEnemySprite("ARMORED", ex, ey, 15, 240, true);
            // hold progress arc
            const dur = ev.duration ?? 2;
            const prog = p.constrain((currentBeat - ev.beat) / dur, 0, 1);
            p.noFill();
            p.stroke(255, 230, 120, 220);
            p.strokeWeight(2);
            p.arc(ex, ey, 22, 22, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
            continue;
        }

        const size = near ? 16 : 13;
        drawEnemySprite(ev.type, x, y, size, 235, false);
    }
}

function drawHUD(input: InputSnapshot): void {
    // life bar across the top
    const barW = 140, barX = CX - barW / 2, barY = 6;
    p.noStroke();
    p.fill(30, 36, 54);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5 ? p.color(70, 200, 120) : life > 0.25 ? p.color(230, 180, 40) : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    p.fill(200, 210, 225);
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), 333, 14);

    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(150, 190, 240);
        const mult = 1 + Math.floor(combo / 10);
        p.text(`${combo}x  (×${mult})`, 3, 14);
    }

    // control mode hint
    p.textAlign(p.CENTER, p.BOTTOM);
    p.textSize(7);
    p.fill(90, 110, 140);
    p.text(input.spinnerConnected ? "SPINNER AIM" : "JOYSTICK AIM", CX, 260);

    // A/B status pips
    p.noStroke();
    p.fill(input.aHeld ? [120, 220, 140] : [40, 48, 64]);
    p.ellipse(310, 252, 8, 8);
    p.fill(input.bHeld ? [235, 110, 200] : [40, 48, 64]);
    p.ellipse(322, 252, 8, 8);
    p.fill(150, 170, 190);
    p.textAlign(p.RIGHT, p.CENTER);
    p.textSize(6);
    p.text("A", 305, 252);

    judgments = judgments.filter(j => p.frameCount - j.frame < 45);
    for (const j of judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 22, 45, 255, 0);
        const dy = p.map(age, 0, 45, 0, -10);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(10);
        p.fill(j.color[0], j.color[1], j.color[2], alpha);
        p.text(j.text, j.x, j.y + dy);
    }
}

// ── Screens ────────────────────────────────────────────────────────────────────

function drawSelect(input: InputSnapshot): void {
    p.background(10, 12, 22);
    p.noFill();
    for (let r = 24; r <= FIRING_RADIUS; r += 24) {
        p.stroke(40, 55, 90, 50);
        p.strokeWeight(r >= FIRING_RADIUS ? 2 : 0.5);
        p.ellipse(CX, CY, r * 2, r * 2);
    }
    // mini turret
    p.stroke(200, 215, 235);
    p.strokeWeight(3);
    p.line(CX, CY, CX, CY - FIRING_RADIUS + 8);
    p.noStroke();
    p.fill(70, 200, 120);
    p.ellipse(CX, CY, 14, 14);

    p.textAlign(p.CENTER, p.CENTER);
    p.fill(150, 175, 205);
    p.textSize(9);
    p.text("TOWER", CX, 26);
    p.fill(215, 225, 245);
    p.textSize(13);
    p.text("SELECT ASSAULT", CX, 46);

    for (let i = 0; i < CHARTS.length; i++) {
        const y = 92 + i * 28;
        const sel = i === selectedChart;
        p.fill(sel ? 220 : 110, sel ? 230 : 125, sel ? 250 : 150);
        p.textSize(sel ? 14 : 11);
        p.text((sel ? "> " : "  ") + CHARTS[i].name, CX, y);
    }
    p.fill(100, 120, 150);
    p.textSize(8);
    p.text("UP/DN choose   A start", CX, 200);
    p.textSize(7);
    p.fill(80, 100, 130);
    p.text("aim barrel · A fire · B flak", CX, 215);

    const dirUp = input.direction === "UP";
    const dirDown = input.direction === "DOWN";
    if (!dirUp && !dirDown) menuLatch = false;
    else if (!menuLatch) {
        menuLatch = true;
        if (dirUp)   selectedChart = (selectedChart - 1 + CHARTS.length) % CHARTS.length;
        if (dirDown) selectedChart = (selectedChart + 1) % CHARTS.length;
    }

    if (input.aPressed) startChart(CHARTS[selectedChart].notes);
}

function drawPlaying(input: InputSnapshot): void {
    const cb = ctx.beatNow();
    updateBarrel(input);
    drawArena(cb);
    spawnEnemies(cb);
    evaluateEnemies(cb, input);
    drawEnemies(cb);
    drawTurret();
    drawHUD(input);

    if (life <= 0) { failed = true; ctx.audio.stop(); state = "RESULT"; }
    else if (cb >= SONG_LENGTH_BEATS) { ctx.audio.stop(); state = "RESULT"; }
}

function drawResult(input: InputSnapshot): void {
    p.background(10, 12, 22);
    p.noFill();
    p.stroke(120, 170, 230);
    p.strokeWeight(2);
    p.ellipse(CX, CY, FIRING_RADIUS * 2, FIRING_RADIUS * 2);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(failed ? p.color(230, 90, 90) : p.color(120, 220, 150));
    p.textSize(20);
    p.text(failed ? "FAIL" : "CLEAR!", CX, CY - 30);
    p.fill(220, 228, 245);
    p.textSize(12);
    p.text(`SCORE ${score}`, CX, CY - 2);
    p.fill(150, 175, 205);
    p.textSize(9);
    p.text(`MAX COMBO ${maxCombo}`, CX, CY + 18);
    p.fill(120, 140, 170);
    p.textSize(8);
    p.text("A to replay  ·  hold START to exit", CX, CY + 40);

    if (input.aPressed) state = "SELECT";
}

// ── Module ─────────────────────────────────────────────────────────────────────

const tower: GameModule = {
    id: "tower",
    title: "Tower",
    author: "kpthill",
    init(c) {
        ctx = c;
        p = c.p;
        state = "SELECT";
        selectedChart = 0;
        menuLatch = false;
    },
    frame(input) {
        switch (state) {
            case "SELECT":  drawSelect(input);  break;
            case "PLAYING": drawPlaying(input); break;
            case "RESULT":  drawResult(input);  break;
        }
    },
    teardown() {
        activeEnemies = [];
        judgments = [];
        ctx.audio.stop();
    },
};

export default tower;
