// Crypt — a Crypt-of-the-NecroDancer-style grid crawler. Everything happens ON
// THE BEAT: each beat is a "step window". During the window the player commits
// ONE cardinal direction (last direction held this beat wins). On the beat
// boundary we resolve, in order:
//   1. the player's committed move — into an empty tile = step; into an enemy =
//      ATTACK (strike it); into a wall = wasted beat (bump, breaks groove).
//   2. every enemy takes its action; an enemy that lands on / moves into the
//      player deals damage.
// Moving on every beat builds GROOVE (a combo multiplier). Letting a beat pass
// with NO input — or bumping a wall — resets groove to 1.
//
// States: PLAYING → RESULT (A to replay). Host owns title + hold-START quit.

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import {
    COLS, ROWS, TILE, GRID_X, GRID_Y, GRID_W, GRID_H,
    MAX_LIFE, HIT_COST, MAX_GROOVE,
    ENEMY_SPEC, inBounds, dirToStep,
    type Enemy, type Player,
} from "./types";
import { resetSpawner, maybeSpawn, enemyStep } from "./enemies";

type State = "PLAYING" | "RESULT";

interface FloatText { text: string; frame: number; x: number; y: number; col: [number, number, number]; }

let ctx: GameContext;
let p: p5;

let state: State = "PLAYING";
let player: Player;
let enemies: Enemy[] = [];
let score = 0;
let groove = 1;          // combo / multiplier
let life = MAX_LIFE;
let failed = false;
let kills = 0;

let lastBeat = -1;        // last integer beat we resolved
let committedDir: { x: number; y: number } | null = null; // staged move for current beat
let floats: FloatText[] = [];
let shakeFrame = -999;

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

function startRun(): void {
    player = {
        x: Math.floor(COLS / 2),
        y: Math.floor(ROWS / 2),
        fromX: Math.floor(COLS / 2),
        fromY: Math.floor(ROWS / 2),
        hitFrame: -999,
        bumpFrame: -999,
    };
    enemies = [];
    score = 0;
    groove = 1;
    life = MAX_LIFE;
    failed = false;
    kills = 0;
    lastBeat = -1;
    committedDir = null;
    floats = [];
    resetSpawner();
    state = "PLAYING";
    void ctx.audio.play(0);
}

function pushFloat(text: string, tx: number, ty: number, col: [number, number, number]): void {
    floats.push({
        text,
        frame: p.frameCount,
        x: GRID_X + tx * TILE + TILE / 2,
        y: GRID_Y + ty * TILE + TILE / 2,
        col,
    });
}

function enemyAt(x: number, y: number): Enemy | undefined {
    return enemies.find(e => e.x === x && e.y === y);
}

// ── Beat resolution ─────────────────────────────────────────────────────────────

function resolveBeat(beatJustPassed: number): void {
    // snapshot previous tiles for slide tweens
    player.fromX = player.x;
    player.fromY = player.y;
    for (const e of enemies) { e.fromX = e.x; e.fromY = e.y; }

    let acted = false;

    // 1. Player action
    if (committedDir) {
        const tx = player.x + committedDir.x;
        const ty = player.y + committedDir.y;
        if (!inBounds(tx, ty)) {
            // wall bump — wasted beat, breaks groove
            player.bumpFrame = p.frameCount;
            groove = 1;
        } else {
            const target = enemyAt(tx, ty);
            if (target) {
                // ATTACK
                target.hp -= 1;
                target.hitFrame = p.frameCount;
                acted = true;
                if (target.hp <= 0) {
                    const pts = ENEMY_SPEC[target.kind].points * groove;
                    score += pts;
                    kills++;
                    pushFloat(`+${pts}`, tx, ty, [255, 230, 90]);
                    enemies = enemies.filter(e => e !== target);
                }
                groove = Math.min(MAX_GROOVE, groove + 1);
            } else {
                // step into empty tile
                player.x = tx;
                player.y = ty;
                acted = true;
                groove = Math.min(MAX_GROOVE, groove + 1);
            }
        }
    } else {
        // missed the beat — no input. Break groove.
        groove = 1;
    }
    committedDir = null;
    void acted;

    // 2. Enemy actions
    for (const e of enemies) {
        const dest = enemyStep(e, player, enemies);
        e.x = dest.x;
        e.y = dest.y;
    }

    // 3. Collisions: any enemy sharing the player's tile deals damage + is shoved
    //    off (knockback to its previous tile so it doesn't camp).
    let damaged = false;
    for (const e of enemies) {
        if (e.x === player.x && e.y === player.y) {
            damaged = true;
            e.x = e.fromX;
            e.y = e.fromY;
        }
    }
    if (damaged) {
        life = Math.max(0, life - HIT_COST);
        groove = 1;
        player.hitFrame = p.frameCount;
        shakeFrame = p.frameCount;
        pushFloat("HIT", player.x, player.y, [255, 70, 70]);
        if (life <= 0) failed = true;
    }

    // 4. Spawn waves
    maybeSpawn(beatJustPassed + 1, enemies, player);
}

