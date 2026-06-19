// Fighter — an interleaved rhythm fighter. ONE horizontal lane scrolls right→left
// toward a strike line on the left. The timeline alternates two kinds of beat-events:
//
//   ATTACK  — execute a short combo (direction + button per step) as each icon
//             crosses the strike line. All steps on-beat → special move + bonus.
//   DEFEND  — the opponent winds up one beat early; a tell shows the needed defense
//             (WEAVE left/right, BLOCK up, DUCK down). Land it on the strike beat.
//
// Internal states: PLAYING → RESULT. The host handles the title/loading screens and
// the hold-START quit-to-menu gesture. Mirrors tunnel's scoring/combo/life feel.

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot, Direction } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHARTS } from "./chart";
import type {
    FightEvent, ActiveAttack, ActiveDefend, ActiveStep, DefenseDir,
} from "./events";
import {
    BUTTON_COLOR, DEFENSE_LABEL,
    STRIKE_X, LANE_Y, LANE_TOP, LANE_BOT,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS, PERFECT_WINDOW_BEATS,
    beatToX,
} from "./events";

const WIDTH = 336;
const HEIGHT = 262;

type State = "PLAYING" | "RESULT";

interface FloatText { text: string; frame: number; x: number; y: number; color: [number, number, number]; }

let ctx: GameContext;
let p: p5;

let state: State = "PLAYING";
let chart: FightEvent[] = CHARTS[0].events;
let chartIndex = 0;
let attacks: ActiveAttack[] = [];
let defends: ActiveDefend[] = [];

let score = 0;
let combo = 0;
let life = 1.0;
let failed = false;
let floats: FloatText[] = [];

// Visual feedback timers (frame-stamped)
let playerHitFrame = -999;   // player landed a blow
let playerHurtFrame = -999;  // opponent landed a blow on player
let oppHurtFrame = -999;     // opponent reeled from a combo
let specialFrame = -999;     // special-move flourish
let windupStrikeBeat = -999; // beat the opponent is currently winding up to (for animation)

// ── Helpers ──────────────────────────────────────────────────────────────────────

function pushFloat(text: string, color: [number, number, number], x: number, y: number): void {
    floats.push({ text, color, x, y, frame: p.frameCount });
}

function registerHit(points: number, quality: string, x: number, y: number): void {
    combo++;
    score += points * combo;
    const col: [number, number, number] =
        quality === "PERFECT" ? [255, 240, 80] :
        quality === "GOOD"    ? [80, 220, 120] :
        quality === "BLOCK"   ? [120, 180, 255] : [255, 255, 255];
    pushFloat(quality, col, x, y);
}

function registerMiss(text: string, lifeCost: number, x: number, y: number): void {
    combo = 0;
    life = Math.max(0, life - lifeCost);
    pushFloat(text, [255, 80, 80], x, y);
}

function startGame(): void {
    chart = CHARTS[0].events;
    chartIndex = 0;
    attacks = [];
    defends = [];
    score = 0;
    combo = 0;
    life = 1.0;
    failed = false;
    floats = [];
    playerHitFrame = playerHurtFrame = oppHurtFrame = specialFrame = -999;
    windupStrikeBeat = -999;
    state = "PLAYING";
    void ctx.audio.play(0);
}

// Map a defense direction to the matching joystick input (accepts diagonals).
function defenseMatches(def: DefenseDir, dir: Direction | null): boolean {
    if (!dir) return false;
    switch (def) {
        case "LEFT":  return dir === "LEFT"  || dir === "UP_LEFT"   || dir === "DOWN_LEFT";
        case "RIGHT": return dir === "RIGHT" || dir === "UP_RIGHT"  || dir === "DOWN_RIGHT";
        case "UP":    return dir === "UP"    || dir === "UP_LEFT"   || dir === "UP_RIGHT";
        case "DOWN":  return dir === "DOWN"  || dir === "DOWN_LEFT" || dir === "DOWN_RIGHT";
    }
}

