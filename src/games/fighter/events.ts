// Fighter-specific event model + rendering constants (vendored; not shared).
//
// The whole game is ONE ordered timeline of beat-events. There are two kinds:
//   ATTACK  — a short combo: a sequence of (direction + button) steps, each step
//             pinned to a beat/half-beat. The player executes each step in time as
//             it crosses the strike line. Finishing the whole combo on-beat triggers
//             a special-move flourish + bonus.
//   DEFEND  — the opponent winds up ONE beat before striking. A tell shows which
//             defensive input is required on the strike beat:
//               LEFT/RIGHT = weave that way, UP = block, DOWN = duck.
//             Press the right defensive input ON the strike beat (±window) to avoid
//             damage; missing costs life.

import type { Direction } from "../../platform/input";

export type Button = "A" | "B";

// ── Defense kinds (a restricted, readable subset of directions) ──────────────────
export type DefenseDir = "LEFT" | "RIGHT" | "UP" | "DOWN";

export const DEFENSE_LABEL: Record<DefenseDir, string> = {
    LEFT:  "WEAVE",
    RIGHT: "WEAVE",
    UP:    "BLOCK",
    DOWN:  "DUCK",
};

// ── A single step inside an attack combo ─────────────────────────────────────────
export interface ComboStep {
    beat: number;          // song beat this step must be hit on
    direction: Direction;  // joystick direction required
    button: Button;        // button required
}

// ── Timeline events ──────────────────────────────────────────────────────────────
export interface AttackEvent {
    kind: "attack";
    beat: number;          // beat of the FIRST step (used for ordering/spawning)
    steps: ComboStep[];
}

export interface DefendEvent {
    kind: "defend";
    beat: number;          // the STRIKE beat — defense input must land here (±window)
    defense: DefenseDir;
}

export type FightEvent = AttackEvent | DefendEvent;

// ── Per-combo-step runtime status ────────────────────────────────────────────────
export interface ActiveStep {
    step: ComboStep;
    done: boolean;
    missed: boolean;
}

export interface ActiveAttack {
    event: AttackEvent;
    steps: ActiveStep[];
    resolved: boolean;     // whole combo finished (all steps done or missed)
    special: boolean;      // all steps were hit → special move
}

export interface ActiveDefend {
    event: DefendEvent;
    resolved: boolean;
    blocked: boolean;      // player defended successfully
}

// ── Layout / timing constants (336 × 262 canvas) ─────────────────────────────────
export const STRIKE_X = 84;          // x of the strike line (left side of the lane)
export const LANE_Y = 96;            // vertical center of the scrolling prompt lane
export const LANE_TOP = 78;
export const LANE_BOT = 118;
export const SPAWN_X = 336;          // notes enter from the right edge

export const LOOKAHEAD_BEATS = 4;    // beats of lead-in before a step reaches strike line
export const HIT_WINDOW_BEATS = 0.5; // ± window for any hit
export const PERFECT_WINDOW_BEATS = 0.18;

export const BUTTON_COLOR: Record<Button, [number, number, number]> = {
    A: [80, 180, 255],   // blue
    B: [255, 110, 80],   // orange-red
};

// Horizontal pixel position for a step/strike at a given beat.
// At beat == currentBeat it sits on the strike line; LOOKAHEAD beats earlier it's at SPAWN_X.
export function beatToX(targetBeat: number, currentBeat: number): number {
    const frac = (targetBeat - currentBeat) / LOOKAHEAD_BEATS; // 0 at line, 1 at spawn
    return STRIKE_X + frac * (SPAWN_X - STRIKE_X);
}
