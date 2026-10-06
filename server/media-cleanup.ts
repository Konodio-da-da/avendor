import { deleteObject, isR2Configured } from './r2.js'
import { findExpiredPendingMedia, markMediaFailed, type MediaRecord } from './media.js'

export interface CleanupResult {
  scanned: number
  deleted: number
  failed: number
  skipped: number
  errors: Array<{ mediaId: string; message: string }>
}

/**
 * Removes abandoned pending media from R2 and marks the Firestore records failed.
 * This function is intentionally callable by a scheduler later; the HTTP endpoint
 * is only an operational trigger and does not itself provide scheduling.
 */
export async function cleanupExpiredPendingMedia(olderThanMs: number, limit = 100): Promise<CleanupResult> {
  if (!isR2Configured()) throw new Error('Cloudflare R2 not configured')
  if (!Number.isFinite(olderThanMs) || olderThanMs < 60_000) throw new Error('Cleanup age must be at least 60 seconds')
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Cleanup limit must be between 1 and 500')

  const records = await findExpiredPendingMedia(olderThanMs, limit)
  const selected = records
  const result: CleanupResult = { scanned: selected.length, deleted: 0, failed: 0, skipped: 0, errors: [] }

  for (const media of selected) {
    try {
      await deleteObject(media.objectKey)
      await markMediaFailed(media.id)
      result.deleted += 1
      result.failed += 1
    } catch (error) {
      result.errors.push({
        mediaId: media.id,
        message: error instanceof Error ? error.message : 'Unknown cleanup error',
      })
    }
  }

  return result
}
