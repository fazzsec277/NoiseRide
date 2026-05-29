import { useState, useRef, useMemo, useEffect } from 'react'
import type { Mp3Item } from '@shared/types'
import { useMp3Store } from '../../stores/mp3Store'
import { useRandomStore } from '../../stores/randomStore'
import { randomRegistry } from '../../managers/RandomQueueManager'
import { Mp3ItemRow } from './Mp3ItemRow'
import styles from './Mp3List.module.css'

type SortField = 'name' | 'keybind' | 'duration' | 'volume' | 'status' | 'playing' | 'default' | 'randomQueue'
type SortDir = 'asc' | 'desc'

interface Props {
  mp3s: Mp3Item[]
  activePresetId: string
}

export function Mp3List({ mp3s, activePresetId }: Props): JSX.Element {
  const reorderMp3InPreset = useMp3Store((s) => s.reorderMp3InPreset)
  const presets = useMp3Store((s) => s.presets)
  const loadingIds = useMp3Store((s) => s.loadingIds)
  const dragFromIdx = useRef<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const presetStates = useRandomStore((s) => s.presetStates)
  const isRandomActive = presetStates[activePresetId]?.isActive ?? false
  const currentPlayingId = presetStates[activePresetId]?.currentPlayingId ?? null
  const loadingId = presetStates[activePresetId]?.loadingId ?? null

  const [sortField, setSortField] = useState<SortField>('default')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // ランダム再生が停止したらランダム順ソートを解除
  useEffect(() => {
    if (!isRandomActive && sortField === 'randomQueue') {
      setSortField('default')
    }
  }, [isRandomActive, sortField])

  const handleSort = (field: Exclude<SortField, 'default' | 'randomQueue'>): void => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const resetSort = (): void => {
    setSortField('default')
    setSortDir('asc')
  }

  const handlePlayingColumnClick = (): void => {
    if (sortField === 'default') {
      setSortField('playing')
      setSortDir('desc')
    } else {
      resetSort()
    }
  }

  const handleRandomQueueColumnClick = (): void => {
    if (!isRandomActive) return
    if (sortField === 'randomQueue') {
      resetSort()
    } else {
      setSortField('randomQueue')
      setSortDir('asc')
    }
  }

  const displayMp3s = useMemo(() => {
    if (sortField === 'default') return mp3s
    return [...mp3s].sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name, 'ja')
      else if (sortField === 'keybind') {
        const len = Math.max(a.keybinds.length, b.keybinds.length, 1)
        for (let i = 0; i < len; i++) {
          cmp = (a.keybinds[i] ?? '').localeCompare(b.keybinds[i] ?? '')
          if (cmp !== 0) break
        }
      }
      else if (sortField === 'duration') cmp = a.duration - b.duration
      else if (sortField === 'volume') cmp = (a.volume ?? 1) - (b.volume ?? 1)
      else if (sortField === 'status') {
        const scoreA = (a.loop ? 2 : 0) + (a.restart ? 1 : 0)
        const scoreB = (b.loop ? 2 : 0) + (b.restart ? 1 : 0)
        cmp = scoreA - scoreB
      }
      else if (sortField === 'playing') {
        const score = (m: Mp3Item): number => {
          if (m.isPlaying && m.id === currentPlayingId) return 4
          if (m.isPlaying) return 3
          if (m.id === loadingId) return 2
          if (loadingIds.includes(m.id)) return 1
          return 0
        }
        cmp = score(a) - score(b)
      }
      else if (sortField === 'randomQueue') {
        const manager = randomRegistry.get(activePresetId)
        if (manager) {
          const history = manager.getPlayedHistory()
          const current = manager.getCurrentPlayingId()
          const remaining = manager.getRemainingQueue()
          const order = [...history, ...(current ? [current] : []), ...remaining]
          const posMap = new Map(order.map((id, i) => [id, i]))
          cmp = (posMap.get(a.id) ?? Infinity) - (posMap.get(b.id) ?? Infinity)
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [mp3s, sortField, sortDir, currentPlayingId, loadingId, loadingIds, activePresetId])

  const SortArrow = ({ field }: { field: Exclude<SortField, 'default' | 'randomQueue'> }): JSX.Element | null => {
    if (sortField !== field) return null
    return <span className={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>
  }

  const enableDrag = (id: string): void => {
    const el = rowRefs.current.get(id)
    if (el) el.draggable = true
  }

  const disableDrag = (id: string): void => {
    const el = rowRefs.current.get(id)
    if (el) el.draggable = false
  }

  const onDrop = (toIdx: number): void => {
    const from = dragFromIdx.current
    if (from !== null && from !== toIdx) {
      const preset = presets.find((p) => p.id === activePresetId)
      if (preset) {
        const fromId = displayMp3s[from]?.id
        const toId = displayMp3s[toIdx]?.id
        const presetFromIdx = preset.mp3Ids.indexOf(fromId ?? '')
        const presetToIdx = preset.mp3Ids.indexOf(toId ?? '')
        if (presetFromIdx >= 0 && presetToIdx >= 0) {
          reorderMp3InPreset(activePresetId, presetFromIdx, presetToIdx)
        }
      }
    }
    dragFromIdx.current = null
    setDropIdx(null)
  }

  const dragColIcon = sortField === 'default' ? '▶' : sortField === 'randomQueue' ? '⇄' : '≡'

  return (
    <div className={styles.wrapper}>
      {mp3s.length > 0 && (
        <div className={styles.header}>
          <span
            className={`${styles.colDrag} ${styles.colSortable} ${sortField === 'playing' ? styles.colSortActive : ''} ${sortField !== 'default' && sortField !== 'playing' ? styles.colSortReset : ''}`}
            onClick={handlePlayingColumnClick}
            title={sortField === 'default' ? '再生中でソート' : 'デフォルト順に戻す'}
          >
            {dragColIcon}
          </span>
          <span
            className={`${styles.colName} ${styles.colSortable} ${sortField === 'name' ? styles.colSortActive : ''}`}
            onClick={() => handleSort('name')}
          >
            名前<SortArrow field="name" />
          </span>
          <span
            className={`${styles.colKeys} ${styles.colSortable} ${sortField === 'keybind' ? styles.colSortActive : ''}`}
            onClick={() => handleSort('keybind')}
          >
            キーバインド<SortArrow field="keybind" />
          </span>
          <span
            className={`${styles.colDur} ${styles.colSortable} ${sortField === 'duration' ? styles.colSortActive : ''}`}
            onClick={() => handleSort('duration')}
          >
            時間<SortArrow field="duration" />
          </span>
          <span
            className={`${styles.colVolume} ${styles.colSortable} ${sortField === 'volume' ? styles.colSortActive : ''}`}
            onClick={() => handleSort('volume')}
          >
            音量<SortArrow field="volume" />
          </span>
          <span
            className={`${styles.colStatus} ${styles.colSortable} ${sortField === 'status' ? styles.colSortActive : ''}`}
            onClick={() => handleSort('status')}
          >
            状態<SortArrow field="status" />
          </span>
          <span
            className={`${styles.colActions} ${isRandomActive ? styles.colSortable : styles.colRandomSortDisabled} ${sortField === 'randomQueue' ? styles.colSortActive : ''}`}
            onClick={handleRandomQueueColumnClick}
            title={!isRandomActive ? 'ランダム再生中のみ使用可' : sortField === 'randomQueue' ? 'デフォルト順に戻す' : 'ランダム再生順でソート'}
          >
            ⇄
          </span>
        </div>
      )}
      <div className={styles.container}>
        {mp3s.length === 0 ? (
          <div className={styles.empty}>
            <p>MP3ファイルをドラッグ&ドロップするか、「+ 追加」ボタンで追加してください</p>
          </div>
        ) : (
          <div className={styles.list}>
            {displayMp3s.map((mp3, idx) => (
              <div
                key={mp3.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(mp3.id, el)
                  else rowRefs.current.delete(mp3.id)
                }}
                draggable={false}
                onDragStart={() => { dragFromIdx.current = idx }}
                onDragOver={(e) => { e.preventDefault(); setDropIdx(idx) }}
                onDrop={() => onDrop(idx)}
                onDragEnd={() => {
                  disableDrag(mp3.id)
                  dragFromIdx.current = null
                  setDropIdx(null)
                }}
                className={dropIdx === idx ? styles.dropTarget : ''}
              >
                <Mp3ItemRow
                  mp3={mp3}
                  onHandlePointerDown={sortField === 'default' ? () => enableDrag(mp3.id) : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
