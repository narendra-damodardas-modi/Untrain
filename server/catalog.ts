import type { Task, ToolCall } from './types.ts'

const OUTPUT_RULE =
  'Write the finished video to `output.mp4` at the sandbox root. Use only the provided tools. Inspect with `probe` and `extract_frame` before submitting.'

export const TASKS: Task[] = [
  {
    id: 'trim-head-2s',
    name: 'Trim head to 2s',
    difficulty: 'easy',
    instruction: `inputs/clip.mp4 is a 5.0s 1280x720 30fps clip with a 440Hz tone. Keep only the first 2.0 seconds. Preserve resolution and frame rate.\n\n${OUTPUT_RULE}`,
    inputs: ['red_5s.mp4'],
    solution: [
      {
        tool: 'trim',
        args: { input: 'inputs/clip.mp4', start: 0, end: 2, output: 'output.mp4' },
      },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'duration', path: 'output.mp4', seconds: 2, tolerance: 0.2 },
      { type: 'resolution', path: 'output.mp4', width: 1280, height: 720 },
      { type: 'fps', path: 'output.mp4', fps: 30, tolerance: 0.2 },
      { type: 'has_audio', path: 'output.mp4', value: true },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 20 },
    ],
  },
  {
    id: 'slice-middle',
    name: 'Slice 1.5s–3.5s',
    difficulty: 'easy',
    instruction: `Cut inputs/clip.mp4 from t=1.5s to t=3.5s (inclusive window of 2.0s). Keep 1280x720 @ 30fps.\n\n${OUTPUT_RULE}`,
    inputs: ['red_5s.mp4'],
    solution: [
      {
        tool: 'trim',
        args: { input: 'inputs/clip.mp4', start: 1.5, end: 3.5, output: 'output.mp4' },
      },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'duration', path: 'output.mp4', seconds: 2, tolerance: 0.25 },
      { type: 'resolution', path: 'output.mp4', width: 1280, height: 720 },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 20 },
    ],
  },
  {
    id: 'concat-red-blue',
    name: 'Concat red then blue',
    difficulty: 'medium',
    instruction: `Concatenate inputs/red.mp4 then inputs/blue.mp4 in that order into one video. Result should be ~2.0s. Frame at 0.4s must be red; frame at 1.4s must be blue.\n\n${OUTPUT_RULE}`,
    inputs: ['red_1s.mp4', 'blue_1s.mp4'],
    solution: [
      {
        tool: 'concat',
        args: {
          inputs: ['inputs/red.mp4', 'inputs/blue.mp4'],
          output: 'output.mp4',
        },
      },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'duration', path: 'output.mp4', seconds: 2, tolerance: 0.25 },
      {
        type: 'sample_color',
        path: 'output.mp4',
        time: 0.4,
        x: 640,
        y: 360,
        rgb: [255, 0, 0],
        tolerance: 80,
      },
      {
        type: 'sample_color',
        path: 'output.mp4',
        time: 1.4,
        x: 640,
        y: 360,
        rgb: [0, 0, 255],
        tolerance: 80,
      },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 18 },
    ],
  },
  {
    id: 'mute-audio',
    name: 'Strip audio',
    difficulty: 'easy',
    instruction: `inputs/clip.mp4 has a sine tone. Produce output.mp4 with the same picture but no audio track.\n\n${OUTPUT_RULE}`,
    inputs: ['red_5s.mp4'],
    solution: [
      { tool: 'mute', args: { input: 'inputs/clip.mp4', output: 'output.mp4' } },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'has_audio', path: 'output.mp4', value: false },
      { type: 'duration', path: 'output.mp4', seconds: 5, tolerance: 0.25 },
      { type: 'resolution', path: 'output.mp4', width: 1280, height: 720 },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 20 },
    ],
  },
  {
    id: 'scale-640x360',
    name: 'Scale to 640×360',
    difficulty: 'easy',
    instruction: `Scale inputs/clip.mp4 to exactly 640x360. Keep duration ~5s.\n\n${OUTPUT_RULE}`,
    inputs: ['red_5s.mp4'],
    solution: [
      {
        tool: 'scale',
        args: { input: 'inputs/clip.mp4', width: 640, height: 360, output: 'output.mp4' },
      },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'resolution', path: 'output.mp4', width: 640, height: 360 },
      { type: 'duration', path: 'output.mp4', seconds: 5, tolerance: 0.25 },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 20 },
    ],
  },
  {
    id: 'crop-center',
    name: 'Center crop 640×360',
    difficulty: 'medium',
    instruction: `Center-crop inputs/clip.mp4 from 1280x720 down to 640x360 (crop x=320,y=180).\n\n${OUTPUT_RULE}`,
    inputs: ['red_5s.mp4'],
    solution: [
      {
        tool: 'crop',
        args: {
          input: 'inputs/clip.mp4',
          width: 640,
          height: 360,
          x: 320,
          y: 180,
          output: 'output.mp4',
        },
      },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'resolution', path: 'output.mp4', width: 640, height: 360 },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 20 },
    ],
  },
  {
    id: 'overlay-title',
    name: 'Overlay title card',
    difficulty: 'medium',
    instruction: `Burn the text "HARNESS" onto inputs/clip.mp4, centered, white, font size 72.\n\n${OUTPUT_RULE}`,
    inputs: ['red_5s.mp4'],
    solution: [
      {
        tool: 'overlay_text',
        args: {
          input: 'inputs/clip.mp4',
          text: 'HARNESS',
          x: '(w-text_w)/2',
          y: '(h-text_h)/2',
          fontSize: 72,
          color: 'white',
          output: 'output.mp4',
        },
      },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'duration', path: 'output.mp4', seconds: 5, tolerance: 0.25 },
      { type: 'resolution', path: 'output.mp4', width: 1280, height: 720 },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 16 },
    ],
  },
  {
    id: 'speed-2x',
    name: 'Speed 2×',
    difficulty: 'hard',
    instruction: `Speed up inputs/clip.mp4 by 2x (video and audio). A 4.0s source should become ~2.0s.\n\n${OUTPUT_RULE}`,
    inputs: ['green_4s.mp4'],
    solution: [
      {
        tool: 'set_speed',
        args: { input: 'inputs/clip.mp4', speed: 2, output: 'output.mp4' },
      },
    ],
    checks: [
      { type: 'file_exists', path: 'output.mp4' },
      { type: 'duration', path: 'output.mp4', seconds: 2, tolerance: 0.3 },
      { type: 'has_audio', path: 'output.mp4', value: true },
      { type: 'psnr', path: 'output.mp4', reference: 'golden', minDb: 16 },
    ],
  },
]

