import { useState } from 'react'
import { useMp3Store } from '../../stores/mp3Store'
import { eventToAccelerator } from '@shared/accelerator'
import type { Mp3Item } from '@shared/types'
import styles from './KeybindEditor.module.css'

interface Props {
  mp3: Mp3Item
}

function displayKey(k: string): string {
  return k
    .replace('Return', 'Enter')
    .replace(/^num(\d)$/, 'Num$1')
    .replace('numdec', 'Num.')
    .replace('numadd', 'Num+')
    .replace('numsub', 'Num-')
    .replace('nummult', 'Num*')
    .replace('numdiv', 'Num/')
}

export function KeybindEditor({ mp3 }: Props): JSX.Element {
  const updateKeybinds = useMp3Store((s) => s.updateKeybinds)
  const allMp3s = useMp3Store((s) => s.mp3s)
  const [capturing, setCapturing] = useState(false)

  const duplicates = mp3.keybinds.filter((key) =>
    allMp3s.some((m) => m.id !== mp3.id && m.keybinds.includes(key))
  )

  const removeKey = (key: string): void => {
    updateKeybinds(mp3.id, mp3.keybinds.filter((k) => k !== key))
  }

  const startCapture = (): void => {
    if (mp3.keybinds.length >= 3) return
    setCapturing(true)

    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      const key = eventToAccelerator(e)
      if (!key) return

      if (!mp3.keybinds.includes(key)) {
        updateKeybinds(mp3.id, [...mp3.keybinds, key])
      }
      setCapturing(false)
      window.removeEventListener('keydown', onKeyDown)
    }

    const onBlur = (): void => {
      setCapturing(false)
      window.removeEventListener('keydown', onKeyDown)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur, { once: true })
  }

  return (
    <div className={styles.wrapper}>
      {mp3.keybinds.map((key) => (
        <span
          key={key}
          className={`${styles.keyBadge} ${duplicates.includes(key) ? styles.warn : ''}`}
          title={duplicates.includes(key) ? '他のMP3でも使用中' : ''}
        >
          {displayKey(key)}
          <button className={styles.removeKey} onClick={() => removeKey(key)}>×</button>
        </span>
      ))}
      {mp3.keybinds.length < 3 && (
        <button
          className={`${styles.captureBtn} ${capturing ? styles.capturing : ''}`}
          onClick={startCapture}
        >
          {capturing ? 'キーを押して...' : '+ キー'}
        </button>
      )}
    </div>
  )
}
