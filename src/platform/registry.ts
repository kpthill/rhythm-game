// Auto-discovers every game under src/games/<id>/index.ts via Vite's import.meta.glob.
// Adding a game = creating a folder that default-exports a GameModule. No edits here.

import type { GameModule } from "./game";

const modules = import.meta.glob<{ default: GameModule }>("../games/*/index.ts", {
    eager: true,
});

export const GAMES: GameModule[] = Object.values(modules)
    .map((m) => m.default)
    .filter((g): g is GameModule => Boolean(g && g.id && g.title))
    .sort((a, b) => a.title.localeCompare(b.title));
