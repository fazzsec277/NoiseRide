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
  private playedHistory: string[] = []   // 戻る用スタック [oldest ... newest]
  private futureQueue: string[] = []     // 進む用スタック [oldest ... newest(=直前に戻った曲)]

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

  /** 後ろ向き再生専用 — 履歴を変更しない */
  setCurrentPlayingBack(id: string): void {
    this.currentPlayingId = id
  }

  /**
   * 次トラック再生前に呼ぶ。
   * 現在曲を playedHistory に積んで currentPlayingId を null にする。
   * これにより onEnded の二重発火を防ぎつつ、戻る履歴も正しく保持する。
   */
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

  /** 前の曲を返す。現在曲を futureQueue に積んでから history をポップする。 */
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

  /**
   * 次の曲を返す。
   * futureQueue に曲がある場合はそちらを優先する（⏮ 後に⏭ で同じ曲に戻る挙動）。
   * なければシャッフルキューから取り出す。
   */
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
}

export const randomQueueManager = new RandomQueueManager()
