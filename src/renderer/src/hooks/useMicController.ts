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

  // アプリ起動時にマイク開始、デバイス変更時に再起動
  useEffect(() => {
    micManager
      .start(settings.micDeviceId, settings.outputDeviceIds, settings.micInputGain)
      .then(() => {
        micManager.setPtkMuted(settings.micPushToKey)
      })
      .catch(() => {})
    return () => micManager.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.micDeviceId, settings.outputDeviceIds.join(',')])

  // PTK ON/OFF 切り替え
  useEffect(() => {
    micManager.setPtkMuted(settings.micPushToKey)
  }, [settings.micPushToKey])

  // PTK キーを Main プロセスに登録
  useEffect(() => {
    if (settings.micPushToKeyBind) {
      window.api.ptk.setKey(settings.micPushToKeyBind).catch(() => {})
    }
  }, [settings.micPushToKeyBind])

  // PTK キー制御（フォーカス中: document events）
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

  // PTK キー制御（非フォーカス時: IPC events）
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
