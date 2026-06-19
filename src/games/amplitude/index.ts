// Amplitude — three parallel instrument lanes scroll top→bottom toward a hit line.
// The player occupies ONE lane (joystick LEFT/RIGHT switches lanes) and taps A/B
// as gems reach the hit line in the CURRENT lane. Clearing every gem in a PHRASE
// "captures" that lane — it lights up and auto-plays, and the song visually
// assembles as more instruments lock in.
//
// Internal states: PLAYING → RESULT. The host handles the title/loading screens
// and the hold-START quit-to-menu gesture (START is reserved — never consumed here).

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";
import { CHART_GEMS, PHRASE_COUNT, PHRASE_META } from "./chart";
import type { ActiveGem, Button } from "./notes";
import {
    LANE_COUNT, LANES, BUTTON_COLOR,
    FIELD_TOP, HIT_Y, LANE_TOP_W, FIELD_LEFT, FIELD_W,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS, PERFECT_WINDOW_BEATS,
    laneCenterX, gemY,
} from "./notes";

type State = "PLAYING" | "RESULT";

interface Judgment { text: string; frame: number; x: number; y: number; color: [number, number, number]; }

let ctx: GameContext;
let p: p5;

let state: State = "PLAYING";
let activeGems: ActiveGem[] = [];
let chartIndex = 0;
let score = 0;
let combo = 0;
let life = 1.0;
let failed = false;
let judgments: Judgment[] = [];

let currentLane = 1;                  // player starts in the middle lane (BASS)
let laneLatch = false;                // debounce for LEFT/RIGHT lane switching

// Per-phrase capture tracking.
let phraseHits: number[] = [];        // gems cleanly hit per phrase
let phraseMissed: boolean[] = [];     // any miss in the phrase → uncapturable
let phraseDone: boolean[] = [];       // accounted for (capture/fail resolved)
let laneCaptured: boolean[] = [];     // lane currently lit (latest phrase captured)
let capturedCount = 0;                // total phrases captured (for the result)

// Visual flair: per-lane "lit" pulse timestamp.
let laneFlash: number[] = [];

// ── Lifecycle helpers ────────────────────────────────────────────────────────

function resetGame(): void {
    activeGems = [];
    chartIndex = 0;
    score = 0;
    combo = 0;
    life = 1.0;
    failed = false;
    judgments = [];
    currentLane = 1;
    laneLatch = false;
    phraseHits = new Array(PHRASE_COUNT).fill(0);
    phraseMissed = new Array(PHRASE_COUNT).fill(false);
    phraseDone = new Array(PHRASE_COUNT).fill(false);
    laneCaptured = new Array(LANE_COUNT).fill(false);
    capturedCount = 0;
    laneFlash = new Array(LANE_COUNT).fill(-999);
}

function startSong(): void {
    resetGame();
    state = "PLAYING";
    void ctx.audio.play(0);
}

// ── Judgments ────────────────────────────────────────────────────────────────

function pushJudgment(text: string, lane: number, color: [number, number, number]): void {
    judgments.push({ text, frame: p.frameCount, x: laneCenterX(lane), y: HIT_Y - 26, color });
}

function registerHit(gem: ActiveGem, perfect: boolean): void {
    combo++;
    const mult = comboMultiplier();
    score += (perfect ? 300 : 100) * mult;
    gem.hit = true;
    phraseHits[gem.event.phrase]++;
    pushJudgment(perfect ? "PERFECT" : "GOOD",
        gem.event.lane,
        perfect ? [255, 240, 80] : [110, 220, 140]);
    checkPhrase(gem.event.phrase);
}

function registerMiss(gem: ActiveGem): void {
    combo = 0;
    life = Math.max(0, life - 0.07);
    gem.missed = true;
    phraseMissed[gem.event.phrase] = true;
    pushJudgment("MISS", gem.event.lane, [255, 80, 80]);
    checkPhrase(gem.event.phrase);
}

