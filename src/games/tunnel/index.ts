// Tunnel — the original circular game, refactored as a GameModule and the reference
// implementation other prototypes copy. Notes scroll center-outward; press the
// matching joystick direction + button (A/B) as each note reaches the hit ring.
//
// Internal states: SELECT (pick a chart) → PLAYING → RESULT. The host handles the
// title/loading screens and the hold-START quit-to-menu gesture.

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot, Direction } from "../../platform/input";
import { DIRECTION_ANGLE } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHARTS } from "./chart";
import type { NoteEvent } from "./notes";
import {
    BUTTON_COLOR, HIT_ZONE_RADIUS, CX, CY,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS, noteRadius,
} from "./notes";
import type { ActiveNote, Button } from "./notes";

const BEAT_PX = HIT_ZONE_RADIUS / LOOKAHEAD_BEATS;

type State = "SELECT" | "PLAYING" | "RESULT";

interface Judgment { text: string; frame: number; x: number; y: number; }

let ctx: GameContext;
let p: p5;

let state: State = "SELECT";
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function posOnRing(angle: number, r: number): [number, number] {
    return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
}

function pushJudgment(text: string, dir: Direction): void {
    const angle = DIRECTION_ANGLE[dir];
    const [x, y] = posOnRing(angle, HIT_ZONE_RADIUS - 18);
    judgments.push({ text, frame: p.frameCount, x, y });
}

function registerHit(points: number, quality: string, note: ActiveNote): void {
    combo++;
    score += points * combo;
    pushJudgment(quality, note.event.direction);
    note.hit = true;
}

function registerMiss(note: ActiveNote): void {
    combo = 0;
    life = Math.max(0, life - 0.08);
    pushJudgment("MISS", note.event.direction);
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
    state = "PLAYING";
    void ctx.audio.play(0);
}

// ── Game logic ─────────────────────────────────────────────────────────────────

function spawnNotes(currentBeat: number): void {
    while (chartIndex < activeChart.length) {
        const ev = activeChart[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            activeNotes.push({ event: ev, hit: false, missed: false, holdActive: false, holdComplete: false });
            chartIndex++;
        } else break;
    }
}

