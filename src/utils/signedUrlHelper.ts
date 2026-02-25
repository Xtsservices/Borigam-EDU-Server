import { S3Service } from './s3Service';

/**
 * Utility class for handling signed URLs across all modules
 * Fixes issues with S3 URL handling and signed URL generation
 */
export class SignedUrlHelper {
  
  /**
   * Extract S3 file key from various URL formats
   * Handles multiple S3 URL patterns
   */
  static extractS3FileKey(url?: string): string | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      // Pattern 1: https://bucket.s3.region.amazonaws.com/path/to/file
      const pattern1 = /^https:\/\/[a-zA-Z0-9\-]+\.s3[.\-a-zA-Z0-9]*\.amazonaws\.com\/(.+)$/;
      const match1 = url.match(pattern1);
      if (match1) {
        return match1[1];
      }

      // Pattern 2: https://s3.region.amazonaws.com/bucket/path/to/file
      const pattern2 = /^https:\/\/s3[.\-a-zA-Z0-9]*\.amazonaws\.com\/[a-zA-Z0-9\-]+\/(.+)$/;
      const match2 = url.match(pattern2);
      if (match2) {
        return match2[1];
      }

      // Pattern 3: If URL already contains query params (presigned URL), try to extract before ?
      if (url.includes('?')) {
        const baseUrl = url.split('?')[0];
        return this.extractS3FileKey(baseUrl); // Recursively try patterns on base URL
      }

      // Pattern 4: Check if it looks like a file path (contains slashes and no protocol)
      if (!url.includes('://') && url.includes('/')) {
        // This might already be a file key
        if (url.includes('courses/') || url.includes('exams/') || url.includes('materials/')) {
          return url;
        }
      }

      return null;
    } catch (error) {
      console.warn('Error extracting S3 file key from URL:', { url, error });
      return null;
    }
  }

  /**
   * Generate signed URL for a content item
   * Handles various content types (files, videos, etc.)
   */
  static async generateSignedUrl(url?: string, expiresIn: number = 86400): Promise<string | undefined> {
    if (!url) {
      return undefined;
    }

    try {
      const fileKey = this.extractS3FileKey(url);
      if (!fileKey) {
        // URL is not an S3 URL, return as is (e.g., YouTube URL)
        return url;
      }

      // Generate and return signed URL
      const signedUrl = await S3Service.generateSignedUrl(fileKey, expiresIn);
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', { url, error });
      // Return original URL on error
      return url;
    }
  }

  /**
   * Process signed URLs for course content
   * Handles content_url and content_text with embedded URLs
   */
  static async processContentSignedUrls(content: any, expiresIn: number = 86400): Promise<void> {
    if (!content) {
      return;
    }

    try {
      // Process content_url (for files, videos, etc.)
      if (content.content_url) {
        content.content_url = await this.generateSignedUrl(content.content_url, expiresIn);
      }

      // Process content_text (for embedded S3 URLs in text content)
      if (content.content_text && typeof content.content_text === 'string') {
        // Find all S3 URLs in the text
        const s3UrlPattern = /https:\/\/[a-zA-Z0-9\-\.]+\.s3[.\-a-zA-Z0-9]*\.amazonaws\.com\/[^\s"'<>]+/g;
        const matches = content.content_text.match(s3UrlPattern);

        if (matches) {
          // Process each URL concurrently
          const urlMap = new Map<string, string>();
          
          for (const match of matches) {
            if (!urlMap.has(match)) {
              const signedUrl = await this.generateSignedUrl(match, expiresIn);
              if (signedUrl) {
                urlMap.set(match, signedUrl);
              }
            }
          }

          // Replace all original URLs with signed URLs
          let updatedText = content.content_text;
          for (const [originalUrl, signedUrl] of urlMap) {
            updatedText = updatedText.replaceAll(originalUrl, signedUrl);
          }
          content.content_text = updatedText;
        }
      }
    } catch (error) {
      console.error('Error processing content signed URLs:', { contentId: content.id, error });
      // Continue without signed URLs if generation fails
    }
  }

  /**
   * Process signed URLs for course image
   */
  static async processCourseImageSignedUrl(course: any, expiresIn: number = 86400): Promise<void> {
    if (!course || !course.course_image) {
      return;
    }

    try {
      course.course_image = await this.generateSignedUrl(course.course_image, expiresIn);
    } catch (error) {
      console.error('Error processing course image signed URL:', { courseId: course.id, error });
      // Keep original URL on error
    }
  }

  /**
   * Process signed URLs for exam materials
   */
  static async processExamMaterialSignedUrls(material: any, expiresIn: number = 86400): Promise<void> {
    if (!material) {
      return;
    }

    try {
      // Process pdf_file_url
      if (material.pdf_file_url) {
        material.pdf_file_url = await this.generateSignedUrl(material.pdf_file_url, expiresIn);
      }

      // Process content_url (for videos stored in S3)
      if (material.content_url) {
        // Only generate signed URL if it's an S3 URL (not YouTube)
        const fileKey = this.extractS3FileKey(material.content_url);
        if (fileKey) {
          material.content_url = await this.generateSignedUrl(material.content_url, expiresIn);
        }
        // If it's YouTube, keep as is
      }

      // Process description if it contains S3 URLs
      if (material.description && typeof material.description === 'string') {
        const s3UrlPattern = /https:\/\/[a-zA-Z0-9\-\.]+\.s3[.\-a-zA-Z0-9]*\.amazonaws\.com\/[^\s"'<>]+/g;
        const matches = material.description.match(s3UrlPattern);

        if (matches) {
          let updatedText = material.description;
          for (const match of matches) {
            const signedUrl = await this.generateSignedUrl(match, expiresIn);
            if (signedUrl) {
              updatedText = updatedText.replaceAll(match, signedUrl);
            }
          }
          material.description = updatedText;
        }
      }
    } catch (error) {
      console.error('Error processing exam material signed URLs:', { materialId: material.id, error });
      // Continue without signed URLs if generation fails
    }
  }

  /**
   * Batch process signed URLs for multiple items
   */
  static async batchProcessSignedUrls<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    concurrency: number = 5
  ): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }

    // Process in batches to avoid overwhelming the S3 service
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      await Promise.all(batch.map(item => processor(item)));
    }
  }

  /**
   * Check if URL is an S3 URL
   */
  static isS3Url(url?: string): boolean {
    if (!url) {
      return false;
    }

    return /https:\/\/[a-zA-Z0-9\-\.]+\.s3[.\-a-zA-Z0-9]*\.amazonaws\.com\//.test(url);
  }

  /**
   * Check if URL is a YouTube URL
   */
  static isYouTubeUrl(url?: string): boolean {
    if (!url) {
      return false;
    }

    return /https?:\/\/(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)\//.test(url);
  }

  /**
   * Get safe URL - returns URL safe for client-side use
   * For S3 URLs: generates signed URL
   * For other URLs: returns as is
   */
  static async getSafeUrl(url?: string, expiresIn: number = 86400): Promise<string | undefined> {
    if (!url) {
      return undefined;
    }

    if (this.isS3Url(url)) {
      return this.generateSignedUrl(url, expiresIn);
    }

    return url;
  }
}
