import type { Direction } from "./input";

export type Button = "A" | "B";

export interface NoteEvent {
    beat: number;
    direction: Direction;
    button: Button;
    type: "tap" | "hold";
    duration?: number;  // beats; holds only
}

export interface ActiveNote {
    event: NoteEvent;
    hit: boolean;
    missed: boolean;
    holdActive: boolean;   // player has pressed and hold has started
    holdComplete: boolean;
}

export const BUTTON_COLOR: Record<Button, [number, number, number]> = {
    A: [80, 180, 255],   // blue
    B: [255, 110, 80],   // orange-red
};

export const HIT_ZONE_RADIUS = 100;
export const CX = 168;
export const CY = 131;
export const LOOKAHEAD_BEATS = 4;
export const HIT_WINDOW_BEATS = 0.5;

// Radius of note head at a given beat
export function noteRadius(noteBeat: number, currentBeat: number): number {
    return ((currentBeat - noteBeat + LOOKAHEAD_BEATS) / LOOKAHEAD_BEATS) * HIT_ZONE_RADIUS;
}