function evaluateNotes(currentBeat: number, input: InputSnapshot): void {
    for (const note of activeNotes) {
        if (note.hit || note.missed) continue;
        const { event: ev } = note;
        const beatDiff = currentBeat - ev.beat;

        if (ev.type === "tap") {
            const buttonPressed = ev.button === "A" ? input.aPressed : input.bPressed;
            const dirMatch = input.direction === ev.direction;
            if (buttonPressed && dirMatch && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS;
                registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", note);
            } else if (beatDiff > HIT_WINDOW_BEATS) {
                registerMiss(note);
            }
        } else {
            const dur = ev.duration ?? 1;
            const holdEndBeat = ev.beat + dur;
            if (!note.holdActive) {
                const buttonPressed = ev.button === "A" ? input.aPressed : input.bPressed;
                const dirMatch = input.direction === ev.direction;
                if (buttonPressed && dirMatch && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                    note.holdActive = true;
                    combo++;
                    pushJudgment("HOLD", ev.direction);
                } else if (beatDiff > HIT_WINDOW_BEATS) {
                    registerMiss(note);
                }
            } else {
                const buttonHeld = ev.button === "A" ? input.aHeld : input.bHeld;
                const dirHeld = input.direction === ev.direction;
                if (!buttonHeld || !dirHeld) {
                    combo = 0;
                    life = Math.max(0, life - 0.04);
                    pushJudgment("DROP", ev.direction);
                    note.missed = true;
                } else if (currentBeat >= holdEndBeat) {
                    note.holdComplete = true;
                    registerHit(300, "PERFECT", note);
                }
            }
        }
    }
    activeNotes = activeNotes.filter(n => currentBeat - n.event.beat < LOOKAHEAD_BEATS + 1);
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function drawTunnel(currentBeat: number): void {
    p.background(12, 8, 24);

    p.strokeWeight(0.5);
    for (const angle of Object.values(DIRECTION_ANGLE)) {
        p.stroke(30, 24, 50, 160);
        p.line(CX, CY, CX + Math.cos(angle) * HIT_ZONE_RADIUS, CY + Math.sin(angle) * HIT_ZONE_RADIUS);
    }

    const subPx = BEAT_PX;
    const scroll = (currentBeat % 1) * subPx;
    p.noFill();
    for (let k = 0; ; k++) {
        const r = scroll + k * subPx;
        if (r > HIT_ZONE_RADIUS) break;
        const alpha = p.map(r, 0, HIT_ZONE_RADIUS, 20, 70);
        p.stroke(60, 50, 110, alpha);
        p.strokeWeight(1.5);
        p.ellipse(CX, CY, r * 2, r * 2);
    }

    p.stroke(140, 110, 220);
    p.strokeWeight(2);
    p.noFill();
    p.ellipse(CX, CY, HIT_ZONE_RADIUS * 2, HIT_ZONE_RADIUS * 2);

    for (const angle of Object.values(DIRECTION_ANGLE)) {
        const [x, y] = posOnRing(angle, HIT_ZONE_RADIUS);
        p.fill(40, 30, 65);
        p.stroke(90, 70, 150);
        p.strokeWeight(1);
        p.ellipse(x, y, 7, 7);
    }
}

function drawNotes(currentBeat: number): void {
    for (const note of activeNotes) {
        if (note.missed) continue;
        const { event: ev } = note;
        const angle = DIRECTION_ANGLE[ev.direction];
        const [cr, cg, cb] = BUTTON_COLOR[ev.button as Button];
        const rHead = noteRadius(ev.beat, currentBeat);

        if (ev.type === "tap") {
            if (note.hit) continue;
            if (rHead < 0 || rHead > HIT_ZONE_RADIUS + 15) continue;
            const [x, y] = posOnRing(angle, p.constrain(rHead, 0, HIT_ZONE_RADIUS));
            p.fill(cr, cg, cb);
            p.stroke(255, 255, 255, 160);
            p.strokeWeight(1.5);
            p.ellipse(x, y, 13, 13);
        } else {
            const dur = ev.duration ?? 1;
            const rTail = noteRadius(ev.beat + dur, currentBeat);
            const r0 = p.constrain(Math.min(rHead, rTail), 0, HIT_ZONE_RADIUS);
            const r1 = p.constrain(Math.max(rHead, rTail), 0, HIT_ZONE_RADIUS);
            if (r1 > 0) {
                p.stroke(cr, cg, cb, note.holdActive ? 220 : 150);
                p.strokeWeight(6);
                p.line(CX + Math.cos(angle) * r0, CY + Math.sin(angle) * r0,
                       CX + Math.cos(angle) * r1, CY + Math.sin(angle) * r1);
            }
            if (!note.holdActive && rHead <= HIT_ZONE_RADIUS + 5) {
                const hr = p.constrain(rHead, 0, HIT_ZONE_RADIUS);
                const [x, y] = posOnRing(angle, hr);
                p.fill(cr, cg, cb);
                p.stroke(255, 255, 255, 160);
                p.strokeWeight(1.5);
                p.ellipse(x, y, 13, 13);
            }
        }
    }
}

function drawInputIndicator(input: InputSnapshot): void {
    const ox = 12, oy = 220, pip = 5;
    p.noStroke();
    const arms: [Direction, number, number][] = [
        ["UP", 0, -pip * 1.5], ["DOWN", 0, pip * 1.5],
        ["LEFT", -pip * 1.5, 0], ["RIGHT", pip * 1.5, 0],
    ];
    for (const [dir, dx, dy] of arms) {
        const active = input.direction === dir ||
            (dir === "UP"    && (input.direction === "UP_LEFT"   || input.direction === "UP_RIGHT")) ||
            (dir === "DOWN"  && (input.direction === "DOWN_LEFT" || input.direction === "DOWN_RIGHT")) ||
            (dir === "LEFT"  && (input.direction === "UP_LEFT"   || input.direction === "DOWN_LEFT")) ||
            (dir === "RIGHT" && (input.direction === "UP_RIGHT"  || input.direction === "DOWN_RIGHT"));
        p.fill(active ? 220 : 45);
        p.rect(ox + dx - 2, oy + dy - 2, 5, 5, 1);
    }
    p.fill(input.aHeld ? BUTTON_COLOR.A : [40, 40, 55]);
    p.ellipse(ox + 22, oy, 8, 8);
    p.fill(input.bHeld ? BUTTON_COLOR.B : [40, 40, 55]);
    p.ellipse(ox + 33, oy, 8, 8);
}

function drawHUD(): void {
    const barW = HIT_ZONE_RADIUS * 2;
    const barX = CX - HIT_ZONE_RADIUS;
    const barY = CY + HIT_ZONE_RADIUS + 8;
    p.noStroke();
    p.fill(35, 28, 55);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5 ? p.color(80, 200, 120) : life > 0.25 ? p.color(230, 180, 40) : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    p.fill(200, 195, 220);
    p.noStroke();
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), 334, 4);

    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 4);
    }

    judgments = judgments.filter(j => p.frameCount - j.frame < 50);
    for (const j of judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 25, 50, 255, 0);
        const dy = p.map(age, 0, 50, 0, -12);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(11);
        if (j.text === "PERFECT") p.fill(255, 240, 80, alpha);
        else if (j.text === "GOOD") p.fill(80, 220, 120, alpha);
        else if (j.text === "HOLD") p.fill(80, 180, 255, alpha);
        else p.fill(255, 80, 80, alpha);
        p.text(j.text, j.x, j.y + dy);
    }
}

