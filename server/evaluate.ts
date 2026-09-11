import fs from 'node:fs/promises'
import path from 'node:path'
import type { Check, CheckResult, FramePreview } from './types.ts'
import { differencePng, extractPng, probe, psnrAverage, sampleRgb } from './ffmpeg.ts'
import { fileUrl, pathExists } from './paths.ts'

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

export async function runChecks(
  sandbox: string,
  checks: Check[],
  goldenAbs?: string,
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const check of checks) {
    try {
      results.push(await runOne(sandbox, check, goldenAbs))
    } catch (err) {
      results.push({
        check,
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}

async function runOne(sandbox: string, check: Check, goldenAbs?: string): Promise<CheckResult> {
  if (check.type === 'file_exists') {
    const ok = await pathExists(path.join(sandbox, check.path))
    return { check, passed: ok, detail: ok ? 'present' : 'missing' }
  }
  const abs = path.join(sandbox, check.path)
  if (check.type === 'duration') {
    const info = await probe(abs)
    const delta = Math.abs(info.duration - check.seconds)
    return {
      check,
      passed: delta <= check.tolerance,
      detail: `duration=${info.duration.toFixed(3)}s expected ${check.seconds}±${check.tolerance}`,
    }
  }
  if (check.type === 'resolution') {
    const info = await probe(abs)
    const ok = info.width === check.width && info.height === check.height
    return { check, passed: ok, detail: `${info.width}x${info.height}` }
  }
  if (check.type === 'fps') {
    const info = await probe(abs)
    const delta = Math.abs(info.fps - check.fps)
    return {
      check,
      passed: delta <= check.tolerance,
      detail: `fps=${info.fps.toFixed(3)} expected ${check.fps}±${check.tolerance}`,
    }
  }
  if (check.type === 'has_audio') {
    const info = await probe(abs)
    return {
      check,
      passed: info.hasAudio === check.value,
      detail: info.hasAudio ? 'audio present' : 'no audio',
    }
  }
  if (check.type === 'sample_color') {
    const rgb = await sampleRgb(abs, check.time, check.x, check.y)
    const dist = colorDist(rgb, check.rgb)
    return {
      check,
      passed: dist <= check.tolerance,
      detail: `rgb=(${rgb.join(',')}) expected (${check.rgb.join(',')}) dist=${dist.toFixed(1)}`,
    }
  }
  if (check.type === 'psnr') {
    if (!goldenAbs || !(await pathExists(goldenAbs))) {
      return { check, passed: false, detail: 'golden reference missing' }
    }
    const db = await psnrAverage(abs, goldenAbs)
    return {
      check,
      passed: db >= check.minDb,
      detail: `PSNR=${db.toFixed(2)} dB (min ${check.minDb})`,
    }
  }
  return { check, passed: false, detail: 'unknown check' }
}

export async function buildPreviews(
  runId: string,
  sandbox: string,
  primaryInput: string | undefined,
): Promise<FramePreview[]> {
  const output = path.join(sandbox, 'output.mp4')
  const golden = path.join(sandbox, 'golden.mp4')
  const input = primaryInput ? path.join(sandbox, primaryInput) : undefined
  const previewDir = path.join(sandbox, 'previews')
  await fs.mkdir(previewDir, { recursive: true })
  if (!(await pathExists(output))) return []
  const info = await probe(output)
  const times = [0.15, 0.5, 0.85].map((f) => Number((info.duration * f).toFixed(3)))
  const frames: FramePreview[] = []
  for (const [i, time] of times.entries()) {
    const outPng = path.join(previewDir, `out-${i}.png`)
    const goldPng = path.join(previewDir, `gold-${i}.png`)
    const inPng = path.join(previewDir, `in-${i}.png`)
    const diffPng = path.join(previewDir, `diff-${i}.png`)
    const frame: FramePreview = { time }
    await extractPng(output, time, outPng)
    frame.output = fileUrl(`runs/${runId}/previews/out-${i}.png`)
    if (await pathExists(golden)) {
      const gInfo = await probe(golden)
      const gt = Math.min(time, Math.max(0, gInfo.duration - 0.05))
      await extractPng(golden, gt, goldPng)
      frame.golden = fileUrl(`runs/${runId}/previews/gold-${i}.png`)
      try {
        await differencePng(outPng, goldPng, diffPng)
        frame.diff = fileUrl(`runs/${runId}/previews/diff-${i}.png`)
      } catch {
        // different sizes — skip diff
      }
    }
    if (input && (await pathExists(input))) {
      const iInfo = await probe(input)
      const it = Math.min(time, Math.max(0, iInfo.duration - 0.05))
      await extractPng(input, it, inPng)
      frame.input = fileUrl(`runs/${runId}/previews/in-${i}.png`)
    }
    frames.push(frame)
  }
  return frames
}
