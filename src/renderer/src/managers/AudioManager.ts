import type { Mp3Item, Settings } from '@shared/types'

interface CtxEntry {
  ctx: AudioContext
  masterGain: GainNode
}

interface DeviceEntry {
  source: AudioBufferSourceNode
  gainNode: GainNode
}

interface PlayingEntry {
  devices: Map<string, DeviceEntry>
  itemVolume: number
  startCtxTime: number
  startOffset: number
  duration: number
  filePath: string
  fallbackTimeoutId?: ReturnType<typeof window.setTimeout>
}

type OnEndedCallback = (id: string) => void

class AudioManager {
  private ctxMap = new Map<string, CtxEntry>()
  private activeDeviceIds: string[] = ['']
  private masterVolume = 0.8
  private playing = new Map<string, PlayingEntry>()
  private bufferCache = new Map<string, AudioBuffer>()
  private onEndedCallbacks: OnEndedCallback[] = []

  private async getCtxEntry(deviceId: string): Promise<CtxEntry> {
    let entry = this.ctxMap.get(deviceId)
    if (!entry || entry.ctx.state === 'closed') {
      const ctx = new AudioContext()
      if (deviceId) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ctx as any).setSinkId(deviceId)
        } catch { /* setSinkId not supported or invalid deviceId */ }
      }
      const masterGain = ctx.createGain()
      masterGain.gain.value = this.masterVolume
      masterGain.connect(ctx.destination)
      entry = { ctx, masterGain }
      this.ctxMap.set(deviceId, entry)
    }
    if (entry.ctx.state === 'suspended') await entry.ctx.resume()
    return entry
  }

  private async loadBuffer(filePath: string, ctx: AudioContext): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(filePath)
    if (cached) return cached
    const data = await window.api.readFileBuffer(filePath)
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    const buffer = await ctx.decodeAudioData(ab as ArrayBuffer)
    this.bufferCache.set(filePath, buffer)
    return buffer
  }

  private notifyEnded(id: string): void {
    this.onEndedCallbacks.forEach((cb) => cb(id))
  }

  onEnded(cb: OnEndedCallback): () => void {
    this.onEndedCallbacks.push(cb)
    return () => {
      this.onEndedCallbacks = this.onEndedCallbacks.filter((c) => c !== cb)
    }
  }

  isPlaying(id: string): boolean {
    return this.playing.has(id)
  }

  playingCount(): number {
    return this.playing.size
  }

  async play(mp3: Mp3Item, settings: Settings): Promise<boolean> {
    if (this.playing.has(mp3.id)) return false
    if (this.playing.size >= settings.maxConcurrent) return false

    const itemVolume = mp3.volume ?? 1.0
    const devices = new Map<string, DeviceEntry>()

    // Load buffer using first available context
    const firstDeviceId = this.activeDeviceIds[0] ?? ''
    const firstCtxEntry = await this.getCtxEntry(firstDeviceId)
    let buffer: AudioBuffer
    try {
      buffer = await this.loadBuffer(mp3.filePath, firstCtxEntry.ctx)
    } catch (err) {
      console.error('Failed to load audio:', mp3.filePath, err)
      return false
    }

    // Create sources for all active contexts (buffer is reusable across contexts)
    for (const deviceId of this.activeDeviceIds) {
      const { ctx, masterGain } = await this.getCtxEntry(deviceId)
      const gainNode = ctx.createGain()
      gainNode.gain.value = itemVolume
      gainNode.connect(masterGain)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = mp3.loop ?? false
      source.connect(gainNode)

      devices.set(deviceId, { source, gainNode })
    }

    const entry: PlayingEntry = {
      devices,
      itemVolume,
      startCtxTime: firstCtxEntry.ctx.currentTime,
      startOffset: 0,
      duration: buffer.duration,
      filePath: mp3.filePath,
    }
    this.playing.set(mp3.id, entry)

    // Wire onended to first device's source only (non-loop: cleans up all devices)
    if (!mp3.loop) {
      const firstDevice = devices.get(firstDeviceId)
      if (firstDevice) {
        firstDevice.source.onended = () => {
          if (!this.playing.has(mp3.id)) return
          const e = this.playing.get(mp3.id)!
          if (e.fallbackTimeoutId !== undefined) clearTimeout(e.fallbackTimeoutId)
          this.playing.delete(mp3.id)
          for (const [dId, dev] of devices.entries()) {
            if (dId !== firstDeviceId) {
              try { dev.source.stop() } catch { /* ok */ }
              dev.gainNode.disconnect()
            }
          }
          firstDevice.gainNode.disconnect()
          this.notifyEnded(mp3.id)
        }
      }
    }

    for (const { source } of devices.values()) {
      source.start()
    }

    // Fallback: if onended never fires, force cleanup after duration + 2s
    if (!mp3.loop) {
      const fallbackMs = (buffer.duration + 2) * 1000
      const timeoutId = window.setTimeout(() => {
        if (!this.playing.has(mp3.id)) return
        this.playing.delete(mp3.id)
        this.notifyEnded(mp3.id)
      }, fallbackMs)
      entry.fallbackTimeoutId = timeoutId
    }

    return true
  }

  stop(id: string): void {
    const entry = this.playing.get(id)
    if (!entry) return
    if (entry.fallbackTimeoutId !== undefined) clearTimeout(entry.fallbackTimeoutId)
    this.playing.delete(id)
    for (const { source, gainNode } of entry.devices.values()) {
      try { source.stop() } catch { /* already stopped */ }
      gainNode.disconnect()
    }
    this.notifyEnded(id)
  }

  stopAll(): void {
    for (const id of [...this.playing.keys()]) {
      this.stop(id)
    }
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = volume
    for (const { masterGain } of this.ctxMap.values()) {
      masterGain.gain.value = volume
    }
  }

  updateItemGain(id: string, volume: number): void {
    const entry = this.playing.get(id)
    if (!entry) return
    entry.itemVolume = volume
    for (const { gainNode } of entry.devices.values()) {
      gainNode.gain.value = volume
    }
  }

  updateLoop(id: string, loop: boolean): void {
    const entry = this.playing.get(id)
    if (!entry) return

    if (loop) {
      // Turning loop ON: set source.loop = true and clear the onended handler
      for (const { source } of entry.devices.values()) {
        source.loop = true
        source.onended = null
      }
    } else {
      // Turning loop OFF: set source.loop = false and re-wire onended for cleanup
      for (const { source } of entry.devices.values()) {
        source.loop = false
      }
      const firstDeviceId = this.activeDeviceIds[0] ?? ''
      const firstDevice = entry.devices.get(firstDeviceId)
      if (firstDevice) {
        firstDevice.source.onended = () => {
          if (!this.playing.has(id)) return
          this.playing.delete(id)
          for (const [dId, dev] of entry.devices.entries()) {
            if (dId !== firstDeviceId) {
              try { dev.source.stop() } catch { /* ok */ }
              dev.gainNode.disconnect()
            }
          }
          firstDevice.gainNode.disconnect()
          this.notifyEnded(id)
        }
      }
    }
  }

  async setOutputDevices(deviceIds: string[]): Promise<void> {
    const newIds = deviceIds.length > 0 ? deviceIds : ['']
    const newSet = new Set(newIds)

    // Close removed contexts
    for (const [key, ctxEntry] of this.ctxMap.entries()) {
      if (!newSet.has(key)) {
        try { await ctxEntry.ctx.close() } catch { /* ok */ }
        this.ctxMap.delete(key)
      }
    }

    this.activeDeviceIds = newIds

    // Pre-warm new contexts
    for (const deviceId of newIds) {
      await this.getCtxEntry(deviceId)
    }
  }

  getCurrentTime(id: string): number {
    const entry = this.playing.get(id)
    if (!entry) return 0
    const firstDeviceId = this.activeDeviceIds[0] ?? ''
    const ctxEntry = this.ctxMap.get(firstDeviceId)
    if (!ctxEntry) return 0
    const raw = ctxEntry.ctx.currentTime - entry.startCtxTime + entry.startOffset
    return entry.duration > 0 ? raw % entry.duration : 0
  }

  async seek(id: string, offset: number): Promise<void> {
    const entry = this.playing.get(id)
    if (!entry) return

    const mp3Loop = entry.devices.values().next().value?.source.loop ?? false

    // Cancel existing fallback timeout before restarting
    if (entry.fallbackTimeoutId !== undefined) clearTimeout(entry.fallbackTimeoutId)

    // Stop old sources without triggering onended callbacks
    for (const { source, gainNode } of entry.devices.values()) {
      source.onended = null
      try { source.stop() } catch { /* ok */ }
      gainNode.disconnect()
    }

    const firstDeviceId = this.activeDeviceIds[0] ?? ''
    const firstCtxEntry = await this.getCtxEntry(firstDeviceId)
    const buffer = this.bufferCache.get(entry.filePath)
    if (!buffer) return

    const newDevices = new Map<string, DeviceEntry>()
    const clampedOffset = Math.max(0, Math.min(offset, entry.duration - 0.01))

    for (const deviceId of this.activeDeviceIds) {
      const { ctx, masterGain } = await this.getCtxEntry(deviceId)
      const gainNode = ctx.createGain()
      gainNode.gain.value = entry.itemVolume
      gainNode.connect(masterGain)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = mp3Loop
      source.connect(gainNode)
      newDevices.set(deviceId, { source, gainNode })
    }

    entry.devices = newDevices
    entry.startCtxTime = firstCtxEntry.ctx.currentTime
    entry.startOffset = clampedOffset

    if (!mp3Loop) {
      const firstDevice = newDevices.get(firstDeviceId)
      if (firstDevice) {
        firstDevice.source.onended = () => {
          if (!this.playing.has(id)) return
          this.playing.delete(id)
          for (const [dId, dev] of newDevices.entries()) {
            if (dId !== firstDeviceId) {
              try { dev.source.stop() } catch { /* ok */ }
              dev.gainNode.disconnect()
            }
          }
          firstDevice.gainNode.disconnect()
          this.notifyEnded(id)
        }
      }
    }

    for (const { source } of newDevices.values()) {
      source.start(0, clampedOffset)
    }

    if (!mp3Loop) {
      const remainingMs = (entry.duration - clampedOffset + 2) * 1000
      entry.fallbackTimeoutId = window.setTimeout(() => {
        if (!this.playing.has(id)) return
        this.playing.delete(id)
        this.notifyEnded(id)
      }, remainingMs)
    }
  }

  async updateDuration(mp3: Mp3Item): Promise<number> {
    const firstDeviceId = this.activeDeviceIds[0] ?? ''
    try {
      const { ctx } = await this.getCtxEntry(firstDeviceId)
      const buffer = await this.loadBuffer(mp3.filePath, ctx)
      return buffer.duration
    } catch {
      return 0
    }
  }
}

export const audioManager = new AudioManager()
