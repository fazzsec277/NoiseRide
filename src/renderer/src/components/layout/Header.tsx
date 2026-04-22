import { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { audioManager } from '../../managers/AudioManager'
import { micManager } from '../../managers/MicManager'
import styles from './Header.module.css'

interface Props {
  onSettingsClick: () => void
}

export function Header({ onSettingsClick }: Props): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [audioOpen, setAudioOpen] = useState(false)
  const [micOpen, setMicOpen] = useState(false)
  const [masterMuted, setMasterMuted] = useState(false)
  const premuteVolume = useRef(settings.masterVolume)
  const audioDropdownRef = useRef<HTMLDivElement>(null)
  const micDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((all) => {
      setAudioDevices(all.filter((d) => d.kind === 'audiooutput'))
    })
    micManager.enumerateDevices().then(setMicDevices)
  }, [])

  useEffect(() => {
    if (!audioOpen) return
    const handler = (e: MouseEvent): void => {
      if (audioDropdownRef.current && !audioDropdownRef.current.contains(e.target as Node)) {
        setAudioOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [audioOpen])

  useEffect(() => {
    if (!micOpen) return
    const handler = (e: MouseEvent): void => {
      if (micDropdownRef.current && !micDropdownRef.current.contains(e.target as Node)) {
        setMicOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [micOpen])

  const selectedIds = settings.outputDeviceIds ?? []

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const vol = parseFloat(e.target.value)
    if (masterMuted) setMasterMuted(false)
    premuteVolume.current = vol
    updateSettings({ masterVolume: vol })
    audioManager.setMasterVolume(vol)
  }

  const toggleMasterMute = (): void => {
    if (masterMuted) {
      const vol = premuteVolume.current
      updateSettings({ masterVolume: vol })
      audioManager.setMasterVolume(vol)
      setMasterMuted(false)
    } else {
      premuteVolume.current = settings.masterVolume
      updateSettings({ masterVolume: 0 })
      audioManager.setMasterVolume(0)
      setMasterMuted(true)
    }
  }

  const toggleAudioDevice = (deviceId: string): void => {
    const next = selectedIds.includes(deviceId)
      ? selectedIds.filter((id) => id !== deviceId)
      : [...selectedIds, deviceId]
    updateSettings({ outputDeviceIds: next })
    audioManager.setOutputDevices(next)
  }

  const handleMicMuteToggle = (): void => {
    const next = !settings.micMuted
    updateSettings({ micMuted: next })
    micManager.setMuted(next)
  }

  const handleMicGainChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const gain = parseFloat(e.target.value)
    updateSettings({ micInputGain: gain })
    micManager.setGain(gain)
  }

  const handleMicDeviceChange = (deviceId: string): void => {
    updateSettings({ micDeviceId: deviceId })
    setMicOpen(false)
  }

  const getAudioLabel = (): string => {
    if (selectedIds.length === 0) return 'システムデフォルト'
    const first = audioDevices.find((d) => d.deviceId === selectedIds[0])
    const firstName = first?.label || `デバイス (${selectedIds[0].slice(0, 8)})`
    return selectedIds.length === 1 ? firstName : `⊕ ${firstName}`
  }

  const getMicLabel = (): string => {
    if (!settings.micDeviceId) return 'OSデフォルト'
    const dev = micDevices.find((d) => d.deviceId === settings.micDeviceId)
    return dev?.label || `マイク (${settings.micDeviceId.slice(0, 8)})`
  }

  return (
    <header className={styles.header}>
      <div className={styles.title}>
        <span className={styles.icon}>♪</span>
        <span>NoiseRide</span>
      </div>
      <div className={styles.controls}>
        <div className={styles.deviceControls}>
          {/* Row 1: Mic */}
          <span
            className={`${styles.micIcon} ${settings.micMuted ? styles.micIconMuted : ''}`}
            onClick={handleMicMuteToggle}
            title={settings.micMuted ? 'マイクミュート解除' : 'マイクミュート'}
          >
            🎤
          </span>
          <input
            type="range"
            className={styles.deviceSlider}
            min={0}
            max={2}
            step={0.05}
            value={settings.micInputGain}
            onChange={handleMicGainChange}
            title={`マイク入力ゲイン: ${Math.round(settings.micInputGain * 100)}%`}
          />
          <span className={styles.deviceValue}>{Math.round(settings.micInputGain * 100)}%</span>
          <div className={styles.deviceDropdown} ref={micDropdownRef}>
            <button
              className={`${styles.deviceTrigger} ${micOpen ? styles.deviceTriggerOpen : ''}`}
              onClick={() => setMicOpen((o) => !o)}
            >
              <span className={styles.deviceLabel}>{getMicLabel()}</span>
              <span className={styles.deviceCaret}>{micOpen ? '▲' : '▼'}</span>
            </button>
            {micOpen && (
              <div className={styles.deviceMenu}>
                <label className={styles.deviceItem}>
                  <input
                    type="radio"
                    name="micDevice"
                    checked={!settings.micDeviceId}
                    onChange={() => handleMicDeviceChange('')}
                  />
                  <span className={styles.deviceItemLabel}>OSデフォルト</span>
                </label>
                {micDevices.map((d) => (
                  <label key={d.deviceId} className={styles.deviceItem}>
                    <input
                      type="radio"
                      name="micDevice"
                      checked={settings.micDeviceId === d.deviceId}
                      onChange={() => handleMicDeviceChange(d.deviceId)}
                    />
                    <span className={styles.deviceItemLabel}>
                      {d.label || `マイク (${d.deviceId.slice(0, 8)})`}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Row 2: Audio */}
          <span
            className={styles.volumeIcon}
            onClick={toggleMasterMute}
            title={masterMuted ? 'ミュート解除' : 'ミュート'}
          >
            {masterMuted ? '🔇' : '🔊'}
          </span>
          <input
            type="range"
            className={styles.deviceSlider}
            min={0}
            max={1}
            step={0.01}
            value={settings.masterVolume}
            onChange={handleVolumeChange}
            title={`マスター音量: ${Math.round(settings.masterVolume * 100)}%`}
          />
          <span className={styles.deviceValue}>{Math.round(settings.masterVolume * 100)}%</span>
          <div className={styles.deviceDropdown} ref={audioDropdownRef}>
            <button
              className={`${styles.deviceTrigger} ${audioOpen ? styles.deviceTriggerOpen : ''}`}
              onClick={() => setAudioOpen((o) => !o)}
            >
              <span className={styles.deviceLabel}>{getAudioLabel()}</span>
              <span className={styles.deviceCaret}>{audioOpen ? '▲' : '▼'}</span>
            </button>
            {audioOpen && (
              <div className={styles.deviceMenu}>
                {audioDevices.map((d) => {
                  const label = d.label || `デバイス (${d.deviceId.slice(0, 8)})`
                  const checked = selectedIds.includes(d.deviceId)
                  return (
                    <label key={d.deviceId} className={styles.deviceItem}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAudioDevice(d.deviceId)}
                      />
                      <span className={styles.deviceItemLabel}>{label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <button className={styles.settingsBtn} onClick={onSettingsClick} title="設定">
          ⚙
        </button>
      </div>
    </header>
  )
}
