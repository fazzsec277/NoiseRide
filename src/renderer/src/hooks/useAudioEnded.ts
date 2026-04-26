import { useEffect } from 'react'
import { audioManager } from '../managers/AudioManager'
import { useMp3Store } from '../stores/mp3Store'
import { randomQueueManager } from '../managers/RandomQueueManager'
import { useSettingsStore } from '../stores/settingsStore'
import { useRandomStore } from '../stores/randomStore'

export function playNextRandom(): void {
  const nextId = randomQueueManager.getNext()
  if (!nextId) {
    randomQueueManager.clearCurrentPlaying()
    useRandomStore.getState().setCurrentRandomPlayingId(null)
    useRandomStore.getState().setRandomLoadingId(null)
    return
  }

  const mp3 = useMp3Store.getState().mp3s.find((m) => m.id === nextId)
  if (!mp3) {
    randomQueueManager.clearCurrentPlaying()
    useRandomStore.getState().setCurrentRandomPlayingId(null)
    useRandomStore.getState().setRandomLoadingId(null)
    return
  }

  const settings = useSettingsStore.getState().settings
  randomQueueManager.setCurrentPlaying(nextId)
  useRandomStore.getState().setCurrentRandomPlayingId(nextId)
  useRandomStore.getState().setRandomLoadingId(nextId)

  audioManager.play(mp3, settings).then((started) => {
    useRandomStore.getState().setRandomLoadingId(null)
    if (started) {
      useMp3Store.getState().setPlaying(nextId, true)
    } else if (started === false) {
      // Already playing manually — skip to the next queued track
      playNextRandom()
    }
    // null（ロード中にキャンセル）は何もしない
  })
}

export function useAudioEnded(): void {
  const setPlaying = useMp3Store((s) => s.setPlaying)

  useEffect(() => {
    const off = audioManager.onEnded((id) => {
      setPlaying(id, false)

      if (!randomQueueManager.active) return
      if (!randomQueueManager.isCurrentRandom(id)) return

      randomQueueManager.clearFutureQueue()
      playNextRandom()
    })
    return off
  }, [setPlaying])
}
