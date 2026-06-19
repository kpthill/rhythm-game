// Tube Run charts — obstacle / gap layout over the shared song beats.
// The runner lives at angle PI/2 (bottom of tube = 6 o'clock) at rest.
// Events define the required safe angle for that beat.

import type { TubeEvent } from "./notes";
import { GAP_COLOR, JUMP_COLOR, TUNNEL_COLOR } from "./notes";

const GA = GAP_COLOR;    // gap (rotate to safety)
const JU = JUMP_COLOR;   // jump obstacle
const TU = TUNNEL_COLOR; // narrow-tunnel rotation

// Shorthand helpers
const gap    = (beat: number, safeAngle: number): TubeEvent =>
    ({ beat, type: "gap",    safeAngle, color: GA });
const jump   = (beat: number, safeAngle: number): TubeEvent =>
    ({ beat, type: "jump",   safeAngle, color: JU });
const tunnel = (beat: number, safeAngle: number): TubeEvent =>
    ({ beat, type: "tunnel", safeAngle, color: TU });

// Convenience angle constants (radians, clockwise from right)
const BOT  =  Math.PI / 2;           // 6-o'clock (runner home)
const TOP  = -Math.PI / 2;           // 12-o'clock
const RGT  =  0;                     // 3-o'clock
const LFT  =  Math.PI;               // 9-o'clock
const BOT_R =  Math.PI / 4;          // 4:30
const BOT_L =  (3 * Math.PI) / 4;   // 7:30
const TOP_R = -Math.PI / 4;          // 1:30
const TOP_L = -(3 * Math.PI) / 4;   // 10:30

// ── EASY chart ────────────────────────────────────────────────────────────────
// Every 4 beats, mostly gaps at simple angles.  Forgiving intro.
export const CHART_EASY: TubeEvent[] = [
    // Intro warmup — gaps at home angle so no rotation needed (tutorial feel)
    gap(4,  BOT),
    gap(8,  BOT),
    gap(12, BOT),

    // Start rotating: flip between bottom and sides
    gap(16, RGT),
    gap(20, BOT),
    gap(24, LFT),
    gap(28, BOT),

    gap(32, TOP),
    gap(36, BOT),
    gap(40, RGT),
    gap(44, BOT),

    // First jumps
    jump(48, BOT),
    jump(52, BOT),
    gap(56, LFT),
    jump(60, BOT),

    // More rotation
    gap(64, TOP),
    gap(68, RGT),
    gap(72, BOT),
    gap(76, LFT),

    gap(80, BOT),
    jump(84, BOT),
    gap(88, RGT),
    gap(92, TOP),

    // Diagonals start appearing
    gap(96,  BOT_R),
    gap(100, BOT_L),
    gap(104, TOP_R),
    gap(108, TOP_L),

    gap(112, BOT),
    jump(116, BOT),
    jump(120, BOT),
    gap(124, RGT),

    // Section 2 (126.6 BPM) — slightly denser
    gap(128, BOT),
    gap(130, TOP),
    gap(132, BOT),
    gap(134, RGT),

    gap(136, BOT),
    jump(138, BOT),
    gap(140, LFT),
    gap(142, BOT),

    gap(144, TOP),
    gap(146, RGT),
    gap(148, BOT_R),
    gap(150, BOT_L),

    gap(152, BOT),
    jump(154, BOT),
    gap(156, TOP),
    gap(158, LFT),

    gap(160, BOT),
    gap(162, RGT),
    jump(164, BOT),
    gap(166, TOP),

    gap(168, BOT),
    gap(170, LFT),
    gap(172, BOT),
    gap(174, RGT),

    jump(176, BOT),
    gap(178, TOP),
    gap(180, BOT),
    gap(182, LFT),

    gap(184, BOT),
    jump(186, BOT),
    gap(188, RGT),
    gap(190, BOT),

    // Section 3 (86.3 BPM — slower, dramatic)
    tunnel(214, TOP),
    tunnel(218, LFT),
    tunnel(222, BOT),
    tunnel(226, RGT),

    gap(230, BOT),
    jump(234, BOT),
    gap(238, TOP),
    gap(242, BOT),

    gap(246, LFT),
    jump(250, BOT),
    gap(254, RGT),
    gap(258, BOT),

    gap(262, TOP_L),
    gap(266, BOT_R),
    gap(270, BOT),
];

