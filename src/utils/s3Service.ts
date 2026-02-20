import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const s3 = new AWS.S3();

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
  private static generateFileKey(courseId: number, sectionId: number, contentType: string, originalName: string, courseName?: string, sectionName?: string): string {
    const fileExtension = path.extname(originalName);
    const fileName = path.basename(originalName, fileExtension);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const sanitizedCourseName = courseName ? courseName.replace(/[^a-zA-Z0-9-_]/g, '-') : `course-${courseId}`;
    const sanitizedSectionName = sectionName ? sectionName.replace(/[^a-zA-Z0-9-_]/g, '-') : `section-${sectionId}`;
    const uniqueId = uuidv4();
    
    return `courses/${sanitizedCourseName}-${courseId}/sections/${sanitizedSectionName}-${sectionId}/${contentType}/${sanitizedFileName}-${uniqueId}${fileExtension}`;
  }

  /**
   * Upload a file to S3
   */
  static async uploadFile(params: UploadFileParams): Promise<UploadResult> {
    try {
      const { buffer, originalName, mimeType, courseId, sectionId, contentType, courseName, sectionName } = params;

      // Generate unique file key with descriptive names
      const fileKey = S3Service.generateFileKey(courseId, sectionId, contentType, originalName, courseName, sectionName);

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

      return {
        key: fileKey,
        url: result.Location,
        bucket: S3Service.BUCKET_NAME,
        size: buffer.length
      };

    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file to storage');
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
      const uniqueId = uuidv4();
      
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
   */
  static async generateSignedUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: S3Service.BUCKET_NAME,
        Key: fileKey
      };

      const signedUrl = await s3.getSignedUrlPromise('getObject', {
        ...params,
        Expires: expiresIn
      });
      return signedUrl;

    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error('Failed to generate secure access URL');
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
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PPT';
    if (mimeType === 'text/plain') return 'TEXT';
    
    return 'OTHER';
  }
}