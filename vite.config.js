import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

/**
 * Dev-only takes endpoint for the DJ chart recorder.
 *
 * Recorded takes are saved to takes/<songId>/<name>.json (gitignored) so the
 * authoring loop doesn't round-trip through the clipboard:
 *   POST /__dj/takes                 {songId, ...} → saves, returns {name}
 *   GET  /__dj/takes?song=<songId>   → {takes: [{name, savedAt}]} newest first
 *   GET  /__dj/takes/<songId>/<name> → the saved JSON
 */
function djTakesPlugin() {
    const root = path.resolve("takes");
    const safe = (s) => /^[\w.-]+$/.test(s); // path-segment allowlist

    return {
        name: "dj-takes",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use("/__dj/takes", (req, res, next) => {
                const url = new URL(req.url, "http://localhost");

                if (req.method === "POST") {
                    let body = "";
                    req.on("data", (chunk) => { body += chunk; });
                    req.on("end", () => {
                        try {
                            const take = JSON.parse(body);
                            if (!take.songId || !safe(take.songId)) throw new Error("bad songId");
                            const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
                            const name = `take-${stamp}.json`;
                            const dir = path.join(root, take.songId);
                            fs.mkdirSync(dir, { recursive: true });
                            fs.writeFileSync(path.join(dir, name), JSON.stringify(take, null, 2));
                            res.setHeader("content-type", "application/json");
                            res.end(JSON.stringify({ name }));
                        } catch (err) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: String(err) }));
                        }
                    });
                    return;
                }

                if (req.method === "GET") {
                    const segments = url.pathname.split("/").filter(Boolean);
                    try {
                        if (segments.length === 2 && safe(segments[0]) && safe(segments[1])) {
                            // /__dj/takes/<songId>/<name> → file contents
                            const file = path.join(root, segments[0], segments[1]);
                            res.setHeader("content-type", "application/json");
                            res.end(fs.readFileSync(file, "utf8"));
                            return;
                        }
                        const song = url.searchParams.get("song");
                        if (song && safe(song)) {
                            const dir = path.join(root, song);
                            const takes = fs.existsSync(dir)
                                ? fs.readdirSync(dir)
                                    .filter((f) => f.endsWith(".json"))
                                    .map((f) => ({ name: f, savedAt: fs.statSync(path.join(dir, f)).mtimeMs }))
                                    .sort((a, b) => b.savedAt - a.savedAt)
                                : [];
                            res.setHeader("content-type", "application/json");
                            res.end(JSON.stringify({ takes }));
                            return;
                        }
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: "bad request" }));
                    } catch (err) {
                        res.statusCode = 404;
                        res.end(JSON.stringify({ error: String(err) }));
                    }
                    return;
                }

                next();
            });
        },
    };
}

export default defineConfig({
    publicDir: "public",
    build: {
        assetsInlineLimit: 0,
    },
    plugins: [djTakesPlugin()],
});
