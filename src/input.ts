import { PLAYER_1, SYSTEM } from "@rcade/plugin-input-classic";

export type Direction =
    | "UP" | "UP_RIGHT" | "RIGHT" | "DOWN_RIGHT"
    | "DOWN" | "DOWN_LEFT" | "LEFT" | "UP_LEFT";

// Angles in radians, p5 convention: 0=right, clockwise positive
export const DIRECTION_ANGLE: Record<Direction, number> = {
    RIGHT:      0,
    DOWN_RIGHT: Math.PI / 4,
    DOWN:       Math.PI / 2,
    DOWN_LEFT:  (3 * Math.PI) / 4,
    LEFT:       Math.PI,
    UP_LEFT:   -(3 * Math.PI) / 4,
    UP:        -Math.PI / 2,
    UP_RIGHT:  -Math.PI / 4,
};

export interface InputSnapshot {
    direction: Direction | null;
    aHeld: boolean;
    bHeld: boolean;
    aPressed: boolean;   // true only on the frame the button was first pressed
    bPressed: boolean;
    startPressed: boolean;
}

let prevA = false;
let prevB = false;
let prevStart = false;

export function sampleInput(): InputSnapshot {
    const up    = PLAYER_1.DPAD.up;
    const down  = PLAYER_1.DPAD.down;
    const left  = PLAYER_1.DPAD.left;
    const right = PLAYER_1.DPAD.right;
    const a     = PLAYER_1.A;
    const b     = PLAYER_1.B;
    const start = SYSTEM.ONE_PLAYER;

    let direction: Direction | null = null;
    if      (up && right)   direction = "UP_RIGHT";
    else if (up && left)    direction = "UP_LEFT";
    else if (down && right) direction = "DOWN_RIGHT";
    else if (down && left)  direction = "DOWN_LEFT";
    else if (up)            direction = "UP";
    else if (down)          direction = "DOWN";
    else if (left)          direction = "LEFT";
    else if (right)         direction = "RIGHT";

    const snap: InputSnapshot = {
        direction,
        aHeld:        a,
        bHeld:        b,
        aPressed:     a && !prevA,
        bPressed:     b && !prevB,
        startPressed: start && !prevStart,
    };

    prevA     = a;
    prevB     = b;
    prevStart = start;

    return snap;
}
