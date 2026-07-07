// DJ game — player-2 input sampling (vendored to src/games/dj/, not shared).
//
// The platform's sampleInput() (src/platform/input.ts) only wires PLAYER_1
// into the InputSnapshot passed to GameModule.frame() — every other prototype
// in the collection is single-lane and never needed PLAYER_2. DJ's two-lane
// layout needs it, so this module reads the raw plugin singletons directly.
//
// This is safe: ESM caches modules by specifier, so `PLAYER_2` here is the
// *same* object the platform's input.ts and the plugin itself use — importing
// it again doesn't re-acquire the channel. And there's no double-consumption
// hazard on the spinner step delta: the platform's sampleInput() only ever
// touches PLAYER_1's spinner, never PLAYER_2's, so it's still safe to call
// consume_step_delta() here exactly once per frame for player 2.
//
// Dev keyboard note: only PLAYER_1 has WASD/F/G keyboard emulation wired up by
// the `rcade dev` harness. PLAYER_2 (this module) is only exercised by real
// second-controller hardware; on a laptop the left lane (PLAYER_1, including
// its joystick scratch/spin fallback) is the dev testing path.

import { PLAYER_2 as CLASSIC_P2 } from "@rcade/plugin-input-classic";
import { PLAYER_2 as SPIN_P2, STATUS as SPIN_STATUS } from "@rcade/plugin-input-spinners";
import type { Direction } from "../../platform/input";

/** The subset of InputSnapshot the DJ game needs, shared by both lanes' logic. */
export interface LaneInput {
    direction: Direction | null;
    aHeld: boolean;
    bHeld: boolean;
    aPressed: boolean;
    bPressed: boolean;
    spinnerConnected: boolean;
    spinnerDelta: number;
}

let prevA = false;
let prevB = false;

/** Sample PLAYER_2's buttons + spinner for this frame. Call exactly once per frame. */
export function sampleP2(): LaneInput {
    const up    = CLASSIC_P2.DPAD.up;
    const down  = CLASSIC_P2.DPAD.down;
    const left  = CLASSIC_P2.DPAD.left;
    const right = CLASSIC_P2.DPAD.right;
    const a     = CLASSIC_P2.A;
    const b     = CLASSIC_P2.B;

    let direction: Direction | null = null;
    if      (up && right)   direction = "UP_RIGHT";
    else if (up && left)    direction = "UP_LEFT";
    else if (down && right) direction = "DOWN_RIGHT";
    else if (down && left)  direction = "DOWN_LEFT";
    else if (up)            direction = "UP";
    else if (down)          direction = "DOWN";
    else if (left)          direction = "LEFT";
    else if (right)         direction = "RIGHT";

    const spinnerConnected = SPIN_STATUS.connected;
    // consume_step_delta() resets on read; sampled at most once per frame here.
    const spinnerDelta = spinnerConnected ? SPIN_P2.SPINNER.consume_step_delta() : 0;

    const snap: LaneInput = {
        direction,
        aHeld: a,
        bHeld: b,
        aPressed: a && !prevA,
        bPressed: b && !prevB,
        spinnerConnected,
        spinnerDelta,
    };

    prevA = a;
    prevB = b;
    return snap;
}

/** Reset edge-detection state so a button held across a game reset doesn't suppress the next press. */
export function resetP2Input(): void {
    prevA = false;
    prevB = false;
}
