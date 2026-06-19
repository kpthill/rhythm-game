import { PLAYER_1, SYSTEM } from "@rcade/plugin-input-classic";
import { PLAYER_1 as SPIN, STATUS as SPIN_STATUS } from "@rcade/plugin-input-spinners";

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
    aPressed: boolean;     // true only on the frame the button was first pressed
    bPressed: boolean;
    startHeld: boolean;
    startPressed: boolean;

    // Spinner (rotary). Falls back to zero/false when no spinner hardware is present.
    // NOTE: START is reserved by the host (hold ~1s = quit to menu); games should not
    // consume startPressed/startHeld for their own actions.
    spinnerConnected: boolean;
    spinnerDelta: number;  // signed step delta since last frame (sampled once per frame here)
    spinnerAngle: number;  // accumulated angle, normalized to [-PI, PI]
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

    // consume_step_delta() resets on read, so it must be sampled exactly once per frame.
    const spinnerConnected = SPIN_STATUS.connected;
    const spinnerDelta = spinnerConnected ? SPIN.SPINNER.consume_step_delta() : 0;
    const spinnerAngle = spinnerConnected ? SPIN.SPINNER.angle : 0;

    const snap: InputSnapshot = {
        direction,
        aHeld:        a,
        bHeld:        b,
        aPressed:     a && !prevA,
        bPressed:     b && !prevB,
        startHeld:    start,
        startPressed: start && !prevStart,
        spinnerConnected,
        spinnerDelta,
        spinnerAngle,
    };

    prevA     = a;
    prevB     = b;
    prevStart = start;

    return snap;
}