// ── Spawning ───────────────────────────────────────────────────────────────────

function spawn(currentBeat: number): void {
    while (chartIndex < chart.length) {
        const ev = chart[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            if (ev.kind === "attack") {
                const steps: ActiveStep[] = ev.steps.map(s => ({ step: s, done: false, missed: false }));
                attacks.push({ event: ev, steps, resolved: false, special: false });
            } else {
                defends.push({ event: ev, resolved: false, blocked: false });
            }
            chartIndex++;
        } else break;
    }
}

// ── Evaluation ───────────────────────────────────────────────────────────────────

function evaluateAttacks(currentBeat: number, input: InputSnapshot): void {
    for (const atk of attacks) {
        if (atk.resolved) continue;
        for (const as of atk.steps) {
            if (as.done || as.missed) continue;
            const beatDiff = currentBeat - as.step.beat;
            const x = STRIKE_X;
            const pressed = as.step.button === "A" ? input.aPressed : input.bPressed;
            const dirMatch = input.direction === as.step.direction;
            if (pressed && dirMatch && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                const perfect = Math.abs(beatDiff) <= PERFECT_WINDOW_BEATS;
                registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", x, LANE_Y - 16);
                as.done = true;
                playerHitFrame = p.frameCount;
            } else if (beatDiff > HIT_WINDOW_BEATS) {
                registerMiss("MISS", 0.06, x, LANE_Y - 16);
                as.missed = true;
            }
            break; // steps are executed in order; only the earliest pending step is live
        }
        // Resolve the combo once every step is done or missed.
        if (atk.steps.every(s => s.done || s.missed)) {
            atk.resolved = true;
            const allHit = atk.steps.every(s => s.done);
            if (allHit && atk.steps.length >= 2) {
                atk.special = true;
                specialFrame = p.frameCount;
                oppHurtFrame = p.frameCount;
                score += 500 * Math.max(1, combo);
                pushFloat("SPECIAL!", [255, 220, 60], WIDTH / 2, 52);
            } else if (allHit) {
                oppHurtFrame = p.frameCount;
            }
        }
    }
    attacks = attacks.filter(a => !a.resolved || currentBeat - a.event.beat < LOOKAHEAD_BEATS);
}

function evaluateDefends(currentBeat: number, input: InputSnapshot): void {
    // Track the nearest upcoming/active windup for the opponent animation.
    windupStrikeBeat = -999;
    for (const d of defends) {
        if (!d.resolved) {
            const lead = d.event.beat - currentBeat;
            if (lead <= 1 && lead > -HIT_WINDOW_BEATS && d.event.beat > windupStrikeBeat) {
                windupStrikeBeat = d.event.beat;
            }
        }
        if (d.resolved) continue;
        const beatDiff = currentBeat - d.event.beat;
        const matched = defenseMatches(d.event.defense, input.direction);
        if (matched && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
            d.resolved = true;
            d.blocked = true;
            registerHit(200, "BLOCK", STRIKE_X, LANE_Y - 16);
        } else if (beatDiff > HIT_WINDOW_BEATS) {
            d.resolved = true;
            d.blocked = false;
            registerMiss("HIT!", 0.12, STRIKE_X, LANE_Y - 16);
            playerHurtFrame = p.frameCount;
        }
    }
    defends = defends.filter(d => !d.resolved || currentBeat - d.event.beat < LOOKAHEAD_BEATS);
}

// ── Rendering: arena + figures ───────────────────────────────────────────────────

function drawArena(currentBeat: number): void {
    p.background(18, 14, 30);

    // Floor
    p.noStroke();
    p.fill(28, 22, 44);
    p.rect(0, 150, WIDTH, HEIGHT - 150);
    p.stroke(60, 50, 90);
    p.strokeWeight(1);
    p.line(0, 150, WIDTH, 150);

    // Subtle backdrop pulse on the beat
    const pulse = 1 - (currentBeat % 1);
    p.noStroke();
    p.fill(40, 30, 70, 30 * pulse);
    p.rect(0, 0, WIDTH, 150);
}

