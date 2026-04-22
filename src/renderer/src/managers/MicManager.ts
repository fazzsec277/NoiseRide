interface CtxEntry {
  ctx: AudioContext
  source: MediaStreamAudioSourceNode
  gainNode: GainNode
}

class MicManager {
  private ctxMap = new Map<string, CtxEntry>()
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private currentGain = 1.0
  private isMuted = false
  private ptkMuted = false

  private effectiveGain(): number {
    return this.ptkMuted || this.isMuted ? 0 : this.currentGain
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {})
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  }

  async start(micDeviceId: string, outputDeviceIds: string[], inputGain: number): Promise<void> {
    this.stop()

    this.currentGain = inputGain

    const constraints: MediaStreamConstraints = {
      audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true
    }
    this.stream = await navigator.mediaDevices.getUserMedia(constraints)

    const targetDevices = outputDeviceIds.length > 0 ? outputDeviceIds : ['']
    let isFirst = true

    for (const deviceId of targetDevices) {
      const ctx = new AudioContext()
      if (deviceId && 'setSinkId' in ctx) {
        await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId)
      }

      const source = ctx.createMediaStreamSource(this.stream)
      const gainNode = ctx.createGain()
      gainNode.gain.value = this.effectiveGain()

      source.connect(gainNode)
      gainNode.connect(ctx.destination)

      if (isFirst) {
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        gainNode.connect(analyser)
        this.analyser = analyser
        isFirst = false
      }

      this.ctxMap.set(deviceId, { ctx, source, gainNode })
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }

    for (const { ctx } of this.ctxMap.values()) {
      ctx.close().catch(() => {})
    }
    this.ctxMap.clear()
    this.analyser = null
  }

  isRunning(): boolean {
    return this.stream !== null
  }

  setGain(gain: number): void {
    this.currentGain = gain
    const value = this.effectiveGain()
    for (const { gainNode } of this.ctxMap.values()) {
      gainNode.gain.value = value
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
    const value = this.effectiveGain()
    for (const { gainNode } of this.ctxMap.values()) {
      gainNode.gain.value = value
    }
  }

  setPtkMuted(muted: boolean): void {
    this.ptkMuted = muted
    const value = this.effectiveGain()
    for (const { gainNode } of this.ctxMap.values()) {
      gainNode.gain.value = value
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setPitch(_semitones: number): void {
    // pitch shift not yet implemented
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }
}

export const micManager = new MicManager()
