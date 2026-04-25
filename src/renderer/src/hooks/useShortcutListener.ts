import { useEffect, useCallback } from 'react'
import { useMp3Store, getKeybindMap } from '../stores/mp3Store'
import { useSettingsStore } from '../stores/settingsStore'
import { audioManager } from '../managers/AudioManager'
import { eventToAccelerator } from '@shared/accelerator'

export function useShortcutListener(): void {
  const mp3s = useMp3Store((s) => s.mp3s)
  const setPlaying = useMp3Store((s) => s.setPlaying)

  // Sync keybind map to main process whenever mp3s change
  useEffect(() => {
    const keybindMap = getKeybindMap(mp3s)
    window.api.shortcut.sync(keybindMap)
  }, [mp3s])

  const triggerByKey = useCallback((key: string): void => {
    if (!useSettingsStore.getState().settings.keybindEnabled) return
    const keybindMap = getKeybindMap(useMp3Store.getState().mp3s)
    const ids = keybindMap[key] ?? []
    if (ids.length === 0) return
    const currentMp3s = useMp3Store.getState().mp3s
    const currentSettings = useSettingsStore.getState().settings
    for (const id of ids) {
      const mp3 = currentMp3s.find((m) => m.id === id)
      if (!mp3) continue
      if (mp3.isPlaying && (mp3.restart ?? false)) {
        audioManager.seek(mp3.id, 0)
        continue
      }
      audioManager.play(mp3, currentSettings).then((started) => {
        if (started) setPlaying(id, true)
      })
    }
  }, [setPlaying])

  // Handle global shortcuts fired from main process (app not focused)
  useEffect(() => {
    return window.api.shortcut.onTriggered(triggerByKey)
  }, [triggerByKey])

  // Handle shortcuts when app IS focused (globalShortcut skips to avoid consuming input keys)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      // Skip if the user is typing in an input, textarea, or contenteditable
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return

      const key = eventToAccelerator(e)
      if (!key) return
      triggerByKey(key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [triggerByKey])
}