function drawFighter(x: number, facing: number, hurt: boolean, attacking: boolean, color: [number, number, number]): void {
    // Simple stick fighter. facing = +1 faces right, -1 faces left.
    const groundY = 168;
    const shake = hurt ? (Math.random() - 0.5) * 4 : 0;
    const fx = x + shake;
    const [r, g, b] = hurt ? [230, 70, 70] : color;
    p.stroke(r, g, b);
    p.strokeWeight(3);
    p.noFill();
    // Head
    p.fill(r, g, b);
    p.noStroke();
    p.ellipse(fx, groundY - 34, 11, 11);
    // Body
    p.stroke(r, g, b);
    p.strokeWeight(3);
    p.line(fx, groundY - 28, fx, groundY - 10);
    // Legs
    p.line(fx, groundY - 10, fx - 6, groundY);
    p.line(fx, groundY - 10, fx + 6, groundY);
    // Arms — punch extends toward the opponent when attacking
    const reach = attacking ? 14 : 7;
    p.line(fx, groundY - 24, fx + facing * reach, groundY - (attacking ? 26 : 18));
    p.line(fx, groundY - 24, fx - facing * 5, groundY - 16);
}

function drawStrikeLine(currentBeat: number): void {
    // Lane backdrop
    p.noStroke();
    p.fill(24, 20, 40);
    p.rect(STRIKE_X, LANE_TOP, WIDTH - STRIKE_X, LANE_BOT - LANE_TOP);

    // The strike line itself, pulses on the beat
    const onBeat = 1 - (currentBeat % 1);
    p.stroke(180, 160, 255, 120 + 120 * onBeat);
    p.strokeWeight(2);
    p.line(STRIKE_X, LANE_TOP - 2, STRIKE_X, LANE_BOT + 2);
    p.noStroke();
    p.fill(180, 160, 255, 80);
    p.triangle(STRIKE_X - 6, LANE_Y - 4, STRIKE_X - 6, LANE_Y + 4, STRIKE_X, LANE_Y);
}

function drawAttacks(currentBeat: number): void {
    for (const atk of attacks) {
        const steps = atk.steps;
        // Connecting rail between steps so a combo reads as one unit.
        if (steps.length > 1) {
            const xs = steps.map(s => beatToX(s.step.beat, currentBeat));
            p.stroke(90, 80, 130, 120);
            p.strokeWeight(2);
            p.line(Math.min(...xs), LANE_Y, Math.max(...xs), LANE_Y);
        }
        for (let i = 0; i < steps.length; i++) {
            const as = steps[i];
            if (as.done) continue;
            const x = beatToX(as.step.beat, currentBeat);
            if (x < STRIKE_X - 14 || x > WIDTH + 14) continue;
            const [r, g, b] = BUTTON_COLOR[as.step.button];
            const faded = as.missed;
            p.fill(faded ? 70 : r, faded ? 60 : g, faded ? 70 : b);
            p.stroke(255, 255, 255, faded ? 60 : 180);
            p.strokeWeight(1.5);
            p.ellipse(x, LANE_Y, 16, 16);
            // Direction arrow
            drawArrow(x, LANE_Y, as.step.direction, faded);
            // Button letter beneath
            p.noStroke();
            p.fill(faded ? 90 : 255, faded ? 90 : 255, faded ? 90 : 255);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(7);
            p.text(as.step.button, x, LANE_Y + 13);
        }
    }
}

