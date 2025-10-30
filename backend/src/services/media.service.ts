import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.util';

const IMAGES_DIR = path.join(__dirname, '../../uploads/images');

export class MediaService {
  static async saveImage(filePath: string, userId: string): Promise<string> {
    try {
      const fileExtension = path.extname(filePath);
      const fileName = `${userId}-${Date.now()}${fileExtension}`;
      const newPath = path.join(IMAGES_DIR, fileName);

      // Resolve and ensure paths are inside the designated images directory
      const resolvedNewPath = path.resolve(newPath);
      const resolvedImagesDir = path.resolve(IMAGES_DIR);
      if (!resolvedNewPath.startsWith(resolvedImagesDir + path.sep) && resolvedNewPath !== resolvedImagesDir) {
        throw new Error('Invalid destination path for image');
      }

      await fs.promises.rename(filePath, resolvedNewPath);

      return resolvedNewPath.split(path.sep).join('/');
    } catch (error) {
      try {
        // Only attempt to unlink a file if it looks like an images filename (basename without path traversal)
        const base = path.basename(filePath);
        if (/^[a-zA-Z0-9._-]+$/.test(base)) {
          const candidate = path.join(IMAGES_DIR, base);
          try {
            await fs.promises.unlink(candidate);
          } catch (e: unknown) {
            // Ignore if file doesn't exist; log unexpected errors
            const error = e as { code?: string };
            if (error?.code && error.code !== 'ENOENT') {
              logger.warn('Failed to unlink temp file after failed save:', String(e));
            }
          }
        } else {
          // If basename contains suspicious characters, do not attempt unlink for safety
          logger.warn(`Skipped unlink of suspicious filename after failed save: ${String(base)}`);
        }
      } catch (unlinkErr) {
        logger.warn('Failed to unlink temp file after failed save:', String(unlinkErr));
      }
      throw new Error(`Failed to save profile picture: ${error}`);
    }
  }

  static async deleteImage(url: string): Promise<void> {
    try {
      // Accept either a filename or a full path; but always delete only by basename inside IMAGES_DIR
      const base = path.basename(url);
      if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
        logger.warn(`Refusing to delete file with suspicious name: ${String(base)}`);
        return;
      }
      const resolved = path.join(IMAGES_DIR, base);
      try {
        await fs.promises.unlink(resolved);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error?.code && error.code !== 'ENOENT') {
          logger.error('Failed to delete old profile picture:', String(err));
        }
      }
    } catch (error) {
      logger.error('Failed to delete old profile picture:', String(error));
    }
  }

  static async deleteAllUserImages(userId: string): Promise<void> {
    try {
      try {
        const files = await fs.promises.readdir(IMAGES_DIR).catch(() => []);
        const userFiles = files.filter(file => file.startsWith(userId + '-'));

        await Promise.all(userFiles.map(file => this.deleteImage(file)));
      } catch (err: unknown) {
        logger.error('Failed to delete user images:', String(err));
      }
    } catch (error) {
      logger.error('Failed to delete user images:', String(error));
    }
  }
}