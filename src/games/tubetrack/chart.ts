// TubeTrack charts — notes placed at varied angular positions around the tube over the song.
// tubeAngle is in radians, p5 convention (0=right, clockwise). Range [0, 2π).
// The runner is anchored at π/2 (6-o'clock). Each note requires the player to rotate the
// tube so that the note's angle lines up under the runner.

import type { NoteEvent } from "./notes";

export type ChartDef = { name: string; notes: NoteEvent[] };

// Shorthand angles for common positions
const R0   = 0;                    // 3-o'clock
const R45  = Math.PI / 4;          // 4:30
const R90  = Math.PI / 2;          // 6-o'clock (runner home)
const R135 = (3 * Math.PI) / 4;   // 7:30
const R180 = Math.PI;              // 9-o'clock
const R225 = (5 * Math.PI) / 4;   // 10:30
const R270 = (3 * Math.PI) / 2;   // 12-o'clock
const R315 = (7 * Math.PI) / 4;   // 1:30

const n = (beat: number, angle: number): NoteEvent => ({ beat, tubeAngle: angle });

// ── Easy chart ─────────────────────────────────────────────────────────────────
// Notes mostly at runner home (R90) or one step away; gentle pace.
const CHART_EASY: NoteEvent[] = [
    n( 3, R90),
    n( 5, R90),
    n( 7, R90),
    n( 9, R90),

    n(11, R0),
    n(13, R90),
    n(15, R180),
    n(17, R90),

    n(19, R270),
    n(21, R90),
    n(23, R270),
    n(25, R90),

    n(27, R45),
    n(29, R90),
    n(31, R135),
    n(33, R90),

    n(35, R0),
    n(37, R270),
    n(39, R180),
    n(41, R90),

    n(43, R90),
    n(45, R0),
    n(47, R90),
    n(49, R180),

    n(51, R90),
    n(53, R90),
    n(55, R90),
    n(57, R90),

    n(59, R45),
    n(61, R90),
];

// ── Groove chart (full song) ───────────────────────────────────────────────────
// Full-song chart with all three BPM sections. Notes at 8 positions on the tube.
const CHART_GROOVE: NoteEvent[] = [
    // Section 1: 108 BPM (beats 1–115) — intro, every 2 beats
    n( 3, R90),
    n( 5, R0),
    n( 7, R90),
    n( 9, R180),

    n(11, R270),
    n(13, R90),
    n(15, R0),
    n(17, R90),

    n(19, R45),
    n(21, R90),
    n(23, R135),
    n(25, R90),

    n(27, R225),
    n(29, R90),
    n(31, R315),
    n(33, R90),

    // Spin sequence: sweep around the tube
    n(35, R0),
    n(37, R45),
    n(39, R90),
    n(41, R135),
    n(43, R180),
    n(45, R225),
    n(47, R270),
    n(49, R315),

    // Back to center, denser
    n(51, R90),
    n(53, R0),
    n(55, R90),
    n(57, R180),

    n(59, R270),
    n(61, R90),
    n(63, R270),
    n(65, R90),

    // Every beat
    n(69, R0),
    n(70, R90),
    n(71, R180),
    n(72, R270),
    n(73, R0),
    n(74, R90),
    n(75, R180),
    n(76, R270),

    n(77, R45),
    n(78, R90),
    n(79, R135),
    n(80, R90),

    n(83, R225),
    n(84, R90),
    n(85, R315),
    n(86, R90),
    n(87, R0),

    // Slow bridge: big jumps
    n(93, R270),
    n(95, R90),
    n(97, R0),
    n(99, R180),

    n(101, R90),
    n(103, R270),
    n(105, R45),
    n(107, R225),
    n(109, R90),
    n(111, R135),
    n(113, R315),

    // Section 2: 126.6 BPM (from beat 115.6) — faster, tighter spin patterns
    n(117, R90),
    n(119, R0),
    n(121, R90),
    n(123, R180),
    n(125, R270),
    n(127, R90),

    // Every beat
    n(129, R90),
    n(130, R0),
    n(131, R270),
    n(132, R180),
    n(133, R90),
    n(134, R45),
    n(135, R315),
    n(136, R225),

    n(137, R90),
    n(138, R135),
    n(139, R0),
    n(140, R315),
    n(141, R90),
    n(142, R45),
    n(143, R180),
    n(144, R225),

    n(145, R90),
    n(146, R270),
    n(147, R0),
    n(148, R180),

    n(149, R90),
    n(153, R0),

    n(155, R270),
    n(156, R45),
    n(157, R90),
    n(158, R225),
    n(159, R0),
    n(160, R135),
    n(161, R90),
    n(162, R315),
    n(163, R180),
    n(164, R90),

    n(167, R45),
    n(168, R225),
    n(169, R90),
    n(171, R315),
    n(172, R135),
    n(173, R90),
    n(174, R0),
    n(175, R180),

    n(176, R90),
    n(179, R270),

    n(182, R90),
    n(183, R0),
    n(185, R90),
    n(188, R180),
    n(190, R90),
    n(191, R270),

    n(192, R0),
    n(193, R90),
    n(194, R180),
    n(195, R270),
    n(197, R45),
    n(198, R225),
    n(199, R90),

    n(201, R0),
    n(202, R90),
    n(203, R180),
    n(204, R270),
    n(205, R45),
    n(206, R135),
    n(207, R225),
    n(208, R315),
    n(209, R90),
    n(210, R0),
    n(211, R180),

    // Section 3: 86.3 BPM (from beat 212.5) — slower, deliberate
    n(213, R270),
    n(216, R90),
    n(217, R0),
    n(219, R180),
    n(220, R90),
    n(222, R270),
    n(223, R45),

    n(226, R225),
    n(227, R90),
    n(228, R315),
    n(229, R135),
    n(230, R90),

    n(234, R0),
    n(235, R90),
    n(237, R180),
    n(238, R270),
    n(239, R90),
    n(240, R45),

    n(241, R90),
    n(245, R225),
    n(246, R90),
    n(247, R315),
    n(248, R135),
    n(249, R90),
    n(250, R0),

    n(251, R180),
    n(261, R90),
    n(265, R270),
    n(269, R90),
    n(273, R0),
];

export const CHARTS: ChartDef[] = [
    { name: "EASY",   notes: CHART_EASY },
    { name: "GROOVE", notes: CHART_GROOVE },
];
