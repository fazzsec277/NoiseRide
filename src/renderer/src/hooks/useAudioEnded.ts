import { useEffect } from 'react'
import { audioManager } from '../managers/AudioManager'
import { useMp3Store } from '../stores/mp3Store'
import { randomRegistry } from '../managers/RandomQueueManager'
import { useSettingsStore } from '../stores/settingsStore'
import { useRandomStore } from '../stores/randomStore'

export function playNextRandom(presetId: string): void {
  const manager = randomRegistry.get(presetId)
  if (!manager) return

  const nextId = manager.getNext()
  if (!nextId) {
    manager.clearCurrentPlaying()
    useRandomStore.getState().setCurrentPlayingId(presetId, null)
    useRandomStore.getState().setLoadingId(presetId, null)
    return
  }

  const mp3 = useMp3Store.getState().mp3s.find((m) => m.id === nextId)
  if (!mp3) {
    manager.clearCurrentPlaying()
    useRandomStore.getState().setCurrentPlayingId(presetId, null)
    useRandomStore.getState().setLoadingId(presetId, null)
    return
  }

  const settings = useSettingsStore.getState().settings
  manager.setCurrentPlaying(nextId)
  useRandomStore.getState().setCurrentPlayingId(presetId, nextId)
  useRandomStore.getState().setLoadingId(presetId, nextId)

  audioManager.play(mp3, settings).then((started) => {
    useRandomStore.getState().setLoadingId(presetId, null)
    if (started) {
      useMp3Store.getState().setPlaying(nextId, true)
    } else if (started === false) {
      playNextRandom(presetId)
    }
    // null（ロード中にキャンセル）は何もしない
  })
}

export function useAudioEnded(): void {
  const setPlaying = useMp3Store((s) => s.setPlaying)

  useEffect(() => {
    const off = audioManager.onEnded((id) => {
      setPlaying(id, false)

      const found = randomRegistry.findByTrackId(id)
      if (!found) return
      const [presetId, manager] = found
      if (!manager.isCurrentRandom(id)) return

      manager.clearFutureQueue()
      playNextRandom(presetId)
    })
    return off
  }, [setPlaying])
}
