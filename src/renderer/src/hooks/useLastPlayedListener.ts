import { useEffect, useCallback } from 'react'
import { useMp3Store } from '../stores/mp3Store'
import { useSettingsStore } from '../stores/settingsStore'
import { audioManager } from '../managers/AudioManager'
import { eventToAccelerator } from '@shared/accelerator'

export function useLastPlayedListener(): void {
  const settings = useSettingsStore((s) => s.settings)

  const playLastPlayed = useCallback((): void => {
    const id = useMp3Store.getState().lastManualPlayedId
    if (!id) return
    const mp3 = useMp3Store.getState().mp3s.find((m) => m.id === id)
    if (!mp3) return
    const s = useSettingsStore.getState().settings
    if (mp3.isPlaying) {
      audioManager.seek(id, 0)
    } else {
      audioManager.play(mp3, s).then((started) => {
        if (started) useMp3Store.getState().setPlaying(id, true)
      })
    }
  }, [])

  // Background key trigger via IPC
  useEffect(() => {
    return window.api.lastPlayed.onTrigger(playLastPlayed)
  }, [playLastPlayed])

  // Foreground key trigger via local keydown
  useEffect(() => {
    if (!settings.lastPlayedBind) return
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return
      if (eventToAccelerator(e) === settings.lastPlayedBind) {
        e.preventDefault()
        playLastPlayed()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settings.lastPlayedBind, playLastPlayed])

  // Register key with main process for background handling
  useEffect(() => {
    window.api.lastPlayed.setKey(settings.lastPlayedBind).catch(() => {})
  }, [settings.lastPlayedBind])
}
