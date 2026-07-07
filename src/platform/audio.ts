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
    public loaded = false;
    public playing = false;

    constructor() {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
    }

    async load(url: string): Promise<void> {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.loaded = true;
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
