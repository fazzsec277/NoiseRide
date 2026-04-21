import { useEffect } from 'react'
import { audioManager } from '../managers/AudioManager'
import { useMp3Store } from '../stores/mp3Store'
import { randomQueueManager } from '../managers/RandomQueueManager'
import { useSettingsStore } from '../stores/settingsStore'
import { useRandomStore } from '../stores/randomStore'

function playNextRandom(): void {
  const nextId = randomQueueManager.getNext()
  if (!nextId) {
    randomQueueManager.clearCurrentPlaying()
    useRandomStore.getState().setCurrentRandomPlayingId(null)
    return
  }

  const mp3 = useMp3Store.getState().mp3s.find((m) => m.id === nextId)
  if (!mp3) {
    randomQueueManager.clearCurrentPlaying()
    useRandomStore.getState().setCurrentRandomPlayingId(null)
    return
  }

  const settings = useSettingsStore.getState().settings
  randomQueueManager.setCurrentPlaying(nextId)
  useRandomStore.getState().setCurrentRandomPlayingId(nextId)

  audioManager.play(mp3, settings).then((started) => {
    if (started) {
      useMp3Store.getState().setPlaying(nextId, true)
    } else {
      // Already playing manually — skip to the next queued track
      playNextRandom()
    }
  })
}

export function useAudioEnded(): void {
  const setPlaying = useMp3Store((s) => s.setPlaying)

  useEffect(() => {
    const off = audioManager.onEnded((id) => {
      setPlaying(id, false)

      if (!randomQueueManager.active) return
      if (!randomQueueManager.isCurrentRandom(id)) return

      playNextRandom()
    })
    return off
  }, [setPlaying])
}
