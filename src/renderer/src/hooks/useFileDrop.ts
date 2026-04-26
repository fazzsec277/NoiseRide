import { useEffect } from 'react'
import { useMp3Store } from '../stores/mp3Store'

export function getAudioDuration(filePath: string): Promise<number> {
  return window.api.readFileBuffer(filePath).then((data) => {
    return new Promise<number>((resolve) => {
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      const blob = new Blob([ab], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.src = url
      audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration) }
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(0) }
    })
  }).catch(() => 0)
}

async function addAndLoadDurations(
  filePaths: string[],
  targetPresetId: string | undefined,
  addMp3s: ReturnType<typeof useMp3Store.getState>['addMp3s'],
  setDuration: ReturnType<typeof useMp3Store.getState>['setDuration']
): Promise<void> {
  const newItems = addMp3s(filePaths, targetPresetId)
  for (const item of newItems) {
    const dur = await getAudioDuration(item.filePath)
    if (dur > 0) setDuration(item.id, dur)
  }
}

export function useFileDrop(targetPresetId?: string): void {
  const addMp3s = useMp3Store((s) => s.addMp3s)
  const setDuration = useMp3Store((s) => s.setDuration)

  useEffect(() => {
    // dragover.preventDefault() and drop handling are done in preload/index.ts
    // (Node.js context guarantees f.path access). Here we only:
    //  1. Subscribe to the file drop notification via window.api
    //  2. Manage the drag-over visual overlay

    const offDrop = window.api.onFileDropped((paths) => {
      document.body.classList.remove('drag-over')
      const mp3Paths = paths.filter((p) => p.toLowerCase().endsWith('.mp3'))
      if (mp3Paths.length > 0) {
        addAndLoadDurations(mp3Paths, targetPresetId, addMp3s, setDuration)
      }
    })

    // Visual overlay via CSS class (counter handles nested element enter/leave)
    let dragCounter = 0

    const onDragEnter = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter++
        document.body.classList.add('drag-over')
      }
    }

    const onDragLeave = (): void => {
      dragCounter = Math.max(0, dragCounter - 1)
      if (dragCounter === 0) document.body.classList.remove('drag-over')
    }

    const onDrop = (): void => {
      dragCounter = 0
      document.body.classList.remove('drag-over')
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      offDrop()
      dragCounter = 0
      document.body.classList.remove('drag-over')
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addMp3s, setDuration, targetPresetId])
}
