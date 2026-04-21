import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { AppData } from '../types'
import { DEFAULT_SETTINGS, GLOBAL_PRESET_ID } from '../types'

function getDataFile(): string {
  return join(app.getPath('userData'), 'data.json')
}

const defaultData = (): AppData => ({
  mp3s: [],
  presets: [{ id: GLOBAL_PRESET_ID, name: '全体', mp3Ids: [] }],
  settings: { ...DEFAULT_SETTINGS }
})

export function loadData(): AppData {
  const DATA_FILE = getDataFile()
  try {
    if (!existsSync(DATA_FILE)) return defaultData()
    const raw = readFileSync(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as AppData
    if (!parsed.presets?.find((p) => p.id === GLOBAL_PRESET_ID)) {
      parsed.presets = [{ id: GLOBAL_PRESET_ID, name: '全体', mp3Ids: [] }, ...parsed.presets]
    }
    // Migrate legacy outputDeviceId → outputDeviceIds
    const s = parsed.settings as Record<string, unknown>
    if (!Array.isArray(s.outputDeviceIds)) {
      const legacy = s.outputDeviceId as string | undefined
      s.outputDeviceIds = legacy ? [legacy] : []
      delete s.outputDeviceId
    }
    return parsed
  } catch {
    return defaultData()
  }
}

export function saveData(data: AppData): void {
  writeFileSync(getDataFile(), JSON.stringify(data, null, 2), 'utf-8')
}