function drawArrow(x: number, y: number, dir: Direction, faded: boolean): void {
    const ang: Record<Direction, number> = {
        RIGHT: 0, DOWN_RIGHT: Math.PI / 4, DOWN: Math.PI / 2, DOWN_LEFT: (3 * Math.PI) / 4,
        LEFT: Math.PI, UP_LEFT: -(3 * Math.PI) / 4, UP: -Math.PI / 2, UP_RIGHT: -Math.PI / 4,
    };
    const a = ang[dir];
    const len = 5;
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len;
    p.stroke(faded ? 120 : 255, faded ? 120 : 255, faded ? 120 : 255);
    p.strokeWeight(1.5);
    p.line(x - Math.cos(a) * len, y - Math.sin(a) * len, tx, ty);
    // Arrowhead
    const wing = 0.5;
    p.line(tx, ty, tx - Math.cos(a - wing) * 3, ty - Math.sin(a - wing) * 3);
    p.line(tx, ty, tx - Math.cos(a + wing) * 3, ty - Math.sin(a + wing) * 3);
}

function drawDefends(currentBeat: number): void {
    for (const d of defends) {
        if (d.resolved) continue;
        const x = beatToX(d.event.beat, currentBeat);
        if (x < STRIKE_X - 14 || x > WIDTH + 14) continue;
        const lead = d.event.beat - currentBeat;
        // Telegraph icon: red diamond marked with the required defense.
        const danger = lead <= 1;
        const r = danger ? 255 : 200;
        p.push();
        p.translate(x, LANE_Y);
        p.rotate(Math.PI / 4);
        p.fill(r, 60, 60, danger ? 230 : 150);
        p.stroke(255, 200, 200, 200);
        p.strokeWeight(1.5);
        p.rectMode(p.CENTER);
        const s = danger ? 18 : 15;
        p.rect(0, 0, s, s, 2);
        p.pop();
        // Defense glyph
        drawArrow(x, LANE_Y, d.event.defense, false);
        p.noStroke();
        p.fill(255, 230, 230);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(6);
        p.text(DEFENSE_LABEL[d.event.defense], x, LANE_Y + 14);
    }
}

function drawInputIndicator(input: InputSnapshot): void {
    const ox = 16, oy = 240, pip = 5;
    p.noStroke();
    const arms: [Direction, number, number][] = [
        ["UP", 0, -pip * 1.4], ["DOWN", 0, pip * 1.4],
        ["LEFT", -pip * 1.4, 0], ["RIGHT", pip * 1.4, 0],
    ];
    for (const [dir, dx, dy] of arms) {
        const active = input.direction === dir ||
            (dir === "UP"    && (input.direction === "UP_LEFT"   || input.direction === "UP_RIGHT")) ||
            (dir === "DOWN"  && (input.direction === "DOWN_LEFT" || input.direction === "DOWN_RIGHT")) ||
            (dir === "LEFT"  && (input.direction === "UP_LEFT"   || input.direction === "DOWN_LEFT")) ||
            (dir === "RIGHT" && (input.direction === "UP_RIGHT"  || input.direction === "DOWN_RIGHT"));
        p.fill(active ? 220 : 50);
        p.rect(ox + dx - 2, oy + dy - 2, 5, 5, 1);
    }
    p.fill(input.aHeld ? BUTTON_COLOR.A : [45, 45, 60]);
    p.ellipse(ox + 24, oy, 8, 8);
    p.fill(input.bHeld ? BUTTON_COLOR.B : [45, 45, 60]);
    p.ellipse(ox + 35, oy, 8, 8);
}

