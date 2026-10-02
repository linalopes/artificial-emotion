/**
 * Server/build-time Cloudinary Admin API helpers.
 * Never import this module from client scripts.
 */

export type GalleryItem =
  | {
      type: 'image';
      src: string;
      alt: string;
      caption?: string;
    }
  | {
      type: 'video';
      src: string;
      poster?: string;
      caption?: string;
      alt?: string;
    };

type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

type FolderMode = 'dynamic' | 'fixed';

type CloudinaryResource = {
  public_id?: string;
  secure_url?: string;
  resource_type?: string;
  format?: string;
  created_at?: string;
  asset_folder?: string;
  folder?: string;
  display_name?: string;
  original_filename?: string;
  filename?: string;
  context?: unknown;
  metadata?: unknown;
};

type CloudinaryListResponse = {
  resources?: CloudinaryResource[];
  next_cursor?: string;
  error?: { message?: string };
};

type CloudinaryConfigResponse = {
  folder_mode?: string;
  settings?: {
    folder_mode?: string;
    folder_decoupling?: boolean;
  };
  error?: { message?: string };
};

const ADMIN_API = 'https://api.cloudinary.com/v1_1';
const MAX_RESULTS = 500;
const REQUEST_TIMEOUT_MS = 20_000;

const SKIP_IMAGE_FORMATS = new Set([
  'pdf',
  'ai',
  'eps',
  'psd',
  'ps',
  'svgz',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'json',
  'xml',
  'html',
  'js',
  'css',
  'csv',
  'zip',
  'gz',
]);

const VIDEO_FORMATS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv']);

const LIST_METADATA = {
  context: 'true',
  metadata: 'true',
};

const CAPTION_KEYS = ['caption', 'title', 'caption_text'];
const ALT_KEYS = ['alt', 'alt_text', 'alttext', 'description'];
const POSTER_KEYS = ['poster', 'poster_url', 'thumbnail'];

let folderModePromise: Promise<FolderMode> | undefined;

function readEnv(
  name: 'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET',
): string | undefined {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const fromProcess = processEnv?.[name]?.trim();
  if (fromProcess) return fromProcess;
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[name];
  return fromMeta?.trim() || undefined;
}

function readCredentials(): CloudinaryCredentials | undefined {
  const cloudName = readEnv('CLOUDINARY_CLOUD_NAME');
  const apiKey = readEnv('CLOUDINARY_API_KEY');
  const apiSecret = readEnv('CLOUDINARY_API_SECRET');
  if (!cloudName || !apiKey || !apiSecret) return undefined;
  return { cloudName, apiKey, apiSecret };
}

export function normalizeGalleryFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, '');
}

function missingCredentialsError(folder: string): Error {
  return new Error(
    `Cloudinary galleryFolder "${folder}" cannot be resolved because Cloudinary credentials are missing.`,
  );
}

function folderNotFoundError(folder: string): Error {
  return new Error(`Cloudinary galleryFolder "${folder}" was not found.`);
}

function apiError(folder: string, message: string): Error {
  return new Error(`Cloudinary galleryFolder "${folder}" could not be resolved: ${message}`);
}

function adminHeaders(credentials: CloudinaryCredentials): HeadersInit {
  const token = btoa(`${credentials.apiKey}:${credentials.apiSecret}`);
  return { Authorization: `Basic ${token}` };
}

