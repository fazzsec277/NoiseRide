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

/** 指数減衰ノイズでリバーブ用インパルス応答を生成する。 */
function buildImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  return buf
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
  robotBypassGain: GainNode
  robotRingModGain: GainNode
  robotOscillator: OscillatorNode
  robotWetGain: GainNode
  lowFilter: BiquadFilterNode
  midFilter: BiquadFilterNode
  highFilter: BiquadFilterNode
  echoDryGain: GainNode
  echoDelayNode: DelayNode
  echoFeedbackGain: GainNode
  echoWetGain: GainNode
  radioBypassGain: GainNode
  radioHighpass: BiquadFilterNode
  radioLowpass: BiquadFilterNode
  radioWetGain: GainNode
  distDryGain: GainNode
  distPreGain: GainNode
  waveshaper: WaveShaperNode
  distToneFilter: BiquadFilterNode
  distWetGain: GainNode
  reverbDryGain: GainNode
  reverbConvolver: ConvolverNode
  reverbWetGain: GainNode
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
  private compressorThreshold = -24
  private compressorRatio = 12
  private compressorAttack = 3
  private compressorRelease = 100
  private echoEnabled = false
  private echoDelay = 200
  private echoFeedback = 40
  private echoMix = 50
  private radioEnabled = false
  private reverbEnabled = false
  private reverbDuration = 1.5
  private reverbDecay = 2
  private reverbMix = 40
  private robotEnabled = false
  private robotFrequency = 100
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

      // Echo (parallel dry/wet with feedback loop)
      const echoDryGain = ctx.createGain()
      echoDryGain.gain.value = this.echoEnabled ? (100 - this.echoMix) / 100 : 1

      const echoDelayNode = ctx.createDelay(2.0)
      echoDelayNode.delayTime.value = this.echoDelay / 1000

      const echoFeedbackGain = ctx.createGain()
      echoFeedbackGain.gain.value = this.echoFeedback / 100

      const echoWetGain = ctx.createGain()
      echoWetGain.gain.value = this.echoEnabled ? this.echoMix / 100 : 0

      // Radio (bypass or HP+LP bandpass)
      const radioBypassGain = ctx.createGain()
      radioBypassGain.gain.value = this.radioEnabled ? 0 : 1

      const radioHighpass = ctx.createBiquadFilter()
      radioHighpass.type = 'highpass'
      radioHighpass.frequency.value = 300

      const radioLowpass = ctx.createBiquadFilter()
      radioLowpass.type = 'lowpass'
      radioLowpass.frequency.value = 3000

      const radioWetGain = ctx.createGain()
      radioWetGain.gain.value = this.radioEnabled ? 1 : 0

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

      // Reverb (parallel dry/wet with synthesized impulse response)
      const reverbDryGain = ctx.createGain()
      reverbDryGain.gain.value = this.reverbEnabled ? (100 - this.reverbMix) / 100 : 1

      const reverbConvolver = ctx.createConvolver()
      reverbConvolver.buffer = buildImpulse(ctx, this.reverbDuration, this.reverbDecay)

      const reverbWetGain = ctx.createGain()
      reverbWetGain.gain.value = this.reverbEnabled ? this.reverbMix / 100 : 0

      // Compressor
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.value = this.compressorEnabled ? this.compressorThreshold : 0
      compressor.knee.value = 30
      compressor.ratio.value = this.compressorRatio
      compressor.attack.value = this.compressorAttack / 1000
      compressor.release.value = this.compressorRelease / 1000

      // Robot (ring modulation: source × oscillator carrier)
      const robotBypassGain = ctx.createGain()
      robotBypassGain.gain.value = this.robotEnabled ? 0 : 1

      const robotRingModGain = ctx.createGain()

      const robotOscillator = ctx.createOscillator()
      robotOscillator.type = 'sine'
      robotOscillator.frequency.value = this.robotFrequency
      robotOscillator.connect(robotRingModGain.gain)
      robotOscillator.start()

      const robotWetGain = ctx.createGain()
      robotWetGain.gain.value = this.robotEnabled ? 1 : 0

      const source = ctx.createMediaStreamSource(this.stream!)
      const gainNode = ctx.createGain()
      gainNode.gain.value = this.effectiveGain()

      // Signal chain:
      //   source → robot(bypass/ring-mod) → gain → [pitch →] EQ(low→mid→high)
      //   → echo(dry/wet+feedback) → radio(bypass/HP+LP) → dist(dry/wet)
      //   → reverb(dry/wet) → compressor → dest
      source.connect(robotBypassGain)
      source.connect(robotRingModGain)
      robotRingModGain.connect(robotWetGain)
      robotBypassGain.connect(gainNode)
      robotWetGain.connect(gainNode)
      let lastNode: AudioNode = gainNode
      if (pitchNode) {
        gainNode.connect(pitchNode)
        lastNode = pitchNode
      }
      lastNode.connect(lowFilter)
      lowFilter.connect(midFilter)
      midFilter.connect(highFilter)

      // Echo
      highFilter.connect(echoDryGain)
      highFilter.connect(echoDelayNode)
      echoDelayNode.connect(echoFeedbackGain)
      echoFeedbackGain.connect(echoDelayNode)  // feedback loop
      echoDelayNode.connect(echoWetGain)

      // Radio (both echo paths feed into bypass and filtered paths)
      echoDryGain.connect(radioBypassGain)
      echoDryGain.connect(radioHighpass)
      echoWetGain.connect(radioBypassGain)
      echoWetGain.connect(radioHighpass)
      radioHighpass.connect(radioLowpass)
      radioLowpass.connect(radioWetGain)

      // Distortion
      radioBypassGain.connect(distDryGain)
      radioBypassGain.connect(distPreGain)
      radioWetGain.connect(distDryGain)
      radioWetGain.connect(distPreGain)
      distPreGain.connect(waveshaper)
      waveshaper.connect(distToneFilter)
      distToneFilter.connect(distWetGain)

      // Reverb
      distDryGain.connect(reverbDryGain)
      distDryGain.connect(reverbConvolver)
      distWetGain.connect(reverbDryGain)
      distWetGain.connect(reverbConvolver)
      reverbConvolver.connect(reverbWetGain)
      reverbDryGain.connect(compressor)
      reverbWetGain.connect(compressor)
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
        robotBypassGain, robotRingModGain, robotOscillator, robotWetGain,
        lowFilter, midFilter, highFilter,
        echoDryGain, echoDelayNode, echoFeedbackGain, echoWetGain,
        radioBypassGain, radioHighpass, radioLowpass, radioWetGain,
        distDryGain, distPreGain, waveshaper, distToneFilter, distWetGain,
        reverbDryGain, reverbConvolver, reverbWetGain,
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
    for (const { compressor } of this.ctxMap.values()) {
      compressor.threshold.value = enabled ? this.compressorThreshold : 0
      compressor.ratio.value = this.compressorRatio
      compressor.attack.value = this.compressorAttack / 1000
      compressor.release.value = this.compressorRelease / 1000
    }
  }

  setCompressorThreshold(threshold: number): void {
    this.compressorThreshold = threshold
    if (this.compressorEnabled) {
      for (const { compressor } of this.ctxMap.values()) compressor.threshold.value = threshold
    }
  }

  setCompressorRatio(ratio: number): void {
    this.compressorRatio = ratio
    for (const { compressor } of this.ctxMap.values()) compressor.ratio.value = ratio
  }

  setCompressorAttack(ms: number): void {
    this.compressorAttack = ms
    for (const { compressor } of this.ctxMap.values()) compressor.attack.value = ms / 1000
  }

  setCompressorRelease(ms: number): void {
    this.compressorRelease = ms
    for (const { compressor } of this.ctxMap.values()) compressor.release.value = ms / 1000
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

  setEchoEnabled(enabled: boolean): void {
    this.echoEnabled = enabled
    for (const entry of this.ctxMap.values()) {
      entry.echoDryGain.gain.value = enabled ? (100 - this.echoMix) / 100 : 1
      entry.echoWetGain.gain.value = enabled ? this.echoMix / 100 : 0
    }
  }

  setEchoDelay(ms: number): void {
    this.echoDelay = ms
    for (const { echoDelayNode } of this.ctxMap.values()) echoDelayNode.delayTime.value = ms / 1000
  }

  setEchoFeedback(pct: number): void {
    this.echoFeedback = pct
    for (const { echoFeedbackGain } of this.ctxMap.values()) echoFeedbackGain.gain.value = pct / 100
  }

  setEchoMix(pct: number): void {
    this.echoMix = pct
    if (this.echoEnabled) {
      for (const entry of this.ctxMap.values()) {
        entry.echoDryGain.gain.value = (100 - pct) / 100
        entry.echoWetGain.gain.value = pct / 100
      }
    }
  }

  setRadioEnabled(enabled: boolean): void {
    this.radioEnabled = enabled
    for (const entry of this.ctxMap.values()) {
      entry.radioBypassGain.gain.value = enabled ? 0 : 1
      entry.radioWetGain.gain.value = enabled ? 1 : 0
    }
  }

  setReverbEnabled(enabled: boolean): void {
    this.reverbEnabled = enabled
    for (const entry of this.ctxMap.values()) {
      entry.reverbDryGain.gain.value = enabled ? (100 - this.reverbMix) / 100 : 1
      entry.reverbWetGain.gain.value = enabled ? this.reverbMix / 100 : 0
    }
  }

  setReverbDuration(seconds: number): void {
    this.reverbDuration = seconds
    for (const entry of this.ctxMap.values()) {
      entry.reverbConvolver.buffer = buildImpulse(entry.ctx, seconds, this.reverbDecay)
    }
  }

  setReverbDecay(decay: number): void {
    this.reverbDecay = decay
    for (const entry of this.ctxMap.values()) {
      entry.reverbConvolver.buffer = buildImpulse(entry.ctx, this.reverbDuration, decay)
    }
  }

  setReverbMix(pct: number): void {
    this.reverbMix = pct
    if (this.reverbEnabled) {
      for (const entry of this.ctxMap.values()) {
        entry.reverbDryGain.gain.value = (100 - pct) / 100
        entry.reverbWetGain.gain.value = pct / 100
      }
    }
  }

  setRobotEnabled(enabled: boolean): void {
    this.robotEnabled = enabled
    for (const entry of this.ctxMap.values()) {
      entry.robotBypassGain.gain.value = enabled ? 0 : 1
      entry.robotWetGain.gain.value = enabled ? 1 : 0
    }
  }

  setRobotFrequency(freq: number): void {
    this.robotFrequency = freq
    for (const { robotOscillator } of this.ctxMap.values()) robotOscillator.frequency.value = freq
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
