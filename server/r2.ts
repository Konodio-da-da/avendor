import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from './config.js'
import { randomUUID } from 'crypto'

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'application/pdf',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024

const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/avif': ['avif'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'application/pdf': ['pdf'],
}

const OBJECT_KEY_PATTERN = /^(product|vendor)\/([^/]+)\/([0-9a-f-]{36})\.([a-z0-9]+)$/i

function getS3Client(): S3Client | null {
  if (!config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY || !config.R2_ENDPOINT || !config.R2_BUCKET) {
    return null
  }
  return new S3Client({
    region: config.R2_REGION ?? 'auto',
    endpoint: config.R2_ENDPOINT,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  })
}

export function isR2Configured(): boolean {
  return getS3Client() !== null
}

export function validateFileType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType)
}

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE
}

export function validateFileExtension(filename: string, mimeType: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase()
  return Boolean(extension && MIME_TO_EXTENSIONS[mimeType]?.includes(extension))
}

export function parseObjectKey(objectKey: string): { type: 'product' | 'vendor'; vendorId: string } | null {
  const match = OBJECT_KEY_PATTERN.exec(objectKey)
  if (!match) return null
  return { type: match[1] as 'product' | 'vendor', vendorId: match[2] }
}

export function canAccessObjectKey(
  objectKey: string,
  user: { role: string; vendorId?: string },
): boolean {
  if (['admin', 'super_admin'].includes(user.role)) return parseObjectKey(objectKey) !== null
  if (!['vendor', 'vendor_staff'].includes(user.role)) return false
  const parsed = parseObjectKey(objectKey)
  return Boolean(parsed && user.vendorId && parsed.vendorId === user.vendorId)
}

export function generateObjectKey(vendorId: string, type: 'product' | 'vendor', filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin'
  const uuid = randomUUID()
  return `${type}/${vendorId}/${uuid}.${ext}`
}

export interface SignedUploadUrl {
  uploadUrl: string
  objectKey: string
  expiresAt: string
  headers: Record<string, string>
}

export async function createSignedUploadUrl(
  vendorId: string,
  type: 'product' | 'vendor',
  filename: string,
  mimeType: string,
  size: number,
  ttlSeconds = 3600
): Promise<SignedUploadUrl> {
  const client = getS3Client()
  if (!client) {
    throw new Error('Cloudflare R2 not configured')
  }
  if (!validateFileType(mimeType)) {
    throw new Error(`File type ${mimeType} not allowed`)
  }
  if (!validateFileSize(size)) {
    throw new Error(`File size ${size} exceeds limit of ${MAX_FILE_SIZE} bytes`)
  }
  if (!validateFileExtension(filename, mimeType)) {
    throw new Error(`File extension does not match MIME type ${mimeType}`)
  }

  const objectKey = generateObjectKey(vendorId, type, filename)
  const command = new PutObjectCommand({
    Bucket: config.R2_BUCKET!,
    Key: objectKey,
    ContentType: mimeType,
    ContentLength: size,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: ttlSeconds })
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

  return {
    uploadUrl,
    objectKey,
    expiresAt,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(size),
    },
  }
}


export function createPublicObjectUrl(objectKey: string): string | null {
  if (!config.R2_PUBLIC_BASE_URL || !parseObjectKey(objectKey)) return null
  const base = config.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')
  return `${base}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
}

export interface SignedDownloadUrl {
  downloadUrl: string
  objectKey: string
  expiresAt: string
}

export async function createSignedDownloadUrl(
  objectKey: string,
  ttlSeconds = 3600
): Promise<SignedDownloadUrl> {
  const client = getS3Client()
  if (!client) {
    throw new Error('Cloudflare R2 not configured')
  }

  const command = new GetObjectCommand({
    Bucket: config.R2_BUCKET!,
    Key: objectKey,
  })

  const downloadUrl = await getSignedUrl(client, command, { expiresIn: ttlSeconds })
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

  return {
    downloadUrl,
    objectKey,
    expiresAt,
  }
}

export interface ObjectMetadata {
  objectKey: string
  contentType: string
  contentLength: number
}

export async function headObject(objectKey: string): Promise<ObjectMetadata> {
  const client = getS3Client()
  if (!client) {
    throw new Error('Cloudflare R2 not configured')
  }

  const command = new HeadObjectCommand({
    Bucket: config.R2_BUCKET!,
    Key: objectKey,
  })
  const result = await client.send(command)

  if (!result.ContentLength || result.ContentLength <= 0) {
    throw new Error('Uploaded object is empty or missing its size metadata')
  }

  return {
    objectKey,
    contentType: result.ContentType ?? 'application/octet-stream',
    contentLength: result.ContentLength,
  }
}

export async function deleteObject(objectKey: string): Promise<void> {
  const client = getS3Client()
  if (!client) {
    throw new Error('Cloudflare R2 not configured')
  }

  const command = new DeleteObjectCommand({
    Bucket: config.R2_BUCKET!,
    Key: objectKey,
  })

  await client.send(command)
}