export function getTask(id: string): Task {
  const task = TASKS.find((t) => t.id === id)
  if (!task) throw new Error(`unknown task ${id}`)
  return task
}

export const INPUT_ALIASES: Record<string, string> = {
  'red_5s.mp4': 'clip.mp4',
  'green_4s.mp4': 'clip.mp4',
  'red_1s.mp4': 'red.mp4',
  'blue_1s.mp4': 'blue.mp4',
}

export const TOOL_SPECS: Array<{
  name: ToolCall['tool']
  summary: string
  args: Array<{ name: string; type: string; required?: boolean }>
}> = [
  { name: 'list_files', summary: 'List sandbox files', args: [] },
  {
    name: 'probe',
    summary: 'ffprobe duration, size, codecs, audio',
    args: [{ name: 'path', type: 'string', required: true }],
  },
  {
    name: 'extract_frame',
    summary: 'Write a PNG frame at timestamp t',
    args: [
      { name: 'path', type: 'string', required: true },
      { name: 'time', type: 'number', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'trim',
    summary: 'Cut [start, end) into a new mp4',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'start', type: 'number', required: true },
      { name: 'end', type: 'number', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'concat',
    summary: 'Concatenate clips in order',
    args: [
      { name: 'inputs', type: 'string[]', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'overlay_text',
    summary: 'Burn text onto video',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'text', type: 'string', required: true },
      { name: 'output', type: 'string', required: true },
      { name: 'x', type: 'string' },
      { name: 'y', type: 'string' },
      { name: 'fontSize', type: 'number' },
      { name: 'color', type: 'string' },
    ],
  },
  {
    name: 'scale',
    summary: 'Resize video',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'width', type: 'number', required: true },
      { name: 'height', type: 'number', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'crop',
    summary: 'Crop a rectangle',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'width', type: 'number', required: true },
      { name: 'height', type: 'number', required: true },
      { name: 'x', type: 'number', required: true },
      { name: 'y', type: 'number', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'mute',
    summary: 'Drop the audio track',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'set_volume',
    summary: 'Multiply audio volume',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'volume', type: 'number', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'set_fps',
    summary: 'Resample frame rate',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'fps', type: 'number', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
  {
    name: 'set_speed',
    summary: 'Change playback speed (video + audio)',
    args: [
      { name: 'input', type: 'string', required: true },
      { name: 'speed', type: 'number', required: true },
      { name: 'output', type: 'string', required: true },
    ],
  },
]
