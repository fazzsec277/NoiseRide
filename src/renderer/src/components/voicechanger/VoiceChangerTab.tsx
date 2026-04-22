import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './VoiceChangerTab.module.css'

function buildAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(e.key === ' ' ? 'Space' : e.key)
  return parts.join('+')
}

export function VoiceChangerTab(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      const acc = buildAccelerator(e)
      updateSettings({ micPushToKeyBind: acc })
      window.api.ptk.setKey(acc).catch(() => {})
      setRecording(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [recording, updateSettings])

  const handlePitchChange = (semitones: number): void => {
    updateSettings({ micPitchSemitones: semitones })
  }

  const clearBind = (): void => {
    updateSettings({ micPushToKeyBind: '' })
  }

  return (
    <div className={styles.container}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Push to Key</h2>

        <div className={styles.row}>
          <label className={styles.label}>モード</label>
          <div className={styles.modeGroup}>
            <button
              className={`${styles.modeBtn} ${!settings.micPushToKey ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micPushToKey: false })}
            >
              常時有効
            </button>
            <button
              className={`${styles.modeBtn} ${settings.micPushToKey ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micPushToKey: true })}
            >
              Push to Key
            </button>
          </div>
        </div>

        {settings.micPushToKey && (
          <div className={styles.row}>
            <label className={styles.label}>キー</label>
            <div className={styles.keyGroup}>
              {settings.micPushToKeyBind ? (
                <>
                  <span className={styles.keyBadge}>{settings.micPushToKeyBind}</span>
                  <button className={styles.clearBtn} onClick={clearBind} title="クリア">×</button>
                </>
              ) : null}
              <button
                className={`${styles.recordBtn} ${recording ? styles.recordBtnActive : ''}`}
                onClick={() => setRecording((r) => !r)}
              >
                {recording ? 'キー入力待ち...' : settings.micPushToKeyBind ? '変更' : 'キーを記録'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>音声加工</h2>

        <div className={styles.row}>
          <label className={`${styles.label} ${styles.labelMuted}`}>
            ピッチ
            <span className={styles.futureTag}>将来実装予定</span>
          </label>
          <div className={styles.sliderGroup}>
            <span className={styles.pitchEdge}>-12</span>
            <input
              type="range"
              className={styles.slider}
              min={-12}
              max={12}
              step={1}
              value={settings.micPitchSemitones}
              onChange={(e) => handlePitchChange(Number(e.target.value))}
              disabled
            />
            <span className={styles.pitchEdge}>+12</span>
            <span className={styles.sliderValue}>
              {settings.micPitchSemitones > 0 ? '+' : ''}
              {settings.micPitchSemitones} st
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
