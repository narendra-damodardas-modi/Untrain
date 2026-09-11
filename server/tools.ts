import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProbeInfo } from './types.ts'
import { AUDIO_ENCODE, FONT_FILE, VIDEO_ENCODE } from './paths.ts'
import { escapeDrawtext, extractPng, ffmpeg, listRelFiles, probe } from './ffmpeg.ts'

export function resolveSafe(root: string, rel: string): string {
  const cleaned = rel.replaceAll('\\', '/').replace(/^\/+/, '')
  const abs = path.resolve(root, cleaned)
  const rootResolved = path.resolve(root)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    throw new Error(`path escapes sandbox: ${rel}`)
  }
  return abs
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || !v) throw new Error(`missing string arg ${key}`)
  return v
}

function num(args: Record<string, unknown>, key: string): number {
  const v = args[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`missing number arg ${key}`)
  return v
}

function optStr(args: Record<string, unknown>, key: string, fallback: string): string {
  const v = args[key]
  return typeof v === 'string' && v ? v : fallback
}

function optNum(args: Record<string, unknown>, key: string, fallback: number): number {
  const v = args[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export async function execTool(
  sandbox: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ stdout: string; stderr: string; data?: unknown }> {
  switch (tool) {
    case 'list_files': {
      const files = await listRelFiles(sandbox)
      return { stdout: files.join('\n'), stderr: '', data: { files } }
    }
    case 'probe': {
      const target = resolveSafe(sandbox, str(args, 'path'))
      const info: ProbeInfo = await probe(target)
      return { stdout: JSON.stringify(info, null, 2), stderr: '', data: info as unknown as Record<string, unknown> }
    }
    case 'extract_frame': {
      const input = resolveSafe(sandbox, str(args, 'path'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const time = num(args, 'time')
      await extractPng(input, time, output)
      return { stdout: `wrote ${str(args, 'output')}`, stderr: '', data: { output: str(args, 'output') } }
    }
    case 'trim': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      const start = num(args, 'start')
      const end = num(args, 'end')
      if (end <= start) throw new Error('end must be greater than start')
      await fs.mkdir(path.dirname(output), { recursive: true })
      const result = await ffmpeg([
        '-ss',
        String(start),
        '-to',
        String(end),
        '-i',
        input,
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        output,
      ])
      return { stdout: `trim ${start}-${end} -> ${str(args, 'output')}`, stderr: result.stderr.slice(-500) }
    }
    case 'concat': {
      const inputsArg = args.inputs
      if (!Array.isArray(inputsArg) || inputsArg.some((x) => typeof x !== 'string')) {
        throw new Error('inputs must be string[]')
      }
      const files = inputsArg.map((p) => resolveSafe(sandbox, p))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const n = files.length
      if (n < 2) throw new Error('concat needs at least 2 inputs')
      const probes = await Promise.all(files.map((f) => probe(f)))
      const hasAudio = probes.every((p) => p.hasAudio)
      const inputArgs = files.flatMap((f) => ['-i', f])
      const labels = files
        .map((_, i) => (hasAudio ? `[${i}:v][${i}:a]` : `[${i}:v]`))
        .join('')
      const filter = hasAudio
        ? `${labels}concat=n=${n}:v=1:a=1[v][a]`
        : `${labels}concat=n=${n}:v=1:a=0[v]`
      const map = hasAudio ? ['-map', '[v]', '-map', '[a]', ...AUDIO_ENCODE] : ['-map', '[v]']
      const result = await ffmpeg([
        ...inputArgs,
        '-filter_complex',
        filter,
        ...map,
        ...VIDEO_ENCODE,
        output,
      ])
      return { stdout: `concat ${n} clips -> ${str(args, 'output')}`, stderr: result.stderr.slice(-500) }
    }
    case 'overlay_text': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const text = escapeDrawtext(str(args, 'text'))
      const x = optStr(args, 'x', '(w-text_w)/2')
      const y = optStr(args, 'y', '(h-text_h)/2')
      const fontSize = optNum(args, 'fontSize', 64)
      const color = optStr(args, 'color', 'white')
      const vf = `drawtext=fontfile=${FONT_FILE}:text='${text}':fontsize=${fontSize}:fontcolor=${color}:x=${x}:y=${y}`
      const result = await ffmpeg(['-i', input, '-vf', vf, ...VIDEO_ENCODE, ...AUDIO_ENCODE, output])
      return { stdout: `overlay_text -> ${str(args, 'output')}`, stderr: result.stderr.slice(-500) }
    }
    case 'scale': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const w = num(args, 'width')
      const h = num(args, 'height')
      const result = await ffmpeg([
        '-i',
        input,
        '-vf',
        `scale=${w}:${h}`,
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        output,
      ])
      return { stdout: `scale ${w}x${h}`, stderr: result.stderr.slice(-500) }
    }
    case 'crop': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const w = num(args, 'width')
      const h = num(args, 'height')
      const x = num(args, 'x')
      const y = num(args, 'y')
      const result = await ffmpeg([
        '-i',
        input,
        '-vf',
        `crop=${w}:${h}:${x}:${y}`,
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        output,
      ])
      return { stdout: `crop ${w}x${h}+${x}+${y}`, stderr: result.stderr.slice(-500) }
    }
    case 'mute': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const result = await ffmpeg(['-i', input, ...VIDEO_ENCODE, '-an', output])
      return { stdout: `muted -> ${str(args, 'output')}`, stderr: result.stderr.slice(-500) }
    }
    case 'set_volume': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const volume = num(args, 'volume')
      const result = await ffmpeg([
        '-i',
        input,
        '-af',
        `volume=${volume}`,
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        output,
      ])
      return { stdout: `volume x${volume}`, stderr: result.stderr.slice(-500) }
    }
    case 'set_fps': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const fps = num(args, 'fps')
      const result = await ffmpeg([
        '-i',
        input,
        '-vf',
        `fps=${fps}`,
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        output,
      ])
      return { stdout: `fps ${fps}`, stderr: result.stderr.slice(-500) }
    }
    case 'set_speed': {
      const input = resolveSafe(sandbox, str(args, 'input'))
      const output = resolveSafe(sandbox, str(args, 'output'))
      await fs.mkdir(path.dirname(output), { recursive: true })
      const speed = num(args, 'speed')
      if (speed <= 0 || speed > 2) throw new Error('speed must be in (0, 2]')
      const info = await probe(input)
      const setpts = `setpts=PTS/${speed}`
      const atempo = `atempo=${speed}`
      const result = info.hasAudio
        ? await ffmpeg([
            '-i',
            input,
            '-filter_complex',
            `[0:v]${setpts}[v];[0:a]${atempo}[a]`,
            '-map',
            '[v]',
            '-map',
            '[a]',
            ...VIDEO_ENCODE,
            ...AUDIO_ENCODE,
            output,
          ])
        : await ffmpeg(['-i', input, '-vf', setpts, ...VIDEO_ENCODE, output])
      return { stdout: `speed ${speed}x`, stderr: result.stderr.slice(-500) }
    }
    default:
      throw new Error(`unknown tool ${tool}`)
  }
}
