/**
 * PitchFormantProcessor – AudioWorklet
 *
 * Implements independent pitch and formant shifting via two-stage resampling + OLA.
 *
 * Stage 1  Write input into inBuf resampled by (1/formantRatio).
 *           This moves the spectral envelope (formants) up/down by formantRatio.
 * Stage 2  Read from inBuf with a read step of (pitchRatio * formantRatio) per output sample,
 *           using granular overlap-add synthesis.
 *           Net result: pitch shifts by pitchRatio, formant shifts by formantRatio.
 *
 * Latency budget: ~2 × GRAIN_SIZE / sampleRate ≈ 93 ms at 44.1 kHz (quality priority).
 */

const GRAIN_SIZE = 2048        // ~46 ms @ 44.1 kHz
const HOP_SIZE   =  512        // 25 % overlap
const BUF_BITS   =   14        // 2^14 = 16384
const BUF_SIZE   = 1 << BUF_BITS
const BUF_MASK   = BUF_SIZE - 1

/** Pre-computed Hann window */
const HANN = new Float32Array(GRAIN_SIZE)
for (let i = 0; i < GRAIN_SIZE; i++) {
  HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (GRAIN_SIZE - 1)))
}

/**
 * OLA normalisation: with 75 % overlap (hop = 25 % of grain) the Hann
 * window sums to ~0.5 * grainSize / hopSize = 2.0 per sample, so we
 * divide by 2 to reconstruct unity gain.
 */
const OLA_SCALE = HOP_SIZE / (GRAIN_SIZE * 0.5)

// ---------------------------------------------------------------------------
// Per-channel state
// ---------------------------------------------------------------------------
class ChannelState {
  constructor() {
    this.inBuf  = new Float32Array(BUF_SIZE)  // ring: stage-1 output
    this.outBuf = new Float32Array(BUF_SIZE)  // ring: stage-2 OLA accumulator

    this.inWrite  = GRAIN_SIZE      // write head (samples written to inBuf)
    this.readPos  = 0.5             // fractional read head in inBuf
    this.outWrite = GRAIN_SIZE      // OLA write head
    this.outRead  = 0               // output consumption head
    this.grainPhase = 0             // samples into current hop
  }
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------
class PitchFormantProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pitchRatio  = 1.0   // 2^(pitchSemitones / 12)
    this.formantRatio = 1.0  // 2^(formantSemitones / 12)
    this.ch = [new ChannelState(), new ChannelState()]

    this.port.onmessage = ({ data }) => {
      if (data.pitch   !== undefined) this.pitchRatio   = Math.pow(2, data.pitch   / 12)
      if (data.formant !== undefined) this.formantRatio = Math.pow(2, data.formant / 12)
    }
  }

  /** Linear interpolation from a ring buffer */
  _lerp(buf, pos) {
    const i = Math.floor(pos) & BUF_MASK
    const j = (i + 1)        & BUF_MASK
    const f = pos - Math.floor(pos)
    return buf[i] + f * (buf[j] - buf[i])
  }

  /** Overlap-add one grain from inBuf into outBuf */
  _addGrain(ch) {
    // Centre the grain around the current read position
    const grainStart = ch.readPos - GRAIN_SIZE * 0.5
    for (let i = 0; i < GRAIN_SIZE; i++) {
      const s   = this._lerp(ch.inBuf, grainStart + i)
      const idx = (ch.outWrite + i) & BUF_MASK
      ch.outBuf[idx] += s * HANN[i]
    }
    ch.outWrite += HOP_SIZE
  }

  _processChannel(ch, input, output) {
    const pr   = this.pitchRatio
    const fr   = this.formantRatio
    const n    = input.length

    // ---- Stage 1: resample input by 1/fr → inBuf ----
    // Advancing source by fr per written sample compresses (fr>1) or
    // stretches (fr<1) the spectral envelope without changing pitch.
    let srcPos = 0.0
    while (srcPos < n - 1) {
      const lo  = Math.floor(srcPos)
      const hi  = lo + 1
      const frc = srcPos - lo
      const v   = input[lo] + frc * (input[hi] - input[lo])
      ch.inBuf[ch.inWrite & BUF_MASK] = v
      ch.inWrite++
      srcPos += fr
    }
    // Write the last sample without interpolation
    ch.inBuf[ch.inWrite & BUF_MASK] = input[n - 1]
    ch.inWrite++

    // ---- Stage 2: granular OLA → output ----
    // Read step per *output* sample = pr * fr.
    // After the formant pre-warp (stage 1) this makes pitch = pr and formant = fr.
    const readStep = pr * fr

    for (let i = 0; i < n; i++) {
      // Emit a grain every HOP_SIZE output samples
      if (ch.grainPhase === 0) {
        this._addGrain(ch)
        // Advance read pointer by one hop in the (already fr-warped) inBuf
        ch.readPos += HOP_SIZE * readStep
      }

      // Consume from outBuf
      const idx = ch.outRead & BUF_MASK
      output[i] = ch.outBuf[idx] * OLA_SCALE
      ch.outBuf[idx] = 0   // clear consumed slot
      ch.outRead++

      ch.grainPhase = (ch.grainPhase + 1) % HOP_SIZE
    }

    // Safety: keep readPos in valid range relative to inWrite
    const available = ch.inWrite - ch.readPos
    if (available < GRAIN_SIZE) {
      ch.readPos = ch.inWrite - GRAIN_SIZE
    } else if (available > BUF_SIZE - GRAIN_SIZE) {
      ch.readPos = ch.inWrite - (BUF_SIZE - GRAIN_SIZE)
    }
  }

  process(inputs, outputs) {
    const inputChs  = inputs[0]
    const outputChs = outputs[0]
    if (!inputChs || !outputChs || inputChs.length === 0) return true

    // Bypass when both ratios are unity (saves CPU)
    if (Math.abs(this.pitchRatio - 1.0) < 0.0005 && Math.abs(this.formantRatio - 1.0) < 0.0005) {
      for (let c = 0; c < outputChs.length; c++) {
        if (inputChs[c]) outputChs[c].set(inputChs[c])
      }
      return true
    }

    const numCh = Math.min(inputChs.length, outputChs.length, this.ch.length)
    for (let c = 0; c < numCh; c++) {
      if (inputChs[c] && outputChs[c]) {
        this._processChannel(this.ch[c], inputChs[c], outputChs[c])
      }
    }

    return true
  }
}

registerProcessor('pitch-formant-processor', PitchFormantProcessor)
