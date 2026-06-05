export class AudioManager {
    private ctx: AudioContext;
    private buffer: AudioBuffer | null = null;
    private source: AudioBufferSourceNode | null = null;
    private playStartContextTime = 0;
    private playStartOffset = 0;
    public loaded = false;
    public playing = false;

    constructor() {
        this.ctx = new AudioContext();
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
        this.source.connect(this.ctx.destination);
        this.playStartOffset = offsetSeconds;
        this.playStartContextTime = this.ctx.currentTime;
        this.source.start(0, offsetSeconds);
        this.playing = true;
    }

    get currentSeconds(): number {
        if (!this.playing) return 0;
        return (this.ctx.currentTime - this.playStartContextTime) + this.playStartOffset;
    }

    currentBeat(bpm: number): number {
        return this.currentSeconds * (bpm / 60);
    }
}
