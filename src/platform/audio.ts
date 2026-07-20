// Sample-accurate audio playback clock built on the Web Audio API.
//
// A game gets a shared AudioManager (preloaded with the collection's default song)
// via GameContext.audio. A game that wants a different track can construct its own
// AudioManager and load() its own file (see the `amplitude` prototype).

export class AudioManager {
    private ctx: AudioContext;
    private buffer: AudioBuffer | null = null;
    private source: AudioBufferSourceNode | null = null;
    private masterGain: GainNode;
    private playStartContextTime = 0;
    private playStartOffset = 0;
    /** Decoded buffers by URL, so switching between songs doesn't re-fetch. */
    private cache = new Map<string, AudioBuffer>();
    public loaded = false;
    public playing = false;

    constructor() {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
    }

    /** Load (or switch to) a track. Stops playback when switching. */
    async load(url: string): Promise<void> {
        const cached = this.cache.get(url);
        if (cached) {
            if (this.buffer !== cached) this.stop();
            this.buffer = cached;
            this.loaded = true;
            return;
        }
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arrayBuffer);
        this.cache.set(url, decoded);
        this.stop();
        this.buffer = decoded;
        this.loaded = true;
    }

    /** Buffer duration in seconds (0 until loaded). */
    get durationSeconds(): number {
        return this.buffer?.duration ?? 0;
    }

    /** Release the underlying AudioContext (for per-game managers). */
    close(): void {
        this.stop();
        void this.ctx.close();
    }

    stop(): void {
        if (!this.source || !this.playing) return;
        this.source.stop();
        this.source = null;
        this.playing = false;
    }

    async play(offsetSeconds = 0): Promise<void> {
        if (!this.buffer || this.playing) return;
        await this.ctx.resume();
        this.source = this.ctx.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.connect(this.masterGain);
        this.playStartOffset = offsetSeconds;
        this.playStartContextTime = this.ctx.currentTime;
        this.source.start(0, offsetSeconds);
        this.playing = true;
    }

    get currentSeconds(): number {
        if (!this.playing) return 0;
        return (this.ctx.currentTime - this.playStartContextTime) + this.playStartOffset;
    }

    /** Exposed so games can build their own audio graph (filters, gains) if needed. */
    get context(): AudioContext {
        return this.ctx;
    }

    /** Master output node. Connect game SFX graphs here (not ctx.destination) so `volume` applies to them too. */
    get output(): GainNode {
        return this.masterGain;
    }

    /** Master volume, clamped to [0, 1]. Persists across games for the session (the AudioManager is shared). */
    get volume(): number {
        return this.masterGain.gain.value;
    }

    set volume(v: number) {
        this.masterGain.gain.value = Math.min(1, Math.max(0, v));
    }
}