async function adminRequest(
  credentials: CloudinaryCredentials,
  path: string,
  search: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${ADMIN_API}/${credentials.cloudName}/${path}`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: adminHeaders(credentials),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => undefined)) as
    | { error?: { message?: string } }
    | undefined;
  const message = payload?.error?.message || response.statusText || `HTTP ${response.status}`;

  if (!response.ok) {
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  return payload;
}

function parseFolderMode(payload: CloudinaryConfigResponse): FolderMode | undefined {
  const mode = payload.settings?.folder_mode ?? payload.folder_mode;
  if (mode === 'dynamic' || mode === 'fixed') return mode;
  if (payload.settings?.folder_decoupling === true) return 'dynamic';
  if (payload.settings?.folder_decoupling === false) return 'fixed';
  return undefined;
}

async function detectFolderMode(credentials: CloudinaryCredentials): Promise<FolderMode> {
  if (!folderModePromise) {
    folderModePromise = (async () => {
      try {
        const payload = (await adminRequest(credentials, 'config', {
          settings: 'true',
        })) as CloudinaryConfigResponse;
        const mode = parseFolderMode(payload);
        if (mode) return mode;
      } catch {
        // Probe below.
      }

      try {
        await adminRequest(credentials, 'resources/by_asset_folder', {
          asset_folder: '__folder-mode-probe__',
          max_results: '1',
        });
        return 'dynamic';
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (
          message.includes('not available') ||
          message.includes('not enabled') ||
          message.includes('invalid') ||
          message.includes('unknown')
        ) {
          return 'fixed';
        }
        return 'dynamic';
      }
    })();
  }

  return folderModePromise;
}

function encodedFolderPath(folder: string): string {
  return folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function folderExists(
  credentials: CloudinaryCredentials,
  folder: string,
): Promise<boolean> {
  try {
    await adminRequest(credentials, `folders/${encodedFolderPath(folder)}`);
    return true;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return false;
    throw error;
  }
}

function isSupportedResource(resource: CloudinaryResource): boolean {
  const format = (resource.format ?? '').toLowerCase();
  if (resource.resource_type === 'image') {
    return !SKIP_IMAGE_FORMATS.has(format);
  }
  if (resource.resource_type === 'video') {
    return format === '' || VIDEO_FORMATS.has(format);
  }
  return false;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return asTrimmedString((value as { value: unknown }).value);
  }
  return undefined;
}

function lowerKeyedStrings(source: unknown): Record<string, string> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const text = asTrimmedString(value);
    if (text) out[key.trim().toLowerCase()] = text;
  }
  return out;
}

function contextFields(resource: CloudinaryResource): Record<string, string> {
  const context = resource.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
  const record = context as Record<string, unknown>;
  const custom = record.custom;
  return {
    ...lowerKeyedStrings(context),
    ...lowerKeyedStrings(custom),
  };
}

function structuredFields(resource: CloudinaryResource): Record<string, string> {
  return lowerKeyedStrings(resource.metadata);
}

function firstField(fields: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (fields[key]) return fields[key];
  }
  return undefined;
}

function isFilenameLike(value: string, resource: CloudinaryResource): boolean {
  const publicId = (resource.public_id ?? '').trim();
  const original = (resource.original_filename ?? resource.filename ?? '').trim();
  const publicBase = publicId.split('/').pop() ?? '';
  if (value === publicId || value === original || value === publicBase) return true;
  if (/\.(webp|jpe?g|png|gif|avif|mp4|webm|mov|m4v|ogv|mkv|svg)$/i.test(value)) return true;
  if (/^IMG[_-]?\d+/i.test(value)) return true;
  return false;
}

function pickCaption(resource: CloudinaryResource): string | undefined {
  const context = contextFields(resource);
  const structured = structuredFields(resource);
  const fromContext = firstField(context, CAPTION_KEYS);
  if (fromContext) return fromContext;
  const fromStructured = firstField(structured, CAPTION_KEYS);
  if (fromStructured) return fromStructured;
  const displayName = asTrimmedString(resource.display_name);
  if (displayName && !isFilenameLike(displayName, resource)) return displayName;
  return undefined;
}

function pickAlt(resource: CloudinaryResource): string {
  const context = contextFields(resource);
  const structured = structuredFields(resource);
  return firstField(context, ALT_KEYS) || firstField(structured, ALT_KEYS) || '';
}

function derivedVideoPoster(src: string): string | undefined {
  try {
    const url = new URL(src);
    if (!url.hostname.includes('cloudinary.com')) return undefined;
    if (!url.pathname.includes('/video/upload/')) return undefined;
    url.pathname = url.pathname
      .replace('/video/upload/', '/video/upload/so_0/')
      .replace(/\.[a-z0-9]+$/i, '.jpg');
    return url.toString();
  } catch {
    return undefined;
  }
}

function pickPoster(resource: CloudinaryResource, src: string): string | undefined {
  const fromContext = firstField(contextFields(resource), POSTER_KEYS);
  if (fromContext) return fromContext;
  return derivedVideoPoster(src);
}

function toGalleryItem(resource: CloudinaryResource): GalleryItem | undefined {
  const src = resource.secure_url?.trim();
  if (!src) return undefined;
  const caption = pickCaption(resource);
  const alt = pickAlt(resource);
  if (resource.resource_type === 'video') {
    return {
      type: 'video',
      src,
      poster: pickPoster(resource, src),
      caption,
      alt: alt || undefined,
    };
  }
  return { type: 'image', src, alt, caption };
}

function createdAtMs(resource: CloudinaryResource): number {
  const value = resource.created_at ? Date.parse(resource.created_at) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

function sortResources(resources: CloudinaryResource[]): CloudinaryResource[] {
  return [...resources].sort((a, b) => {
    const byDate = createdAtMs(a) - createdAtMs(b);
    if (byDate !== 0) return byDate;
    return (a.public_id ?? '').localeCompare(b.public_id ?? '');
  });
}

function inExactFixedFolder(resource: CloudinaryResource, folder: string): boolean {
  const publicId = resource.public_id ?? '';
  const prefix = `${folder}/`;
  if (!publicId.startsWith(prefix)) return false;
  return !publicId.slice(prefix.length).includes('/');
}

async function listPages(
  credentials: CloudinaryCredentials,
  path: string,
  search: Record<string, string>,
): Promise<CloudinaryResource[]> {
  const resources: CloudinaryResource[] = [];
  let cursor: string | undefined;

  do {
    const payload = (await adminRequest(credentials, path, {
      ...search,
      ...(cursor ? { next_cursor: cursor } : {}),
    })) as CloudinaryListResponse;
    if (Array.isArray(payload.resources)) resources.push(...payload.resources);
    cursor = payload.next_cursor || undefined;
  } while (cursor);

  return resources;
}

async function listFolderResources(
  credentials: CloudinaryCredentials,
  folder: string,
  mode: FolderMode,
): Promise<CloudinaryResource[]> {
  if (mode === 'dynamic') {
    return listPages(credentials, 'resources/by_asset_folder', {
      asset_folder: folder,
      max_results: String(MAX_RESULTS),
      ...LIST_METADATA,
    });
  }

  const [images, videos] = await Promise.all([
    listPages(credentials, 'resources/image/upload', {
      prefix: `${folder}/`,
      max_results: String(MAX_RESULTS),
      ...LIST_METADATA,
    }),
    listPages(credentials, 'resources/video/upload', {
      prefix: `${folder}/`,
      max_results: String(MAX_RESULTS),
      ...LIST_METADATA,
    }),
  ]);

  return [...images, ...videos].filter((resource) => inExactFixedFolder(resource, folder));
}

/**
 * Public delivery URLs + gallery fields for supported image/video assets
 * in a Cloudinary folder. Oldest upload first.
 */
export async function getCloudinaryFolderMedia(folder: string): Promise<GalleryItem[]> {
  const name = normalizeGalleryFolder(folder);
  if (!name) {
    throw new Error('Cloudinary galleryFolder is empty.');
  }

  const credentials = readCredentials();
  if (!credentials) throw missingCredentialsError(name);

  try {
    const mode = await detectFolderMode(credentials);
    const resources = await listFolderResources(credentials, name, mode);
    const items = sortResources(resources.filter(isSupportedResource))
      .map(toGalleryItem)
      .filter((item): item is GalleryItem => item !== undefined);

    if (items.length === 0 && !(await folderExists(credentials, name))) {
      throw folderNotFoundError(name);
    }

    return items;
  } catch (error) {
    if (error instanceof Error && /galleryFolder/.test(error.message)) throw error;
    const status = (error as { status?: number }).status;
    if (status === 404) throw folderNotFoundError(name);
    const message = error instanceof Error ? error.message : 'Unknown Cloudinary error';
    throw apiError(name, message);
  }
}

export function mediaIdentity(src: string): string {
  const trimmed = src.trim();
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/v\d+\//, '/').replace(/\.[a-z0-9]+$/i, '');
    return `${url.host}${path}`.toLowerCase();
  } catch {
    return trimmed.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  }
}

/**
 * Folder assets first (already ordered), then unique manual extras.
 * Duplicate identity keeps the Cloudinary folder item — media, caption, alt.
 */
export function mergeGallerySources(
  folderItems: GalleryItem[],
  manualItems: GalleryItem[],
): GalleryItem[] {
  const merged = folderItems.map((item) => ({ ...item }));
  const indexById = new Map(merged.map((item, index) => [mediaIdentity(item.src), index]));

  for (const manual of manualItems) {
    if (!manual.src.trim()) continue;
    const id = mediaIdentity(manual.src);
    if (indexById.has(id)) continue;
    indexById.set(id, merged.length);
    merged.push({ ...manual });
  }

  return merged;
}
