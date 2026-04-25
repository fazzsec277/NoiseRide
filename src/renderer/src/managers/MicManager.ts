/** ソフトクリッピング曲線を生成する（変形シグモイド）。
 *  drive 0 → 線形（歪みなし）、drive 100 → 激しい矩形波クリッピング。
 */
function makeDistortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 512
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  const k = Math.max(drive * drive * 0.04, 0.001)  // 0〜400
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1  // -1 〜 +1
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

/** Tone 値 (0〜100) をローパスカットオフ周波数 (Hz) に変換する。 */
function toneToFreq(tone: number): number {
  return 500 * Math.pow(40, tone / 100)  // 500 Hz〜20 kHz
}

interface CtxEntry {
  ctx: AudioContext
  source: MediaStreamAudioSourceNode
  gainNode: GainNode
  pitchNode: AudioWorkletNode | null
  lowFilter: BiquadFilterNode
  midFilter: BiquadFilterNode
  highFilter: BiquadFilterNode
  distDryGain: GainNode
  distPreGain: GainNode
  waveshaper: WaveShaperNode
  distToneFilter: BiquadFilterNode
  distWetGain: GainNode
  compressor: DynamicsCompressorNode
}

class MicManager {
  private ctxMap = new Map<string, CtxEntry>()
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private currentGain = 1.0
  private isMuted = false
  private ptkMuted = false

  // Cached params (re-applied after restart)
  private pitchSemitones = 0
  private formantSemitones = 0
  private eqLow = 0
  private eqMid = 0
  private eqHigh = 0
  private compressorEnabled = false
  private distortionEnabled = false
  private distortionDrive = 50
  private distortionMix = 80
  private distortionTone = 70

  private effectiveGain(): number {
    return this.ptkMuted || this.isMuted ? 0 : this.currentGain
  }

  /** distortionEnabled の状態に応じた dry/wet ゲイン値を返す。 */
  private distGains(): { dry: number; wet: number; pre: number } {
    if (!this.distortionEnabled) return { dry: 1, wet: 0, pre: 1 }
    const wet = this.distortionMix / 100
    const dry = 1 - wet
    const pre = 1 + this.distortionDrive * 0.3  // drive 0→1, 100→31
    return { dry, wet, pre }
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
      audio: {
        ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
    }
    this.stream = await navigator.mediaDevices.getUserMedia(constraints)

    const workletUrl = new URL('./worklets/PitchFormantProcessor.js', window.location.href).href
    const targetDevices = outputDeviceIds.length > 0 ? outputDeviceIds : ['']
    let isFirst = true

    for (const deviceId of targetDevices) {
      const ctx = new AudioContext()
      if (deviceId && 'setSinkId' in ctx) {
        await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId)
      }

      // Pitch/formant worklet
      let pitchNode: AudioWorkletNode | null = null
      try {
        await ctx.audioWorklet.addModule(workletUrl)
        pitchNode = new AudioWorkletNode(ctx, 'pitch-formant-processor')
        pitchNode.port.postMessage({ pitch: this.pitchSemitones, formant: this.formantSemitones })
      } catch {
        // フォールバック: ピッチシフトなし
      }

      // EQ
      const lowFilter = ctx.createBiquadFilter()
      lowFilter.type = 'lowshelf'
      lowFilter.frequency.value = 250
      lowFilter.gain.value = this.eqLow

      const midFilter = ctx.createBiquadFilter()
      midFilter.type = 'peaking'
      midFilter.frequency.value = 1000
      midFilter.Q.value = 1.0
      midFilter.gain.value = this.eqMid

      const highFilter = ctx.createBiquadFilter()
      highFilter.type = 'highshelf'
      highFilter.frequency.value = 4000
      highFilter.gain.value = this.eqHigh

      // Distortion (parallel dry/wet)
      const { dry, wet, pre } = this.distGains()

      const distDryGain = ctx.createGain()
      distDryGain.gain.value = dry

      const distPreGain = ctx.createGain()
      distPreGain.gain.value = pre

      const waveshaper = ctx.createWaveShaper()
      waveshaper.curve = makeDistortionCurve(this.distortionEnabled ? this.distortionDrive : 0)
      waveshaper.oversample = '4x'

      const distToneFilter = ctx.createBiquadFilter()
      distToneFilter.type = 'lowpass'
      distToneFilter.frequency.value = toneToFreq(this.distortionTone)

      const distWetGain = ctx.createGain()
      distWetGain.gain.value = wet

      // Compressor
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.value = this.compressorEnabled ? -24 : 0
      compressor.knee.value = 30
      compressor.ratio.value = 12
      compressor.attack.value = 0.003
      compressor.release.value = 0.25

      const source = ctx.createMediaStreamSource(this.stream!)
      const gainNode = ctx.createGain()
      gainNode.gain.value = this.effectiveGain()

      // Signal chain:
      //   source → gain → [pitchNode →] low → mid → high
      //   → distDryGain ──────────────────────────────────→ compressor → dest
      //   → distPreGain → waveshaper → toneFilter → distWetGain ┘
      source.connect(gainNode)
      let lastNode: AudioNode = gainNode
      if (pitchNode) {
        gainNode.connect(pitchNode)
        lastNode = pitchNode
      }
      lastNode.connect(lowFilter)
      lowFilter.connect(midFilter)
      midFilter.connect(highFilter)

      highFilter.connect(distDryGain)
      highFilter.connect(distPreGain)
      distPreGain.connect(waveshaper)
      waveshaper.connect(distToneFilter)
      distToneFilter.connect(distWetGain)

      distDryGain.connect(compressor)
      distWetGain.connect(compressor)
      compressor.connect(ctx.destination)

      if (isFirst) {
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        gainNode.connect(analyser)
        this.analyser = analyser
        isFirst = false
      }

      this.ctxMap.set(deviceId, {
        ctx, source, gainNode, pitchNode,
        lowFilter, midFilter, highFilter,
        distDryGain, distPreGain, waveshaper, distToneFilter, distWetGain,
        compressor
      })
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    for (const { ctx } of this.ctxMap.values()) ctx.close().catch(() => {})
    this.ctxMap.clear()
    this.analyser = null
  }

