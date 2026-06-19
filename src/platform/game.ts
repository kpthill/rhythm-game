// The contract every game in the collection implements.
//
// A game lives in its own folder under src/games/<id>/ and default-exports a
// GameModule. The launcher discovers it automatically via import.meta.glob —
// there is NO central registry to edit, so games never touch a shared file.
//
// Lifecycle, all driven by the host:
//   init(ctx)            once, when the player picks the game from the menu
//   frame(input, dt)     every frame while the game is active (update + draw)
//   teardown()           once, when returning to the menu (stop audio, free state)

import type p5 from "p5";
import type { AudioManager } from "./audio";
import type { InputSnapshot } from "./input";

export interface GameContext {
    /** Shared p5 instance — draw with immediate-mode calls (p.fill, p.rect, …). */
    p: p5;
    /** Canvas size (336 × 262). */
    width: number;
    height: number;
    /** Shared audio, preloaded with the collection's default song. Call play()/stop(). */
    audio: AudioManager;
    /** Current beat of the shared song (wraps secondsToBeat). Ignore if you load your own track. */
    beatNow(): number;
    /** Return to the launcher menu. */
    exit(): void;
}

export interface GameModule {
    /** Unique slug, also the folder name (e.g. "tunnel"). */
    id: string;
    /** Menu label. */
    title: string;
    author?: string;
    init(ctx: GameContext): void;
    /** dt = p.deltaTime in milliseconds. */
    frame(input: InputSnapshot, dt: number): void;
    teardown(): void;
}
