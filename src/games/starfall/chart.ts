// Starfall chart — vendored.  Song timing lives in platform/song.ts.
// Object types:
//   "enemy"    col C: be in col C and press A when it hits the firing line
//   "bullet"   col ignored: press B (shield) when it arrives
//   "asteroid" col C: HAZARD — move away from col C before it hits the line
//
// SAFETY RULE: no same-beat enemy+asteroid that share a column (impossible dodge+hit).
// Adjacent-beat tension (e.g. enemy beat 5, asteroid beat 6) is fine and encouraged.

import type { StarNote } from "./notes";

type OT = "enemy" | "bullet" | "asteroid";
const e = (beat: number, col: number): StarNote => ({ beat, col, type: "enemy"    as OT });
const b = (beat: number):              StarNote => ({ beat, col: 2, type: "bullet"   as OT });
const a = (beat: number, col: number): StarNote => ({ beat, col, type: "asteroid" as OT });

// ── Section 1: 108 BPM (beats 1–115) ─────────────────────────────────────────
// Intro: slow enemies in center, player learns to line up and fire.
const SEC1: StarNote[] = [
    e( 3, 2),
    e( 7, 2),
    e(11, 2),
    e(15, 2),

    // Start mixing asteroids in rests (off-center so no conflict with center enemies)
    a(17, 0),
    e(19, 2),
    a(21, 4),
    e(23, 2),
    a(25, 0),
    e(27, 2),
    a(29, 4),
    e(31, 2),

    // Enemies shift columns; asteroids fill rests in the enemy column's neighbors
    e(33, 1),  a(35, 3),
    e(37, 3),  a(39, 1),
    e(41, 1),  a(43, 3),
    e(45, 3),  a(47, 1),

    // Bullets introduced — press B regardless of column
    b(49),  e(51, 2),
    b(53),  e(55, 2),
    b(57),  e(59, 2),
    b(61),  e(63, 2),

    // Mixed bullets + enemies with asteroids blocking retreat
    e(65, 0),  a(66, 2),  b(67),
    e(69, 4),  a(70, 2),  b(71),
    e(73, 1),  a(74, 3),  b(75),
    e(77, 3),  a(78, 1),  b(79),

    // Dense asteroid field — enemies at col 2 with asteroids surrounding
    a(81, 0),  a(81, 4),  e(83, 2),
    a(85, 0),  a(85, 4),  e(87, 2),

    // Pure bullet stream
    b(89),  b(91),  b(93),  b(95),

    // Cross-column enemies: player must weave left/right
    e( 97, 0),  a( 98, 2),  a( 98, 4),
    e(101, 4),  a(102, 0),  a(102, 2),
    e(105, 2),
    b(107),  b(109),  b(111),

    // Bridge before tempo change
    e(113, 2),  a(114, 0),
];

// ── Section 2: 126.6 BPM (beats ~115–212) ────────────────────────────────────
// Faster tempo: denser patterns, more weaving required.
const SEC2: StarNote[] = [
    // Opening burst — every 2 beats
    e(117, 1),  e(119, 3),  e(121, 1),  e(123, 3),
    e(125, 2),  b(126),

    // Bullets + enemies interleaved
    e(127, 0),  b(128),  e(129, 4),  b(130),
    e(131, 2),  b(132),  e(133, 0),  b(134),

    // Asteroid gauntlet — player forced to specific safe columns
    a(135, 0),  a(135, 1),  e(137, 3),
    a(139, 3),  a(139, 4),  e(141, 1),
    a(143, 1),  a(143, 3),  e(145, 0),  // only col 0,2,4 safe; enemy at 0 so go 2 or 4
    b(146),
    a(147, 0),  a(147, 2),  a(147, 4),  e(149, 1), // cols 1 or 3 safe; enemy at 1 so go 3

    // Pairs: bullet + enemy same window (player shields then attacks)
    b(151),  e(153, 2),
    b(155),  e(157, 4),
    b(159),  e(161, 0),
    b(163),  e(165, 2),

    // STOP zone ~ beat 170 — dramatic pause, single enemy
    e(167, 2),
    // (stop at 170.1)
    e(171, 2),
    a(172, 0),  a(172, 4),
    b(173),
    e(175, 2),

    // After stop — syncopated enemies
    e(177, 1),  b(178),  e(179, 3),
    b(180),  e(181, 1),  a(182, 3),
    b(183),  e(185, 3),  a(186, 1),

    // Dense section: bullets + weaving asteroids
    b(187),  a(188, 2),  e(189, 0),
    b(190),  a(191, 2),  e(192, 4),
    // (stop at 192.2)
    b(193),  e(195, 2),

    // Fast enemy run — every beat
    e(197, 0),  e(198, 1),  e(199, 2),  e(200, 3),  e(201, 4),
    b(202),  b(203),

    // Bullet barrage with asteroid obstacles
    a(205, 2),  b(205),
    a(207, 2),  b(207),
    e(209, 0),  e(210, 4),
    b(211),
];

// ── Section 3: 86.3 BPM (beats ~212–276) ─────────────────────────────────────
// Slower but harder: complex patterns, asteroid mazes, combo finishers.
const SEC3: StarNote[] = [
    // Slow buildup — long gaps, precise timing required
    e(213, 2),
    // (stop at 214.7)
    a(215, 0),  a(215, 4),
    b(216),
    e(219, 2),

    // Asteroid maze: forced columns shift every 2 beats
    a(221, 2),  a(221, 3),  e(223, 0),
    a(224, 0),  a(224, 1),  e(226, 3),
    // (stop at 225.2)
    b(227),
    a(228, 2),  a(228, 4),  e(230, 1),

    // (stop at 232.6)
    e(234, 2),
    a(235, 0),  a(235, 4),
    b(236),
    e(237, 2),

    // Finale run — enemies every beat across all columns
    e(240, 0),  b(241),
    e(242, 4),  b(243),
    e(244, 2),  b(245),
    e(246, 1),  b(247),
    e(248, 3),  b(249),

    // Penultimate gauntlet: asteroids block all but one column
    a(250, 0),  a(250, 2),  a(250, 4),  e(252, 1),
    a(253, 1),  a(253, 3),             e(255, 2),  // cols 0,2,4 free; enemy at 2 so 0 or 4
    a(256, 0),  a(256, 2),  a(256, 4),  e(258, 3),

    // Final bullet rush
    b(260),  b(261),  b(262),  b(263),

    // Last stand
    e(265, 2),
    a(266, 0),  a(266, 4),
    b(267),
    e(269, 2),
    b(271),
    e(273, 2),
];

export const CHART: StarNote[] = [
    ...SEC1,
    ...SEC2,
    ...SEC3,
].sort((a, b) => a.beat - b.beat);
