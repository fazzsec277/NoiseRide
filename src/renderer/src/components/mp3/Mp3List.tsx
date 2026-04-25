import { useState, useRef, useMemo } from 'react'
import type { Mp3Item } from '@shared/types'
import { useMp3Store } from '../../stores/mp3Store'
import { Mp3ItemRow } from './Mp3ItemRow'
import styles from './Mp3List.module.css'

type SortField = 'name' | 'keybind' | 'duration' | 'volume' | 'status' | 'default'
type SortDir = 'asc' | 'desc'

interface Props {
  mp3s: Mp3Item[]
  activePresetId: string
}

export function Mp3List({ mp3s, activePresetId }: Props): JSX.Element {
  const reorderMp3InPreset = useMp3Store((s) => s.reorderMp3InPreset)
  const presets = useMp3Store((s) => s.presets)
  const dragFromIdx = useRef<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const [sortField, setSortField] = useState<SortField>('default')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (field: Exclude<SortField, 'default'>): void => {
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
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [mp3s, sortField, sortDir])

  const SortArrow = ({ field }: { field: Exclude<SortField, 'default'> }): JSX.Element | null => {
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

  return (
    <div className={styles.container}>
      {mp3s.length === 0 ? (
        <div className={styles.empty}>
          <p>MP3ファイルをドラッグ&ドロップするか、「+ 追加」ボタンで追加してください</p>
        </div>
      ) : (
        <div className={styles.list}>
          <div className={styles.header}>
            <span
              className={`${styles.colDrag} ${styles.colSortable} ${sortField !== 'default' ? styles.colSortReset : ''}`}
              onClick={resetSort}
              title="デフォルト順"
            >
              {sortField !== 'default' && '≡'}
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
            <span className={styles.colActions} />
          </div>
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
  )
}
