import { useState, useRef, useEffect, useCallback } from 'react'
import { useMp3Store } from '../../stores/mp3Store'
import { randomQueueManager } from '../../managers/RandomQueueManager'
import { audioManager } from '../../managers/AudioManager'
import { useSettingsStore } from '../../stores/settingsStore'
import { useRandomStore } from '../../stores/randomStore'
import { useRandomControls } from '../../hooks/useRandomControls'
import { playNextRandom } from '../../hooks/useAudioEnded'
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

  const { playPrev, playNext, stopAll } = useRandomControls()
  const isRandom = useRandomStore((s) => s.isRandomActive)
  const randomPresetName = useRandomStore((s) => s.randomPresetName)
  const randomLoadingId = useRandomStore((s) => s.randomLoadingId)
  const [editingPreset, setEditingPreset] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Preset drag state
  const dragPresetIdx = useRef<number | null>(null)
  const [dropPresetIdx, setDropPresetIdx] = useState<number | null>(null)

  // Tab scroll state
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
    return () => {
      el.removeEventListener('scroll', updateScrollState)
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
      const dur = await audioManager.updateDuration(item)
      if (dur > 0) setDuration(item.id, dur)
    }
  }

  const toggleRandom = (): void => {
    if (isRandom) {
      const idToStop = randomQueueManager.getCurrentPlayingId()
      randomQueueManager.stop()
      useRandomStore.getState().setCurrentRandomPlayingId(null)
      useRandomStore.getState().setRandomActive(false)
      useRandomStore.getState().setRandomLoadingId(null)
      if (idToStop) {
        audioManager.stop(idToStop)
        setPlaying(idToStop, false)
      }
    } else {
      const activePreset = presets.find((p) => p.id === activePresetId)
      const allIds =
        activePresetId === GLOBAL_PRESET_ID
          ? mp3s.map((m) => m.id)
          : activePreset?.mp3Ids ?? []
      const ids = allIds.filter((id: string) => !mp3s.find((m) => m.id === id)?.loop)
      if (ids.length === 0) return
      const presetName = activePreset?.name ?? '全体'
      randomQueueManager.start(activePresetId, ids)
      useRandomStore.getState().setRandomActive(true, presetName)

      const nextId = randomQueueManager.getNext()
      if (!nextId) return
      const mp3 = mp3s.find((m) => m.id === nextId)
      if (!mp3) return
      randomQueueManager.setCurrentPlaying(nextId)
      useRandomStore.getState().setCurrentRandomPlayingId(nextId)
      useRandomStore.getState().setRandomLoadingId(nextId)
      audioManager.play(mp3, settings).then((started) => {
        useRandomStore.getState().setRandomLoadingId(null)
        if (started) {
          setPlaying(nextId, true)
        } else if (started === false) {
          // 選ばれたトラックが既に手動再生中 → スキップして次へ
          playNextRandom()
        } else {
          // null: ロード中にキャンセル（ランダム停止ボタン押下）→ 状態クリア
          randomQueueManager.clearCurrentPlaying()
          useRandomStore.getState().setCurrentRandomPlayingId(null)
        }
      })
    }
  }

  // Preset drag handlers
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
        {presets.map((p, idx) => (
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
              dropPresetIdx === idx ? styles.dropTarget : ''
            ].join(' ')}
          >
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
        ))}
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
        <div className={`${styles.pillGroup} ${isRandom ? styles.pillOn : ''}`}>
          <button
            className={styles.pillSkip}
            onClick={playPrev}
            disabled={!isRandom || !randomQueueManager.hasPrevious() || randomLoadingId !== null}
            title="前の曲"
          >«</button>
          <div className={styles.pillDivider} />
          <button
            className={styles.pillRandom}
            onClick={toggleRandom}
            title="ランダム再生"
          >
            {isRandom ? `⇄ ${randomPresetName}` : '⇄ ランダム'}
          </button>
          <div className={styles.pillDivider} />
          <button
            className={styles.pillSkip}
            onClick={playNext}
            disabled={!isRandom || randomLoadingId !== null}
            title="次の曲"
          >»</button>
        </div>
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