// ── Rendering ───────────────────────────────────────────────────────────────────

// eased slide from previous tile, settling within the first part of the beat
function lerpedCenter(x: number, y: number, fx: number, fy: number, beatFrac: number): [number, number] {
    const t = Math.min(1, beatFrac / 0.45);
    const e = 1 - (1 - t) * (1 - t); // ease-out
    const cx = GRID_X + (fx + (x - fx) * e) * TILE + TILE / 2;
    const cy = GRID_Y + (fy + (y - fy) * e) * TILE + TILE / 2;
    return [cx, cy];
}

function drawGrid(beatFrac: number): void {
    // pulse the floor on the beat
    const pulse = 1 - beatFrac;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const dark = (x + y) % 2 === 0;
            const base = dark ? 26 : 34;
            const b = base + pulse * 10;
            p.noStroke();
            p.fill(b * 0.55, b * 0.5, b);
            p.rect(GRID_X + x * TILE, GRID_Y + y * TILE, TILE, TILE);
        }
    }
    p.noFill();
    p.stroke(90, 80, 150, 120);
    p.strokeWeight(1.5);
    p.rect(GRID_X, GRID_Y, GRID_W, GRID_H);
}

function drawPlayer(beatFrac: number): void {
    const [cx, cy] = lerpedCenter(player.x, player.y, player.fromX, player.fromY, beatFrac);
    const flash = p.frameCount - player.hitFrame < 8;
    const bump = p.frameCount - player.bumpFrame < 8;
    // beat-bob
    const bob = (1 - Math.min(1, beatFrac / 0.5)) * 3;
    p.noStroke();
    // shadow
    p.fill(0, 0, 0, 90);
    p.ellipse(cx, cy + 9, 18, 6);
    // body
    if (flash) p.fill(255, 120, 120);
    else if (bump) p.fill(200, 180, 90);
    else p.fill(120, 200, 255);
    p.stroke(255, 255, 255, 180);
    p.strokeWeight(1.5);
    p.ellipse(cx, cy - bob, 18, 18);
    // eyes
    p.noStroke();
    p.fill(20, 30, 50);
    p.ellipse(cx - 4, cy - bob - 1, 4, 5);
    p.ellipse(cx + 4, cy - bob - 1, 4, 5);
}

function drawEnemy(e: Enemy, beatFrac: number): void {
    const [cx, cy] = lerpedCenter(e.x, e.y, e.fromX, e.fromY, beatFrac);
    const flash = p.frameCount - e.hitFrame < 6;
    p.noStroke();
    p.fill(0, 0, 0, 90);
    p.ellipse(cx, cy + 9, 18, 6);

    if (e.kind === "skeleton") {
        p.fill(flash ? [255, 255, 255] : [225, 225, 210]);
        p.stroke(60, 60, 70);
        p.strokeWeight(1);
        p.ellipse(cx, cy - 2, 16, 16);
        p.noStroke();
        p.fill(20, 20, 30);
        p.ellipse(cx - 3.5, cy - 3, 3.5, 4);
        p.ellipse(cx + 3.5, cy - 3, 3.5, 4);
        p.stroke(180, 180, 170);
        p.strokeWeight(2);
        p.line(cx, cy + 4, cx, cy + 9);
    } else if (e.kind === "slime") {
        p.fill(flash ? [255, 255, 255] : [120, 220, 130]);
        p.stroke(40, 120, 60);
        p.strokeWeight(1);
        p.arc(cx, cy + 1, 20, 18, p.PI, p.TWO_PI);
        p.rect(cx - 10, cy + 1, 20, 5);
        p.noStroke();
        p.fill(20, 50, 30);
        p.ellipse(cx - 4, cy - 2, 3, 4);
        p.ellipse(cx + 4, cy - 2, 3, 4);
    } else {
        // bat
        p.fill(flash ? [255, 255, 255] : [150, 110, 200]);
        p.stroke(70, 50, 110);
        p.strokeWeight(1);
        const wing = Math.sin(p.frameCount * 0.5) * 3;
        p.triangle(cx, cy, cx - 12, cy - 4 - wing, cx - 6, cy + 4);
        p.triangle(cx, cy, cx + 12, cy - 4 - wing, cx + 6, cy + 4);
        p.ellipse(cx, cy, 11, 11);
        p.noStroke();
        p.fill(255, 200, 60);
        p.ellipse(cx - 2.5, cy - 1, 2.5, 3);
        p.ellipse(cx + 2.5, cy - 1, 2.5, 3);
    }
}

