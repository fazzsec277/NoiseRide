import { useState, useRef, useEffect, useCallback } from 'react'
import { useMp3Store } from '../../stores/mp3Store'
import { randomRegistry } from '../../managers/RandomQueueManager'
import { audioManager } from '../../managers/AudioManager'
import { useSettingsStore } from '../../stores/settingsStore'
import { useRandomStore } from '../../stores/randomStore'
import { useRandomControls, playPresetNext, playPresetPrev } from '../../hooks/useRandomControls'
import { playNextRandom } from '../../hooks/useAudioEnded'
import { getAudioDuration } from '../../hooks/useFileDrop'
import { GLOBAL_PRESET_ID } from '@shared/types'
import styles from './TabBar.module.css'

export function TabBar(): JSX.Element {
  const presets = useMp3Store((s) => s.presets)
  const mp3s = useMp3Store((s) => s.mp3s)
  const activePresetId = useMp3Store((s) => s.activePresetId)
  const setActivePreset = useMp3Store((s) => s.setActivePreset)
  const addPreset = useMp3Store((s) => s.addPreset)
  const removePreset = useMp3Store((s) => s.removePreset)
  const renamePreset = useMp3Store((s) => s.renamePreset)
  const reorderPresets = useMp3Store((s) => s.reorderPresets)
  const addMp3s = useMp3Store((s) => s.addMp3s)
  const setDuration = useMp3Store((s) => s.setDuration)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const setPlaying = useMp3Store((s) => s.setPlaying)

  const { stopAll } = useRandomControls()
  const presetStates = useRandomStore((s) => s.presetStates)

  const [editingPreset, setEditingPreset] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dragPresetIdx = useRef<number | null>(null)
  const [dropPresetIdx, setDropPresetIdx] = useState<number | null>(null)

  const tabsRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback((): void => {
    const el = tabsRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = tabsRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY, behavior: 'smooth' })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      el.removeEventListener('wheel', onWheel)
      ro.disconnect()
    }
  }, [updateScrollState, presets])

  const handleAddPreset = (): void => {
    const name = `プリセット ${presets.length}`
    addPreset(name)
  }

  const handlePresetDblClick = (id: string, name: string): void => {
    if (id === GLOBAL_PRESET_ID) return
    setEditingPreset(id)
    setEditName(name)
    setTimeout(() => editRef.current?.select(), 0)
  }

  const commitPresetRename = (): void => {
    if (editingPreset && editName.trim()) renamePreset(editingPreset, editName)
    setEditingPreset(null)
  }

  const handleDeleteClick = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    if (confirmDeleteId === id) {
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null }
      setConfirmDeleteId(null)
      // ランダム再生中なら停止してから削除
      if (presetStates[id]?.isActive) {
        const manager = randomRegistry.get(id)
        const currentId = manager?.getCurrentPlayingId() ?? null
        randomRegistry.delete(id)
        useRandomStore.getState().clearPreset(id)
        if (currentId) { audioManager.stop(currentId); setPlaying(currentId, false) }
      }
      removePreset(id)
    } else {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirmDeleteId(id)
      confirmTimerRef.current = setTimeout(() => {
        setConfirmDeleteId(null)
        confirmTimerRef.current = null
      }, 2000)
    }
  }

  const handleAddFiles = async (): Promise<void> => {
    const filePaths = await window.api.dialog.openMp3()
    if (filePaths.length === 0) return
    const target = activePresetId === GLOBAL_PRESET_ID ? undefined : activePresetId
    const newItems = addMp3s(filePaths, target)
    for (const item of newItems) {
      const dur = await getAudioDuration(item.filePath)
      if (dur > 0) setDuration(item.id, dur)
    }
  }

  const toggleRandom = useCallback((presetId: string): void => {
    const state = useRandomStore.getState()
    const isActive = state.presetStates[presetId]?.isActive ?? false

    if (isActive) {
      const manager = randomRegistry.get(presetId)
      const idToStop = manager?.getCurrentPlayingId() ?? null
      randomRegistry.delete(presetId)
      state.clearPreset(presetId)
      if (idToStop) { audioManager.stop(idToStop); setPlaying(idToStop, false) }
    } else {
      const preset = presets.find((p) => p.id === presetId)
      const allIds =
        presetId === GLOBAL_PRESET_ID
          ? mp3s.map((m) => m.id)
          : preset?.mp3Ids ?? []
      const ids = allIds.filter((id: string) => !mp3s.find((m) => m.id === id)?.loop)
      if (ids.length === 0) return

      const manager = randomRegistry.getOrCreate(presetId)
      manager.start(presetId, ids)
      state.setPresetActive(presetId, true)
      state.setLastActivePresetId(presetId)

      const nextId = manager.getNext()
      if (!nextId) return
      const mp3 = mp3s.find((m) => m.id === nextId)
      if (!mp3) return
      manager.setCurrentPlaying(nextId)
      state.setCurrentPlayingId(presetId, nextId)
      state.setLoadingId(presetId, nextId)
      audioManager.play(mp3, settings).then((started) => {
        state.setLoadingId(presetId, null)
        if (started) {
          setPlaying(nextId, true)
        } else if (started === false) {
          playNextRandom(presetId)
        } else {
          randomRegistry.get(presetId)?.clearCurrentPlaying()
          state.setCurrentPlayingId(presetId, null)
        }
      })
    }
  }, [mp3s, presets, settings, setPlaying])

  const onPresetDragStart = (idx: number): void => {
    dragPresetIdx.current = idx
  }

  const onPresetDragOver = (e: React.DragEvent, idx: number): void => {
    e.preventDefault()
    if (idx !== 0) setDropPresetIdx(idx)
  }

  const onPresetDrop = (idx: number): void => {
    const from = dragPresetIdx.current
    if (from !== null && from !== idx && idx !== 0) {
      reorderPresets(from, idx)
    }
    dragPresetIdx.current = null
    setDropPresetIdx(null)
  }

  const onPresetDragEnd = (): void => {
    dragPresetIdx.current = null
    setDropPresetIdx(null)
  }

  const scrollTabs = (dir: 'left' | 'right'): void => {
    tabsRef.current?.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' })
  }

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabArea}>
        <button
          className={`${styles.arrowBtn} ${!canScrollLeft ? styles.arrowDisabled : ''}`}
          onClick={() => scrollTabs('left')}
          tabIndex={-1}
        >‹</button>
        <div className={`${styles.fadeLeft} ${canScrollLeft ? styles.fadeVisible : ''}`} />
        <div ref={tabsRef} className={styles.tabs}>
        {presets.map((p, idx) => {
          const isRandom = presetStates[p.id]?.isActive ?? false
          const loadingId = presetStates[p.id]?.loadingId ?? null
          const hasPrev = randomRegistry.get(p.id)?.hasPrevious() ?? false
          return (
            <div
              key={p.id}
              draggable={p.id !== GLOBAL_PRESET_ID}
              onDragStart={() => onPresetDragStart(idx)}
              onDragOver={(e) => onPresetDragOver(e, idx)}
              onDrop={() => onPresetDrop(idx)}
              onDragEnd={onPresetDragEnd}
              className={[
                styles.tab,
                activePresetId === p.id ? styles.active : '',
                isRandom ? styles.randomOn : '',
                dropPresetIdx === idx ? styles.dropTarget : ''
              ].join(' ')}
            >
              {/* 上段: プリセット名 + 削除ボタン */}
              <div className={styles.tabTop}>
                {editingPreset === p.id ? (
                  <input
                    ref={editRef}
                    className={styles.tabInput}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={commitPresetRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitPresetRename()
                      if (e.key === 'Escape') setEditingPreset(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={styles.tabLabel}
                    onClick={() => setActivePreset(p.id)}
                    onDoubleClick={() => handlePresetDblClick(p.id, p.name)}
                  >
                    {p.name}
                  </span>
                )}
                {p.id !== GLOBAL_PRESET_ID && (
                  <button
                    className={`${styles.tabClose} ${confirmDeleteId === p.id ? styles.tabCloseConfirm : ''}`}
                    onClick={(e) => handleDeleteClick(e, p.id)}
                    title={confirmDeleteId === p.id ? 'もう一度クリックで削除' : 'プリセット削除'}
                  >
                    {confirmDeleteId === p.id ? '!' : '×'}
                  </button>
                )}
              </div>

              {/* 下段: ランダムコントロール */}
              <div className={styles.tabBottom}>
                <button
                  className={styles.tabSkipBtn}
                  onClick={(e) => { e.stopPropagation(); playPresetPrev(p.id) }}
                  disabled={!isRandom || !hasPrev || loadingId !== null}
                  title="前の曲"
                >«</button>
                <button
                  className={styles.tabRandomBtn}
                  onClick={(e) => { e.stopPropagation(); toggleRandom(p.id) }}
                  title={isRandom ? 'ランダム停止' : 'ランダム再生'}
                >⇄</button>
                <button
                  className={styles.tabSkipBtn}
                  onClick={(e) => { e.stopPropagation(); playPresetNext(p.id) }}
                  disabled={!isRandom || loadingId !== null}
                  title="次の曲"
                >»</button>
              </div>
            </div>
          )
        })}
        <button className={styles.addTab} onClick={handleAddPreset} title="プリセット追加">
          +
        </button>
        </div>
        <div className={`${styles.fadeRight} ${canScrollRight ? styles.fadeVisible : ''}`} />
        <button
          className={`${styles.arrowBtn} ${!canScrollRight ? styles.arrowDisabled : ''}`}
          onClick={() => scrollTabs('right')}
          tabIndex={-1}
        >›</button>
      </div>

      <div className={styles.actions}>
        <button className={styles.stopBtn} onClick={stopAll} title="全停止">全停止 ■</button>
        <button
          className={`${styles.kbToggleBtn} ${!settings.keybindEnabled ? styles.kbToggleOff : ''}`}
          onClick={() => updateSettings({ keybindEnabled: !settings.keybindEnabled })}
          title={settings.keybindEnabled ? 'キーバインド有効（クリックで無効化）' : 'キーバインド無効（クリックで有効化）'}
        >
          {settings.keybindEnabled ? 'KB: ON' : 'KB: OFF'}
        </button>
        <button className={styles.addFileBtn} onClick={handleAddFiles} title="ファイル追加">
          + 追加
        </button>
      </div>
    </div>
  )
}