function drawHUD(): void {
    // Life bar (player) on the left
    const barW = 120, barX = 12, barY = 12;
    p.noStroke();
    p.fill(35, 28, 55);
    p.rect(barX, barY, barW, 6, 2);
    const lc = life > 0.5 ? p.color(80, 200, 120) : life > 0.25 ? p.color(230, 180, 40) : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 6, 2);
    p.fill(150, 140, 180);
    p.textAlign(p.LEFT, p.BOTTOM);
    p.textSize(7);
    p.text("YOU", barX, barY - 1);

    // Score
    p.fill(200, 195, 220);
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), WIDTH - 4, 4);

    // Combo
    if (combo > 1) {
        p.textAlign(p.RIGHT, p.TOP);
        p.fill(255, 220, 120);
        p.textSize(11);
        p.text(`${combo}x`, WIDTH - 4, 16);
    }

    // Floating judgments
    floats = floats.filter(f => p.frameCount - f.frame < 45);
    for (const f of floats) {
        const age = p.frameCount - f.frame;
        const alpha = p.map(age, 22, 45, 255, 0);
        const dy = p.map(age, 0, 45, 0, -12);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(f.text === "SPECIAL!" ? 13 : 11);
        p.fill(f.color[0], f.color[1], f.color[2], alpha);
        p.text(f.text, f.x, f.y + dy);
    }
}

// ── Screens ────────────────────────────────────────────────────────────────────

function drawPlaying(input: InputSnapshot): void {
    const cb = ctx.beatNow();
    spawn(cb);
    evaluateAttacks(cb, input);
    evaluateDefends(cb, input);

    drawArena(cb);
    drawStrikeLine(cb);

    // Player fighter (left, faces right). Punches when a hit just landed.
    const playerAttacking = p.frameCount - playerHitFrame < 8;
    const playerHurt = p.frameCount - playerHurtFrame < 10;
    drawFighter(46, 1, playerHurt, playerAttacking, [120, 200, 255]);

    // Opponent (right, faces left). Winds up before a defend strike, reels when combo'd.
    const windupActive = windupStrikeBeat > -900;
    const windupLead = windupActive ? windupStrikeBeat - cb : 99;
    const oppAttacking = windupActive && windupLead < 0.5;
    const oppHurt = p.frameCount - oppHurtFrame < 12;
    const oppX = 300 - (windupActive && windupLead < 1 ? (1 - Math.max(0, windupLead)) * 6 : 0);
    drawFighter(oppX, -1, oppHurt, oppAttacking, [255, 150, 120]);

    // Windup warning glow above opponent
    if (windupActive && windupLead < 1) {
        const a = p.map(Math.max(0, windupLead), 0, 1, 220, 60);
        p.noStroke();
        p.fill(255, 80, 80, a);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.textSize(8);
        p.text("!", 300, 128);
    }

    // Special-move flourish ring around the strike line
    if (p.frameCount - specialFrame < 18) {
        const t = (p.frameCount - specialFrame) / 18;
        p.noFill();
        p.stroke(255, 220, 60, 255 * (1 - t));
        p.strokeWeight(3);
        p.ellipse(STRIKE_X, LANE_Y, 20 + t * 50, 20 + t * 50);
    }

    drawDefends(cb);
    drawAttacks(cb);
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
    p.background(18, 14, 30);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    const win = !failed;
    p.fill(win ? p.color(255, 230, 90) : p.color(220, 70, 70));
    p.textSize(26);
    p.text(win ? "WIN" : "LOSE", WIDTH / 2, HEIGHT / 2 - 34);

    p.fill(220, 210, 255);
    p.textSize(13);
    p.text(`SCORE ${score}`, WIDTH / 2, HEIGHT / 2 + 2);

    // Two fighters flanking the result
    drawFighter(70, 1, false, win, [120, 200, 255]);
    drawFighter(266, -1, !win, false, [255, 150, 120]);

    p.fill(150, 140, 180);
    p.textSize(9);
    p.text("A to rematch   ·   hold START to exit", WIDTH / 2, HEIGHT / 2 + 30);

    if (input.aPressed) startGame();
}

// ── Module ─────────────────────────────────────────────────────────────────────

const fighter: GameModule = {
    id: "fighter",
    title: "Fighter",
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
        attacks = [];
        defends = [];
        floats = [];
        ctx.audio.stop();
    },
};

export default fighter;