function drawHUD(beatFrac: number): void {
    // score
    p.noStroke();
    p.fill(210, 205, 230);
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(10);
    p.text(score.toString().padStart(7, "0"), 332, 4);

    // groove multiplier
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(10);
    const gcol = groove >= MAX_GROOVE
        ? p.color(255, 210, 80) : p.color(180, 160, 220);
    p.fill(groove > 1 ? gcol : p.color(120, 110, 150));
    p.text(`GROOVE ${groove}×`, 4, 4);

    // beat pip — flashes on the beat so the player can read the rhythm
    const beatPulse = 1 - Math.min(1, beatFrac / 0.5);
    p.fill(255, 230, 120, 80 + beatPulse * 175);
    p.ellipse(168, 9, 6 + beatPulse * 8, 6 + beatPulse * 8);

    // life bar
    const barW = GRID_W;
    const barX = GRID_X;
    const barY = GRID_Y - 10;
    p.noStroke();
    p.fill(35, 28, 55);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5 ? p.color(80, 200, 120)
        : life > 0.25 ? p.color(230, 180, 40) : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    // floating texts
    floats = floats.filter(f => p.frameCount - f.frame < 45);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(11);
    for (const f of floats) {
        const age = p.frameCount - f.frame;
        const alpha = p.map(age, 20, 45, 255, 0);
        const dy = p.map(age, 0, 45, 0, -14);
        p.fill(f.col[0], f.col[1], f.col[2], alpha);
        p.text(f.text, f.x, f.y + dy);
    }
}

// ── Game loop ───────────────────────────────────────────────────────────────────

function drawPlaying(input: InputSnapshot): void {
    const beat = ctx.beatNow();
    const ibeat = Math.floor(beat);
    const beatFrac = beat - ibeat;

    // stage the player's chosen direction for the current beat (last cardinal
    // held this beat wins). Only stage once we know the beat hasn't been resolved.
    const step = dirToStep(input.direction);
    if (step && ibeat > lastBeat) committedDir = step;

    // resolve on each new integer beat boundary
    if (ibeat > lastBeat && lastBeat >= 0) {
        // resolve every beat that passed (handles frame drops / song stops)
        for (let b = lastBeat; b < ibeat; b++) {
            resolveBeat(b);
            if (failed) break;
        }
    }
    if (lastBeat < 0) {
        // first frame: just spawn the opening wave
        maybeSpawn(ibeat, enemies, player);
    }
    lastBeat = ibeat;

    // ── draw ──
    const shake = p.frameCount - shakeFrame < 6 ? (6 - (p.frameCount - shakeFrame)) : 0;
    p.push();
    if (shake > 0) p.translate(Math.random() * shake - shake / 2, Math.random() * shake - shake / 2);
    p.background(10, 8, 20);
    drawGrid(beatFrac);
    // draw enemies behind player when above, simple paint order is fine here
    for (const e of enemies) drawEnemy(e, beatFrac);
    drawPlayer(beatFrac);
    p.pop();

    drawHUD(beatFrac);

    if (failed) {
        ctx.audio.stop();
        state = "RESULT";
    } else if (beat >= SONG_LENGTH_BEATS) {
        ctx.audio.stop();
        state = "RESULT";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(10, 8, 20);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    const cx = 168, cy = 131;
    p.fill(220, 210, 255);
    p.textSize(20);
    p.text(failed ? "YOU DIED" : "SURVIVED!", cx, cy - 40);
    p.textSize(13);
    p.fill(255, 230, 120);
    p.text(`SCORE ${score}`, cx, cy - 8);
    p.fill(170, 200, 240);
    p.textSize(10);
    p.text(`${kills} kills`, cx, cy + 14);
    p.fill(150, 140, 180);
    p.textSize(9);
    p.text("A to replay   ·   hold START to exit", cx, cy + 44);

    if (input.aPressed) startRun();
}

// ── Module ───────────────────────────────────────────────────────────────────────

const necrodancer: GameModule = {
    id: "necrodancer",
    title: "Crypt",
    author: "kpthill",
    init(c) {
        ctx = c;
        p = c.p;
        startRun();
    },
    frame(input) {
        switch (state) {
            case "PLAYING": drawPlaying(input); break;
            case "RESULT":  drawResult(input);  break;
        }
    },
    teardown() {
        enemies = [];
        floats = [];
        ctx.audio.stop();
    },
};

export default necrodancer;
