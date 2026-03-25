import AWS from 'aws-sdk';
import path from 'path';
import fs from 'fs';
import { CompressionService } from './compressionService';

// Configure AWS with optimized settings for large file uploads
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  httpOptions: {
    timeout: 0, // No timeout (required for large files)
    connectTimeout: 30000, // 30 seconds to connect
    socketTimeout: 30000 // 30 seconds per socket operation
  },
  maxRetries: 3
});

const s3 = new AWS.S3();

// Cache for dynamic uuid import
let uuidModule: any = null;
async function getUuidV4() {
  if (!uuidModule) {
    uuidModule = await import('uuid');
  }
  return uuidModule.v4();
}

interface UploadFileParams {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  courseId: number;
  sectionId: number;
  contentType: string;
  courseName?: string;
  sectionName?: string;
}

interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  size: number;
}

export class S3Service {
  
  private static readonly BUCKET_NAME = process.env.S3_BUCKET_NAME || 'borigam-edu-content';
  private static readonly BASE_URL = process.env.S3_BASE_URL || `https://${S3Service.BUCKET_NAME}.s3.amazonaws.com`;

  /**
   * Generate a unique file key for S3 storage with descriptive names
   */
  private static async generateFileKey(courseId: number, sectionId: number, contentType: string, originalName: string, courseName?: string, sectionName?: string): Promise<string> {
    const fileExtension = path.extname(originalName);
    const fileName = path.basename(originalName, fileExtension);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const sanitizedCourseName = courseName ? courseName.replace(/[^a-zA-Z0-9-_]/g, '-') : `course-${courseId}`;
    const sanitizedSectionName = sectionName ? sectionName.replace(/[^a-zA-Z0-9-_]/g, '-') : `section-${sectionId}`;
    const uniqueId = await getUuidV4();
    
    return `courses/${sanitizedCourseName}-${courseId}/sections/${sanitizedSectionName}-${sectionId}/${contentType}/${sanitizedFileName}-${uniqueId}${fileExtension}`;
  }

  /**
   * Upload a file to S3
   */
  static async uploadFile(params: UploadFileParams): Promise<UploadResult> {
    try {
      const { buffer, originalName, mimeType, courseId, sectionId, contentType, courseName, sectionName } = params;

      // Generate unique file key with descriptive names
      const fileKey = await S3Service.generateFileKey(courseId, sectionId, contentType, originalName, courseName, sectionName);

      console.log(`📤 S3Service.uploadFile called:`, {
        originalName,
        mimeType,
        contentType,
        courseId,
        sectionId,
        fileKey,
        bufferSize: buffer.length
      });

      // S3 upload parameters
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'course-id': courseId.toString(),
          'section-id': sectionId.toString(),
          'course-name': courseName || `Course-${courseId}`,
          'section-name': sectionName || `Section-${sectionId}`,
          'content-type': contentType,
          'original-name': originalName,
          'upload-timestamp': new Date().toISOString()
        }
      };

      // Upload to S3
      const result = await s3.upload(uploadParams).promise();

      console.log(`✅ S3 Upload successful:`, {
        Location: result.Location,
        Bucket: result.Bucket,
        Key: result.Key,
        ETag: result.ETag
      });

      const uploadResult = {
        key: fileKey,
        url: result.Location,
        bucket: S3Service.BUCKET_NAME,
        size: buffer.length
      };

      console.log(`📦 UploadResult being returned:`, uploadResult);

