import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';

// Set FFmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

interface CompressionResult {
  originalPath: string;
  compressedPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number; // percentage saved
  compressionTime: number; // milliseconds
  fileType: string;
  mimeType: string;
  success: boolean;
  error?: string;
}

export class CompressionService {
  private static readonly TEMP_DIR = path.join(process.cwd(), 'temp');
  private static readonly COMPRESSION_TIMEOUT = 300000; // 5 minutes

  /**
   * Initialize temp directory
   */
  static initializeTempDir(): void {
    if (!fs.existsSync(this.TEMP_DIR)) {
      fs.mkdirSync(this.TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Detect file type from MIME type
   */
  static detectFileType(mimeType: string): 'VIDEO' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' {
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    return 'DOCUMENT';
  }

  /**
   * Get compression recommendations based on file type
   */
  private static getCompressionStrategy(fileType: string, mimeType: string) {
    switch (fileType) {
      case 'VIDEO':
        return {
          type: 'VIDEO',
          description: 'Video compression using H.265 codec',
          inputFormat: this.getVideoFormat(mimeType),
          outputFormat: 'mp4',
          estimatedReduction: '40-50%'
        };
      case 'IMAGE':
        return {
          type: 'IMAGE',
          description: 'Image compression to WebP format',
          inputFormat: this.getImageFormat(mimeType),
          outputFormat: 'webp',
          estimatedReduction: '25-35%'
        };
      case 'AUDIO':
        return {
          type: 'AUDIO',
          description: 'Audio compression using Opus codec',
          inputFormat: this.getAudioFormat(mimeType),
          outputFormat: 'opus',
          estimatedReduction: '30-40%'
        };
      default:
        return {
          type: 'DOCUMENT',
          description: 'Documents are already optimized',
          inputFormat: mimeType,
          outputFormat: mimeType,
          estimatedReduction: '0-5%'
        };
    }
  }

  /**
   * Get video format details
   */
  private static getVideoFormat(mimeType: string): string {
    const formats: { [key: string]: string } = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/avi': 'avi',
      'video/x-avi': 'avi',
      'video/x-msvideo': 'avi'
    };
    return formats[mimeType] || 'mp4';
  }

  /**
   * Get image format details
   */
  private static getImageFormat(mimeType: string): string {
    const formats: { [key: string]: string } = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    return formats[mimeType] || 'jpeg';
  }

  /**
   * Get audio format details
   */
  private static getAudioFormat(mimeType: string): string {
    const formats: { [key: string]: string } = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav'
    };
    return formats[mimeType] || 'mp3';
  }