// Combo multiplier rewards stringing gems / whole phrases together (Amplitude-style).
function comboMultiplier(): number {
    if (combo >= 24) return 4;
    if (combo >= 16) return 3;
    if (combo >= 8) return 2;
    return 1;
}

// Resolve a phrase once all its gems are accounted for: capture the lane if clean.
function checkPhrase(phrase: number): void {
    if (phraseDone[phrase]) return;
    const meta = PHRASE_META[phrase];
    if (phraseHits[phrase] >= meta.total) {
        // Whole phrase cleared — capture the lane.
        phraseDone[phrase] = true;
        laneCaptured[meta.lane] = true;
        laneFlash[meta.lane] = p.frameCount;
        capturedCount++;
        score += 500 * comboMultiplier();          // capture bonus
        life = Math.min(1, life + 0.06);
        pushJudgment("CAPTURE!", meta.lane, LANES[meta.lane].color);
    } else if (phraseMissed[phrase]) {
        // A miss means this phrase can never be fully cleared → fail it now.
        phraseDone[phrase] = true;
        laneCaptured[meta.lane] = false;           // lane drops out until next phrase
    }
}

// ── Update ────────────────────────────────────────────────────────────────────

function spawnGems(currentBeat: number): void {
    while (chartIndex < CHART_GEMS.length) {
        const ev = CHART_GEMS[chartIndex];
        if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
            activeGems.push({ event: ev, hit: false, missed: false });
            chartIndex++;
        } else break;
    }
}

function evaluateGems(currentBeat: number, input: InputSnapshot): void {
    // Edge presses this frame; each press consumes at most one gem in the current lane.
    let aAvail = input.aPressed;
    let bAvail = input.bPressed;

    // Find the best (nearest-in-time, in-window) gem in the current lane per button.
    const tryButton = (btn: Button, avail: boolean): boolean => {
        if (!avail) return false;
        let best: ActiveGem | null = null;
        let bestDiff = Infinity;
        for (const gem of activeGems) {
            if (gem.hit || gem.missed) continue;
            if (gem.event.lane !== currentLane || gem.event.button !== btn) continue;
            const diff = Math.abs(currentBeat - gem.event.beat);
            if (diff <= HIT_WINDOW_BEATS && diff < bestDiff) {
                best = gem;
                bestDiff = diff;
            }
        }
        if (best) {
            registerHit(best, bestDiff <= PERFECT_WINDOW_BEATS);
            return true;
        }
        return false;
    };

    if (tryButton("A", aAvail)) aAvail = false;
    if (tryButton("B", bAvail)) bAvail = false;

    // Auto-miss any gem that scrolled past the hit window unhit.
    for (const gem of activeGems) {
        if (gem.hit || gem.missed) continue;
        if (currentBeat - gem.event.beat > HIT_WINDOW_BEATS) {
            registerMiss(gem);
        }
    }

    // Drop gems that have fully scrolled off.
    activeGems = activeGems.filter(g => currentBeat - g.event.beat < LOOKAHEAD_BEATS);
}

