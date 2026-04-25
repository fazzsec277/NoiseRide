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

function semitoneLabel(v: number): string {
  return (v > 0 ? '+' : '') + v + ' st'
}

function dbLabel(v: number): string {
  return (v > 0 ? '+' : '') + v + ' dB'
}

interface SliderRowProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  valueLabel: string
  onChange: (v: number) => void
}

function SliderRow({ label, min, max, step, value, valueLabel, onChange }: SliderRowProps): JSX.Element {
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <div className={styles.sliderGroup}>
        <span className={styles.pitchEdge}>{min > 0 ? `+${min}` : min}</span>
        <input
          type="range"
          className={styles.slider}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className={styles.pitchEdge}>{max > 0 ? `+${max}` : max}</span>
        <span className={styles.sliderValue}>{valueLabel}</span>
      </div>
    </div>
  )
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

  const clearBind = (): void => updateSettings({ micPushToKeyBind: '' })

  return (
    <div className={styles.container}>

      {/* ── Push to Key ── */}
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
              {settings.micPushToKeyBind && (
                <>
                  <span className={styles.keyBadge}>{settings.micPushToKeyBind}</span>
                  <button className={styles.clearBtn} onClick={clearBind} title="クリア">×</button>
                </>
              )}
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

      {/* ── Pitch / Formant ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ピッチ・フォルマント</h2>

        <SliderRow
          label="ピッチ"
          min={-12} max={12} step={1}
          value={settings.micPitchSemitones}
          valueLabel={semitoneLabel(settings.micPitchSemitones)}
          onChange={(v) => updateSettings({ micPitchSemitones: v })}
        />

        <SliderRow
          label="フォルマント"
          min={-12} max={12} step={1}
          value={settings.micFormantSemitones}
          valueLabel={semitoneLabel(settings.micFormantSemitones)}
          onChange={(v) => updateSettings({ micFormantSemitones: v })}
        />
      </section>

      {/* ── EQ ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>EQ</h2>

        <SliderRow
          label="Low"
          min={-12} max={12} step={1}
          value={settings.micEqLow}
          valueLabel={dbLabel(settings.micEqLow)}
          onChange={(v) => updateSettings({ micEqLow: v })}
        />

        <SliderRow
          label="Mid"
          min={-12} max={12} step={1}
          value={settings.micEqMid}
          valueLabel={dbLabel(settings.micEqMid)}
          onChange={(v) => updateSettings({ micEqMid: v })}
        />

        <SliderRow
          label="High"
          min={-12} max={12} step={1}
          value={settings.micEqHigh}
          valueLabel={dbLabel(settings.micEqHigh)}
          onChange={(v) => updateSettings({ micEqHigh: v })}
        />
      </section>

      {/* ── Distortion ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ディストーション</h2>

        <div className={styles.row}>
          <label className={styles.label}>有効</label>
          <button
            className={`${styles.modeBtn} ${settings.micDistortionEnabled ? styles.modeBtnActive : ''}`}
            onClick={() => updateSettings({ micDistortionEnabled: !settings.micDistortionEnabled })}
          >
            {settings.micDistortionEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {settings.micDistortionEnabled && (
          <>
            <SliderRow
              label="Drive"
              min={0} max={100} step={1}
              value={settings.micDistortionDrive}
              valueLabel={`${settings.micDistortionDrive} %`}
              onChange={(v) => updateSettings({ micDistortionDrive: v })}
            />
            <SliderRow
              label="Mix"
              min={0} max={100} step={1}
              value={settings.micDistortionMix}
              valueLabel={`${settings.micDistortionMix} %`}
              onChange={(v) => updateSettings({ micDistortionMix: v })}
            />
            <SliderRow
              label="Tone"
              min={0} max={100} step={1}
              value={settings.micDistortionTone}
              valueLabel={`${settings.micDistortionTone} %`}
              onChange={(v) => updateSettings({ micDistortionTone: v })}
            />
          </>
        )}
      </section>

      {/* ── Compressor ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>コンプレッサー</h2>

        <div className={styles.row}>
          <label className={styles.label}>有効</label>
          <button
            className={`${styles.modeBtn} ${settings.micCompressorEnabled ? styles.modeBtnActive : ''}`}
            onClick={() => updateSettings({ micCompressorEnabled: !settings.micCompressorEnabled })}
          >
            {settings.micCompressorEnabled ? 'ON' : 'OFF'}
          </button>
          {settings.micCompressorEnabled && (
            <span className={styles.compressorHint}>Threshold -24 dB  /  Ratio 12:1</span>
          )}
        </div>
      </section>

    </div>
  )
}