  /**
   * Compress image file using Sharp
   */
  private static async compressImage(
    inputPath: string,
    outputPath: string,
    mimeType: string
  ): Promise<CompressionResult> {
    const startTime = Date.now();
    const stats = fs.statSync(inputPath);
    const originalSize = stats.size;

    try {
      console.log(`📸 Starting image compression: ${path.basename(inputPath)}`);

      const image = sharp(inputPath);

      // Convert to WebP for better compression or keep original format
      if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        await image
          .webp({ quality: 95, alphaQuality: 95 })
          .toFile(outputPath);
      } else if (mimeType === 'image/gif') {
        // GIFs are already optimized, just copy as-is
        fs.copyFileSync(inputPath, outputPath);
      } else {
        // Keep original format but optimize
        await image.toFile(outputPath);
      }

      const compressedStats = fs.statSync(outputPath);
      const compressedSize = compressedStats.size;
      const compressionTime = Date.now() - startTime;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      console.log(`✅ Image compressed successfully:`);
      console.log(`   Original: ${this.formatBytes(originalSize)}`);
      console.log(`   Compressed: ${this.formatBytes(compressedSize)}`);
      console.log(`   Saved: ${compressionRatio.toFixed(2)}%`);

      return {
        originalPath: inputPath,
        compressedPath: outputPath,
        originalSize,
        compressedSize,
        compressionRatio: Math.round(compressionRatio),
        compressionTime,
        fileType: 'IMAGE',
        mimeType: 'image/webp',
        success: true
      };
    } catch (error: any) {
      console.error(`❌ Image compression error:`, error.message);
      // If compression fails, use original file
      fs.copyFileSync(inputPath, outputPath);
      const compressedStats = fs.statSync(outputPath);
      return {
        originalPath: inputPath,
        compressedPath: outputPath,
        originalSize,
        compressedSize: compressedStats.size,
        compressionRatio: 0,
        compressionTime: Date.now() - startTime,
        fileType: 'IMAGE',
        mimeType,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Compress video file using FFmpeg
   */
  private static compressVideo(
    inputPath: string,
    outputPath: string
  ): Promise<CompressionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const stats = fs.statSync(inputPath);
      const originalSize = stats.size;

      console.log(`🎬 Starting video compression: ${path.basename(inputPath)}`);
      console.log(`   Original size: ${this.formatBytes(originalSize)}`);

      ffmpeg(inputPath)
        .videoCodec('libx265') // H.265 codec for better compression
        .audioCodec('aac') // AAC audio codec
        .outputOptions([
          '-crf 23', // Quality (0-51, lower=better, 23=default good quality)
          '-preset medium', // Encoding speed vs compression (fast/medium/slow)
          '-maxrate 5000k', // Max bitrate
          '-bufsize 10000k', // Buffer size
          '-tag:v hvc1' // Compatibility tag
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`   FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`   Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('error', (error) => {
          console.error(`❌ Video compression error:`, error.message);
          // If compression fails, use original file
          try {
            fs.copyFileSync(inputPath, outputPath);
            const compressedStats = fs.statSync(outputPath);
            resolve({
              originalPath: inputPath,
              compressedPath: outputPath,
              originalSize,
              compressedSize: compressedStats.size,
              compressionRatio: 0,
              compressionTime: Date.now() - startTime,
              fileType: 'VIDEO',
              mimeType: 'video/mp4',
              success: false,
              error: error.message
            });
          } catch (copyError: any) {
            resolve({
              originalPath: inputPath,
              compressedPath: outputPath,
              originalSize,
              compressedSize: 0,
              compressionRatio: 0,
              compressionTime: Date.now() - startTime,
              fileType: 'VIDEO',
              mimeType: 'video/mp4',
              success: false,
              error: copyError.message
            });
          }
        })
        .on('end', () => {
          try {
            const compressedStats = fs.statSync(outputPath);
            const compressedSize = compressedStats.size;
            const compressionTime = Date.now() - startTime;
            const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

            console.log(`✅ Video compressed successfully:`);
            console.log(`   Compressed: ${this.formatBytes(compressedSize)}`);
            console.log(`   Saved: ${compressionRatio.toFixed(2)}%`);
            console.log(`   Time: ${(compressionTime / 1000).toFixed(2)}s`);

            resolve({
              originalPath: inputPath,
              compressedPath: outputPath,
              originalSize,
              compressedSize,
              compressionRatio: Math.round(compressionRatio),
              compressionTime,
              fileType: 'VIDEO',
              mimeType: 'video/mp4',
              success: true
            });
          } catch (error: any) {
            console.error(`❌ Error reading compressed file:`, error.message);
            resolve({
              originalPath: inputPath,
              compressedPath: outputPath,
              originalSize,
              compressedSize: 0,
              compressionRatio: 0,
              compressionTime: Date.now() - startTime,
              fileType: 'VIDEO',
              mimeType: 'video/mp4',
              success: false,
              error: error.message
            });
          }
        })
        .run();
    });
  }

  /**
   * Compress audio file using FFmpeg
   */
  private static compressAudio(
    inputPath: string,
    outputPath: string
  ): Promise<CompressionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const stats = fs.statSync(inputPath);
      const originalSize = stats.size;

      console.log(`🎵 Starting audio compression: ${path.basename(inputPath)}`);
      console.log(`   Original size: ${this.formatBytes(originalSize)}`);

      ffmpeg(inputPath)
        .audioCodec('libopus') // Opus codec for better compression
        .audioChannels(2) // Stereo
        .audioBitrate('192k') // Good quality at lower bitrate
        .output(outputPath)
        .outputOptions([
          '-q:a 5' // Quality parameter for Opus
        ])
        .on('error', (error) => {
          console.error(`❌ Audio compression error:`, error.message);
          // Fallback to AAC if Opus fails
          ffmpeg(inputPath)
            .audioCodec('aac')
            .audioChannels(2)
            .audioBitrate('192k')
            .output(outputPath)
            .on('end', () => {
              const compressedStats = fs.statSync(outputPath);
              const compressedSize = compressedStats.size;
              const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

              resolve({
                originalPath: inputPath,
                compressedPath: outputPath,
                originalSize,
                compressedSize,
                compressionRatio: Math.round(compressionRatio),
                compressionTime: Date.now() - startTime,
                fileType: 'AUDIO',
                mimeType: 'audio/aac',
                success: true
              });
            })
            .on('error', (fallbackError) => {
              fs.copyFileSync(inputPath, outputPath);
              const compressedStats = fs.statSync(outputPath);
              resolve({
                originalPath: inputPath,
                compressedPath: outputPath,
                originalSize,
                compressedSize: compressedStats.size,
                compressionRatio: 0,
                compressionTime: Date.now() - startTime,
                fileType: 'AUDIO',
                mimeType: 'audio/aac',
                success: false,
                error: fallbackError.message
              });
            })
            .run();
        })
        .on('end', () => {
          const compressedStats = fs.statSync(outputPath);
          const compressedSize = compressedStats.size;
          const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

          console.log(`✅ Audio compressed successfully:`);
          console.log(`   Compressed: ${this.formatBytes(compressedSize)}`);
          console.log(`   Saved: ${compressionRatio.toFixed(2)}%`);

          resolve({
            originalPath: inputPath,
            compressedPath: outputPath,
            originalSize,
            compressedSize,
            compressionRatio: Math.round(compressionRatio),
            compressionTime: Date.now() - startTime,
            fileType: 'AUDIO',
            mimeType: 'audio/opus',
            success: true
          });
        })
        .run();
    });
  }

  /**
   * Main compression handler - detects file type and compresses accordingly
   */
  static async compressFile(
    inputPath: string,
    mimeType: string,
    originalFileName: string
  ): Promise<CompressionResult> {
    this.initializeTempDir();

    const fileType = this.detectFileType(mimeType);
    const fileExtension = fileType === 'VIDEO' ? '.mp4' : fileType === 'IMAGE' ? '.webp' : fileType === 'AUDIO' ? '.opus' : path.extname(originalFileName);
    const compressedFileName = `${uuidv4()}${fileExtension}`;
    const compressedPath = path.join(this.TEMP_DIR, compressedFileName);

    console.log(`\n🔧 Compression Service Initialized`);
    console.log(`   File: ${originalFileName}`);
    console.log(`   Type: ${fileType}`);
    console.log(`   MIME: ${mimeType}`);

    try {
      if (fileType === 'IMAGE') {
        return await this.compressImage(inputPath, compressedPath, mimeType);
      } else if (fileType === 'VIDEO') {
        return await this.compressVideo(inputPath, compressedPath);
      } else if (fileType === 'AUDIO') {
        return await this.compressAudio(inputPath, compressedPath);
      } else {
        // Documents - no compression needed
        fs.copyFileSync(inputPath, compressedPath);
        const stats = fs.statSync(compressedPath);
        return {
          originalPath: inputPath,
          compressedPath: compressedPath,
          originalSize: stats.size,
          compressedSize: stats.size,
          compressionRatio: 0,
          compressionTime: 0,
          fileType: 'DOCUMENT',
          mimeType,
          success: true
        };
      }
    } catch (error: any) {
      console.error(`❌ Compression failed:`, error.message);
      // Return error result but still copy file for fallback
      try {
        fs.copyFileSync(inputPath, compressedPath);
        const stats = fs.statSync(compressedPath);
        return {
          originalPath: inputPath,
          compressedPath: compressedPath,
          originalSize: stats.size,
          compressedSize: stats.size,
          compressionRatio: 0,
          compressionTime: 0,
          fileType,
          mimeType,
          success: false,
          error: error.message
        };
      } catch (copyError: any) {
        return {
          originalPath: inputPath,
          compressedPath: compressedPath,
          originalSize: 0,
          compressedSize: 0,
          compressionRatio: 0,
          compressionTime: 0,
          fileType,
          mimeType,
          success: false,
          error: copyError.message
        };
      }
    }
  }

  /**
   * Clean up temp file
   */
  static cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up temp file: ${path.basename(filePath)}`);
      }
    } catch (error: any) {
      console.error(`⚠️ Error cleaning up temp file:`, error.message);
    }
  }

  /**
   * Format bytes to human-readable format
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
