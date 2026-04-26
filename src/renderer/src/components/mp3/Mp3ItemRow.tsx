import { useState, useRef, useEffect, useCallback } from 'react'
import type { Mp3Item } from '@shared/types'
import { useMp3Store } from '../../stores/mp3Store'
import { useSettingsStore } from '../../stores/settingsStore'
import { useRandomStore } from '../../stores/randomStore'
import { audioManager } from '../../managers/AudioManager'
import { Mp3NameEditor } from './Mp3NameEditor'
import { KeybindEditor } from '../keybind/KeybindEditor'
import { Mp3ContextMenu } from './Mp3ContextMenu'
import styles from './Mp3ItemRow.module.css'

function formatDuration(sec: number): string {
  if (!sec) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  mp3: Mp3Item
  onHandlePointerDown?: () => void
}

export function Mp3ItemRow({ mp3, onHandlePointerDown }: Props): JSX.Element {
  const updateMp3Name = useMp3Store((s) => s.updateMp3Name)
  const setPlaying = useMp3Store((s) => s.setPlaying)
  const updateVolume = useMp3Store((s) => s.updateVolume)
  const toggleLoop = useMp3Store((s) => s.toggleLoop)
  const toggleRestart = useMp3Store((s) => s.toggleRestart)
  const settings = useSettingsStore((s) => s.settings)
  const isRandomPlaying = useRandomStore((s) => s.currentRandomPlayingId === mp3.id)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [elapsed, setElapsed] = useState(0)
  const isDragging = useRef(false)
  const rafId = useRef(0)
  const seekBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mp3.isPlaying) { setElapsed(0); return }
    const tick = (): void => {
      if (!audioManager.isPlaying(mp3.id)) {
        // AudioManager already ended (onended fired) but Zustand wasn't updated
        setPlaying(mp3.id, false)
        return
      }
      if (!isDragging.current) setElapsed(audioManager.getCurrentTime(mp3.id))
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [mp3.isPlaying, mp3.id, setPlaying])

  const calcOffset = (clientX: number): number => {
    const el = seekBarRef.current
    if (!el || !mp3.duration) return 0
    const { left, width } = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - left) / width)) * mp3.duration
  }

  const handleSeekMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    isDragging.current = true
    setElapsed(calcOffset(e.clientX))

    const onMove = (ev: MouseEvent): void => setElapsed(calcOffset(ev.clientX))
    const onUp = (ev: MouseEvent): void => {
      isDragging.current = false
      const offset = calcOffset(ev.clientX)
      setElapsed(offset)
      audioManager.seek(mp3.id, offset)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [mp3.id, mp3.duration])

  const handlePlay = (): void => {
    if (mp3.isPlaying) {
      audioManager.stop(mp3.id)
      setPlaying(mp3.id, false)
    } else {
      setIsLoading(true)
      audioManager.play(mp3, settings)
        .then((started) => {
          setIsLoading(false)
          if (started) setPlaying(mp3.id, true)
        })
        .catch(() => setIsLoading(false))
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const vol = Number(e.target.value) / 100
    updateVolume(mp3.id, vol)
    audioManager.updateItemGain(mp3.id, vol)
  }

  return (
    <div className={`${styles.row} ${mp3.isPlaying ? (isRandomPlaying ? styles.randomPlaying : styles.playing) : ''}`}>
      <div
        className={styles.colDrag}
        title={onHandlePointerDown ? 'ドラッグで並び替え' : undefined}
        onPointerDown={onHandlePointerDown}
        style={onHandlePointerDown ? undefined : { visibility: 'hidden' }}
      >
        ⠿
      </div>

      <div className={styles.colName}>
        <button
          className={`${styles.playBtn} ${mp3.isPlaying ? (isRandomPlaying ? styles.randomPlayingBtn : styles.playingBtn) : ''} ${isLoading ? styles.loadingBtn : ''}`}
          onClick={handlePlay}
          disabled={isLoading}
          title={isLoading ? '読み込み中...' : mp3.isPlaying ? '停止' : '再生'}
        >
          {mp3.isPlaying ? '■' : isLoading ? <span className={styles.loadingIcon}>↻</span> : '▶'}
        </button>
        <Mp3NameEditor name={mp3.name} onSave={(n) => updateMp3Name(mp3.id, n)} />
      </div>

      <div className={styles.colKeys}>
        <KeybindEditor mp3={mp3} />
      </div>

      <div className={styles.colDur}>
        <span className={styles.duration}>
          {`${mp3.isPlaying ? formatTime(elapsed) : '0:00'} / ${formatDuration(mp3.duration)}`}
        </span>
      </div>

      <div className={styles.colVolume}>
        <input
          type="range"
          className={styles.volumeSlider}
          min={0}
          max={200}
          value={Math.round((mp3.volume ?? 1.0) * 100)}
          onChange={handleVolumeChange}
          title={`音量: ${Math.round((mp3.volume ?? 1.0) * 100)}%`}
        />
        <span className={styles.volumeLabel}>{Math.round((mp3.volume ?? 1.0) * 100)}%</span>
      </div>

      <div className={styles.colStatus}>
        <button
          className={`${styles.loopBtn} ${mp3.loop ? styles.loopOn : ''}`}
          onClick={() => {
            const next = !(mp3.loop ?? false)
            toggleLoop(mp3.id)
            audioManager.updateLoop(mp3.id, next)
          }}
          title={mp3.loop ? 'ループOFF' : 'ループON'}
        >
          ↺
        </button>
        <button
          className={`${styles.restartBtn} ${mp3.restart ? styles.restartOn : ''}`}
          onClick={() => toggleRestart(mp3.id)}
          title={mp3.restart ? '再生しなおしOFF' : '再生しなおしON'}
        >
          ↩
        </button>
      </div>
      <div className={styles.colActions}>
        <button
          ref={menuBtnRef}
          className={styles.menuBtn}
          onClick={() => setMenuOpen((o) => !o)}
          title="操作"
        >
          ⋮
        </button>
        {menuOpen && (
          <Mp3ContextMenu
            mp3={mp3}
            onClose={() => setMenuOpen(false)}
            anchorRef={menuBtnRef}
          />
        )}
      </div>
      {mp3.isPlaying && (
        <div
          ref={seekBarRef}
          className={styles.seekBar}
          onMouseDown={handleSeekMouseDown}
        >
          <div
            className={`${styles.seekFill} ${isRandomPlaying ? styles.seekFillRandom : ''}`}
            style={{ width: `${mp3.duration ? (elapsed / mp3.duration) * 100 : 0}%` }}
          />
          <div
            className={styles.seekHandle}
            style={{ left: `${mp3.duration ? (elapsed / mp3.duration) * 100 : 0}%` }}
          />
        </div>
      )}
    </div>
  )
}
