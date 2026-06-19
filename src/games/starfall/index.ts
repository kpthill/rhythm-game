// Starfall — flat top-down Galaga rhythm shmup.
//
// Five discrete columns.  Ship snaps left/right (one press = one step).
// Objects scroll downward; they must be dealt with when they hit FIRE_Y:
//   enemy    → be in the enemy's column and press A
//   bullet   → press B (shield) regardless of column
//   asteroid → HAZARD: move away from the asteroid's column before it arrives
//
// States: PLAYING → RESULT → (A to replay)

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHART } from "./chart";
import {
    NUM_COLS, COL_X, SHIP_Y, FIRE_Y, SPAWN_Y,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS, CANVAS_H,
    COLOR_ENEMY, COLOR_BULLET, COLOR_ASTEROID,
    noteY,
} from "./notes";
import type { ActiveObject } from "./notes";

// ── Module-level state ────────────────────────────────────────────────────────

let ctx: GameContext;
let p: p5;

type State = "PLAYING" | "RESULT";
let state: State = "PLAYING";

// Player
let playerCol = 2;           // center column
let prevLeft = false;
let prevRight = false;

// Chart playback
let chartIndex = 0;
let activeObjects: ActiveObject[] = [];

// Scoring
let score = 0;
let combo = 0;
let life = 1.0;
let failed = false;

// Judgment popups
interface Judgment { text: string; frame: number; x: number; y: number; }
let judgments: Judgment[] = [];

