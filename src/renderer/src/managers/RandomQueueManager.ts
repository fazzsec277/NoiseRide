function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

class RandomQueueManager {
  private queue: string[] = []
  private activePresetId: string | null = null
  private sourceIds: string[] = []
  private isActive = false
  private currentPlayingId: string | null = null

  start(presetId: string, mp3Ids: string[]): void {
    this.activePresetId = presetId
    this.sourceIds = [...mp3Ids]
    this.queue = shuffle(mp3Ids)
    this.isActive = true
    this.currentPlayingId = null
  }

  stop(): void {
    this.isActive = false
    this.activePresetId = null
    this.queue = []
    this.sourceIds = []
    this.currentPlayingId = null
  }

  setCurrentPlaying(id: string): void {
    this.currentPlayingId = id
  }

  clearCurrentPlaying(): void {
    this.currentPlayingId = null
  }

  isCurrentRandom(id: string): boolean {
    return this.currentPlayingId === id
  }

  getCurrentPlayingId(): string | null {
    return this.currentPlayingId
  }

  getNext(): string | null {
    if (!this.isActive || this.sourceIds.length === 0) return null
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
}

export const randomQueueManager = new RandomQueueManager()
