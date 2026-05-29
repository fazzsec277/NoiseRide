function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export class RandomQueueManager {
  private queue: string[] = []
  private activePresetId: string | null = null
  private sourceIds: string[] = []
  private isActive = false
  private currentPlayingId: string | null = null
  private playedHistory: string[] = []
  private futureQueue: string[] = []

  start(presetId: string, mp3Ids: string[]): void {
    this.activePresetId = presetId
    this.sourceIds = [...mp3Ids]
    this.queue = shuffle(mp3Ids)
    this.isActive = true
    this.currentPlayingId = null
    this.playedHistory = []
    this.futureQueue = []
  }

  stop(): void {
    this.isActive = false
    this.activePresetId = null
    this.queue = []
    this.sourceIds = []
    this.currentPlayingId = null
    this.playedHistory = []
    this.futureQueue = []
  }

  setCurrentPlaying(id: string): void {
    if (this.currentPlayingId !== null) {
      this.playedHistory.push(this.currentPlayingId)
      if (this.playedHistory.length > 50) this.playedHistory.shift()
    }
    this.currentPlayingId = id
  }

  setCurrentPlayingBack(id: string): void {
    this.currentPlayingId = id
  }

  prepareForNextTrack(): void {
    if (this.currentPlayingId !== null) {
      this.playedHistory.push(this.currentPlayingId)
      if (this.playedHistory.length > 50) this.playedHistory.shift()
      this.currentPlayingId = null
    }
  }

  clearCurrentPlaying(): void {
    this.currentPlayingId = null
  }

  clearFutureQueue(): void {
    this.futureQueue = []
  }

  isCurrentRandom(id: string): boolean {
    return this.currentPlayingId === id
  }

  getCurrentPlayingId(): string | null {
    return this.currentPlayingId
  }

  getPrevious(): string | null {
    if (this.playedHistory.length === 0) return null
    if (this.currentPlayingId !== null) {
      this.futureQueue.push(this.currentPlayingId)
    }
    return this.playedHistory.pop()!
  }

  hasPrevious(): boolean {
    return this.playedHistory.length > 0
  }

  getNext(): string | null {
    if (!this.isActive || this.sourceIds.length === 0) return null
    if (this.futureQueue.length > 0) {
      return this.futureQueue.pop()!
    }
    if (this.queue.length === 0) {
      this.queue = shuffle(this.sourceIds)
    }
    return this.queue.shift() ?? null
  }

  get active(): boolean {
    return this.isActive
  }

  get currentPresetId(): string | null {
    return this.activePresetId
  }

  getPlayedHistory(): string[] {
    return [...this.playedHistory]
  }

  getRemainingQueue(): string[] {
    return [...this.queue]
  }
}

class RandomRegistry {
  private managers = new Map<string, RandomQueueManager>()

  getOrCreate(presetId: string): RandomQueueManager {
    if (!this.managers.has(presetId)) {
      this.managers.set(presetId, new RandomQueueManager())
    }
    return this.managers.get(presetId)!
  }

  get(presetId: string): RandomQueueManager | undefined {
    return this.managers.get(presetId)
  }

  delete(presetId: string): void {
    const manager = this.managers.get(presetId)
    if (manager) {
      manager.stop()
      this.managers.delete(presetId)
    }
  }

  stopAll(): void {
    this.managers.forEach((manager) => manager.stop())
    this.managers.clear()
  }

  findByTrackId(trackId: string): [string, RandomQueueManager] | undefined {
    for (const [presetId, manager] of this.managers) {
      if (manager.isCurrentRandom(trackId)) {
        return [presetId, manager]
      }
    }
    return undefined
  }

  isActive(presetId: string): boolean {
    return this.managers.get(presetId)?.active ?? false
  }
}

export const randomRegistry = new RandomRegistry()
