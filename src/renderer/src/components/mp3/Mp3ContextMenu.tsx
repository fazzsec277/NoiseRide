import { useEffect, useRef } from 'react'
import type { Mp3Item } from '@shared/types'
import { useMp3Store } from '../../stores/mp3Store'
import { audioManager } from '../../managers/AudioManager'
import { GLOBAL_PRESET_ID } from '@shared/types'
import styles from './Mp3ContextMenu.module.css'

interface Props {
  mp3: Mp3Item
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement>
}

export function Mp3ContextMenu({ mp3, onClose, anchorRef }: Props): JSX.Element {
  const removeMp3 = useMp3Store((s) => s.removeMp3)
  const removeFromPreset = useMp3Store((s) => s.removeFromPreset)
  const activePresetId = useMp3Store((s) => s.activePresetId)
  const presets = useMp3Store((s) => s.presets)
  const addMp3ToPreset = useMp3Store((s) => s.addMp3ToPreset)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose, anchorRef])

  const handleFullDelete = (): void => {
    if (mp3.isPlaying) audioManager.stop(mp3.id)
    removeMp3(mp3.id)
    onClose()
  }

  const handlePresetDelete = (): void => {
    if (mp3.isPlaying) audioManager.stop(mp3.id)
    removeFromPreset(mp3.id, activePresetId)
    onClose()
  }

  const otherPresets = presets.filter(
    (p) => p.id !== GLOBAL_PRESET_ID && p.id !== activePresetId && !p.mp3Ids.includes(mp3.id)
  )

  return (
    <div ref={menuRef} className={styles.menu}>
      {activePresetId !== GLOBAL_PRESET_ID && (
        <button className={styles.item} onClick={handlePresetDelete}>
          プリセットから削除
        </button>
      )}
      <button className={`${styles.item} ${styles.danger}`} onClick={handleFullDelete}>
        完全に削除
      </button>
      {otherPresets.length > 0 && (
        <>
          <div className={styles.divider} />
          <div className={styles.label}>プリセットに追加</div>
          {otherPresets.map((p) => (
            <button
              key={p.id}
              className={styles.item}
              onClick={() => { addMp3ToPreset(mp3.id, p.id); onClose() }}
            >
              {p.name}
            </button>
          ))}
        </>
      )}
    </div>
  )
}