function updateLane(input: InputSnapshot): void {
    const left = input.direction === "LEFT" || input.direction === "UP_LEFT" || input.direction === "DOWN_LEFT";
    const right = input.direction === "RIGHT" || input.direction === "UP_RIGHT" || input.direction === "DOWN_RIGHT";
    if (!left && !right) { laneLatch = false; return; }
    if (laneLatch) return;
    laneLatch = true;
    if (left) currentLane = Math.max(0, currentLane - 1);
    if (right) currentLane = Math.min(LANE_COUNT - 1, currentLane + 1);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function drawField(currentBeat: number): void {
    p.background(8, 10, 20);

    for (let lane = 0; lane < LANE_COUNT; lane++) {
        const cx = laneCenterX(lane);
        const lx = cx - LANE_TOP_W / 2;
        const isCur = lane === currentLane;
        const captured = laneCaptured[lane];
        const [cr, cg, cb] = LANES[lane].color;

        // Lane backdrop. Captured lanes glow with their instrument colour.
        p.noStroke();
        if (captured) {
            const flashAge = p.frameCount - laneFlash[lane];
            const glow = flashAge < 18 ? p.map(flashAge, 0, 18, 90, 28) : 28;
            p.fill(cr, cg, cb, glow);
        } else {
            p.fill(isCur ? 30 : 18, isCur ? 34 : 22, isCur ? 52 : 34);
        }
        p.rect(lx, FIELD_TOP, LANE_TOP_W, HIT_Y - FIELD_TOP, 3);

        // Beat ruler: horizontal lines at integer beats scrolling down the lane.
        p.strokeWeight(1);
        for (let b = Math.ceil(currentBeat); b <= currentBeat + LOOKAHEAD_BEATS; b++) {
            const y = gemY(b, currentBeat);
            if (y < FIELD_TOP || y > HIT_Y) continue;
            p.stroke(cr, cg, cb, captured ? 50 : 18);
            p.line(lx + 4, y, lx + LANE_TOP_W - 4, y);
        }

        // Current-lane highlight border.
        p.noFill();
        p.strokeWeight(isCur ? 2 : 1);
        p.stroke(isCur ? p.color(220, 220, 255) : p.color(50, 55, 80));
        p.rect(lx, FIELD_TOP, LANE_TOP_W, HIT_Y - FIELD_TOP, 3);

        // Lane label.
        p.noStroke();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(8);
        p.fill(captured ? p.color(cr, cg, cb) : p.color(120, 125, 150));
        p.text(LANES[lane].name, cx, FIELD_TOP - 8);
    }

    // Hit line spanning the field.
    p.stroke(230, 230, 255);
    p.strokeWeight(2);
    p.line(FIELD_LEFT - 3, HIT_Y, FIELD_LEFT + FIELD_W + 3, HIT_Y);

    // Player cursor: a chevron under the current lane's hit zone.
    const px = laneCenterX(currentLane);
    p.noStroke();
    p.fill(255, 255, 255, 230);
    p.triangle(px, HIT_Y + 4, px - 6, HIT_Y + 13, px + 6, HIT_Y + 13);
}

function drawGems(currentBeat: number): void {
    for (const gem of activeGems) {
        if (gem.hit || gem.missed) continue;
        const { event: ev } = gem;
        const y = gemY(ev.beat, currentBeat);
        if (y < FIELD_TOP - 6 || y > HIT_Y + 10) continue;
        const cx = laneCenterX(ev.lane);
        const [cr, cg, cb] = BUTTON_COLOR[ev.button];
        const dim = ev.lane === currentLane ? 255 : 120;

        p.stroke(255, 255, 255, dim * 0.55);
        p.strokeWeight(1.5);
        p.fill(cr, cg, cb, dim);
        p.rectMode(p.CENTER);
        p.rect(cx, y, 22, 13, 3);
        p.rectMode(p.CORNER);

        p.noStroke();
        p.fill(255, 255, 255, dim * 0.9);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(8);
        p.text(ev.button, cx, y);
    }
}

function drawHUD(input: InputSnapshot): void {
    // Life bar.
    const barX = FIELD_LEFT;
    const barW = FIELD_W;
    const barY = 246;
    p.noStroke();
    p.fill(30, 33, 50);
    p.rect(barX, barY, barW, 5, 2);
    const lc = life > 0.5 ? p.color(80, 200, 120) : life > 0.25 ? p.color(230, 180, 40) : p.color(220, 60, 60);
    p.fill(lc);
    p.rect(barX, barY, barW * life, 5, 2);

    // Score (top-right).
    p.fill(210, 212, 230);
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.text(score.toString().padStart(7, "0"), 334, 4);

    // Combo + multiplier (top-left).
    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 180, 230);
        const mult = comboMultiplier();
        p.text(`${combo}x` + (mult > 1 ? `  ${mult}X` : ""), 4, 4);
    }

    // Captured-instruments pips (bottom-left).
    p.noStroke();
    for (let lane = 0; lane < LANE_COUNT; lane++) {
        const [cr, cg, cb] = LANES[lane].color;
        const px = 6 + lane * 9;
        if (laneCaptured[lane]) p.fill(cr, cg, cb);
        else p.fill(45, 48, 62);
        p.ellipse(px, barY + 2, 6, 6);
    }

    // A/B held indicators (bottom-right).
    p.fill(input.aHeld ? p.color(...BUTTON_COLOR.A) : p.color(45, 48, 62));
    p.ellipse(322, barY + 2, 7, 7);
    p.fill(input.bHeld ? p.color(...BUTTON_COLOR.B) : p.color(45, 48, 62));
    p.ellipse(331, barY + 2, 7, 7);

    // Floating judgments.
    judgments = judgments.filter(j => p.frameCount - j.frame < 45);
    for (const j of judgments) {
        const age = p.frameCount - j.frame;
        const alpha = p.map(age, 22, 45, 255, 0, true);
        const dy = p.map(age, 0, 45, 0, -14);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(j.text === "CAPTURE!" ? 12 : 10);
        p.fill(j.color[0], j.color[1], j.color[2], alpha);
        p.text(j.text, j.x, j.y + dy);
    }
}

