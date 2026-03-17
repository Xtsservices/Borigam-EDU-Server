import multer from 'multer';
import { Request } from 'express';
import { S3Service } from './s3Service';

// Define interface for authenticated request
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
}

// File filter function
const fileFilter = (req: AuthenticatedRequest, file: Express.Multer.File, cb: (error: Error | null, acceptFile?: boolean) => void) => {
  // Check if file type is allowed
  if (S3Service.isAllowedFileType(file.mimetype, file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: PDF, DOC, DOCX, PPT, PPTX, TXT, JPG, JPEG, PNG, GIF, WEBP, MP4, AVI, MOV, MP3, WAV`));
  }
};

// Multer configuration for memory storage
// 3GB file size limit (3 * 1024 * 1024 * 1024 = 3221225472 bytes)
const THREE_GB_BYTES = 3 * 1024 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for S3 upload
  limits: {
    fileSize: THREE_GB_BYTES, // Max 3GB per file
    files: 10, // Max 10 files per request
    fields: 20, // Max 20 non-file fields
    parts: 30 // Max 30 parts total
  },
  fileFilter
});

// Export configured multer instance
export const uploadMiddleware = {
  // Single file upload
  single: (fieldName: string) => upload.single(fieldName),
  
  // Multiple files with same field name
  array: (fieldName: string, maxCount: number = 10) => upload.array(fieldName, maxCount),
  
  // Multiple files with different field names
  fields: (fields: { name: string; maxCount?: number }[]) => upload.fields(fields),
  
  // No file upload, just form fields
  none: () => upload.none()
};

// File validation utilities
export class FileUploadValidator {
  // Maximum file size: 3GB
  private static readonly MAX_FILE_SIZE_MB = 3072; // 3GB in MB
  private static readonly MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024 * 1024; // 3GB in bytes
  
  /**
   * Validate file size - Default max 3GB
   */
  static validateFileSize(file: Express.Multer.File, maxSizeMB: number = FileUploadValidator.MAX_FILE_SIZE_MB): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }

  /**
   * Format bytes to human-readable file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Validate file type for specific content types
   */
  static validateContentTypeFile(file: Express.Multer.File, contentType: string): boolean {
    const contentTypeRules: { [key: string]: string[] } = {
      'TEXT': ['text/plain'],
      'YOUTUBE': [], // URL validation only, no file needed
      'PDF': ['application/pdf'],
      'DOC': [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      'DOCX': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'IMAGE': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
      'VIDEO': ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/x-avi'],
      'AUDIO': ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mpeg3'],
      'QUIZ': [], // No file needed
      'ASSIGNMENT': [], // No file needed
      'FILE': [ // Catch-all for generic file uploads
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/avi',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-avi',
        'audio/mpeg',
        'audio/wav',
        'audio/mp3',
        'audio/mpeg3'
      ]
    };

    const allowedMimeTypes = contentTypeRules[contentType];
    // If no rules defined for this content type, allow it (e.g., TEXT, YOUTUBE, QUIZ, ASSIGNMENT are URL-based)
    if (allowedMimeTypes === undefined) {
      return true;
    }
    // If rules are empty, file is not needed for this content type
    if (allowedMimeTypes.length === 0) {
      return true;
    }
    // Check if file mime type matches allowed types
    return allowedMimeTypes.includes(file.mimetype);
  }

  /**
   * Detect appropriate database ENUM content type from MIME type
   * Maps generic 'FILE' type to specific ENUM values (PDF, IMAGE, VIDEO, etc.)
   */
  static detectDatabaseContentType(mimeType: string, contentTypeHint?: string): string {
    // If a valid ENUM value is provided (not 'FILE'), use it
    const validEnumValues = ['TEXT', 'YOUTUBE', 'PDF', 'DOC', 'DOCX', 'IMAGE', 'VIDEO', 'AUDIO', 'QUIZ', 'ASSIGNMENT'];
    if (contentTypeHint && validEnumValues.includes(contentTypeHint.toUpperCase())) {
      return contentTypeHint.toUpperCase();
    }

    // Otherwise, detect from MIME type
    if (mimeType.startsWith('image/')) {
      return 'IMAGE';
    } else if (mimeType.startsWith('video/')) {
      return 'VIDEO';
    } else if (mimeType.startsWith('audio/')) {
      return 'AUDIO';
    } else if (mimeType === 'application/pdf') {
      return 'PDF';
    } else if (mimeType === 'application/msword') {
      return 'DOC';
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'DOCX';
    } else if (mimeType === 'text/plain') {
      return 'TEXT';
    }

    // Fallback to PDF if unable to detect
    return 'PDF';
  }

  /**
   * Validate file name
   */
  static validateFileName(fileName: string): boolean {
    // Allow most characters except: < > : " / \ | ? *
    // Also allow spaces and common special chars
    const invalidCharRegex = /[<>:"|?*]/;
    return !invalidCharRegex.test(fileName) && fileName.length > 0 && fileName.length <= 255;
  }

  /**
   * Sanitize file name
   */
  static sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9\-_\.]/g, '-') // Replace invalid chars with dash
      .replace(/\s+/g, '-') // Replace spaces with dash
      .replace(/-+/g, '-') // Replace multiple dashes with single dash
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
      .substring(0, 255); // Limit length
  }

  /**
   * Get file validation errors
   */
  static getValidationErrors(file: Express.Multer.File, contentType?: string): string[] {
    const errors: string[] = [];

    // Check file existence
    if (!file) {
      errors.push('❌ No file uploaded. Please select a file to upload.');
      return errors;
    }

    // Validate file size
    if (!FileUploadValidator.validateFileSize(file)) {
      const fileSize = FileUploadValidator.formatFileSize(file.size);
      errors.push(`❌ File size (${fileSize}) exceeds the maximum limit of 3GB. Please select a smaller file.`);
    }

    // Validate file name
    if (!FileUploadValidator.validateFileName(file.originalname)) {
      errors.push('❌ Invalid file name. Please use only letters, numbers, dashes, underscores, and dots.');
    }

    // Validate content type specific rules
    if (contentType && !FileUploadValidator.validateContentTypeFile(file, contentType)) {
      errors.push(`❌ File type '${FileUploadValidator.detectFileType(file.mimetype)}' is not allowed for ${contentType} content. Supported types: PDF, DOC, DOCX, PPT, PPTX, TXT, JPG, JPEG, PNG, GIF, WEBP, MP4, AVI, MOV, MP3, WAV.`);
    }

    return errors;
  }

  /**
   * Detect file type from MIME type for user-friendly messages
   */
  private static detectFileType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'Document';
    return 'File';
  }

  /**
   * Process and validate multiple files
   */
  static validateMultipleFiles(files: Express.Multer.File[], contentType?: string): { 
    valid: Express.Multer.File[]; 
    invalid: { file: Express.Multer.File; errors: string[] }[] 
  } {
    const valid: Express.Multer.File[] = [];
    const invalid: { file: Express.Multer.File; errors: string[] }[] = [];

    for (const file of files) {
      const errors = FileUploadValidator.getValidationErrors(file, contentType);
      
      if (errors.length === 0) {
        valid.push(file);
      } else {
        invalid.push({ file, errors });
      }
    }

    return { valid, invalid };
  }
}

// Error handler for multer errors
export const handleMulterError = (error: any) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return '❌ File size too large. Maximum allowed size is 3GB. Please select a smaller file.';
      case 'LIMIT_FILE_COUNT':
        return '❌ Too many files submitted. Maximum allowed is 10 files per request.';
      case 'LIMIT_UNEXPECTED_FILE':
        return '❌ Unexpected file field in the request. Check your form field names.';
      case 'LIMIT_PART_COUNT':
        return '❌ Request contains too many parts. Please simplify your request.';
      case 'LIMIT_FIELD_COUNT':
        return '❌ Request contains too many fields. Maximum allowed is 20 fields.';
      case 'LIMIT_FIELD_KEY':
        return '❌ Field name is too long. Please use shorter field names.';
      case 'LIMIT_FIELD_VALUE':
        return '❌ Field value is too long. Please provide shorter values.';
      default:
        return `❌ Upload error: ${error.message || 'Unknown error occurred'}`;
    }
  }
  
  return error.message ? `❌ ${error.message}` : '❌ File upload failed. Please try again.';
};