  isRunning(): boolean { return this.stream !== null }

  setGain(gain: number): void {
    this.currentGain = gain
    const value = this.effectiveGain()
    for (const { gainNode } of this.ctxMap.values()) gainNode.gain.value = value
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
    const value = this.effectiveGain()
    for (const { gainNode } of this.ctxMap.values()) gainNode.gain.value = value
  }

  setPtkMuted(muted: boolean): void {
    this.ptkMuted = muted
    const value = this.effectiveGain()
    for (const { gainNode } of this.ctxMap.values()) gainNode.gain.value = value
  }

  setPitch(semitones: number): void {
    this.pitchSemitones = semitones
    for (const { pitchNode } of this.ctxMap.values()) pitchNode?.port.postMessage({ pitch: semitones })
  }

  setFormant(semitones: number): void {
    this.formantSemitones = semitones
    for (const { pitchNode } of this.ctxMap.values()) pitchNode?.port.postMessage({ formant: semitones })
  }

  setEqBand(band: 'low' | 'mid' | 'high', gainDb: number): void {
    if (band === 'low') this.eqLow = gainDb
    else if (band === 'mid') this.eqMid = gainDb
    else this.eqHigh = gainDb
    for (const entry of this.ctxMap.values()) {
      if (band === 'low') entry.lowFilter.gain.value = gainDb
      else if (band === 'mid') entry.midFilter.gain.value = gainDb
      else entry.highFilter.gain.value = gainDb
    }
  }

  setCompressorEnabled(enabled: boolean): void {
    this.compressorEnabled = enabled
    const threshold = enabled ? -24 : 0
    for (const { compressor } of this.ctxMap.values()) compressor.threshold.value = threshold
  }

  setDistortionEnabled(enabled: boolean): void {
    this.distortionEnabled = enabled
    this._applyDistortion()
  }

  setDistortionDrive(drive: number): void {
    this.distortionDrive = drive
    if (this.distortionEnabled) this._applyDistortion()
  }

  setDistortionMix(mix: number): void {
    this.distortionMix = mix
    if (this.distortionEnabled) this._applyDistortion()
  }

  setDistortionTone(tone: number): void {
    this.distortionTone = tone
    const freq = toneToFreq(tone)
    for (const { distToneFilter } of this.ctxMap.values()) distToneFilter.frequency.value = freq
  }

  private _applyDistortion(): void {
    const { dry, wet, pre } = this.distGains()
    const curve = makeDistortionCurve(this.distortionEnabled ? this.distortionDrive : 0)
    for (const entry of this.ctxMap.values()) {
      entry.distDryGain.gain.value = dry
      entry.distWetGain.gain.value = wet
      entry.distPreGain.gain.value = pre
      entry.waveshaper.curve = curve
    }
  }

  getAnalyser(): AnalyserNode | null { return this.analyser }
}

export const micManager = new MicManager()
