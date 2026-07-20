// Launcher menu: a scrollable list of games. Returns the picked GameModule on select.

import type p5 from "p5";
import type { GameModule } from "./game";
import type { InputSnapshot } from "./input";

const W = 336;
const ROW_H = 22;
const VISIBLE = 7;          // rows shown at once
const LIST_TOP = 56;

export class Menu {
    private selected = 0;
    private latch = false;
    private scroll = 0;       // index of the first visible row

    constructor(private p: p5, private games: GameModule[], private title = "RHYTHM COLLECTION") {}

    reset(): void {
        this.latch = false;
    }

    /** Draw + handle input. Returns the chosen game when the player confirms. */
    frame(input: InputSnapshot): GameModule | null {
        const p = this.p;
        const n = this.games.length;

        // ── Navigation (latched so a held stick steps once) ─────────────────────
        const up = input.direction === "UP" || input.direction === "UP_LEFT" || input.direction === "UP_RIGHT";
        const dn = input.direction === "DOWN" || input.direction === "DOWN_LEFT" || input.direction === "DOWN_RIGHT";
        if (!up && !dn) {
            this.latch = false;
        } else if (!this.latch && n > 0) {
            this.latch = true;
            if (up) this.selected = (this.selected - 1 + n) % n;
            if (dn) this.selected = (this.selected + 1) % n;
        }

        // Keep the selection inside the visible window
        if (this.selected < this.scroll) this.scroll = this.selected;
        if (this.selected >= this.scroll + VISIBLE) this.scroll = this.selected - VISIBLE + 1;
        this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, n - VISIBLE)));

        // ── Render ──────────────────────────────────────────────────────────────
        p.background(12, 8, 24);

        p.noStroke();
        p.textAlign(p.CENTER, p.CENTER);
        p.fill(220, 210, 255);
        p.textSize(15);
        p.text(this.title, W / 2, 24);
        p.fill(120, 110, 150);
        p.textSize(8);
        p.text("UP/DOWN  ·  A / START to play  ·  B to go back", W / 2, 40);

        if (n === 0) {
            p.fill(200, 100, 100);
            p.textSize(10);
            p.text("No games found", W / 2, 140);
            return null;
        }

        p.textAlign(p.LEFT, p.CENTER);
        for (let row = 0; row < Math.min(VISIBLE, n); row++) {
            const i = this.scroll + row;
            const g = this.games[i];
            const y = LIST_TOP + row * ROW_H + ROW_H / 2;
            const sel = i === this.selected;

            if (sel) {
                p.noStroke();
                p.fill(40, 30, 70);
                p.rect(20, y - ROW_H / 2 + 2, W - 40, ROW_H - 4, 3);
            }
            p.fill(sel ? 235 : 130, sel ? 220 : 122, sel ? 255 : 160);
            p.textSize(sel ? 13 : 11);
            p.text((sel ? "▶ " : "  ") + g.title, 32, y);
        }

        // Scroll hints
        p.textAlign(p.CENTER, p.CENTER);
        p.fill(90, 80, 120);
        p.textSize(9);
        if (this.scroll > 0) p.text("▲", W / 2, LIST_TOP - 6);
        if (this.scroll + VISIBLE < n) p.text("▼", W / 2, LIST_TOP + VISIBLE * ROW_H + 4);

        // ── Confirm ──────────────────────────────────────────────────────────────
        if (input.aPressed || input.startPressed) {
            return this.games[this.selected];
        }
        return null;
    }
}