      return uploadResult;

    } catch (error) {
      console.error('❌ Error uploading file to S3:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  /**
   * Upload a file to S3 from disk (streaming - preferred for large files)
   * This method reads the file from disk as a stream instead of loading it into memory
   * Much more efficient for large files like 1GB videos
   */
  static async uploadFileFromPath(
    filePath: string,
    originalName: string,
    mimeType: string,
    courseId: number,
    sectionId: number,
    contentType: string,
    courseName?: string,
    sectionName?: string
  ): Promise<UploadResult> {
    let fileStream: fs.ReadStream | null = null;
    
    try {
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Get file size for monitoring
      const fileStats = fs.statSync(filePath);
      const fileSize = fileStats.size;

      // Generate unique file key with descriptive names
      const fileKey = await S3Service.generateFileKey(courseId, sectionId, contentType, originalName, courseName, sectionName);

      console.log(`📤 S3Service.uploadFileFromPath called:`, {
        filePath,
        originalName,
        mimeType,
        contentType,
        courseId,
        sectionId,
        fileKey,
        fileSize: `${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        uploadMethod: 'streaming'
      });

      // Create read stream for file
      fileStream = fs.createReadStream(filePath);

      // S3 upload parameters with streaming Body
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey,
        Body: fileStream,
        ContentType: mimeType,
        ContentLength: fileSize, // Important for streaming uploads
        ServerSideEncryption: 'AES256',
        Metadata: {
          'course-id': courseId.toString(),
          'section-id': sectionId.toString(),
          'course-name': courseName || `Course-${courseId}`,
          'section-name': sectionName || `Section-${sectionId}`,
          'content-type': contentType,
          'original-name': originalName,
          'upload-timestamp': new Date().toISOString(),
          'upload-method': 'streaming'
        }
      };

      // Track upload progress
      let uploadedBytes = 0;
      fileStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        const percentComplete = ((uploadedBytes / fileSize) * 100).toFixed(2);
        console.log(`📊 Upload progress: ${percentComplete}% (${(uploadedBytes / (1024 * 1024)).toFixed(2)} MB / ${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
      });

      // Upload to S3
      const result = await s3.upload(uploadParams).promise();

      console.log(`✅ S3 Streaming Upload successful:`, {
        Location: result.Location,
        Bucket: result.Bucket,
        Key: result.Key,
        ETag: result.ETag,
        fileSize: `${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB`
      });

      const uploadResult = {
        key: fileKey,
        url: result.Location,
        bucket: S3Service.BUCKET_NAME,
        size: fileSize
      };

      console.log(`📦 Upload Result:`, uploadResult);

      return uploadResult;

    } catch (error) {
      console.error('❌ Error uploading file to S3 from path:', error);
      throw new Error(`Failed to upload file to storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Ensure stream is closed if it exists
      if (fileStream) {
        fileStream.destroy();
      }
    }
  }

  /**
   * Upload file with compression to S3
   * Compresses the file first, then uploads the compressed version to S3
   * Returns both original and compressed file information
   */
  static async uploadFileWithCompression(params: UploadFileParams & { buffer: Buffer }): Promise<{
    uploadResult: UploadResult;
    compressionInfo: {
      originalSize: number;
      compressedSize: number;
      compressionRatio: number;
      compressionTime: number;
      fileType: string;
      mimeType: string;
    }
  }> {
    let tempFilePath: string | null = null;
    
    try {
      const { buffer, originalName, mimeType, courseId, sectionId, contentType, courseName, sectionName } = params;

      // Save buffer to temp file for compression
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      tempFilePath = path.join(tempDir, `upload-${Date.now()}-${originalName}`);
      fs.writeFileSync(tempFilePath, buffer);

      console.log(`\n📥 Uploading with compression: ${originalName}`);
      
      // Compress the file
      const compressionResult = await CompressionService.compressFile(
        tempFilePath,
        mimeType,
        originalName
      );

      // Read compressed file
      const compressedBuffer = fs.readFileSync(compressionResult.compressedPath);

      // Generate unique file key with descriptive names
      const fileKey = await S3Service.generateFileKey(
        courseId, 
        sectionId, 
        contentType, 
        originalName, 
        courseName, 
        sectionName
      );

      // S3 upload parameters for compressed file
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey,
        Body: compressedBuffer,
        ContentType: compressionResult.mimeType, // Use compressed file MIME type
        ServerSideEncryption: 'AES256',
        Metadata: {
          'course-id': courseId.toString(),
          'section-id': sectionId.toString(),
          'course-name': courseName || `Course-${courseId}`,
          'section-name': sectionName || `Section-${sectionId}`,
          'content-type': contentType,
          'original-name': originalName,
          'original-size': compressionResult.originalSize.toString(),
          'compressed-size': compressionResult.compressedSize.toString(),
          'compression-ratio': compressionResult.compressionRatio.toString(),
          'file-type': compressionResult.fileType,
          'upload-timestamp': new Date().toISOString(),
          'compression-quality': 'lossless-high-quality'
        }
      };

      // Upload compressed file to S3
      const result = await s3.upload(uploadParams).promise();

      console.log(`✅ S3 Upload with compression successful:`, {
        Location: result.Location,
        OriginalSize: CompressionService.formatBytes(compressionResult.originalSize),
        CompressedSize: CompressionService.formatBytes(compressionResult.compressedSize),
        CompressionRatio: `${compressionResult.compressionRatio}%`
      });

      const uploadResult = {
        key: fileKey,
        url: result.Location,
        bucket: S3Service.BUCKET_NAME,
        size: compressedBuffer.length
      };

      // Clean up temp files
      CompressionService.cleanupTempFile(tempFilePath);
      CompressionService.cleanupTempFile(compressionResult.compressedPath);

      return {
        uploadResult,
        compressionInfo: {
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
          compressionRatio: compressionResult.compressionRatio,
          compressionTime: compressionResult.compressionTime,
          fileType: compressionResult.fileType,
          mimeType: compressionResult.mimeType
        }
      };

    } catch (error) {
      console.error('❌ Error uploading file with compression to S3:', error);
      
      // Clean up temp files on error
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        CompressionService.cleanupTempFile(tempFilePath);
      }
      
      throw new Error('Failed to upload file with compression to storage');
    }
  }

  /**
   * Upload course image to S3
   */
  static async uploadCourseImage(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    courseId?: number
  ): Promise<UploadResult> {
    try {
      const fileExtension = path.extname(originalName);
      const fileName = path.basename(originalName, fileExtension);
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '-');
      const uniqueId = await getUuidV4();
      
      const fileKey = courseId 
        ? `courses/course-${courseId}/images/${sanitizedFileName}-${uniqueId}${fileExtension}`
        : `courses/temp-images/${sanitizedFileName}-${uniqueId}${fileExtension}`;

      const uploadParams = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: mimeType,
        // Removed ACL setting as bucket doesn't support ACLs
        Metadata: {
          'uploaded-by': 'course-system',
          'upload-type': 'course-image',
          'original-name': originalName
        }
      };

      const result = await s3.upload(uploadParams).promise();

      return {
        key: fileKey,
        url: result.Location,
        bucket: S3Service.BUCKET_NAME,
        size: buffer.length
      };

    } catch (error) {
      console.error('Error uploading course image to S3:', error);
      throw new Error('Failed to upload course image to storage');
    }
  }

  /**
   * Generate a pre-signed URL for secure file access
   * @param fileKey - S3 object key
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @param contentType - Optional content type for response headers (useful for video streaming)
   */
  static async generateSignedUrl(fileKey: string, expiresIn: number = 3600, contentType?: string): Promise<string> {
    try {
      // Validate fileKey
      if (!fileKey || typeof fileKey !== 'string' || fileKey.trim() === '') {
        console.error('❌ Invalid file key for signed URL:', fileKey);
        throw new Error('Invalid file key');
      }

      // Remove leading slash if present
      const cleanFileKey = fileKey.startsWith('/') ? fileKey.substring(1) : fileKey;
      
      const params: AWS.S3.GetObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: cleanFileKey
      };

      // Build signed URL options
      const signedUrlOptions: any = {
        ...params,
        Expires: Math.min(expiresIn, 604800) // Max 7 days for S3 presigned URLs
      };

      // For video/media files, include ResponseContentType for proper streaming support
      // AWS SDK v2 includes this as a query parameter in the signed URL
      if (contentType) {
        signedUrlOptions.ResponseContentType = contentType;
        console.log(`📋 Set ResponseContentType to: ${contentType}`);
      }

      // For video files specifically, ensure proper headers for range requests and seeking
      if (contentType && contentType.startsWith('video/')) {
        // Add ResponseCacheControl for better streaming performance
        signedUrlOptions.ResponseCacheControl = 'public, max-age=3600';
        // Don't force download, allow inline playback
        signedUrlOptions.ResponseContentDisposition = 'inline';
        console.log(`🎬 VIDEO: Configured for inline streaming with cache control`);
      }
      // For document files (PDF, DOCX, DOC, etc.), configure for inline viewing
      else if (contentType && (
        contentType.includes('pdf') || 
        contentType.includes('word') || 
        contentType.includes('document') ||
        contentType.includes('officedocument')
      )) {
        // Allow inline viewing in browser instead of forcing download
        signedUrlOptions.ResponseContentDisposition = 'inline; filename="document"';
        signedUrlOptions.ResponseCacheControl = 'public, max-age=3600';
        console.log(`📄 DOCUMENT: Configured for inline viewing (${contentType})`);
      }
      // For images, also configure for inline viewing
      else if (contentType && contentType.startsWith('image/')) {
        signedUrlOptions.ResponseContentDisposition = 'inline';
        signedUrlOptions.ResponseCacheControl = 'public, max-age=86400'; // 24 hours for images
        console.log(`🖼️ IMAGE: Configured for inline display`);
      }

      const signedUrl = await s3.getSignedUrlPromise('getObject', signedUrlOptions);
      console.log(`✅ Generated signed URL for ${cleanFileKey}`);
      
      // Debug log the signed URL structure
      if (contentType && contentType.startsWith('video/')) {
        const urlParams = new URL(signedUrl);
        console.log(`📹 Video signed URL params:`, {
          hasResponseContentType: urlParams.searchParams.has('response-content-type'),
          responseContentType: urlParams.searchParams.get('response-content-type'),
          hasCacheControl: urlParams.searchParams.has('response-cache-control')
        });
      }
      
      return signedUrl;

    } catch (error) {
      console.warn('⚠️ Failed to generate signed URL, using direct S3 URL:', error instanceof Error ? error.message : error);
      // Return direct S3 URL as fallback
      // This assumes bucket has public read access or CloudFront is configured
      const directUrl = `${S3Service.BASE_URL}/${fileKey.startsWith('/') ? fileKey.substring(1) : fileKey}`;
      console.log(`📍 Returning direct S3 URL as fallback: ${directUrl.substring(0, 80)}...`);
      return directUrl;
    }
  }

  /**
   * Generate multiple signed URLs for course contents
   */
  static async generateMultipleSignedUrls(fileKeys: string[], expiresIn: number = 3600): Promise<{ [key: string]: string }> {
    try {
      const signedUrls: { [key: string]: string } = {};

      const promises = fileKeys.map(async (fileKey) => {
        if (fileKey && fileKey.trim()) {
          signedUrls[fileKey] = await S3Service.generateSignedUrl(fileKey, expiresIn);
        }
      });

      await Promise.all(promises);
      return signedUrls;

    } catch (error) {
      console.error('Error generating multiple signed URLs:', error);
      throw new Error('Failed to generate secure access URLs');
    }
  }

  /**
   * Delete a file from S3
   */
  static async deleteFile(fileKey: string): Promise<void> {
    try {
      const params: AWS.S3.DeleteObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey
      };

      await s3.deleteObject(params).promise();
      console.log(`File deleted from S3: ${fileKey}`);

    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error('Failed to delete file from storage');
    }
  }

  /**
   * Check if a file exists in S3
   */
  static async fileExists(fileKey: string): Promise<boolean> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey
      };

      await s3.headObject(params).promise();
      return true;

    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      
      console.error('Error checking file existence:', error);
      throw new Error('Failed to check file existence');
    }
  }

  /**
   * Get file metadata from S3
   */
  static async getFileMetadata(fileKey: string): Promise<AWS.S3.HeadObjectOutput | null> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey
      };

      const metadata = await s3.headObject(params).promise();
      return metadata;

    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      
      console.error('Error getting file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }

  /**
   * Copy a file within S3 (useful for content duplication)
   */
  static async copyFile(sourceKey: string, destinationKey: string): Promise<string> {
    try {
      const params: AWS.S3.CopyObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        CopySource: `${S3Service.BUCKET_NAME}/${sourceKey}`,
        Key: destinationKey,
        ServerSideEncryption: 'AES256'
      };

      const result = await s3.copyObject(params).promise();
      
      return `${S3Service.BASE_URL}/${destinationKey}`;

    } catch (error) {
      console.error('Error copying file in S3:', error);
      throw new Error('Failed to copy file');
    }
  }

  /**
   * List files in a specific course/section path
   */
  static async listFiles(prefix: string): Promise<AWS.S3.Object[]> {
    try {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: S3Service.BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1000
      };

      const result = await s3.listObjectsV2(params).promise();
      return result.Contents || [];

    } catch (error) {
      console.error('Error listing files from S3:', error);
      throw new Error('Failed to list files');
    }
  }

  /**
   * Get download stream for a file
   */
  static getFileStream(fileKey: string): AWS.Request<AWS.S3.GetObjectOutput, AWS.AWSError> {
    const params: AWS.S3.GetObjectRequest = {
      Bucket: S3Service.BUCKET_NAME,
      Key: fileKey
    };

    return s3.getObject(params);
  }

  /**
   * Check if file type is allowed
   */
  static isAllowedFileType(mimeType: string, fileName: string): boolean {
    const allowedTypes = [
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      
      // Videos
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-msvideo',
      
      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/mp3'
    ];

    const fileExtension = path.extname(fileName).toLowerCase();
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', 
                              '.jpg', '.jpeg', '.png', '.gif', '.webp',
                              '.mp4', '.avi', '.mov', '.mp3', '.wav'];

    return allowedTypes.includes(mimeType) && allowedExtensions.includes(fileExtension);
  }

  /**
   * Convert file size to human readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file type category based on MIME type
   */
  static getFileTypeCategory(mimeType: string): string {
    // Return only valid database ENUM values: TEXT, YOUTUBE, PDF, DOC, DOCX, IMAGE, VIDEO, AUDIO, QUIZ, ASSIGNMENT
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType === 'application/msword') return 'DOC';
    if (mimeType.includes('wordprocessingml') || mimeType.includes('document')) return 'DOCX';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'DOCX'; // Map PPT to DOCX
    if (mimeType === 'text/plain' || mimeType.startsWith('text/')) return 'TEXT';
    
    // Default fallback to PDF for unknown document types
    return 'PDF';
  }

  /**
   * Infer MIME type from filename extension
   * Used as fallback when mime_type is null in database
   */
  static getMimeTypeFromFilename(filename: string): string {
    if (!filename) return 'application/octet-stream';
    
    const ext = path.extname(filename).toLowerCase();
    const mimeTypeMap: { [key: string]: string } = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      
      // Videos
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      
      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      
      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      
      // Default
      '': 'application/octet-stream'
    };
    
    return mimeTypeMap[ext] || 'application/octet-stream';
  }
}