// ── GROOVE chart ──────────────────────────────────────────────────────────────
// Full-song chart.  Mirrors GROOVE-level complexity from tunnel reference.
// Every 2 beats in sections 1 & 2; every 2–3 beats in section 3.
export const CHART_GROOVE: TubeEvent[] = [
    // ── Section 1: 108 BPM (beats 1–115) ─────────────────────────────────────
    gap( 3, BOT),
    gap( 5, RGT),
    gap( 7, BOT),
    gap( 9, LFT),

    gap(11, BOT),
    gap(13, TOP),
    gap(15, BOT),
    gap(17, RGT),

    gap(19, BOT),
    gap(21, TOP),
    gap(23, LFT),
    gap(25, BOT),

    gap(27, RGT),
    gap(29, BOT),
    gap(31, LFT),
    gap(33, TOP),

    // First jumps interspersed
    gap(35, BOT),
    jump(37, BOT),
    gap(39, RGT),
    gap(41, BOT),

    jump(43, BOT),
    gap(45, LFT),
    gap(47, BOT),
    gap(49, TOP),

    // Diagonal section
    gap(51, BOT_R),
    gap(53, BOT_L),
    gap(55, TOP_R),
    gap(57, TOP_L),

    gap(59, BOT_R),
    jump(61, BOT_R),
    gap(63, BOT),
    gap(65, TOP),

    gap(67, RGT),
    gap(69, BOT),
    jump(71, BOT),
    gap(73, LFT),

    // Dense: every beat
    gap(75, BOT),   gap(76, RGT),
    gap(77, TOP),   gap(78, LFT),
    gap(79, BOT),   jump(80, BOT),

    gap(81, RGT),   gap(82, TOP),
    gap(83, LFT),   gap(84, BOT),
    gap(85, TOP_R), gap(86, BOT_L),

    gap(87, BOT),   gap(88, RGT),
    jump(89, BOT),  gap(90, LFT),

    gap(91, TOP),   gap(92, RGT),
    gap(93, BOT),   gap(94, LFT),
    gap(95, TOP),

    gap(97, BOT),   gap(99, RGT),
    gap(101, BOT),  gap(103, LFT),

    gap(105, TOP),  jump(107, TOP),
    gap(109, BOT),  gap(111, RGT),
    gap(113, BOT),

    // ── Section 2: 126.6 BPM (from beat 115.6) ───────────────────────────────
    gap(117, BOT),  gap(118, RGT),
    gap(119, TOP),  gap(120, LFT),
    gap(121, BOT),  gap(122, RGT),
    gap(123, TOP),  gap(124, LFT),

    gap(125, BOT),  jump(126, BOT),
    gap(127, RGT),  gap(128, BOT),

    gap(129, TOP),  gap(130, LFT),
    gap(131, BOT),  gap(132, RGT),

    jump(133, BOT), gap(134, BOT_R),
    gap(135, BOT_L), gap(136, TOP_R),
    gap(137, TOP_L), gap(138, BOT),

    gap(139, RGT),  gap(140, BOT),
    gap(141, LFT),  jump(142, BOT),
    gap(143, TOP),  gap(144, BOT),

    gap(145, RGT),  gap(146, LFT),
    gap(147, TOP),  gap(148, BOT),

    tunnel(149, TOP_L),
    tunnel(151, BOT_L),
    tunnel(153, TOP_R),
    tunnel(155, BOT_R),

    gap(157, BOT),  gap(158, RGT),
    jump(159, BOT), gap(160, TOP),
    gap(161, LFT),  gap(162, BOT),

    gap(163, RGT),  gap(164, BOT),
    gap(165, LFT),  gap(166, TOP),

    gap(167, BOT),  jump(168, BOT),
    gap(169, RGT),  gap(170, BOT),

    gap(171, LFT),  gap(172, TOP),
    gap(173, BOT),  gap(174, RGT),
    gap(175, BOT),

    tunnel(176, TOP),
    tunnel(178, LFT),
    tunnel(180, BOT),

    gap(182, RGT),  gap(183, TOP),
    gap(184, LFT),  gap(185, BOT),

    jump(186, BOT), gap(187, RGT),
    gap(188, BOT),  gap(189, LFT),

    gap(190, TOP),  gap(191, BOT),
    gap(192, RGT),

    gap(193, BOT),  gap(194, LFT),
    gap(195, TOP),  jump(196, TOP),
    gap(197, RGT),  gap(198, BOT),
    gap(199, LFT),

    gap(201, BOT),  gap(202, RGT),
    gap(203, TOP),  gap(204, LFT),
    gap(205, BOT),  gap(206, BOT_R),
    gap(207, TOP_R), gap(208, TOP_L),
    gap(209, BOT_L), gap(210, BOT),
    jump(211, BOT),

    // ── Section 3: 86.3 BPM (from beat 212.5) ────────────────────────────────
    tunnel(213, TOP),
    gap(215, BOT),
    tunnel(217, LFT),
    gap(219, BOT),

    tunnel(221, TOP_R),
    jump(223, BOT),
    gap(225, RGT),

    tunnel(227, BOT_L),
    gap(229, BOT),
    jump(231, BOT),

    gap(233, LFT),
    tunnel(235, TOP),
    gap(237, BOT),

    gap(239, RGT),
    jump(241, BOT),
    gap(243, TOP),

    tunnel(245, BOT_R),
    gap(247, BOT),
    gap(249, LFT),
    jump(251, BOT),

    gap(253, TOP_L),
    gap(255, BOT),
    gap(257, RGT),

    gap(259, BOT),
    jump(261, BOT),
    tunnel(263, TOP),
    gap(265, LFT),

    gap(267, BOT),
    gap(269, TOP_R),
    gap(271, BOT),
];

export type ChartDef = { name: string; events: TubeEvent[] };

export const CHARTS: ChartDef[] = [
    { name: "EASY",   events: CHART_EASY },
    { name: "GROOVE", events: CHART_GROOVE },
];
