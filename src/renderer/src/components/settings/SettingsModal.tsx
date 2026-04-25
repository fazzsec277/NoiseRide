import { useState, useEffect } from 'react'
import type { Settings } from '@shared/types'
import { useMp3Store } from '../../stores/mp3Store'
import { audioManager } from '../../managers/AudioManager'
import styles from './SettingsModal.module.css'

function buildAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(e.key === ' ' ? 'Space' : e.key)
  return parts.join('+')
}

type RecordTarget = 'prev' | 'next' | 'stop' | null

interface Props {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
  onClose: () => void
}

export function SettingsModal({ settings, onUpdate, onClose }: Props): JSX.Element {
  const clearAllMp3s = useMp3Store((s) => s.clearAllMp3s)
  const clearAllPresets = useMp3Store((s) => s.clearAllPresets)
  const [confirmClearMp3s, setConfirmClearMp3s] = useState(false)
  const [confirmClearPresets, setConfirmClearPresets] = useState(false)
  const [recording, setRecording] = useState<RecordTarget>(null)

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      const acc = buildAccelerator(e)
      if (recording === 'prev') {
        onUpdate({ randomPrevBind: acc })
        window.api.random.setPrevKey(acc).catch(() => {})
      } else if (recording === 'next') {
        onUpdate({ randomNextBind: acc })
        window.api.random.setNextKey(acc).catch(() => {})
      } else {
        onUpdate({ randomStopBind: acc })
        window.api.random.setStopKey(acc).catch(() => {})
      }
      setRecording(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [recording, onUpdate])

  const handleClearAllMp3s = (): void => {
    audioManager.stopAll()
    clearAllMp3s()
    setConfirmClearMp3s(false)
  }

  const handleClearAllPresets = (): void => {
    clearAllPresets()
    setConfirmClearPresets(false)
  }

  const bindRows: { key: RecordTarget; label: string; value: string }[] = [
    { key: 'prev', label: '前の曲', value: settings.randomPrevBind },
    { key: 'next', label: '次の曲', value: settings.randomNextBind },
    { key: 'stop', label: '全停止', value: settings.randomStopBind },
  ]

  const clearBind = (target: RecordTarget): void => {
    if (target === 'prev') onUpdate({ randomPrevBind: '' })
    else if (target === 'next') onUpdate({ randomNextBind: '' })
    else if (target === 'stop') onUpdate({ randomStopBind: '' })
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span>⚙ 設定</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>最大同時再生数</label>
            <div className={styles.numberRow}>
              <button
                className={styles.numBtn}
                onClick={() => onUpdate({ maxConcurrent: Math.max(1, settings.maxConcurrent - 1) })}
              >▼</button>
              <span className={styles.numValue}>{settings.maxConcurrent}</span>
              <button
                className={styles.numBtn}
                onClick={() => onUpdate({ maxConcurrent: Math.min(20, settings.maxConcurrent + 1) })}
              >▲</button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>テーマ</label>
            <div className={styles.themeRow}>
              <button
                className={`${styles.themeBtn} ${settings.theme === 'dark' ? styles.active : ''}`}
                onClick={() => onUpdate({ theme: 'dark' })}
              >
                ● ダーク
              </button>
              <button
                className={`${styles.themeBtn} ${settings.theme === 'light' ? styles.active : ''}`}
                onClick={() => onUpdate({ theme: 'light' })}
              >
                ○ ライト
              </button>
            </div>
          </div>

          <div className={styles.shortcutSection}>
            <div className={styles.shortcutLabel}>ランダム再生ショートカット</div>
            {bindRows.map(({ key, label, value }) => (
              <div key={key} className={styles.shortcutRow}>
                <span className={styles.shortcutName}>{label}</span>
                <div className={styles.keyGroup}>
                  {value && (
                    <>
                      <span className={styles.keyBadge}>{value}</span>
                      <button className={styles.clearBtn} onClick={() => clearBind(key)} title="クリア">×</button>
                    </>
                  )}
                  <button
                    className={`${styles.recordBtn} ${recording === key ? styles.recordBtnActive : ''}`}
                    onClick={() => setRecording((r) => (r === key ? null : key))}
                  >
                    {recording === key ? 'キー入力待ち...' : value ? '変更' : 'キーを記録'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.dangerZone}>
            <div className={styles.dangerLabel}>データ管理</div>

            <div className={styles.dangerRow}>
              <span className={styles.dangerDesc}>全MP3ファイルを削除</span>
              {confirmClearMp3s ? (
                <div className={styles.confirmRow}>
                  <button className={styles.confirmYes} onClick={handleClearAllMp3s}>削除する</button>
                  <button className={styles.confirmNo} onClick={() => setConfirmClearMp3s(false)}>キャンセル</button>
                </div>
              ) : (
                <button className={styles.dangerBtn} onClick={() => setConfirmClearMp3s(true)}>削除</button>
              )}
            </div>

            <div className={styles.dangerRow}>
              <span className={styles.dangerDesc}>全プリセットを削除</span>
              {confirmClearPresets ? (
                <div className={styles.confirmRow}>
                  <button className={styles.confirmYes} onClick={handleClearAllPresets}>削除する</button>
                  <button className={styles.confirmNo} onClick={() => setConfirmClearPresets(false)}>キャンセル</button>
                </div>
              ) : (
                <button className={styles.dangerBtn} onClick={() => setConfirmClearPresets(true)}>削除</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
