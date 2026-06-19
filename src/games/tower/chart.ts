// Tower assault charts for the shared song (vendored). Song timing lives in
// platform/song.ts; these are the enemy-wave patterns in song beats.
//
// Angles use p5 convention (0 = right, CW positive). Helpers below build the
// four enemy types. Charts avoid stacking two enemies on the same beat at very
// different angles (which would be impossible to aim at simultaneously).

import type { EnemyEvent } from "./enemies";

// Cardinal / diagonal angle constants (match the 8-way joystick snap angles).
const R  = 0;                 // RIGHT
const DR = Math.PI / 4;       // DOWN_RIGHT
const D  = Math.PI / 2;       // DOWN
const DL = (3 * Math.PI) / 4; // DOWN_LEFT
const L  = Math.PI;           // LEFT
const UL = -(3 * Math.PI) / 4;// UP_LEFT
const U  = -Math.PI / 2;      // UP
const UR = -Math.PI / 4;      // UP_RIGHT

const grunt = (beat: number, angle: number): EnemyEvent =>
    ({ beat, angle, type: "GRUNT" });

const armored = (beat: number, angle: number, duration: number): EnemyEvent =>
    ({ beat, angle, type: "ARMORED", duration });

const flyer = (beat: number, angle: number): EnemyEvent =>
    ({ beat, angle, type: "FLYER" });

const swarm = (
    beat: number, angle: number, count: number, arc: number, step: number
): EnemyEvent => ({ beat, angle, type: "SWARM", count, arc, step });

export type ChartDef = { name: string; notes: EnemyEvent[] };

// ── ASSAULT: full-song chart across all three BPM sections ────────────────────
const CHART_ASSAULT: EnemyEvent[] = [
    // Section 1 — 108 BPM, gentle introduction (grunts on cardinals).
    grunt(5,  U),
    grunt(9,  R),
    grunt(13, D),
    grunt(17, L),

    grunt(21, U),  grunt(23, R),
    grunt(25, D),  grunt(27, L),
    grunt(29, U),  grunt(31, UR),

    // first armored hold — track it while it presses the ring
    armored(34, R, 2),
    grunt(38, D),
    grunt(40, L),
    armored(42, U, 2),
    grunt(46, DR),

    // first swarm — a sweep across an arc, repeated taps
    swarm(49, UL, 4, Math.PI / 2, 1),
    grunt(54, D),
    grunt(56, U),

    // first flyer (B / flak)
    flyer(58, R),
    grunt(60, L),
    flyer(62, U),
    grunt(64, D),

    grunt(66, UR), grunt(68, DR),
    grunt(70, DL), grunt(72, UL),

    armored(74, U, 3),
    grunt(78, R),
    flyer(80, D),
    grunt(82, L),

    swarm(85, R, 5, Math.PI * 0.6, 0.75),
    grunt(91, U),
    flyer(93, D),
    grunt(95, L),

    grunt(97, U),  grunt(99, R),  grunt(101, D), grunt(103, L),
    armored(105, U, 3),
    flyer(109, R),
    grunt(111, D),
    grunt(113, L),

    // Section 2 — 126.6 BPM, faster pressure.
    grunt(117, U), grunt(119, R), grunt(121, D), grunt(123, L),
    grunt(125, U), grunt(127, UR),

    grunt(129, U), grunt(130, R), grunt(131, D), grunt(132, L),
    grunt(133, U), grunt(134, R), grunt(135, D),

    flyer(137, U),
    grunt(139, R),
    flyer(141, D),
    grunt(143, L),

    swarm(145, U, 5, Math.PI * 0.8, 0.6),
    armored(150, R, 3),
    grunt(154, D),
    grunt(156, L),

    grunt(158, U), grunt(159, R), grunt(160, D), grunt(161, L),
    flyer(163, U),
    grunt(165, R),
    // → STOP near 170
    grunt(167, D),
    armored(171, L, 2),
    grunt(174, U),
    flyer(176, R),

    swarm(179, DL, 5, Math.PI * 0.7, 0.7),
    grunt(184, U),
    grunt(186, D),
    flyer(188, L),
    grunt(190, R),
    // → STOP near 192
    grunt(193, U),
    grunt(195, D),
    armored(197, R, 3),
    grunt(201, L),
    flyer(203, U),
    grunt(205, R),
    grunt(207, D),
    grunt(209, L),
    grunt(211, U),

    // Section 3 — 86.3 BPM, slower & dramatic finale.
    flyer(214, D),
    grunt(217, U),
    armored(219, R, 2),
    grunt(222, L),
    grunt(224, D),
    // → STOP near 225
    grunt(227, U),
    flyer(229, R),
    grunt(231, L),
    // → STOP near 232
    armored(234, U, 3),
    swarm(238, R, 4, Math.PI / 2, 1),
    grunt(243, D),
    flyer(245, L),
    grunt(247, U),
    armored(249, D, 3),
    grunt(253, R),
    flyer(255, U),
    grunt(257, L),
    swarm(260, U, 6, Math.PI * 1.2, 0.8),
    armored(267, U, 4),
];

// ── PATROL: lighter, slower chart for warm-up (grunts + a few flyers) ─────────
const CHART_PATROL: EnemyEvent[] = [
    grunt(5,  U),
    grunt(9,  R),
    grunt(13, D),
    grunt(17, L),
    grunt(21, U),
    grunt(25, R),
    grunt(29, D),
    grunt(33, L),
    flyer(37, U),
    grunt(41, R),
    grunt(45, D),
    flyer(49, L),
    grunt(53, U),
    armored(57, R, 2),
    grunt(61, D),
    grunt(65, L),
    grunt(69, U),
    flyer(73, R),
    grunt(77, D),
    grunt(81, L),
    swarm(85, U, 3, Math.PI / 2, 1.5),
    grunt(91, R),
    grunt(95, D),
    flyer(99, L),
    grunt(103, U),
    grunt(107, R),
    grunt(111, D),
    // faster section, still spaced
    grunt(117, U), grunt(121, R), grunt(125, D),
    grunt(129, L), grunt(133, U), grunt(137, R),
    flyer(141, D), grunt(145, L), grunt(149, U),
    armored(153, R, 2), grunt(157, D), grunt(161, L),
    grunt(165, U), flyer(169, R), grunt(173, D),
    grunt(177, L), grunt(181, U), grunt(185, R),
    grunt(189, D), grunt(193, L), grunt(197, U),
    flyer(201, R), grunt(205, D), grunt(209, L),
    // finale
    grunt(214, U), grunt(218, R), flyer(222, D),
    grunt(226, L), grunt(230, U), armored(234, R, 2),
    grunt(239, D), grunt(243, L), flyer(247, U),
    grunt(251, R), swarm(256, U, 3, Math.PI / 2, 1.5),
    grunt(263, D),
];

export const CHARTS: ChartDef[] = [
    { name: "PATROL",  notes: CHART_PATROL },
    { name: "ASSAULT", notes: CHART_ASSAULT },
];
