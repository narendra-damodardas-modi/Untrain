import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProbeInfo } from './types.ts'

export type ProcResult = {
  code: number
  stdout: string
  stderr: string
}

export function runProc(
  cmd: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function ffmpeg(args: string[]): Promise<ProcResult> {
  const result = await runProc('ffmpeg', ['-y', '-hide_banner', ...args])
  if (result.code !== 0) {
    throw new Error(result.stderr.slice(-4000) || `ffmpeg exited ${result.code}`)
  }
  return result
}

export async function ffprobeJson(file: string): Promise<Record<string, unknown>> {
  const result = await runProc('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file,
  ])
  if (result.code !== 0) {
    throw new Error(result.stderr || `ffprobe exited ${result.code}`)
  }
  return JSON.parse(result.stdout) as Record<string, unknown>
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : fallback
}

function parseFps(rate: unknown): number {
  if (typeof rate !== 'string' || !rate.includes('/')) return num(rate)
  const [a, b] = rate.split('/')
  const den = Number(b)
  return den ? Number(a) / den : 0
}

export async function probe(file: string): Promise<ProbeInfo> {
  const info = await ffprobeJson(file)
  const streams = (info.streams as Array<Record<string, unknown>> | undefined) ?? []
  const format = (info.format as Record<string, unknown> | undefined) ?? {}
  const video = streams.find((s) => s.codec_type === 'video')
  const audio = streams.find((s) => s.codec_type === 'audio')
  const duration = num(format.duration, num(video?.duration))
  return {
    duration,
    width: num(video?.width),
    height: num(video?.height),
    fps: parseFps(video?.avg_frame_rate) || parseFps(video?.r_frame_rate),
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    videoCodec: typeof video?.codec_name === 'string' ? video.codec_name : undefined,
    audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : undefined,
    sizeBytes: num(format.size),
  }
}

export async function sampleRgb(
  file: string,
  time: number,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  const info = await probe(file)
  const tmp = `${file}.frame-${time}.rgb`
  await ffmpeg([
    '-ss',
    String(time),
    '-i',
    file,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    tmp,
  ])
  const raw = await fs.readFile(tmp)
  await fs.unlink(tmp).catch(() => undefined)
  const w = info.width
  const h = info.height
  const cx = Math.max(0, Math.min(w - 1, Math.round(x)))
  const cy = Math.max(0, Math.min(h - 1, Math.round(y)))
  const idx = (cy * w + cx) * 3
  if (raw.length < idx + 3) {
    throw new Error(`frame buffer too small (${raw.length}) for ${w}x${h}`)
  }
  return [raw[idx], raw[idx + 1], raw[idx + 2]]
}

export async function psnrAverage(output: string, reference: string): Promise<number> {
  const result = await runProc('ffmpeg', [
    '-y',
    '-hide_banner',
    '-i',
    output,
    '-i',
    reference,
    '-filter_complex',
    '[0:v][1:v]psnr',
    '-an',
    '-f',
    'null',
    '-',
  ])
  const text = result.stderr
  const match = text.match(/average:([0-9.]+|inf)/i)
  if (!match) {
    throw new Error(`could not parse PSNR\n${text.slice(-1500)}`)
  }
  if (match[1] === 'inf') return 100
  return Number(match[1])
}

export async function extractPng(input: string, time: number, output: string): Promise<void> {
  await ffmpeg([
    '-ss',
    String(time),
    '-i',
    input,
    '-frames:v',
    '1',
    output,
  ])
}

export async function differencePng(a: string, b: string, output: string): Promise<void> {
  await ffmpeg([
    '-i',
    a,
    '-i',
    b,
    '-filter_complex',
    '[0:v][1:v]blend=all_mode=difference,eq=contrast=4,format=yuv420p',
    '-frames:v',
    '1',
    output,
  ])
}

export function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export async function listRelFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(abs)
      else out.push(path.relative(root, abs).split(path.sep).join('/'))
    }
  }
  await walk(root)
  return out.sort()
}
