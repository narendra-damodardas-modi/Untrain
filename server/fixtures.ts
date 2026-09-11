import fs from 'node:fs/promises'
import path from 'node:path'
import { AUDIO_ENCODE, FIXTURES_DIR, GOLDEN_DIR, VIDEO_ENCODE, ensureDir, pathExists } from './paths.ts'
import { ffmpeg } from './ffmpeg.ts'
import { TASKS } from './catalog.ts'
import { execTool } from './tools.ts'

async function colorClip(opts: {
  color: string
  duration: number
  out: string
  freq: number
  w?: number
  h?: number
  fps?: number
}): Promise<void> {
  const w = opts.w ?? 1280
  const h = opts.h ?? 720
  const fps = opts.fps ?? 30
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=${opts.color}:s=${w}x${h}:d=${opts.duration}:r=${fps}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${opts.freq}:duration=${opts.duration}`,
    '-shortest',
    ...VIDEO_ENCODE,
    ...AUDIO_ENCODE,
    opts.out,
  ])
}

export async function ensureFixtures(): Promise<void> {
  await ensureDir(FIXTURES_DIR)
  await ensureDir(GOLDEN_DIR)
  const specs = [
    { name: 'red_5s.mp4', color: 'red', duration: 5, freq: 440 },
    { name: 'green_4s.mp4', color: 'green', duration: 4, freq: 660 },
    { name: 'red_1s.mp4', color: 'red', duration: 1, freq: 440 },
    { name: 'blue_1s.mp4', color: 'blue', duration: 1, freq: 330 },
  ]
  for (const spec of specs) {
    const out = path.join(FIXTURES_DIR, spec.name)
    if (await pathExists(out)) continue
    await colorClip({ ...spec, out })
  }
}

export async function ensureGoldens(): Promise<void> {
  await ensureFixtures()
  for (const task of TASKS) {
    const golden = path.join(GOLDEN_DIR, `${task.id}.mp4`)
    if (await pathExists(golden)) continue
    const tmp = path.join(GOLDEN_DIR, `.tmp-${task.id}`)
    await fs.rm(tmp, { recursive: true, force: true })
    await ensureDir(path.join(tmp, 'inputs'))
    const { INPUT_ALIASES } = await import('./catalog.ts')
    for (const fixture of task.inputs) {
      const alias = INPUT_ALIASES[fixture] ?? fixture
      await fs.copyFile(path.join(FIXTURES_DIR, fixture), path.join(tmp, 'inputs', alias))
    }
    for (const step of task.solution) {
      await execTool(tmp, step.tool, step.args)
    }
    const produced = path.join(tmp, 'output.mp4')
    await fs.copyFile(produced, golden)
    await fs.rm(tmp, { recursive: true, force: true })
  }
}
