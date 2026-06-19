// The platform host: owns the single p5 instance + canvas, the shared audio, and
// orchestrates the launcher menu <-> active game. Games are pure GameModules; the
// host handles loading, launching, the global quit gesture, and teardown.

import p5 from "p5";
import { sampleInput } from "./input";
import { AudioManager } from "./audio";
import { GAMES } from "./registry";
import { Menu } from "./menu";
import { SONG_FILE, beatAt } from "./song";
import type { GameModule, GameContext } from "./game";

const W = 336;
const H = 262;
const QUIT_HOLD_FRAMES = 45;   // hold START ~0.75s in-game to return to the menu

export function boot(mount: HTMLElement): void {
    const sketch = (p: p5) => {
        const audio = new AudioManager();
        let loaded = false;
        const menu = new Menu(p, GAMES);

        let current: GameModule | null = null;
        let ctx: GameContext | null = null;

        // Quit-gesture bookkeeping
        let startHeldFrames = 0;
        let startReleasedSinceLaunch = false;

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
            menu.reset();
        }

        function drawLoading(): void {
            p.background(12, 8, 24);
            p.fill(180, 170, 200);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(13);
            p.text("Loading…", W / 2, H / 2);
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

            if (!current) {
                const picked = menu.frame(input);
                if (picked) launch(picked);
                return;
            }

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
