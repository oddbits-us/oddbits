import type {
  AltTextEntry,
  AltTextManifest,
  AltTextResult,
  LocalAltTextOptions,
} from './types';

const DEFAULT_MODEL = 'Xenova/vit-gpt2-image-captioning';
const DEFAULT_MAX_LENGTH = 180;

type CaptionPipeline = (input: unknown) => Promise<unknown>;

let captionPipelinePromise: Promise<CaptionPipeline> | null = null;
let captionPipelineModel: string | null = null;

function normalizeAltText(raw: string, maxLength: number): string {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const stripped = compact
    .replace(/^an?\s+image\s+of\s+/i, '')
    .replace(/^an?\s+photo(?:graph)?\s+of\s+/i, '')
    .trim();
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

async function getCaptionPipeline(model: string): Promise<CaptionPipeline> {
  if (!captionPipelinePromise || captionPipelineModel !== model) {
    captionPipelineModel = model;
    captionPipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // Force remote model resolution in browser environments so dev servers do not
      // rewrite local "/models/*" lookups to index.html (which breaks JSON parsing).
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.localModelPath = '';
      env.remoteHost = 'https://huggingface.co';
      env.remotePathTemplate = '/{model}/resolve/{revision}/';
      const baseFetch = globalThis.fetch.bind(globalThis);
      env.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const res = await baseFetch(url as RequestInfo | URL, init);
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('text/html')) {
          const requested = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
          throw new Error(`Model fetch returned HTML for "${requested}" (content-type="${contentType}")`);
        }
        return res;
      }) as typeof fetch;
      // Some browser/ORT combinations fail on quantized decoder artifacts for this
      // model; force full-precision weights for stable local caption generation.
      const runner = await pipeline('image-to-text', model, { dtype: 'fp32' });
      return runner as CaptionPipeline;
    })();
  }
  try {
    return await captionPipelinePromise;
  } catch (err) {
    // Let the next call re-initialize instead of holding a rejected promise.
    captionPipelinePromise = null;
    captionPipelineModel = null;
    throw err;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image blob for local captioning.'));
    reader.readAsDataURL(blob);
  });
}

async function generateLocalAltTextFromInput(
  imageInput: unknown,
  options: LocalAltTextOptions = {}
): Promise<AltTextResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const warnings: string[] = [];
  const pipe = await getCaptionPipeline(model);
  const output = await pipe(imageInput);
  let raw = '';
  if (Array.isArray(output)) {
    raw = String((output[0] as { generated_text?: string } | undefined)?.generated_text ?? '').trim();
  } else if (output && typeof output === 'object' && 'generated_text' in (output as object)) {
    raw = String((output as { generated_text?: string }).generated_text ?? '').trim();
  } else if (typeof output === 'string') {
    raw = output.trim();
  }

  if (!raw) {
    warnings.push('Local caption model returned an empty description.');
  }

  const altText = normalizeAltText(
    raw || 'Unlabeled image (local caption unavailable).',
    maxLength
  );

  return {
    altText,
    warnings,
    model,
  };
}

export async function generateLocalAltTextFromBlob(
  blob: Blob,
  options: LocalAltTextOptions = {}
): Promise<AltTextResult> {
  const errors: string[] = [];
  const objectUrl = URL.createObjectURL(blob);
  try {
    try {
      return await generateLocalAltTextFromInput(objectUrl, options);
    } catch (err) {
      errors.push(`object URL input failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const dataUrl = await blobToDataUrl(blob);
      return await generateLocalAltTextFromInput(dataUrl, options);
    } catch (err) {
      errors.push(`data URL input failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    throw new Error(errors.join(' | '));
  } catch (err) {
    const model = options.model ?? DEFAULT_MODEL;
    throw new Error(
      `Local alt-text generation failed for model "${model}". ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function generateLocalAltTextFromPath(
  filePath: string,
  options: LocalAltTextOptions = {}
): Promise<AltTextResult> {
  return await generateLocalAltTextFromInput(filePath, options);
}

export function buildAltTextManifest(entries: AltTextEntry[], model: string): AltTextManifest {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: {
      mode: 'local',
      provider: 'transformersjs',
      model,
    },
    images: entries,
  };
}

export function stringifyAltTextManifest(manifest: AltTextManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
