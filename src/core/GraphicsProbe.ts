import type { GpuSignals } from './AutoQuality';
import { MAX_PIXEL_RATIO } from './DeviceProfile';

type ProbeContext = WebGLRenderingContext | WebGL2RenderingContext;

/**
 * Reads the GPU hints automatic quality needs from a throwaway WebGL context,
 * released at once. Null when the browser cannot create any WebGL context.
 */
export function probeGpu(doc: Document = document): GpuSignals | null {
  try {
    const strict = createContext(doc, true);
    const probe = strict ?? createContext(doc, false);
    if (!probe) return null;
    const { gl, webgl2 } = probe;
    const signals: GpuSignals = {
      webgl2,
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0,
      majorPerformanceCaveat: strict === null,
      renderer: readRenderer(gl),
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return signals;
  } catch {
    return null;
  }
}

/** Physical pixels of the screen at the highest pixel ratio the game renders, or null when unknown. */
export function measureRenderPixels(view: Pick<Window, 'screen' | 'devicePixelRatio'> = window): number | null {
  const width = view.screen?.width ?? 0;
  const height = view.screen?.height ?? 0;
  if (width <= 0 || height <= 0) return null;
  const ratio = Math.min(view.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  return Math.round(width * height * ratio * ratio);
}

function createContext(doc: Document, failIfMajorPerformanceCaveat: boolean): { gl: ProbeContext; webgl2: boolean } | null {
  // A canvas keeps the first context type it was asked for, so each attempt gets its own.
  const attributes: WebGLContextAttributes = { failIfMajorPerformanceCaveat, antialias: false, depth: false };
  const gl2 = doc.createElement('canvas').getContext('webgl2', attributes);
  if (gl2) return { gl: gl2, webgl2: true };
  const gl = doc.createElement('canvas').getContext('webgl', attributes);
  return gl ? { gl, webgl2: false } : null;
}

function readRenderer(gl: ProbeContext): string | null {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const value: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  return typeof value === 'string' && value.length > 0 ? value : null;
}
