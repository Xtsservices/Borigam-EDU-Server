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
    cb(new Error(`File type not allowed. Allowed types: PDF, DOC, DOCX, PPT, PPTX, TXT, JPG, JPEG, PNG, GIF, MP4, AVI, MOV, MP3, WAV`));
  }
};

// Multer configuration for memory storage
const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for S3 upload
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
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
  
  /**
   * Validate file size
   */
  static validateFileSize(file: Express.Multer.File, maxSizeMB: number = 100): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }

  /**
   * Validate file type for specific content types
   */
  static validateContentTypeFile(file: Express.Multer.File, contentType: string): boolean {
    const contentTypeRules: { [key: string]: string[] } = {
      'PDF': ['application/pdf'],
      'DOC': [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      'DOCX': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'IMAGE': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
      'VIDEO': ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo'],
      'AUDIO': ['audio/mpeg', 'audio/wav', 'audio/mp3']
    };

    const allowedMimeTypes = contentTypeRules[contentType];
    return allowedMimeTypes ? allowedMimeTypes.includes(file.mimetype) : false;
  }

  /**
   * Validate file name
   */
  static validateFileName(fileName: string): boolean {
    // Check for valid characters and length
    const validNameRegex = /^[a-zA-Z0-9\-_\.\s]+$/;
    return validNameRegex.test(fileName) && fileName.length <= 255;
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
      errors.push('No file uploaded');
      return errors;
    }

    // Validate file size
    if (!FileUploadValidator.validateFileSize(file)) {
      errors.push('File size exceeds 100MB limit');
    }

    // Validate file name
    if (!FileUploadValidator.validateFileName(file.originalname)) {
      errors.push('Invalid file name. Use only letters, numbers, dashes, underscores, and dots');
    }

    // Validate content type specific rules
    if (contentType && !FileUploadValidator.validateContentTypeFile(file, contentType)) {
      errors.push(`File type not allowed for content type: ${contentType}`);
    }

    return errors;
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
        return 'File size too large. Maximum size is 100MB';
      case 'LIMIT_FILE_COUNT':
        return 'Too many files. Maximum is 10 files';
      case 'LIMIT_UNEXPECTED_FILE':
        return 'Unexpected file field';
      case 'LIMIT_PART_COUNT':
        return 'Too many parts in the request';
      case 'LIMIT_FIELD_COUNT':
        return 'Too many fields in the request';
      case 'LIMIT_FIELD_KEY':
        return 'Field name too long';
      case 'LIMIT_FIELD_VALUE':
        return 'Field value too long';
      default:
        return `Upload error: ${error.message}`;
    }
  }
  
  return error.message || 'File upload failed';
};