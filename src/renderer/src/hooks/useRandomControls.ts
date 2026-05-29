import { useEffect, useCallback } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useMp3Store } from '../stores/mp3Store'
import { useRandomStore } from '../stores/randomStore'
import { audioManager } from '../managers/AudioManager'
import { randomRegistry } from '../managers/RandomQueueManager'
import { playNextRandom } from './useAudioEnded'

function buildAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(e.key === ' ' ? 'Space' : e.key)
  return parts.join('+')
}

export function playPresetNext(presetId: string): void {
  const state = useRandomStore.getState()
  if (state.presetStates[presetId]?.loadingId !== null) return
  const manager = randomRegistry.get(presetId)
  if (!manager) return
  const id = manager.getCurrentPlayingId()
  if (id) {
    manager.prepareForNextTrack()
    state.setCurrentPlayingId(presetId, null)
    audioManager.stop(id)
    useMp3Store.getState().setPlaying(id, false)
  }
  playNextRandom(presetId)
}

export function playPresetPrev(presetId: string): void {
  const state = useRandomStore.getState()
  if (state.presetStates[presetId]?.loadingId !== null) return
  const manager = randomRegistry.get(presetId)
  if (!manager || !manager.hasPrevious()) return
  const currentId = manager.getCurrentPlayingId()
  const prevId = manager.getPrevious()
  if (!prevId) return
  if (currentId) {
    manager.setCurrentPlayingBack(prevId)
    state.setCurrentPlayingId(presetId, prevId)
    audioManager.stop(currentId)
    useMp3Store.getState().setPlaying(currentId, false)
  }
  const mp3 = useMp3Store.getState().mp3s.find((m) => m.id === prevId)
  if (!mp3) return
  state.setLoadingId(presetId, prevId)
  audioManager.play(mp3, useSettingsStore.getState().settings).then((started) => {
    state.setLoadingId(presetId, null)
    if (started) useMp3Store.getState().setPlaying(prevId, true)
  })
}

export function useRandomControls(): { stopAll: () => void } {
  const settings = useSettingsStore((s) => s.settings)

  const stopAll = useCallback((): void => {
    const { presetStates } = useRandomStore.getState()
    for (const presetId of Object.keys(presetStates)) {
      if (!presetStates[presetId]?.isActive) continue
      const manager = randomRegistry.get(presetId)
      if (manager) {
        const currentId = manager.getCurrentPlayingId()
        manager.stop()
        if (currentId) {
          audioManager.stop(currentId)
          useMp3Store.getState().setPlaying(currentId, false)
        }
      }
    }
    randomRegistry.stopAll()
    useRandomStore.getState().clearAll()
    audioManager.stopAll()
    for (const id of useMp3Store.getState().mp3s.filter((m) => m.isPlaying).map((m) => m.id)) {
      useMp3Store.getState().setPlaying(id, false)
    }
  }, [])

  // グローバル IPC リスナー（アプリ背面時）— lastActivePresetId を対象に
  useEffect(() => {
    const offPrev = window.api.random.onPrev(() => {
      const lastId = useRandomStore.getState().lastActivePresetId
      if (lastId) playPresetPrev(lastId)
    })
    const offNext = window.api.random.onNext(() => {
      const lastId = useRandomStore.getState().lastActivePresetId
      if (lastId) playPresetNext(lastId)
    })
    const offStop = window.api.random.onStop(stopAll)
    return () => { offPrev(); offNext(); offStop() }
  }, [stopAll])

  // アプリフォーカス時のキーボードリスナー
  useEffect(() => {
    if (!settings.randomPrevBind && !settings.randomNextBind && !settings.randomStopBind) return
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      const acc = buildAccelerator(e)
      const lastId = useRandomStore.getState().lastActivePresetId
      if (settings.randomPrevBind && acc === settings.randomPrevBind && lastId) {
        e.preventDefault(); playPresetPrev(lastId)
      } else if (settings.randomNextBind && acc === settings.randomNextBind && lastId) {
        e.preventDefault(); playPresetNext(lastId)
      } else if (settings.randomStopBind && acc === settings.randomStopBind) {
        e.preventDefault(); stopAll()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [settings.randomPrevBind, settings.randomNextBind, settings.randomStopBind, stopAll])

  // キーバインド変更時にメインプロセスへ登録
  useEffect(() => {
    if (settings.randomPrevBind) window.api.random.setPrevKey(settings.randomPrevBind).catch(() => {})
  }, [settings.randomPrevBind])

  useEffect(() => {
    if (settings.randomNextBind) window.api.random.setNextKey(settings.randomNextBind).catch(() => {})
  }, [settings.randomNextBind])

  useEffect(() => {
    if (settings.randomStopBind) window.api.random.setStopKey(settings.randomStopBind).catch(() => {})
  }, [settings.randomStopBind])

  return { stopAll }
}
