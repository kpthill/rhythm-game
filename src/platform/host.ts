// The platform host: owns the single p5 instance + canvas, the shared audio, and
// orchestrates DJ <-> the archive of mothballed prototypes. Games are pure
// GameModules; the host handles loading, launching, the global quit gesture,
// and teardown.
//
// DJ is the headliner: the app boots straight into it. Holding START in-game
// lands on a small home screen (play again / prototype vault); the vault is
// the old launcher menu holding the other prototypes as a novelty.

import p5 from "p5";
import { sampleInput } from "./input";
import { AudioManager } from "./audio";
import { GAMES } from "./registry";
import { Menu } from "./menu";
import { SONG_FILE, beatAt } from "./song";
import type { GameModule, GameContext } from "./game";

const W = 336;
const H = 262;
const QUIT_HOLD_FRAMES = 45;   // hold START ~0.75s in-game to return home

const HEADLINER_ID = "dj";

type HostMode = "game" | "home" | "archive";

export function boot(mount: HTMLElement): void {
    const sketch = (p: p5) => {
        const audio = new AudioManager();
        let loaded = false;

        const headliner = GAMES.find((g) => g.id === HEADLINER_ID) ?? GAMES[0] ?? null;
        const archive = GAMES.filter((g) => g !== headliner);
        const menu = new Menu(p, archive, "PROTOTYPE VAULT");

        let mode: HostMode = "home";
        let current: GameModule | null = null;
        let ctx: GameContext | null = null;
        let booted = false;

        // Quit-gesture bookkeeping
        let startHeldFrames = 0;
        let startReleasedSinceLaunch = false;
        // Home-screen edge guard: ignore the A/START that arrived with the quit
        let homeReleasedSinceEntry = false;

        function launch(game: GameModule): void {
            audio.stop();
            startHeldFrames = 0;
            startReleasedSinceLaunch = false;
            ctx = {
                p, width: W, height: H, audio,
                beatNow: () => beatAt(audio),
                exit: quit,
            };
            current = game;
            mode = "game";
            try {
                game.init(ctx);
            } catch (err) {
                console.error(`[${game.id}] init failed:`, err);
                quit();
            }
        }

        function quit(): void {
            if (current) {
                try { current.teardown(); } catch (err) { console.error(`[${current.id}] teardown failed:`, err); }
            }
            audio.stop();
            current = null;
            ctx = null;
            mode = "home";
            homeReleasedSinceEntry = false;
            menu.reset();
        }

        function drawLoading(): void {
            p.background(12, 8, 24);
            p.fill(180, 170, 200);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(13);
            p.text("Loading…", W / 2, H / 2);
        }

        function frameHome(input: ReturnType<typeof sampleInput>): void {
            p.background(12, 8, 24);

            // Backdrop: a big platter
            p.noStroke();
            p.fill(20, 15, 38);
            p.ellipse(W / 2, 118, 150, 150);
            p.noFill();
            p.strokeWeight(0.5);
            for (let r = 20; r < 72; r += 7) {
                p.stroke(60, 50, 95, 90);
                p.ellipse(W / 2, 118, r * 2, r * 2);
            }
            p.noStroke();
            p.fill(140, 110, 220);
            p.ellipse(W / 2, 118, 18, 18);

            p.textAlign(p.CENTER, p.CENTER);
            p.fill(235, 225, 255);
            p.textSize(34);
            p.text("DJ", W / 2, 62);
            p.fill(120, 110, 150);
            p.textSize(8);
            p.text("turntable rhythm game", W / 2, 84);

            p.textSize(10);
            p.fill(200, 190, 230);
            p.text("A / START — play", W / 2, 208);
            p.fill(90, 82, 118);
            p.textSize(7.5);
            p.text("B — prototype vault", W / 2, 226);

            if (!input.aHeld && !input.startHeld && !input.bHeld) homeReleasedSinceEntry = true;
            if (!homeReleasedSinceEntry) return;

            if ((input.aPressed || input.startPressed) && headliner) launch(headliner);
            else if (input.bPressed && archive.length > 0) {
                mode = "archive";
                menu.reset();
            }
        }

        p.setup = () => {
            p.createCanvas(W, H);
            p.textFont("monospace");
            audio.load(SONG_FILE)
                .then(() => { loaded = true; })
                .catch((err) => { console.error("Audio load failed:", err); loaded = true; });
        };

        p.draw = () => {
            const input = sampleInput();

            if (!loaded) {
                drawLoading();
                return;
            }

            // Boot-time autoplay can leave the AudioContext suspended in plain
            // browsers (no user gesture yet); revive it on the first input.
            if ((input.aPressed || input.bPressed || input.startPressed) && audio.context.state === "suspended") {
                void audio.context.resume();
            }

            // Boot straight into DJ.
            if (!booted) {
                booted = true;
                if (headliner) { launch(headliner); return; }
            }

            if (mode === "home") {
                frameHome(input);
                return;
            }

            if (mode === "archive") {
                if (input.bPressed) { mode = "home"; homeReleasedSinceEntry = false; return; }
                const picked = menu.frame(input);
                if (picked) launch(picked);
                return;
            }

            if (!current) { mode = "home"; return; }

            // Global quit gesture (only after START has been released once post-launch,
            // so the launching START press can't immediately quit).
            if (!input.startHeld) {
                startReleasedSinceLaunch = true;
                startHeldFrames = 0;
            } else if (startReleasedSinceLaunch) {
                startHeldFrames++;
                if (startHeldFrames > QUIT_HOLD_FRAMES) {
                    quit();
                    return;
                }
            }

            try {
                current.frame(input, p.deltaTime);
            } catch (err) {
                console.error(`[${current?.id}] frame failed:`, err);
                quit();
            }
        };
    };

    new p5(sketch, mount);
}