// ── Screens ────────────────────────────────────────────────────────────────────

function drawSelect(input: InputSnapshot): void {
    p.background(12, 8, 24);
    p.noFill();
    for (let r = 20; r <= HIT_ZONE_RADIUS; r += 20) {
        p.stroke(60, 50, 100, p.map(r, 0, HIT_ZONE_RADIUS, 20, 60));
        p.strokeWeight(r === HIT_ZONE_RADIUS ? 2 : 0.5);
        p.ellipse(CX, CY, r * 2, r * 2);
    }
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(160, 150, 190);
    p.textSize(9);
    p.text("TUNNEL", CX, 30);
    p.fill(220, 210, 255);
    p.textSize(13);
    p.text("SELECT CHART", CX, 52);

    for (let i = 0; i < CHARTS.length; i++) {
        const y = 95 + i * 30;
        const sel = i === selectedChart;
        p.fill(sel ? 230 : 110, sel ? 215 : 105, sel ? 255 : 140);
        p.textSize(sel ? 14 : 11);
        p.text((sel ? "> " : "  ") + CHARTS[i].name, CX, y);
    }
    p.fill(110, 100, 140);
    p.textSize(8);
    p.text("UP/DN to choose   A to play", CX, 195);

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
    drawTunnel(cb);
    spawnNotes(cb);
    evaluateNotes(cb, input);
    drawNotes(cb);
    drawInputIndicator(input);
    drawHUD();

    if (life <= 0) failed = true;
    if (cb >= SONG_LENGTH_BEATS) {
        ctx.audio.stop();
        state = "RESULT";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(12, 8, 24);
    p.noFill();
    p.stroke(140, 110, 220);
    p.strokeWeight(2);
    p.ellipse(CX, CY, HIT_ZONE_RADIUS * 2, HIT_ZONE_RADIUS * 2);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(220, 210, 255);
    p.textSize(18);
    p.text(failed ? "FAIL" : "CLEAR!", CX, CY - 25);
    p.textSize(12);
    p.text(`SCORE: ${score}`, CX, CY + 5);
    p.fill(150, 140, 180);
    p.textSize(9);
    p.text("A to replay   ·   hold START to exit", CX, CY + 28);

    if (input.aPressed) state = "SELECT";
}

// ── Module ─────────────────────────────────────────────────────────────────────

const tunnel: GameModule = {
    id: "tunnel",
    title: "Tunnel",
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
        activeNotes = [];
        judgments = [];
    },
};

export default tunnel;
