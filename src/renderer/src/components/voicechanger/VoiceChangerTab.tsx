import { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { micManager } from '../../managers/MicManager'
import styles from './VoiceChangerTab.module.css'

export function VoiceChangerTab(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const [isActive, setIsActive] = useState(false)
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [level, setLevel] = useState(0)
  const rafId = useRef(0)

  useEffect(() => {
    micManager.enumerateDevices().then(setMicDevices)
  }, [])

  // 出力デバイス変更時にマイクを再接続
  useEffect(() => {
    if (!isActive) return
    micManager.stop()
    micManager
      .start(settings.micDeviceId, settings.outputDeviceIds, settings.micInputGain)
      .catch(() => setIsActive(false))
  }, [settings.outputDeviceIds])

  // 音量メーター rAF ループ
  useEffect(() => {
    if (!isActive) {
      setLevel(0)
      return
    }
    const tick = (): void => {
      const analyser = micManager.getAnalyser()
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteTimeDomainData(data)
        const peak = Math.max(...Array.from(data).map((v) => Math.abs(v - 128))) / 128
        setLevel(peak)
      }
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [isActive])

  const handleToggleActive = async (): Promise<void> => {
    if (isActive) {
      micManager.stop()
      setIsActive(false)
    } else {
      try {
        await micManager.start(settings.micDeviceId, settings.outputDeviceIds, settings.micInputGain)
        setIsActive(true)
      } catch {
        setIsActive(false)
      }
    }
  }

  const handleMicDeviceChange = (deviceId: string): void => {
    updateSettings({ micDeviceId: deviceId })
    if (isActive) {
      micManager.stop()
      micManager
        .start(deviceId, settings.outputDeviceIds, settings.micInputGain)
        .catch(() => setIsActive(false))
    }
  }

  const handleGainChange = (gain: number): void => {
    updateSettings({ micInputGain: gain })
    micManager.setGain(gain)
  }

  const handleMuteToggle = (): void => {
    const next = !settings.micMuted
    updateSettings({ micMuted: next })
    micManager.setMuted(next)
  }

  const handlePitchChange = (semitones: number): void => {
    updateSettings({ micPitchSemitones: semitones })
    micManager.setPitch(semitones)
  }

  const levelPct = Math.min(level * 100, 100)

  return (
    <div className={styles.container}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>マイク入力</h2>

        <div className={styles.row}>
          <label className={styles.label}>デバイス</label>
          <select
            className={styles.select}
            value={settings.micDeviceId}
            onChange={(e) => handleMicDeviceChange(e.target.value)}
          >
            <option value="">OSデフォルト</option>
            {micDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `マイク ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <label className={styles.label}>入力ゲイン</label>
          <div className={styles.sliderGroup}>
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={2}
              step={0.05}
              value={settings.micInputGain}
              onChange={(e) => handleGainChange(Number(e.target.value))}
            />
            <span className={styles.sliderValue}>
              {Math.round(settings.micInputGain * 100)}%
            </span>
          </div>
        </div>

        <div className={styles.row}>
          <label className={styles.label}>入力レベル</label>
          <div className={styles.levelMeter}>
            <div className={styles.levelFill} style={{ width: `${levelPct}%` }} />
          </div>
        </div>

        <div className={styles.btnRow}>
          <button
            className={`${styles.startBtn} ${isActive ? styles.startBtnActive : ''}`}
            onClick={handleToggleActive}
          >
            {isActive ? '⏹ 停止' : '🎤 開始'}
          </button>
          <button
            className={`${styles.muteBtn} ${settings.micMuted ? styles.muteBtnOn : ''}`}
            onClick={handleMuteToggle}
            disabled={!isActive}
          >
            {settings.micMuted ? '🔇 ミュート中' : '🔊 ミュート'}
          </button>
        </div>
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
