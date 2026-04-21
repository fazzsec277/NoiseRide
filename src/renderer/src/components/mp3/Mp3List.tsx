import { useState, useRef } from 'react'
import type { Mp3Item } from '@shared/types'
import { useMp3Store } from '../../stores/mp3Store'
import { Mp3ItemRow } from './Mp3ItemRow'
import styles from './Mp3List.module.css'

interface Props {
  mp3s: Mp3Item[]
  activePresetId: string
}

export function Mp3List({ mp3s, activePresetId }: Props): JSX.Element {
  const reorderMp3InPreset = useMp3Store((s) => s.reorderMp3InPreset)
  const presets = useMp3Store((s) => s.presets)
  const dragFromIdx = useRef<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  // DOM refs for each row wrapper — lets us toggle draggable without React re-render
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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
        const fromId = mp3s[from]?.id
        const toId = mp3s[toIdx]?.id
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
            <span className={styles.colDrag} />
            <span className={styles.colName}>名前</span>
            <span className={styles.colKeys}>キーバインド</span>
            <span className={styles.colDur}>時間</span>
            <span className={styles.colVolume}>音量</span>
            <span className={styles.colActions} />
          </div>
          {mp3s.map((mp3, idx) => (
            <div
              key={mp3.id}
              ref={(el) => {
                if (el) rowRefs.current.set(mp3.id, el)
                else rowRefs.current.delete(mp3.id)
              }}
              // draggable starts false; the handle's pointerdown enables it
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
                onHandlePointerDown={() => enableDrag(mp3.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
