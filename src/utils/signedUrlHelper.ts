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
   * Falls back to direct S3 URL if signing fails
   */
  static async generateSignedUrl(url?: string, expiresIn: number = 86400, mimeType?: string): Promise<string | undefined> {
    if (!url) {
      return undefined;
    }

    try {
      const fileKey = this.extractS3FileKey(url);
      if (!fileKey) {
        // URL is not an S3 URL, return as is (e.g., YouTube URL)
        console.log(`ℹ️ Not an S3 URL, returning as-is: ${url.substring(0, 60)}...`);
        return url;
      }

      // Generate and return signed URL with content type for proper streaming
      const signedUrl = await S3Service.generateSignedUrl(fileKey, expiresIn, mimeType);
      if (mimeType && mimeType.startsWith('video/')) {
        console.log(`✅ Generated VIDEO signed URL for ${fileKey.split('/').pop()} (MIME: ${mimeType})`);
      }
      return signedUrl;
    } catch (error) {
      console.warn('⚠️ Error generating signed URL, returning original URL:', { url: url.substring(0, 60), error: error instanceof Error ? error.message : error });
      // Return original URL on error (fallback to direct S3 URL)
      return url;
    }
  }

  /**
   * Process signed URLs for course content
   * Handles content_url and content_text with embedded URLs
   */
  static async processContentSignedUrls(content: any, expiresIn: number = 3600): Promise<void> {
    if (!content) {
      return;
    }

    try {
      // For videos, use longer expiration time (24 hours) to allow watching over time
      // For other content, use default expiration
      let finalExpiresIn = expiresIn;
      if (content.content_type === 'VIDEO') {
        finalExpiresIn = 86400; // 24 hours for videos
        console.log(`⏱️  VIDEO: Using extended expiration of ${finalExpiresIn}s (24 hours)`);
      }

      // Process content_url (for files, videos, etc.)
      if (content.content_url) {
        // Infer MIME type from filename if not in database
        let mimeType = content.mime_type;
        if (!mimeType && content.file_name) {
          mimeType = S3Service.getMimeTypeFromFilename(content.file_name);
          console.log(`📝 Inferred MIME type for ${content.file_name}: ${mimeType}`);
        }
        
        // Debug logging for video files
        if (mimeType && mimeType.startsWith('video/')) {
          console.log(`🎬 Processing VIDEO content:`, {
            title: content.title,
            fileName: content.file_name,
            mimeType,
            contentType: content.content_type,
            hasUrl: !!content.content_url,
            expiresIn: finalExpiresIn
          });
        }
        
        // Pass MIME type for better streaming support on videos/images
        const processedUrl = await this.generateSignedUrl(content.content_url, finalExpiresIn, mimeType);
        // Always keep original URL if processing fails (processedUrl could be undefined)
        if (processedUrl) {
          content.content_url = processedUrl;
          
          // Additional debug for videos
          if (mimeType && mimeType.startsWith('video/')) {
            console.log(`✅ Video signed URL generated successfully with ${finalExpiresIn}s expiration`);
          }
        } else {
          console.warn(`⚠️ Failed to process URL, keeping original`);
        }
        // If processedUrl is undefined, keep original content.content_url
      }

      // Process content_text (for embedded S3 URLs in text content)
      if (content.content_text && typeof content.content_text === 'string') {
        // Find all S3 URLs in the text
        const s3UrlPattern = /https:\/\/[a-zA-Z0-9\-\.]+\.s3[.\-a-zA-Z0-9]*\.amazonaws\.com\/[^\s"'<>]+/g;
        const matches = content.content_text.match(s3UrlPattern);

        if (matches) {
          // Get MIME type for embedded URLs
          let mimeType = content.mime_type;
          if (!mimeType && content.file_name) {
            mimeType = S3Service.getMimeTypeFromFilename(content.file_name);
          }

          // Process each URL concurrently
          const urlMap = new Map<string, string>();
          
          for (const match of matches) {
            if (!urlMap.has(match)) {
              const signedUrl = await this.generateSignedUrl(match, finalExpiresIn, mimeType);
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
      console.log(`🔍 Processing exam material URLs - id=${material.id}, type=${material.material_type}`);
      
      // Infer MIME type if not in database
      let mimeType = material.mime_type;
      if (!mimeType && material.file_name) {
        mimeType = S3Service.getMimeTypeFromFilename(material.file_name);
      }
      
      // Infer MIME type from content_url filename if still not available
      if (!mimeType && material.content_url) {
        const filename = material.content_url.split('/').pop(); // Get last part - the filename
        mimeType = S3Service.getMimeTypeFromFilename(filename);
        console.log(`📝 Inferred MIME type from content_url filename: ${mimeType}`);
      }

      // Process pdf_file_url
      if (material.pdf_file_url) {
        console.log(`  📄 Processing pdf_file_url: ${material.pdf_file_url.substring(0, 50)}...`);
        let urlToProcess = material.pdf_file_url;
        // If it's just a filename/key without URL format, try to construct full S3 URL
        if (!urlToProcess.includes('://') && urlToProcess.includes('/')) {
          // It's likely an S3 key like "exams/1/4/filename"
          urlToProcess = `https://borigam.s3.ap-south-2.amazonaws.com/${urlToProcess}`;
          console.log(`  ✏️ Constructed S3 URL from key: ${urlToProcess.substring(0, 50)}...`);
        } else if (!urlToProcess.includes('://')) {
          // Just a filename - skip, it's not a valid S3 reference
          console.warn(`⚠️ Exam material pdf_file_url is just a filename, unable to process: ${urlToProcess}`);
          return;
        }
        const processedPdfUrl = await this.generateSignedUrl(urlToProcess, expiresIn, mimeType);
        if (processedPdfUrl) {
          material.pdf_file_url = processedPdfUrl;
          console.log(`  ✅ Generated signed URL for pdf_file_url`);
        } else {
          console.warn(`  ⚠️ Failed to generate signed URL for pdf_file_url`);
        }
      }

      // Process content_url (for videos stored in S3)
      if (material.content_url) {
        console.log(`  🎬 Processing content_url: ${material.content_url.substring(0, 50)}...`);
        
        // Skip YouTube URLs - they don't need processing
        if (material.content_url.includes('youtube') || material.content_url.includes('youtu.be')) {
          console.log(`  ℹ️ YouTube URL detected, skipping signed URL generation`);
          return;
        }
        
        // Check if it's a full S3 URL
        let urlToProcess = material.content_url;
        const fileKey = this.extractS3FileKey(material.content_url);
        
        if (fileKey) {
          // It's an S3 URL or valid S3 key - process normally
          console.log(`  ✏️ Extracted S3 file key: ${fileKey.substring(0, 50)}...`);
          const processedContentUrl = await this.generateSignedUrl(urlToProcess, expiresIn, mimeType);
          if (processedContentUrl) {
            material.content_url = processedContentUrl;
            console.log(`  ✅ Generated signed URL for content_url`);
          } else {
            console.warn(`  ⚠️ Failed to generate signed URL for content_url`);
          }
        } else if (!material.content_url.includes('://')) {
          // It's just a filename, not a full URL
          // This shouldn't happen with new uploads, but handles legacy data
          console.warn(`⚠️ Exam material content_url appears to be just a filename, unable to generate signed URL: ${material.content_url}`);
          // Don't modify it, keep as-is since we can't process it
        } else {
          console.warn(`⚠️ Could not extract S3 file key from content_url: ${material.content_url}`);
        }
      }

      // Process description if it contains S3 URLs
      if (material.description && typeof material.description === 'string') {
        const s3UrlPattern = /https:\/\/[a-zA-Z0-9\-\.]+\.s3[.\-a-zA-Z0-9]*\.amazonaws\.com\/[^\s"'<>]+/g;
        const matches = material.description.match(s3UrlPattern);

        if (matches) {
          console.log(`  📝 Found ${matches.length} S3 URLs in description`);
          let updatedText = material.description;
          for (const match of matches) {
            const signedUrl = await this.generateSignedUrl(match, expiresIn, mimeType);
            if (signedUrl) {
              updatedText = updatedText.replaceAll(match, signedUrl);
            }
          }
          material.description = updatedText;
          console.log(`  ✅ Updated description with signed URLs`);
        }
      }
    } catch (error) {
      console.error('❌ Error processing exam material signed URLs:', error);
      // Continue anyway - don't fail the entire request
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
