import p5 from "p5";
import { sampleInput, DIRECTION_ANGLE } from "./input";
import type { InputSnapshot, Direction } from "./input";
import { AudioManager } from "./audio";
import { OFFSET, BPMS, STOPS, SONG_FILE, CHARTS, SONG_LENGTH_BEATS } from "./chart";
import { secondsToBeat } from "./timing";
import {
    BUTTON_COLOR, HIT_ZONE_RADIUS, CX, CY,
    LOOKAHEAD_BEATS, HIT_WINDOW_BEATS,
    noteRadius,
} from "./notes";
import type { ActiveNote, Button } from "./notes";

type GameState = "LOADING" | "TITLE" | "SELECT" | "PLAYING" | "RESULT";

// Pixels between rings that are one beat apart
const BEAT_PX = HIT_ZONE_RADIUS / LOOKAHEAD_BEATS;

// How many recent judgment flashes to show
interface Judgment {
    text: string;
    frame: number;
    x: number;
    y: number;
}

const sketch = (p: p5) => {
    const audio = new AudioManager();
    let state: GameState = "LOADING";

    let activeNotes: ActiveNote[] = [];
    let chartIndex = 0;
    let score = 0;
    let combo = 0;
    let life = 1.0;
    let judgments: Judgment[] = [];
    let beatLog: Array<{ beat: number; btn: "A" | "B" }> = [];
    let failed = false;

    let selectedChart = 0;
    let activeChart = CHARTS[0].notes;
    let menuLatch = false;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function angleForDir(dir: Direction): number {
        return DIRECTION_ANGLE[dir];
    }

    function posOnRing(angle: number, r: number): [number, number] {
        return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
    }

    function pushJudgment(text: string, dir: Direction): void {
        const angle = angleForDir(dir);
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

    // ── Game logic ─────────────────────────────────────────────────────────────

    function spawnNotes(currentBeat: number): void {
        while (chartIndex < activeChart.length) {
            const ev = activeChart[chartIndex];
            if (currentBeat >= ev.beat - LOOKAHEAD_BEATS) {
                activeNotes.push({
                    event: ev,
                    hit: false,
                    missed: false,
                    holdActive: false,
                    holdComplete: false,
                });
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

            if (ev.type === "tap") {
                const buttonPressed = ev.button === "A" ? input.aPressed : input.bPressed;
                const dirMatch = input.direction === ev.direction;

                if (buttonPressed && dirMatch && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
                    const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * 1;
                    registerHit(perfect ? 300 : 100, perfect ? "PERFECT" : "GOOD", note);
                } else if (beatDiff > HIT_WINDOW_BEATS) {
                    registerMiss(note);
                }
            } else {
                // hold
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

        // Prune notes that are well past the hit zone
        activeNotes = activeNotes.filter(
            n => currentBeat - n.event.beat < LOOKAHEAD_BEATS + 1
        );
    }

    // ── Rendering ──────────────────────────────────────────────────────────────

    function drawTunnel(currentBeat: number): void {
        // Background
        p.background(12, 8, 24);

        // Radial guide lines
        p.strokeWeight(0.5);
        for (const angle of Object.values(DIRECTION_ANGLE)) {
            p.stroke(30, 24, 50, 160);
            p.line(CX, CY, CX + Math.cos(angle) * HIT_ZONE_RADIUS, CY + Math.sin(angle) * HIT_ZONE_RADIUS);
        }

        // Scrolling concentric rings (every quarter-beat subdivision)
        const SUBDIV = 1;
        const subPx = BEAT_PX / SUBDIV;
        const scroll = (currentBeat * SUBDIV % 1) * subPx;

        p.noFill();
        for (let k = 0; ; k++) {
            const r = scroll + k * subPx;
            if (r > HIT_ZONE_RADIUS) break;
            const isBeat = k % SUBDIV === 0;
            const alpha = p.map(r, 0, HIT_ZONE_RADIUS, 20, 70);
            p.stroke(60, 50, 110, alpha);
            p.strokeWeight(isBeat ? 1.5 : 0.5);
            p.ellipse(CX, CY, r * 2, r * 2);
        }

        // Hit-zone ring
        p.stroke(140, 110, 220);
        p.strokeWeight(2);
        p.noFill();
        p.ellipse(CX, CY, HIT_ZONE_RADIUS * 2, HIT_ZONE_RADIUS * 2);

        // Direction pip markers on hit-zone ring
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
            const angle = angleForDir(ev.direction);
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
                // hold: draw tail then head
                const dur = ev.duration ?? 1;
                const rTail = noteRadius(ev.beat + dur, currentBeat);

                // visible range: between 0 and HIT_ZONE_RADIUS
                const r0 = p.constrain(Math.min(rHead, rTail), 0, HIT_ZONE_RADIUS);
                const r1 = p.constrain(Math.max(rHead, rTail), 0, HIT_ZONE_RADIUS);

                if (r1 > 0) {
                    // Draw tail (thick line from tail-end toward head)
                    p.stroke(cr, cg, cb, note.holdActive ? 220 : 150);
                    p.strokeWeight(6);
                    p.line(
                        CX + Math.cos(angle) * r0, CY + Math.sin(angle) * r0,
                        CX + Math.cos(angle) * r1, CY + Math.sin(angle) * r1
                    );
                }

                // Head circle – only before the hit point passes the ring
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
        // Small dpad + button display in bottom-left corner of screen (outside circle)
        const ox = 12, oy = 220;
        const pip = 5;

        p.noStroke();
        // dpad arms
        const arms: [Direction, number, number][] = [
            ["UP",    0, -pip * 1.5],
            ["DOWN",  0,  pip * 1.5],
            ["LEFT", -pip * 1.5, 0],
            ["RIGHT", pip * 1.5, 0],
        ];
        for (const [dir, dx, dy] of arms) {
            const active = input.direction === dir ||
                (dir === "UP"    && (input.direction === "UP_LEFT" || input.direction === "UP_RIGHT")) ||
                (dir === "DOWN"  && (input.direction === "DOWN_LEFT" || input.direction === "DOWN_RIGHT")) ||
                (dir === "LEFT"  && (input.direction === "UP_LEFT" || input.direction === "DOWN_LEFT")) ||
                (dir === "RIGHT" && (input.direction === "UP_RIGHT" || input.direction === "DOWN_RIGHT"));
            p.fill(active ? 220 : 45);
            p.rect(ox + dx - 2, oy + dy - 2, 5, 5, 1);
        }

        // A button
        p.fill(input.aHeld ? BUTTON_COLOR.A : [40, 40, 55]);
        p.ellipse(ox + 22, oy, 8, 8);
        // B button
        p.fill(input.bHeld ? BUTTON_COLOR.B : [40, 40, 55]);
        p.ellipse(ox + 33, oy, 8, 8);
    }

    function drawHUD(currentBeat: number): void {
        // Life bar – thin strip below the circle
        const barW = HIT_ZONE_RADIUS * 2;
        const barX = CX - HIT_ZONE_RADIUS;
        const barY = CY + HIT_ZONE_RADIUS + 8;
        p.noStroke();
        p.fill(35, 28, 55);
        p.rect(barX, barY, barW, 5, 2);
        const lc = life > 0.5 ? p.color(80, 200, 120) : life > 0.25 ? p.color(230, 180, 40) : p.color(220, 60, 60);
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

        // Judgment flashes
        judgments = judgments.filter(j => p.frameCount - j.frame < 50);
        for (const j of judgments) {
            const age = p.frameCount - j.frame;
            const alpha = p.map(age, 25, 50, 255, 0);
            const dy = p.map(age, 0, 50, 0, -12);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(11);
            if (j.text === "PERFECT") p.fill(255, 240, 80, alpha);
            else if (j.text === "GOOD")    p.fill(80, 220, 120, alpha);
            else if (j.text === "HOLD")    p.fill(80, 180, 255, alpha);
            else                           p.fill(255, 80, 80, alpha);
            p.text(j.text, j.x, j.y + dy);
        }

        // Charting overlay – left strip
        p.textFont("monospace");
        p.textAlign(p.LEFT, p.TOP);
        p.noStroke();

        // Live beat counter
        p.fill(160, 150, 200);
        p.textSize(9);
        p.text("beat", 4, 18);
        p.fill(220, 215, 255);
        p.textSize(11);
        p.text(currentBeat.toFixed(2), 4, 28);

        // Recent press log (newest at top)
        for (let i = 0; i < beatLog.length; i++) {
            const entry = beatLog[i];
            const alpha = p.map(i, 0, beatLog.length, 220, 60);
            const [r, g, b] = entry.btn === "A" ? BUTTON_COLOR.A : BUTTON_COLOR.B;
            p.fill(r, g, b, alpha);
            p.textSize(8);
            p.text(`${entry.btn} ${entry.beat.toFixed(2)}`, 4, 44 + i * 10);
        }
    }

    function drawLoading(): void {
        p.background(12, 8, 24);
        p.fill(180, 170, 200);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(13);
        p.text("Loading...", CX, CY);
    }

    function drawTitle(input: InputSnapshot): void {
        p.background(12, 8, 24);

        // Decorative static rings
        p.noFill();
        for (let r = 20; r <= HIT_ZONE_RADIUS; r += 20) {
            p.stroke(60, 50, 100, p.map(r, 0, HIT_ZONE_RADIUS, 20, 60));
            p.strokeWeight(r === HIT_ZONE_RADIUS ? 2 : 0.5);
            p.ellipse(CX, CY, r * 2, r * 2);
        }

        p.noStroke();
        p.textAlign(p.CENTER, p.CENTER);
        p.fill(220, 210, 255);
        p.textSize(16);
        p.text("HALL OF THE\nMOUNTAIN KING", CX, CY - 20);
        p.fill(150, 140, 180);
        p.textSize(10);
        p.text("Press 1P START", CX, CY + 22);

        if (input.startPressed) {
            state = "SELECT";
        }
    }

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
        p.text("HALL OF THE MOUNTAIN KING", CX, 30);
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
        p.text("UP/DN to choose   A to play", CX, 165);

        const dirUp   = input.direction === "UP";
        const dirDown = input.direction === "DOWN";
        if (!dirUp && !dirDown) {
            menuLatch = false;
        } else if (!menuLatch) {
            menuLatch = true;
            if (dirUp)   selectedChart = (selectedChart - 1 + CHARTS.length) % CHARTS.length;
            if (dirDown) selectedChart = (selectedChart + 1) % CHARTS.length;
        }

        if (input.aPressed || input.startPressed) {
            activeChart = CHARTS[selectedChart].notes;
            activeNotes = [];
            chartIndex = 0;
            score = 0;
            combo = 0;
            life = 1.0;
            judgments = [];
            beatLog = [];
            failed = false;
            state = "PLAYING";
            void audio.play(0);
        }
    }

    function drawPlaying(input: InputSnapshot): void {
        const cb = secondsToBeat(audio.currentSeconds, OFFSET, BPMS, STOPS);

        // Charting helper: record every button press regardless of note matching
        if (input.aPressed) {
            beatLog.unshift({ beat: cb, btn: "A" });
            if (beatLog.length > 12) beatLog.pop();
            console.log(`A\t${cb.toFixed(2)}`);
        }
        if (input.bPressed) {
            beatLog.unshift({ beat: cb, btn: "B" });
            if (beatLog.length > 12) beatLog.pop();
            console.log(`B\t${cb.toFixed(2)}`);
        }

        drawTunnel(cb);
        spawnNotes(cb);
        evaluateNotes(cb, input);
        drawNotes(cb);
        drawInputIndicator(input);
        drawHUD(cb);

        if (life <= 0) failed = true;

        if (cb >= SONG_LENGTH_BEATS) {
            audio.stop();
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
        p.text("Press 1P START to replay", CX, CY + 28);

        if (input.startPressed) {
            state = "SELECT";
        }
    }

    // ── p5 lifecycle ───────────────────────────────────────────────────────────

    p.setup = () => {
        p.createCanvas(336, 262);
        p.textFont("monospace");
        audio.load(SONG_FILE).then(() => {
            if (state === "LOADING") state = "TITLE";
        }).catch(err => {
            console.error("Audio load failed:", err);
            if (state === "LOADING") state = "TITLE";
        });
    };

    p.draw = () => {
        const input = sampleInput();

        switch (state) {
            case "LOADING": drawLoading();        break;
            case "TITLE":   drawTitle(input);     break;
            case "SELECT":  drawSelect(input);    break;
            case "PLAYING": drawPlaying(input);   break;
            case "RESULT":  drawResult(input);    break;
        }
    };
};

new p5(sketch, document.getElementById("sketch")!);
