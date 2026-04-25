import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { micManager } from '../managers/MicManager'

function matchesBind(e: KeyboardEvent, bind: string): boolean {
  if (!bind) return false
  const parts = bind.split('+')
  const mainKey = parts[parts.length - 1] === 'Space' ? ' ' : parts[parts.length - 1]
  return (
    e.key === mainKey &&
    e.ctrlKey === parts.includes('Ctrl') &&
    e.altKey === parts.includes('Alt') &&
    e.shiftKey === parts.includes('Shift')
  )
}

export function useMicController(): void {
  const settings = useSettingsStore((s) => s.settings)

  // Start mic on mount / restart on device change
  useEffect(() => {
    micManager
      .start(settings.micDeviceId, settings.outputDeviceIds, settings.micInputGain)
      .then(() => {
        micManager.setPtkMuted(settings.micPushToKey)
        micManager.setPitch(settings.micPitchSemitones)
        micManager.setFormant(settings.micFormantSemitones)
        micManager.setEqBand('low', settings.micEqLow)
        micManager.setEqBand('mid', settings.micEqMid)
        micManager.setEqBand('high', settings.micEqHigh)
        micManager.setCompressorEnabled(settings.micCompressorEnabled)
        micManager.setDistortionEnabled(settings.micDistortionEnabled)
        micManager.setDistortionDrive(settings.micDistortionDrive)
        micManager.setDistortionMix(settings.micDistortionMix)
        micManager.setDistortionTone(settings.micDistortionTone)
      })
      .catch(() => {})
    return () => micManager.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.micDeviceId, settings.outputDeviceIds.join(',')])

  // Pitch shift
  useEffect(() => {
    micManager.setPitch(settings.micPitchSemitones)
  }, [settings.micPitchSemitones])

  // Formant shift
  useEffect(() => {
    micManager.setFormant(settings.micFormantSemitones)
  }, [settings.micFormantSemitones])

  // EQ bands
  useEffect(() => {
    micManager.setEqBand('low', settings.micEqLow)
  }, [settings.micEqLow])

  useEffect(() => {
    micManager.setEqBand('mid', settings.micEqMid)
  }, [settings.micEqMid])

  useEffect(() => {
    micManager.setEqBand('high', settings.micEqHigh)
  }, [settings.micEqHigh])

  // Compressor
  useEffect(() => {
    micManager.setCompressorEnabled(settings.micCompressorEnabled)
  }, [settings.micCompressorEnabled])

  // Distortion
  useEffect(() => {
    micManager.setDistortionEnabled(settings.micDistortionEnabled)
  }, [settings.micDistortionEnabled])

  useEffect(() => {
    micManager.setDistortionDrive(settings.micDistortionDrive)
  }, [settings.micDistortionDrive])

  useEffect(() => {
    micManager.setDistortionMix(settings.micDistortionMix)
  }, [settings.micDistortionMix])

  useEffect(() => {
    micManager.setDistortionTone(settings.micDistortionTone)
  }, [settings.micDistortionTone])

  // PTK ON/OFF
  useEffect(() => {
    micManager.setPtkMuted(settings.micPushToKey)
  }, [settings.micPushToKey])

  // PTK keybind → main process
  useEffect(() => {
    if (settings.micPushToKeyBind) {
      window.api.ptk.setKey(settings.micPushToKeyBind).catch(() => {})
    }
  }, [settings.micPushToKeyBind])

  // PTK key capture (focused)
  useEffect(() => {
    if (!settings.micPushToKey || !settings.micPushToKeyBind) return
    const bind = settings.micPushToKeyBind
    const onDown = (e: KeyboardEvent): void => {
      if (matchesBind(e, bind)) micManager.setPtkMuted(false)
    }
    const onUp = (e: KeyboardEvent): void => {
      if (matchesBind(e, bind)) micManager.setPtkMuted(true)
    }
    document.addEventListener('keydown', onDown)
    document.addEventListener('keyup', onUp)
    return () => {
      document.removeEventListener('keydown', onDown)
      document.removeEventListener('keyup', onUp)
    }
  }, [settings.micPushToKey, settings.micPushToKeyBind])

  // PTK key capture (unfocused, IPC)
  useEffect(() => {
    if (!settings.micPushToKey) return
    const offDown = window.api.ptk.onKeyDown(() => micManager.setPtkMuted(false))
    const offUp = window.api.ptk.onKeyUp(() => micManager.setPtkMuted(true))
    return () => {
      offDown()
      offUp()
    }
  }, [settings.micPushToKey])
}
