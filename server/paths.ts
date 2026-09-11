import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(here, '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const FIXTURES_DIR = path.join(DATA_DIR, 'fixtures')
export const GOLDEN_DIR = path.join(DATA_DIR, 'golden')
export const RUNS_DIR = path.join(DATA_DIR, 'runs')
export const FONT_FILE =
  '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf'

export const VIDEO_ENCODE = [
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
] as const

export const AUDIO_ENCODE = ['-c:a', 'aac', '-b:a', '128k'] as const

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export function fileUrl(relFromData: string): string {
  return `/files/${relFromData.split(path.sep).join('/')}`
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
