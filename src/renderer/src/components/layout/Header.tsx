import { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { audioManager } from '../../managers/AudioManager'
import styles from './Header.module.css'

interface Props {
  onSettingsClick: () => void
}

export function Header({ onSettingsClick }: Props): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const premuteVolume = useRef(settings.masterVolume)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((all) => {
      setDevices(all.filter((d) => d.kind === 'audiooutput'))
    })
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedIds = settings.outputDeviceIds ?? []

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const vol = parseFloat(e.target.value)
    if (muted) setMuted(false)
    premuteVolume.current = vol
    updateSettings({ masterVolume: vol })
    audioManager.setMasterVolume(vol)
  }

  const toggleMute = (): void => {
    if (muted) {
      const vol = premuteVolume.current
      updateSettings({ masterVolume: vol })
      audioManager.setMasterVolume(vol)
      setMuted(false)
    } else {
      premuteVolume.current = settings.masterVolume
      updateSettings({ masterVolume: 0 })
      audioManager.setMasterVolume(0)
      setMuted(true)
    }
  }

  const toggleDevice = (deviceId: string): void => {
    let next: string[]
    if (selectedIds.includes(deviceId)) {
      next = selectedIds.filter((id) => id !== deviceId)
    } else {
      next = [...selectedIds, deviceId]
    }
    updateSettings({ outputDeviceIds: next })
    audioManager.setOutputDevices(next)
  }

  const getLabel = (): string => {
    if (selectedIds.length === 0) return 'システムデフォルト'
    const first = devices.find((d) => d.deviceId === selectedIds[0])
    const firstName = first?.label || `デバイス (${selectedIds[0].slice(0, 8)})`
    if (selectedIds.length === 1) return firstName
    return `⊕ ${firstName}`
  }

  return (
    <header className={styles.header}>
      <div className={styles.title}>
        <span className={styles.icon}>♪</span>
        <span>NoiseRide</span>
      </div>
      <div className={styles.controls}>
        <div className={styles.volumeControl}>
          <span className={styles.volumeIcon} onClick={toggleMute} title={muted ? 'ミュート解除' : 'ミュート'}>{muted ? '🔇' : '🔊'}</span>
          <input
            type="range"
            className={styles.volumeSlider}
            min={0}
            max={1}
            step={0.01}
            value={settings.masterVolume}
            onChange={handleVolumeChange}
            title={`マスター音量: ${Math.round(settings.masterVolume * 100)}%`}
          />
          <span className={styles.volumeValue}>{Math.round(settings.masterVolume * 100)}%</span>
        </div>
        {devices.length > 0 && (
          <div className={styles.deviceDropdown} ref={dropdownRef}>
            <button
              className={`${styles.deviceTrigger} ${open ? styles.deviceTriggerOpen : ''}`}
              onClick={() => setOpen((o) => !o)}
            >
              <span className={styles.deviceLabel}>{getLabel()}</span>
              <span className={styles.deviceCaret}>{open ? '▲' : '▼'}</span>
            </button>
            {open && (
              <div className={styles.deviceMenu}>
                {devices.map((d) => {
                  const label = d.label || `デバイス (${d.deviceId.slice(0, 8)})`
                  const checked = selectedIds.includes(d.deviceId)
                  return (
                    <label key={d.deviceId} className={styles.deviceItem}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDevice(d.deviceId)}
                      />
                      <span className={styles.deviceItemLabel}>{label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <button className={styles.settingsBtn} onClick={onSettingsClick} title="設定">
          ⚙
        </button>
      </div>
    </header>
  )
}
