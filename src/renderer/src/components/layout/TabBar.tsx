import { useState, useRef, useEffect, useCallback } from 'react'
import { useMp3Store } from '../../stores/mp3Store'
import { randomQueueManager } from '../../managers/RandomQueueManager'
import { audioManager } from '../../managers/AudioManager'
import { useSettingsStore } from '../../stores/settingsStore'
import { useRandomStore } from '../../stores/randomStore'
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
  const setPlaying = useMp3Store((s) => s.setPlaying)

  const [isRandom, setIsRandom] = useState(() => randomQueueManager.active)
  const [randomPresetName, setRandomPresetName] = useState(() => {
    if (!randomQueueManager.active) return ''
    const presetId = randomQueueManager.currentPresetId
    const { presets: p } = useMp3Store.getState()
    const preset = p.find((pr) => pr.id === presetId)
    return preset?.name ?? '全体'
  })
  const [editingPreset, setEditingPreset] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

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
      if (idToStop) {
        audioManager.stop(idToStop)
        setPlaying(idToStop, false)
      }
      setIsRandom(false)
      setRandomPresetName('')
    } else {
      const activePreset = presets.find((p) => p.id === activePresetId)
      const allIds =
        activePresetId === GLOBAL_PRESET_ID
          ? mp3s.map((m) => m.id)
          : activePreset?.mp3Ids ?? []
      const ids = allIds.filter((id) => !mp3s.find((m) => m.id === id)?.loop)
      if (ids.length === 0) return
      randomQueueManager.start(activePresetId, ids)
      setIsRandom(true)
      setRandomPresetName(activePreset?.name ?? '全体')

      const nextId = randomQueueManager.getNext()
      if (!nextId) return
      const mp3 = mp3s.find((m) => m.id === nextId)
      if (!mp3) return
      randomQueueManager.setCurrentPlaying(nextId)
      useRandomStore.getState().setCurrentRandomPlayingId(nextId)
      audioManager.play(mp3, settings).then((started) => {
        if (started) {
          setPlaying(nextId, true)
        } else {
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
                className={styles.tabClose}
                onClick={(e) => { e.stopPropagation(); removePreset(p.id) }}
                title="プリセット削除"
              >
                ×
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
        <button
          className={`${styles.randomBtn} ${isRandom ? styles.randomOn : ''}`}
          onClick={toggleRandom}
          title="ランダム再生"
        >
          {isRandom ? `⇄ ${randomPresetName}` : '⇄ ランダム'}
        </button>
        <button className={styles.addFileBtn} onClick={handleAddFiles} title="ファイル追加">
          + 追加
        </button>
      </div>
    </div>
  )
}