// Starfield background
interface Star { x: number; y: number; speed: number; brightness: number; }
let stars: Star[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pushJudgment(text: string, col: number): void {
    judgments.push({ text, frame: p.frameCount, x: COL_X[col], y: FIRE_Y - 10 });
}

function registerHit(points: number, quality: string, obj: ActiveObject): void {
    combo++;
    score += points * combo;
    pushJudgment(quality, obj.note.col);
    obj.hit = true;
}

function registerMiss(obj: ActiveObject): void {
    combo = 0;
    life = Math.max(0, life - 0.08);
    // For asteroids show at the asteroid's column, otherwise use player's column
    const popCol = p.constrain(obj.note.col, 0, NUM_COLS - 1);
    pushJudgment("MISS", popCol);
    obj.missed = true;
}

function resetGame(): void {
    playerCol = 2;
    prevLeft = false;
    prevRight = false;
    chartIndex = 0;
    activeObjects = [];
    score = 0;
    combo = 0;
    life = 1.0;
    failed = false;
    judgments = [];
    state = "PLAYING";
    void ctx.audio.play(0);
}

function initStars(): void {
    stars = Array.from({ length: 60 }, () => ({
        x: Math.random() * 336,
        y: Math.random() * 262,
        speed: 0.3 + Math.random() * 0.8,
        brightness: 80 + Math.floor(Math.random() * 120),
    }));
}

// ── Spawning ──────────────────────────────────────────────────────────────────

function spawnNotes(currentBeat: number): void {
    while (chartIndex < CHART.length) {
        const note = CHART[chartIndex];
        if (currentBeat >= note.beat - LOOKAHEAD_BEATS) {
            activeObjects.push({ note, hit: false, missed: false });
            chartIndex++;
        } else break;
    }
}

// ── Game Logic ────────────────────────────────────────────────────────────────

function evaluateObjects(currentBeat: number, input: InputSnapshot): void {
    for (const obj of activeObjects) {
        if (obj.hit || obj.missed) continue;
        const { note } = obj;
        const beatDiff = currentBeat - note.beat;
        const inWindow = Math.abs(beatDiff) <= HIT_WINDOW_BEATS;
        const pastWindow = beatDiff > HIT_WINDOW_BEATS;

        if (note.type === "enemy") {
            if (input.aPressed && playerCol === note.col && inWindow) {
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.6;
                registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", obj);
            } else if (pastWindow) {
                registerMiss(obj);
            }
        } else if (note.type === "bullet") {
            if (input.bPressed && inWindow) {
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 0.6;
                registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", obj);
            } else if (pastWindow) {
                registerMiss(obj);
            }
        } else {
            // asteroid — hazard: player must NOT be in this column at beat arrival
            if (pastWindow) {
                if (playerCol === note.col) {
                    // player failed to dodge
                    registerMiss(obj);
                } else {
                    // successfully dodged — silent, no penalty
                    obj.hit = true; // mark as resolved
                }
            }
        }
    }

    // Prune objects well past the screen
    activeObjects = activeObjects.filter(
        obj => obj.note.beat - currentBeat > -(LOOKAHEAD_BEATS + 1)
    );
}

function handleMovement(input: InputSnapshot): void {
    // Latched movement: one press = one column step (Subway-Surfers style)
    const leftNow  = input.direction === "LEFT"  || input.direction === "UP_LEFT"  || input.direction === "DOWN_LEFT";
    const rightNow = input.direction === "RIGHT" || input.direction === "UP_RIGHT" || input.direction === "DOWN_RIGHT";

    if (leftNow && !prevLeft) {
        playerCol = Math.max(0, playerCol - 1);
    }
    if (rightNow && !prevRight) {
        playerCol = Math.min(NUM_COLS - 1, playerCol + 1);
    }

    prevLeft  = leftNow;
    prevRight = rightNow;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function drawBackground(): void {
    p.background(5, 5, 18);

    // Scroll stars downward
    for (const star of stars) {
        star.y += star.speed;
        if (star.y > 262) {
            star.y = -2;
            star.x = Math.random() * 336;
        }
        p.noStroke();
        p.fill(star.brightness, star.brightness, Math.min(255, star.brightness + 40));
        p.rect(star.x, star.y, 1.5, 1.5);
    }

    // Column lane guides — subtle vertical lines
    p.strokeWeight(0.5);
    for (let c = 0; c < NUM_COLS; c++) {
        p.stroke(30, 28, 55, 100);
        p.line(COL_X[c], 0, COL_X[c], CANVAS_H);
    }

    // Firing line
    p.stroke(80, 70, 130, 160);
    p.strokeWeight(1);
    p.line(0, FIRE_Y, 336, FIRE_Y);
}

function drawShip(): void {
    const x = COL_X[playerCol];
    const y = SHIP_Y;

    // Thruster glow
    p.noStroke();
    p.fill(60, 100, 255, 60);
    p.ellipse(x, y + 12, 14, 8);

    // Body
    p.fill(100, 180, 255);
    p.stroke(200, 230, 255);
    p.strokeWeight(1.5);
    // Main hull — triangle pointing up
    p.triangle(x, y - 12, x - 8, y + 8, x + 8, y + 8);

    // Cockpit
    p.fill(180, 220, 255);
    p.noStroke();
    p.ellipse(x, y - 2, 5, 5);

    // Wing accents
    p.fill(60, 120, 220);
    p.noStroke();
    p.rect(x - 9, y + 2, 5, 4, 1);
    p.rect(x + 4, y + 2, 5, 4, 1);
}

function drawObjects(currentBeat: number): void {
    for (const obj of activeObjects) {
        if (obj.hit || obj.missed) continue;
        const { note } = obj;
        const y = noteY(note.beat, currentBeat);

        // Cull off-screen
        if (y < SPAWN_Y - 10 || y > FIRE_Y + 30) continue;

        const x = COL_X[note.col];

        if (note.type === "enemy") {
            const [r, g, b_] = COLOR_ENEMY;
            // Enemy ship: cyan downward-pointing triangle
            p.fill(r, g, b_);
            p.stroke(200, 240, 255);
            p.strokeWeight(1.5);
            p.triangle(x, y + 9, x - 8, y - 6, x + 8, y - 6);
            // Eye
            p.fill(20, 20, 40);
            p.noStroke();
            p.ellipse(x, y + 1, 5, 5);
            p.fill(r, g, b_);
            p.ellipse(x, y + 1, 3, 3);
        } else if (note.type === "bullet") {
            const [r, g, b_] = COLOR_BULLET;
            // Enemy bullet: orange diamond/rhombus
            p.fill(r, g, b_);
            p.stroke(255, 200, 160);
            p.strokeWeight(1);
            p.push();
            p.translate(x, y);
            p.rotate(Math.PI / 4);
            p.rect(-5, -5, 10, 10, 1);
            p.pop();
            // Inner highlight
            p.fill(255, 240, 200);
            p.noStroke();
            p.ellipse(x, y, 3, 3);
        } else {
            // Asteroid: rough brownish polygon approximation
            const [r, g, b_] = COLOR_ASTEROID;
            p.fill(r, g, b_);
            p.stroke(200, 170, 100);
            p.strokeWeight(1);
            p.push();
            p.translate(x, y);
            p.beginShape();
            const offsets: [number, number][] = [
                [0, -10], [7, -6], [10, 2], [6, 9],
                [-1, 11], [-9, 7], [-10, -1], [-6, -8],
            ];
            for (const [dx, dy] of offsets) p.vertex(dx, dy);
            p.endShape(p.CLOSE);
            p.pop();
            // Crater detail
            p.fill(120, 90, 40, 180);
            p.noStroke();
            p.ellipse(x - 2, y - 2, 4, 3);
        }
    }
}

function drawHitFlash(currentBeat: number): void {
    // Highlight fire-line zone when a note is very close
    for (const obj of activeObjects) {
        if (obj.hit || obj.missed) continue;
        const diff = Math.abs(currentBeat - obj.note.beat);
        if (diff < HIT_WINDOW_BEATS) {
            const alpha = p.map(diff, 0, HIT_WINDOW_BEATS, 100, 0);
            let r = 80, g = 80, b_ = 80;
            if (obj.note.type === "enemy")    { r = 80;  g = 200; b_ = 255; }
            if (obj.note.type === "bullet")   { r = 255; g = 110; b_ = 80;  }
            if (obj.note.type === "asteroid") { r = 255; g = 80;  b_ = 80;  }
            p.noStroke();
            p.fill(r, g, b_, alpha);
            p.rect(0, FIRE_Y - 8, 336, 16);
        }
    }
}

function drawHUD(): void {
    // Life bar
    const barW = 300;
    const barX = 18;
    const barY = 250;
    p.noStroke();
    p.fill(30, 25, 50);
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
    p.text(score.toString().padStart(7, "0"), 334, 4);

    // Combo
    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 4);
    }

    // Judgment popups
    judgments = judgments.filter(j => p.frameCount - j.frame < 50);
    for (const j of judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 25, 50, 255, 0);
        const dy = p.map(age, 0, 50, 0, -16);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(11);
        if (j.text === "PERFECT")      p.fill(255, 240, 80, alpha);
        else if (j.text === "GOOD")    p.fill(80, 220, 120, alpha);
        else                           p.fill(255, 80, 80, alpha);
        p.text(j.text, j.x, j.y + dy);
    }

    // Column indicator dots (show which column is active)
    for (let c = 0; c < NUM_COLS; c++) {
        p.noStroke();
        p.fill(c === playerCol ? 150 : 40, c === playerCol ? 180 : 40, c === playerCol ? 255 : 60, 200);
        p.ellipse(COL_X[c], SHIP_Y + 22, 5, 5);
    }

    // Control hint — tiny, bottom left
    p.fill(60, 55, 80);
    p.textAlign(p.LEFT, p.BOTTOM);
    p.textSize(7);
    p.text("←→ move  A=fire  B=shield", 4, 262);
}

