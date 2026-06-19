// DJ chart for the shared song (vendored).
// Mixes hit notes (tap A/B) with scratch notes (CW/CCW on spinner).
// All timings are in beats of the shared song (platform/song.ts).
//
// Song structure:
//   beats   1–115  : 108 BPM opening
//   beats 115–212  : 126.6 BPM mid
//   beats 212–276  : 86.3 BPM finale

import type { NoteEvent } from "./notes";

const A = "A" as const;
const B = "B" as const;
const CW  = "CW"  as const;
const CCW = "CCW" as const;

const hit = (beat: number, btn: "A" | "B"): NoteEvent =>
    ({ beat, type: "hit", button: btn });

const sc = (beat: number, dir: "CW" | "CCW"): NoteEvent =>
    ({ beat, type: "scratch", scratch: dir });

// ── Section 1: 108 BPM (beats 1–115) ─────────────────────────────────────────
// Intro: quarter-beat hits to let the player find the groove
const SECTION_1: NoteEvent[] = [
    hit(3,  A),
    hit(5,  A),
    hit(7,  A),
    hit(9,  A),

    // First scratches: alternating CW/CCW every 2 beats
    sc (11, CW),
    sc (13, CCW),
    sc (15, CW),
    sc (17, CCW),

    // Hit + scratch combos
    hit(19, A),  sc (20, CW),
    hit(21, B),  sc (22, CCW),
    hit(23, A),  sc (24, CW),
    hit(25, B),  sc (26, CCW),

    // Burst: quick triple hits
    hit(27, A), hit(27.5, B), hit(28, A),
    sc (29, CW),

    hit(31, A), hit(31.5, B), hit(32, A),
    sc (33, CCW),

    // Scratch run
    sc (35, CW),
    sc (36, CCW),
    sc (37, CW),
    sc (38, CCW),

    hit(39, A),  hit(40, B),

    // Dense section — every beat
    hit(41, A), sc (42, CW),
    hit(43, B), sc (44, CCW),
    hit(45, A), sc (46, CW),
    hit(47, B), sc (48, CCW),

    // Eighth-note alternation
    hit(49, A), hit(49.5, B), sc(50, CW),
    hit(51, A), hit(51.5, B), sc(52, CCW),
    hit(53, A), hit(53.5, B), sc(54, CW),

    // Scratch triplets
    sc (55, CW),  sc (55.5, CCW), sc (56,   CW),
    sc (57, CCW), sc (57.5, CW),  sc (58,   CCW),

    hit(59, A), hit(60, B), hit(61, A),

    // A/B alternation with scratches every 4
    hit(63, A), hit(65, B), hit(67, A),
    sc (69, CW),
    hit(71, B), hit(73, A), hit(75, B),
    sc (77, CCW),

    // Build-up to section 2
    sc (79, CW),  hit(80, A),
    sc (81, CCW), hit(82, B),
    sc (83, CW),  hit(84, A),
    sc (85, CCW), hit(86, B),

    sc (87, CW),
    sc (88, CCW),
    sc (89, CW),
    sc (90, CCW),

    hit(91, A), hit(92, B),
    sc (93, CW),
    hit(95, A), hit(96, B),
    sc (97, CCW),
    hit(99, A), hit(100, B),

    sc (101, CW), sc (102, CCW),
    hit(103, A), hit(104, B), hit(105, A),

    sc (107, CW),  hit(108, B),
    sc (109, CCW), hit(110, A),
    sc (111, CW),  hit(112, B),
    sc (113, CCW),
];

// ── Section 2: 126.6 BPM (beats 115–212) ─────────────────────────────────────
const SECTION_2: NoteEvent[] = [
    hit(117, A), hit(119, A), hit(121, A),
    sc (123, CW),
    hit(125, A), hit(127, A),
    sc (129, CCW),

    // Syncopated hits + scratches
    hit(131, A), sc(132, CW),  hit(133, B), sc(134, CCW),
    hit(135, A), sc(136, CW),  hit(137, B), sc(138, CCW),

    // Faster alternation (every beat now)
    sc (139, CW),  hit(140, A),
    sc (141, CCW), hit(142, B),
    sc (143, CW),  hit(144, A),
    sc (145, CCW), hit(146, B),

    // Scratch bursts
    sc (147, CW),  sc (147.5, CCW), sc (148, CW),
    hit(149, A),
    sc (151, CCW), sc (151.5, CW),  sc (152, CCW),
    hit(153, B),

    // Longer run
    hit(155, A), sc(156, CW),
    hit(157, B), sc(158, CCW),
    hit(159, A), sc(160, CW),
    hit(161, B), sc(162, CCW),
    hit(163, A),

    sc (165, CW), sc (165.5, CCW), sc (166, CW),
    hit(167, B), hit(168, A),
    sc (169, CCW),

    hit(171, B), sc(172, CW),
    hit(173, A), sc(174, CCW),
    hit(175, B),

    // Dense scratch run (every beat)
    sc (176, CW),
    sc (177, CCW),
    sc (178, CW),
    sc (179, CCW),

    hit(180, A), hit(181, B),
    sc (182, CW),
    hit(183, A), hit(184, B),
    sc (185, CCW),

    sc (186, CW),  sc (186.5, CCW),
    sc (187, CW),  sc (187.5, CCW),
    hit(188, A),   hit(189, B),

    sc (190, CW),  hit(191, A),
    sc (192, CCW), hit(193, B),
    sc (194, CW),  hit(195, A),

    // Build
    sc (196, CW),  sc (196.5, CCW), sc (197, CW),
    hit(198, B),   hit(199, A),

    sc (200, CCW), hit(201, B),
    sc (202, CW),  hit(203, A),
    sc (204, CCW), hit(205, B),
    sc (206, CW),  hit(207, A),

    sc (208, CW), sc (208.5, CCW),
    sc (209, CW), sc (209.5, CCW),
    sc (210, CW),
];

// ── Section 3: 86.3 BPM (beats 212–276) — slower, heavier, theatrical ────────
const SECTION_3: NoteEvent[] = [
    hit(213, A),
    sc (215, CW),
    hit(216, B),
    sc (218, CCW),
    hit(219, A),
    sc (221, CW),
    hit(222, B),
    sc (224, CCW),

    // Held scratches feel — slower tempo, so more spacing
    hit(226, A), sc(228, CW),
    hit(229, B), sc(231, CCW),
    hit(232, A),

    sc (234, CW),  sc (235, CCW),
    hit(236, B),
    sc (237, CW),  sc (238, CCW),
    hit(239, A),

    // Big scratch climax
    sc (241, CW),
    sc (242, CCW),
    sc (243, CW),
    sc (244, CCW),
    hit(245, A),   hit(246, B),

    sc (247, CW),  sc (248, CCW),
    sc (249, CW),  sc (250, CCW),
    hit(251, A),   hit(252, B),

    // Triplet pattern
    sc (253, CW),  sc (253.5, CCW), sc (254, CW),
    hit(255, A),
    sc (256, CCW), sc (256.5, CW),  sc (257, CCW),
    hit(258, B),

    sc (259, CW),  sc (260, CCW),
    sc (261, CW),  sc (262, CCW),

    hit(263, A),   hit(264, B),

    // Final outro
    sc (265, CW),
    hit(267, A),
    sc (269, CCW),
    hit(271, B),
    sc (273, CW),
    hit(275, A),
];

export const CHART: NoteEvent[] = [
    ...SECTION_1,
    ...SECTION_2,
    ...SECTION_3,
].sort((a, b) => a.beat - b.beat);
