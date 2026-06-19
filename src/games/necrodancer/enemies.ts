// Enemy AI + wave pacing. Each enemy moves once per beat (or every other beat),
// with simple, readable patterns the player can learn:
//   skeleton — steps one tile toward the player (greedy chase)
//   slime    — moves toward the player only every OTHER beat (slow, telegraphed)
//   bat      — ignores the player; bounces in a fixed horizontal zig-zag,
//              drifting down a row when it hits a wall
//
// Wave pacing scales with song progress: more / tougher spawns later.

import {
    COLS, ROWS, ENEMY_SPEC, inBounds,
    type Enemy, type EnemyKind, type Player,
} from "./types";
import { SONG_LENGTH_BEATS } from "../../platform/song";

let nextSpawnBeat = 4;

export function resetSpawner(): void {
    nextSpawnBeat = 4;
}

function sign(n: number): number {
    return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function occupied(enemies: Enemy[], x: number, y: number, self?: Enemy): boolean {
    for (const e of enemies) {
        if (e === self) continue;
        if (e.x === x && e.y === y) return true;
    }
    return false;
}

function makeEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    return {
        kind,
        x, y,
        hp: ENEMY_SPEC[kind].hp,
        beatsAlive: 0,
        zig: Math.random() < 0.5 ? -1 : 1,
        fromX: x, fromY: y,
        hitFrame: -999,
    };
}

// Find a free edge tile to spawn on, away from the player.
function freeSpawnTile(enemies: Enemy[], player: Player): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    for (let x = 0; x < COLS; x++) {
        candidates.push({ x, y: 0 });
        candidates.push({ x, y: ROWS - 1 });
    }
    for (let y = 1; y < ROWS - 1; y++) {
        candidates.push({ x: 0, y });
        candidates.push({ x: COLS - 1, y });
    }
    // shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const c of candidates) {
        const dist = Math.abs(c.x - player.x) + Math.abs(c.y - player.y);
        if (dist >= 2 && !occupied(enemies, c.x, c.y)) return c;
    }
    return null;
}

// Decide whether to spawn enemies on this beat. Difficulty ramps with progress.
export function maybeSpawn(beat: number, enemies: Enemy[], player: Player): void {
    if (beat < nextSpawnBeat) return;

    const progress = Math.min(1, beat / SONG_LENGTH_BEATS);
    // Cap concurrent enemies; rises over the song.
    const cap = 3 + Math.floor(progress * 5);            // 3 → 8
    if (enemies.length >= cap) {
        nextSpawnBeat = beat + 1;
        return;
    }

    // Spawn 1–2 at a time; tighter cadence as the song builds.
    const burst = progress > 0.5 ? 2 : 1;
    for (let i = 0; i < burst; i++) {
        if (enemies.length >= cap) break;
        const tile = freeSpawnTile(enemies, player);
        if (!tile) break;
        enemies.push(makeEnemy(pickKind(progress), tile.x, tile.y));
    }

    const interval = Math.max(3, Math.round(8 - progress * 5)); // 8 → 3 beats
    nextSpawnBeat = beat + interval;
}

function pickKind(progress: number): EnemyKind {
    const r = Math.random();
    if (progress < 0.25) {
        return r < 0.7 ? "skeleton" : "slime";
    }
    if (progress < 0.6) {
        return r < 0.45 ? "skeleton" : r < 0.8 ? "slime" : "bat";
    }
    return r < 0.4 ? "skeleton" : r < 0.65 ? "slime" : "bat";
}

// Advance one enemy by one beat. Returns the desired (x,y); caller commits it
// after collision resolution so two enemies don't stack.
export function enemyStep(e: Enemy, player: Player, enemies: Enemy[]): { x: number; y: number } {
    e.beatsAlive++;

    if (e.kind === "slime" && e.beatsAlive % 2 === 1) {
        return { x: e.x, y: e.y }; // rest beat
    }

    if (e.kind === "bat") {
        let nx = e.x + e.zig;
        let ny = e.y;
        if (!inBounds(nx, ny) || occupied(enemies, nx, ny, e)) {
            e.zig = -e.zig;          // bounce
            nx = e.x + e.zig;
            ny = e.y + 1 >= ROWS ? 0 : e.y + 1; // drift down, wrap
            if (!inBounds(nx, ny) || occupied(enemies, nx, ny, e)) {
                nx = e.x; ny = e.y;
            }
        }
        return { x: nx, y: ny };
    }

    // skeleton + slime active beat: greedy chase, prefer the larger axis gap.
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    let nx = e.x;
    let ny = e.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
        nx = e.x + sign(dx);
    } else if (dy !== 0) {
        ny = e.y + sign(dy);
    } else if (dx !== 0) {
        nx = e.x + sign(dx);
    }
    if (!inBounds(nx, ny) || occupied(enemies, nx, ny, e)) {
        // try the other axis
        nx = e.x; ny = e.y;
        if (dy !== 0 && Math.abs(dx) >= Math.abs(dy)) ny = e.y + sign(dy);
        else if (dx !== 0) nx = e.x + sign(dx);
        if (!inBounds(nx, ny) || occupied(enemies, nx, ny, e)) {
            nx = e.x; ny = e.y;
        }
    }
    return { x: nx, y: ny };
}