// ── Screen handlers ───────────────────────────────────────────────────────────

function drawPlaying(input: InputSnapshot): void {
    const cb = ctx.beatNow();

    handleMovement(input);
    spawnNotes(cb);
    evaluateObjects(cb, input);

    drawBackground();
    drawHitFlash(cb);
    drawObjects(cb);
    drawShip();
    drawHUD();

    if (life <= 0) failed = true;
    if (cb >= SONG_LENGTH_BEATS || failed) {
        ctx.audio.stop();
        state = "RESULT";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(5, 5, 18);

    // Dim starfield
    for (const star of stars) {
        p.noStroke();
        p.fill(star.brightness * 0.4, star.brightness * 0.4, Math.min(255, star.brightness * 0.5));
        p.rect(star.x, star.y, 1.5, 1.5);
    }

    p.textAlign(p.CENTER, p.CENTER);

    // Result header
    p.textSize(24);
    if (failed) {
        p.fill(220, 60, 60);
        p.text("FAIL", 168, 90);
    } else {
        p.fill(255, 220, 60);
        p.text("CLEAR!", 168, 90);
    }

    // Score
    p.fill(200, 195, 220);
    p.textSize(14);
    p.text(`SCORE: ${score}`, 168, 130);

    // Subtext
    p.fill(140, 130, 165);
    p.textSize(8);
    p.text("A to play again   ·   hold START to exit", 168, 165);

    if (input.aPressed) resetGame();
}

// ── GameModule ────────────────────────────────────────────────────────────────

const starfall: GameModule = {
    id: "starfall",
    title: "Starfall",
    author: "kpthill",
    init(c) {
        ctx = c;
        p = c.p;
        initStars();
        resetGame();
    },
    frame(input) {
        switch (state) {
            case "PLAYING": drawPlaying(input); break;
            case "RESULT":  drawResult(input);  break;
        }
    },
    teardown() {
        activeObjects = [];
        judgments = [];
        stars = [];
    },
};

export default starfall;