// ── Screens ───────────────────────────────────────────────────────────────────

function drawPlaying(input: InputSnapshot): void {
    const cb = ctx.beatNow();
    updateLane(input);
    drawField(cb);
    spawnGems(cb);
    evaluateGems(cb, input);
    drawGems(cb);
    drawHUD(input);

    if (life <= 0) failed = true;
    if (cb >= SONG_LENGTH_BEATS) {
        ctx.audio.stop();
        state = "RESULT";
    }
}

function drawResult(input: InputSnapshot): void {
    p.background(8, 10, 20);

    // Show the three instruments, lit by how many of their phrases were captured.
    const cy = 70;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
        const cx = laneCenterX(lane);
        const [cr, cg, cb] = LANES[lane].color;
        const lit = laneCaptured[lane];
        p.noStroke();
        p.fill(lit ? p.color(cr, cg, cb) : p.color(40, 44, 58));
        p.rectMode(p.CENTER);
        p.rect(cx, cy, LANE_TOP_W - 12, 36, 4);
        p.rectMode(p.CORNER);
        p.fill(lit ? p.color(15, 15, 25) : p.color(110, 115, 140));
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(8);
        p.text(LANES[lane].name, cx, cy);
    }

    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(225, 225, 255);
    p.textSize(18);
    p.text(failed ? "FAILED" : "SONG COMPLETE", 168, 120);

    p.textSize(12);
    p.fill(210, 212, 235);
    p.text(`SCORE: ${score}`, 168, 150);

    p.textSize(10);
    p.fill(170, 175, 205);
    p.text(`PHRASES CAPTURED: ${capturedCount} / ${PHRASE_COUNT}`, 168, 170);

    p.fill(140, 145, 175);
    p.textSize(9);
    p.text("A to replay   ·   hold START to exit", 168, 198);

    if (input.aPressed) startSong();
}

// ── Module ────────────────────────────────────────────────────────────────────

const amplitude: GameModule = {
    id: "amplitude",
    title: "Amplitude",
    author: "kpthill",
    init(c) {
        ctx = c;
        p = c.p;
        startSong();
    },
    frame(input) {
        switch (state) {
            case "PLAYING": drawPlaying(input); break;
            case "RESULT":  drawResult(input);  break;
        }
    },
    teardown() {
        ctx.audio.stop();
        activeGems = [];
        judgments = [];
    },
};

export default amplitude;
