import { useEffect, useCallback } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useMp3Store } from '../stores/mp3Store'
import { useRandomStore } from '../stores/randomStore'
import { audioManager } from '../managers/AudioManager'
import { randomQueueManager } from '../managers/RandomQueueManager'
import { playNextRandom } from './useAudioEnded'

function buildAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(e.key === ' ' ? 'Space' : e.key)
  return parts.join('+')
}

export function useRandomControls(): {
  playPrev: () => void
  playNext: () => void
  stopAll: () => void
} {
  const settings = useSettingsStore((s) => s.settings)

  const stopAll = useCallback((): void => {
    // ランダム再生中なら先にランダム状態をリセット（onEnded の連鎖を防ぐ）
    if (randomQueueManager.active) {
      randomQueueManager.stop()
      useRandomStore.getState().setCurrentRandomPlayingId(null)
      useRandomStore.getState().setRandomActive(false)
      useRandomStore.getState().setRandomLoadingId(null)
    }
    audioManager.stopAll()
    // stopAll の中で notifyEnded が各 id に対して呼ばれるが、
    // randomQueueManager.active が false になっているため useAudioEnded は何もしない
    for (const id of useMp3Store.getState().mp3s.filter((m) => m.isPlaying).map((m) => m.id)) {
      useMp3Store.getState().setPlaying(id, false)
    }
  }, [])

  const playNext = useCallback((): void => {
    if (useRandomStore.getState().randomLoadingId !== null) return
    const id = randomQueueManager.getCurrentPlayingId()
    if (id) {
      // prepareForNextTrack を stop より先に呼ぶことで
      // onEnded の二重発火を防ぎつつ現在曲を playedHistory に積む
      randomQueueManager.prepareForNextTrack()
      useRandomStore.getState().setCurrentRandomPlayingId(null)
      audioManager.stop(id)
      useMp3Store.getState().setPlaying(id, false)
    }
    playNextRandom()
  }, [])

  const playPrev = useCallback((): void => {
    if (useRandomStore.getState().randomLoadingId !== null) return
    if (!randomQueueManager.hasPrevious()) return
    const currentId = randomQueueManager.getCurrentPlayingId()
    const prevId = randomQueueManager.getPrevious()
    if (!prevId) return
    if (currentId) {
      // setCurrentPlayingBack で currentPlayingId を prevId に変えてから stop することで
      // isCurrentRandom(currentId) = false になり useAudioEnded の連鎖を防ぐ
      randomQueueManager.setCurrentPlayingBack(prevId)
      useRandomStore.getState().setCurrentRandomPlayingId(prevId)
      audioManager.stop(currentId)
      useMp3Store.getState().setPlaying(currentId, false)
    }
    const mp3 = useMp3Store.getState().mp3s.find((m) => m.id === prevId)
    if (!mp3) return
    useRandomStore.getState().setRandomLoadingId(prevId)
    audioManager.play(mp3, useSettingsStore.getState().settings).then((started) => {
      useRandomStore.getState().setRandomLoadingId(null)
      if (started) useMp3Store.getState().setPlaying(prevId, true)
    })
  }, [])

  // グローバル IPC リスナー（アプリ背面時）
  useEffect(() => {
    const offPrev = window.api.random.onPrev(playPrev)
    const offNext = window.api.random.onNext(playNext)
    const offStop = window.api.random.onStop(stopAll)
    return () => { offPrev(); offNext(); offStop() }
  }, [playPrev, playNext, stopAll])

  // アプリフォーカス時のキーボードリスナー
  useEffect(() => {
    if (!settings.randomPrevBind && !settings.randomNextBind && !settings.randomStopBind) return
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      const acc = buildAccelerator(e)
      if (settings.randomPrevBind && acc === settings.randomPrevBind) { e.preventDefault(); playPrev() }
      else if (settings.randomNextBind && acc === settings.randomNextBind) { e.preventDefault(); playNext() }
      else if (settings.randomStopBind && acc === settings.randomStopBind) { e.preventDefault(); stopAll() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [settings.randomPrevBind, settings.randomNextBind, settings.randomStopBind, playPrev, playNext, stopAll])

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

  return { playPrev, playNext, stopAll }
}
