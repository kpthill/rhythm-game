// Saber chart — adapted from tunnel's GROOVE chart timing structure.
// Notes fly down a single lane; each note specifies a direction (arrow) and button (A/B).
// Song has 3 BPM sections: 108 BPM (beats 1-115), 126.6 BPM (beats 115.6-212.5),
// 86.3 BPM (beats 212.5+). SONG_LENGTH_BEATS ≈ 276.

import type { NoteEvent } from "./notes";
import type { Direction } from "../../platform/input";

type Button = "A" | "B";

const A: Button = "A";
const B: Button = "B";
const UP           = "UP"         as Direction;
const DOWN         = "DOWN"       as Direction;
const LEFT         = "LEFT"       as Direction;
const RIGHT        = "RIGHT"      as Direction;
const UP_RIGHT     = "UP_RIGHT"   as Direction;
const UP_LEFT      = "UP_LEFT"    as Direction;
const DOWN_RIGHT   = "DOWN_RIGHT" as Direction;
const DOWN_LEFT    = "DOWN_LEFT"  as Direction;

const n = (beat: number, dir: Direction, btn: Button, both?: true): NoteEvent =>
    both ? { beat, direction: dir, button: btn, both: true }
         : { beat, direction: dir, button: btn };

// ── SABER chart — ~1 note per 1-2 beats, alternating hands, some doubles ──────
export const CHART_SABER: NoteEvent[] = [
    // === Section 1: 108 BPM (beats 3–115) =====================================
    // Intro warmup — simple alternating cardinal directions, every 4 beats
    n( 3, UP,         A),
    n( 7, DOWN,       B),
    n(11, UP,         A),
    n(15, DOWN,       B),

    // Pick up pace — every 2 beats
    n(17, UP,    A),  n(19, RIGHT, B),
    n(21, DOWN,  A),  n(23, LEFT,  B),
    n(25, UP,    A),  n(27, RIGHT, B),
    n(29, DOWN,  A),  n(31, LEFT,  B),

    // Introduce diagonals
    n(33, UP_RIGHT,   A),  n(35, DOWN_LEFT,  B),
    n(37, UP_LEFT,    A),  n(39, DOWN_RIGHT, B),
    n(41, UP_RIGHT,   A),  n(43, DOWN_LEFT,  B),
    n(45, UP_LEFT,    A),  n(47, DOWN_RIGHT, B),

    // Every beat, alternating A/B with direction variety
    n(49, UP,    A),  n(50, RIGHT, B),  n(51, DOWN,  A),  n(52, LEFT,  B),
    n(53, UP,    A),  n(54, RIGHT, B),  n(55, DOWN,  A),  n(56, LEFT,  B),

    // Burst with mixed directions
    n(57, UP,    A),  n(59, DOWN,  B),
    n(61, RIGHT, A),  n(63, LEFT,  B),
    n(65, UP,    A),  n(67, DOWN,  B),

    // A+B double note (both hands same direction) — special moment
    n(69, UP,    A, true),

    n(71, RIGHT, A),  n(72, LEFT,  B),
    n(73, UP,    A),  n(74, DOWN,  B),
    n(75, RIGHT, A),  n(76, LEFT,  B),
    n(77, UP,    A),  n(78, DOWN,  B),
    n(79, RIGHT, A),

    n(80, DOWN,  B),  n(82, UP,    A),

    // Build to climax of section 1
    n(83, UP,    A),  n(84, RIGHT, B),  n(85, DOWN,  A),  n(86, LEFT,  B),
    n(87, UP,    A),  n(88, RIGHT, B),  n(89, DOWN,  A),

    // Section 1 outro — slow back to every 2 beats
    n(93, DOWN,  B),  n(95, UP,    A),
    n(97, DOWN,  B),  n(99, UP,    A),
    n(101, LEFT, A),  n(103, RIGHT, B),
    n(105, UP,   A),  n(107, DOWN,  B),
    n(109, LEFT, A),  n(111, RIGHT, B),
    n(113, UP,   A),

    // === Section 2: 126.6 BPM (beats 115.6–212.5) =============================
    // Faster BPM — start with every 2 beats to let player adjust
    n(117, UP,    A),  n(119, DOWN,  B),
    n(121, RIGHT, A),  n(123, LEFT,  B),
    n(125, UP,    A),  n(127, DOWN,  B),

    // Ramp to every beat
    n(129, UP,    A),  n(130, RIGHT, B),  n(131, DOWN,  A),  n(132, LEFT,  B),
    n(133, UP,    A),  n(134, RIGHT, B),  n(135, DOWN,  A),  n(136, LEFT,  B),

    // Diagonal patterns
    n(137, UP_RIGHT, A),  n(138, DOWN_LEFT,  B),
    n(139, UP_LEFT,  A),  n(140, DOWN_RIGHT, B),
    n(141, UP_RIGHT, A),  n(142, DOWN_LEFT,  B),
    n(143, UP_LEFT,  A),  n(144, DOWN_RIGHT, B),

    // Another double hit
    n(145, DOWN, A, true),

    n(147, UP,    A),  n(148, RIGHT, B),  n(149, DOWN,  A),  n(150, LEFT,  B),
    n(151, UP,    A),  n(152, RIGHT, B),

    n(153, DOWN,  B),

    // Dense every-beat run
    n(155, UP,    A),  n(156, RIGHT, B),  n(157, DOWN,  A),  n(158, LEFT,  B),
    n(159, UP,    A),  n(160, RIGHT, B),  n(161, DOWN,  A),  n(162, LEFT,  B),
    n(163, UP,    A),  n(164, RIGHT, B),

    // Cool cross pattern
    n(167, UP,    A),  n(168, DOWN,  B),  n(169, UP,    A),

    n(171, LEFT,  B),  n(172, UP,   A),  n(173, DOWN,  B),  n(174, RIGHT, A),
    n(175, LEFT,  B),  n(176, UP,   A),

    n(179, DOWN,  B),
    n(182, UP,    A),  n(183, DOWN,  B),
    n(185, RIGHT, A),
    n(188, LEFT,  B),
    n(190, UP,    A),  n(191, DOWN,  B),
    n(192, RIGHT, A),

    n(193, LEFT,  B),  n(194, UP,   A),  n(195, DOWN,  B),
    n(197, RIGHT, A),  n(198, LEFT, B),  n(199, UP,    A),

    // Double before section 3
    n(201, RIGHT, A, true),

    n(203, UP,    B),  n(205, DOWN,  A),
    n(207, UP,    B),  n(209, DOWN,  A),
    n(211, RIGHT, B),

    // === Section 3: 86.3 BPM (beats 212.5+) — slower, deliberate finale =======
    n(213, DOWN,  B),
    n(216, UP,    A),
    n(217, DOWN,  B),
    n(219, LEFT,  A),
    n(220, UP,    A),
    n(222, RIGHT, B),
    n(223, DOWN,  A),

    n(226, LEFT,  B),  n(227, UP,   A),  n(228, DOWN,  B),  n(229, RIGHT, A),
    n(230, LEFT,  B),

    n(234, UP,    A),
    n(235, RIGHT, B),

    n(237, DOWN,  A),  n(238, UP,   B),  n(239, RIGHT, A),
    n(240, LEFT,  B),
    n(241, UP,    A),

    n(245, DOWN,  B),  n(246, RIGHT, A),  n(247, LEFT,  B),  n(248, UP,    A),
    n(249, DOWN,  B),  n(250, RIGHT, A),

    // Sparse ending — big dramatic notes
    n(251, LEFT,  B),
    n(255, UP,    A),
    n(259, DOWN,  B),

    // Final triple
    n(261, RIGHT, A),
    n(263, LEFT,  B),
    n(265, UP,    A, true),  // double hit to close out
];

export const CHART_NAME = "SABER";
