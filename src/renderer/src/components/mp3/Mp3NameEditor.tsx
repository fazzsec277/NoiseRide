import { useState, useRef, useEffect } from 'react'
import styles from './Mp3NameEditor.module.css'

interface Props {
  name: string
  onSave: (name: string) => void
}

export function Mp3NameEditor({ name, onSave }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(name)
      setTimeout(() => {
        inputRef.current?.select()
      }, 0)
    }
  }, [editing, name])

  const commit = (): void => {
    if (draft.trim()) onSave(draft.trim())
    setEditing(false)
  }

  const cancel = (): void => {
    setDraft(name)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
          e.stopPropagation()
        }}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <span className={styles.displayWrapper}>
      <span
        className={styles.nameText}
        title={name}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      >
        {name}
      </span>
    </span>
  )
}
