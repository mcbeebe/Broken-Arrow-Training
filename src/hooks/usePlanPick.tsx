import { useRef, useState, type ReactNode } from 'react'
import type { UploadInput } from '../utils/planImport/prepareUpload'
import { FILE_ACCEPT } from '../utils/planImport/pickLabels'

/**
 * What the athlete has picked to upload (initiative 004): a file, a photo or
 * pasted text, and the optional note. Kept apart from `usePlanImport` (the
 * read) and from the fields that show it (`PlanPickFields`), so the Settings
 * sheet and onboarding share one picker, and onboarding can hold the choice
 * while the athlete moves between steps.
 */
export interface PlanPick {
  /** The hidden file and camera inputs. Render them always, wherever the hook
   *  is used, so a "Try another file" button can open them from any screen. */
  inputs: ReactNode
  file: File | null
  pasting: boolean
  pasted: string
  hint: string
  setPasted: (text: string) => void
  setHint: (text: string) => void
  /** Opens the file chooser. */
  openFile: () => void
  /** Opens the camera (the back one, on a phone). */
  openCamera: () => void
  /** Switches to pasting text, dropping any chosen file. */
  choosePaste: () => void
  /** Switches back from pasting to a file. */
  stopPasting: () => void
  /** What would be read now, or null when nothing has been picked. */
  input: UploadInput | null
}

/**
 * The athlete's pick.
 *
 * @param onNewPick called when a new file is chosen, or the camera or paste
 *                  is chosen: whatever was read from the last pick no longer
 *                  applies
 */
export function usePlanPick(onNewPick?: () => void): PlanPick {
  const [file, setFile] = useState<File | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [hint, setHint] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  const picked = (el: HTMLInputElement) => {
    const f = el.files?.[0]
    el.value = ''
    if (!f) return
    setFile(f)
    setPasting(false)
    onNewPick?.()
  }

  const inputs = (
    <>
      <input ref={fileInput} type="file" accept={FILE_ACCEPT} className="hidden" data-testid="plan-file-input"
        onChange={e => picked(e.currentTarget)} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" data-testid="plan-camera-input"
        onChange={e => picked(e.currentTarget)} />
    </>
  )

  const input: UploadInput | null = pasting
    ? (pasted.trim() ? { text: pasted, hint } : null)
    : (file ? { file, hint } : null)

  return {
    inputs, file, pasting, pasted, hint, setPasted, setHint, input,
    openFile: () => fileInput.current?.click(),
    openCamera: () => { onNewPick?.(); cameraInput.current?.click() },
    choosePaste: () => { onNewPick?.(); setFile(null); setPasting(true) },
    stopPasting: () => setPasting(false),
  }
}
