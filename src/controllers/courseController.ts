import { Request, Response } from 'express';
import {
  courseValidation,
  courseSectionValidation,
  courseContentValidation,
  courseCategoryValidation,
  courseRatingValidation,
  validateData
} from '../utils/validations';
import {
  CourseQueries,
  CourseCategoryQueries,
  CourseSectionQueries,
  CourseContentQueries,
  CourseRatingQueries
} from '../queries/courseQueries';
import { InstitutionStudentQueries } from '../queries/studentQueries';
import { DatabaseTransaction, DatabaseHelpers } from '../utils/database';
import { S3Service } from '../utils/s3Service';
import { FileUploadValidator, handleMulterError } from '../utils/uploadMiddleware';
import { SignedUrlHelper } from '../utils/signedUrlHelper';

// Legacy compatibility wrappers - now use SignedUrlHelper
async function processContentSignedUrls(content: any): Promise<void> {
  await SignedUrlHelper.processContentSignedUrls(content);
}

async function processCourseImageSignedUrl(course: any): Promise<void> {
  await SignedUrlHelper.processCourseImageSignedUrl(course);
}

// Define interfaces for better type safety
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
}

interface CreateCourseRequest extends AuthenticatedRequest {
  body: {
    title: string;
    description: string;
    course_image?: string;
    duration: string;
    levels: string[] | string; // Can be array or comma-separated string
    category_id: string; // Form-data sends as string, needs parsing
  };
}

interface CreateSectionRequest extends AuthenticatedRequest {
  body: {
    course_id: number;
    title: string;
    description?: string;
    sort_order?: number;
    is_free?: boolean;
  };
}

interface CreateContentRequest extends AuthenticatedRequest {
  body: {
    course_id: number;
    section_id: number;
    title: string;
    description?: string;
    content_type: string;
    content_url?: string;
    content_text?: string;
    youtube_url?: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    duration?: number;
    sort_order?: number;
    is_free?: boolean;
  };
}

export class CourseController {

  /**
   * Create a new course (Admin only)
   * POST /api/courses
   */
  static async createCourse(req: CreateCourseRequest, res: Response): Promise<void> {
    try {
      // Extract data from form-data fields - multer parses them into req.body
      console.log('🔍 Raw req.body:', req.body);
      console.log('🔍 Raw req.file:', req.file ? { name: req.file.originalname, size: req.file.size } : 'No file');
      
      const title = req.body.title;
      const description = req.body.description;
      const course_image = req.body.course_image; // URL if provided
      const duration = req.body.duration;
      const levels = req.body.levels;
      const category_id = req.body.category_id ? parseInt(req.body.category_id as string) : undefined;

      console.log('📋 Parsed course data:', {
        title,
        description,
        duration,
        levels,
        category_id,
        hasFile: !!req.file,
        fileName: req.file?.originalname
      });

      // Validate required fields
      if (!title || !description || !duration || !levels || !category_id) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields',
          errors: {
            title: !title ? 'Title is required' : null,
            description: !description ? 'Description is required' : null,
            duration: !duration ? 'Duration is required' : null,
            levels: !levels ? 'Levels are required' : null,
            category_id: !category_id ? 'Category ID is required' : null
          }
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Handle course image - either file upload or URL
        let finalCourseImage = null;
        
        if (req.file) {
          // File uploaded via form-data - upload to S3
          console.log('📁 File uploaded:', req.file.originalname, 'Size:', req.file.size);
          const uploadResult = await S3Service.uploadCourseImage(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
          );
          finalCourseImage = uploadResult.url;
          console.log('✅ Image uploaded to S3:', finalCourseImage);
        } else if (course_image) {
          // URL provided in form-data
          finalCourseImage = course_image;
          console.log('🔗 Using provided URL:', finalCourseImage);
        } else {
          console.log('📷 No image provided');
        }
        
        // Convert levels from string to array if needed
        let processedLevels = levels;
        if (typeof levels === 'string') {
          // Handle comma-separated string or JSON array string
          if (levels.startsWith('[') && levels.endsWith(']')) {
            try {
              processedLevels = JSON.parse(levels);
            } catch (error) {
              processedLevels = levels.split(',').map((level: string) => level.trim());
            }
          } else {
            processedLevels = levels.split(',').map((level: string) => level.trim());
          }
        }
        
        // Normalize levels to uppercase for consistency
        if (Array.isArray(processedLevels)) {
          processedLevels = processedLevels.map((level: string) => level.toUpperCase());
        }

        // Validate category_id
        if (isNaN(category_id) || category_id <= 0) {
          res.status(400).json({
            status: 'error',
            message: 'Invalid category ID'
          });
          return;
        }
        
        // Validate input data - use processed image URL
        const courseData = {
          title,
          description,
          course_image: finalCourseImage, // Use processed image URL, not original req.body value
          duration,
          levels: processedLevels,
          category_id
        };

        const validation = validateData(courseData, courseValidation.createCourse);
        if (!validation.isValid) {
          res.status(400).json({
            status: 'error',
            message: 'Course validation failed',
            errors: validation.errors
          });
          return;
        }

        // Verify category exists
        const category = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseCategoryQueries.getCategoryById,
          [category_id]
        );

        if (!category) {
          res.status(400).json({
            status: 'error',
            message: 'Invalid category ID'
          });
          return;
        }

        // Create the course
        const courseId = await DatabaseHelpers.executeInsert(
          connection,
          CourseQueries.createCourse,
          [
            title,
            description,
            finalCourseImage || null, // Convert undefined to null
            duration,
            JSON.stringify(processedLevels), // Store levels as JSON
            category_id,
            req.user?.id || null, // Convert undefined to null
            req.user?.id || null  // Convert undefined to null
          ]
        );

        // Get the created course
        const createdCourse = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [courseId]
        );

        // Parse levels from JSON for response
        if (createdCourse && createdCourse.levels) {
          try {
            createdCourse.levels = JSON.parse(createdCourse.levels);
          } catch (error) {
            // If JSON parsing fails, treat as comma-separated string
            if (typeof createdCourse.levels === 'string') {
              createdCourse.levels = createdCourse.levels.split(',').map((level: string) => level.trim());
            }
          }
        }

        res.status(201).json({
          status: 'success',
          message: 'Course created successfully',
          data: {
            course: createdCourse
          }
        });
      });

    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all courses with pagination
   * GET /api/courses
   */
  static async getAllCourses(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        let courses: any[] = [];
        let institutionId: number | null = null;

        // Check if user is Institute Admin - filter courses by their institution
        if (req.user?.roles.includes('Institute Admin')) {
          const institution = await DatabaseHelpers.executeSelectOne(
            connection,
            InstitutionStudentQueries.getInstitutionByAdminUserId,
            [req.user!.id]
          );

          if (!institution) {
            res.status(404).json({
              status: 'error',
              message: 'Institution not found for this administrator'
            });
            return;
          }

          institutionId = institution.id;

          // Get only courses offered by this institution
          courses = await DatabaseHelpers.executeSelect(
            connection,
            CourseQueries.getCoursesByInstitution,
            [institutionId]
          );
        } else {
          // For Admin and Students, get all active courses
          courses = await DatabaseHelpers.executeSelect(
            connection,
            CourseQueries.getAllCoursesBase,
            []
          );
        }

        // Enrich each course with sections and contents
        for (const course of courses) {
          // Parse levels JSON for each course
          if (course.levels) {
            try {
              course.levels = JSON.parse(course.levels);
            } catch (error) {
              // If JSON parsing fails, treat as comma-separated string
              if (typeof course.levels === 'string') {
                course.levels = course.levels.split(',').map((level: string) => level.trim());
              }
            }
          }

          // Generate signed URL for S3 course image
          await processCourseImageSignedUrl(course);

          // Get course sections and contents
          const sections = await DatabaseHelpers.executeSelect(
            connection,
            CourseSectionQueries.getSectionsByCourse,
            [course.id]
          );

          // Get contents for each section
          for (const section of sections) {
            section.contents = await DatabaseHelpers.executeSelect(
              connection,
              CourseContentQueries.getContentsBySection,
              [section.id]
            );
            
            // Generate signed URLs for all content in this section
            for (const content of section.contents) {
              await processContentSignedUrls(content);
            }
          }

          course.sections = sections;
        }

        res.status(200).json({
          status: 'success',
          message: 'Courses retrieved successfully',
          data: {
            courses,
            total_courses: courses.length,
            filtered_by_institution: req.user?.roles.includes('Institute Admin') ? true : false,
            institution_id: institutionId
          }
        });
      });

    } catch (error) {
      console.error('Error getting courses:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get course by ID
   * GET /api/courses/:id
   */
  static async getCourseById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.id as string);

      if (isNaN(courseId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const course = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [courseId]
        );

        if (!course) {
          res.status(404).json({
            status: 'error',
            message: 'Course not found'
          });
          return;
        }

        // Parse levels JSON
        if (course.levels) {
          try {
            course.levels = JSON.parse(course.levels);
          } catch (error) {
            // If JSON parsing fails, treat as comma-separated string
            if (typeof course.levels === 'string') {
              course.levels = course.levels.split(',').map((level: string) => level.trim());
            }
          }
        }

        // Generate signed URL for S3 course image
        await processCourseImageSignedUrl(course);

        // Get course sections and contents
        const sections = await DatabaseHelpers.executeSelect(
          connection,
          CourseSectionQueries.getSectionsByCourse,
          [courseId]
        );

        // Get contents for each section
        for (const section of sections) {
          section.contents = await DatabaseHelpers.executeSelect(
            connection,
            CourseContentQueries.getContentsBySection,
            [section.id]
          );
          
          // Generate signed URLs for all content in this section
          for (const content of section.contents) {
            await processContentSignedUrls(content);
          }
        }

        // Get course ratings
        const ratings = await DatabaseHelpers.executeSelect(
          connection,
          CourseRatingQueries.getCourseRatings,
          [courseId]
        );

        // Get average rating
        const ratingStats = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseRatingQueries.getCourseAverageRating,
          [courseId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Course retrieved successfully',
          data: {
            course: {
              ...course,
              sections,
              ratings,
              average_rating: ratingStats.average_rating || 0,
              total_ratings: ratingStats.total_ratings || 0
            }
          }
        });
      });

    } catch (error) {
      console.error('Error getting course:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update course (Admin only)
   * PUT /api/courses/:id
   */
  static async updateCourse(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.id as string);
      
      // Extract data from form-data fields
      console.log('🔍 Raw req.body for update:', req.body);
      console.log('🔍 Raw req.file for update:', req.file ? { name: req.file.originalname, size: req.file.size } : 'No file');
      
      const title = req.body.title;
      const description = req.body.description;
      const course_image = req.body.course_image; // URL if provided
      const duration = req.body.duration;
      const levels = req.body.levels;
      const category_id = req.body.category_id ? parseInt(req.body.category_id as string) : undefined;

      console.log('📋 Parsed course update data:', {
        courseId,
        title,
        description,
        duration,
        levels,
        category_id,
        hasFile: !!req.file,
        fileName: req.file?.originalname
      });

      if (isNaN(courseId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Handle course image - either file upload or URL
        let finalCourseImage = null;
        let updateImage = false;
        
        if (req.file) {
          // File uploaded via form-data - upload to S3
          console.log('📁 File uploaded for course update:', req.file.originalname, 'Size:', req.file.size);
          const uploadResult = await S3Service.uploadCourseImage(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            courseId
          );
          finalCourseImage = uploadResult.url;
          updateImage = true;
          console.log('✅ Image uploaded to S3:', finalCourseImage);
        } else if (course_image !== undefined) {
          // URL provided in body (could be new URL or null to remove image)
          finalCourseImage = course_image;
          updateImage = true;
          console.log('🔗 Using provided URL:', finalCourseImage);
        } else {
          // Keep existing image if updating other fields
          console.log('📷 No new image provided - keeping existing');
        }
        
        // Convert levels from string to array if needed
        let processedLevels = levels;
        if (levels && typeof levels === 'string') {
          // Handle comma-separated string or JSON array string
          if (levels.startsWith('[') && levels.endsWith(']')) {
            try {
              processedLevels = JSON.parse(levels);
            } catch (error) {
              processedLevels = levels.split(',').map((level: string) => level.trim());
            }
          } else {
            processedLevels = levels.split(',').map((level: string) => level.trim());
          }
        }
        
        // Normalize levels to uppercase for consistency (only if levels are provided)
        if (processedLevels && Array.isArray(processedLevels)) {
          processedLevels = processedLevels.map((level: string) => level.toUpperCase());
        }

        // Validate category_id if provided
        if (category_id !== undefined && (isNaN(category_id) || category_id <= 0)) {
          res.status(400).json({
            status: 'error',
            message: 'Invalid category ID'
          });
          return;
        }
        
        // Validate input data - use processed image URL
        const courseData = {
          title,
          description,
          course_image: finalCourseImage, // Use processed image URL, not original req.body value
          duration,
          levels: processedLevels,
          category_id
        };

        const validation = validateData(courseData, courseValidation.updateCourse);
        if (!validation.isValid) {
          res.status(400).json({
            status: 'error',
            message: 'Course validation failed',
            errors: validation.errors
          });
          return;
        }

        // Check if course exists
        const existingCourse = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [courseId]
        );

        if (!existingCourse) {
          res.status(404).json({
            status: 'error',
            message: 'Course not found'
          });
          return;
        }

        // Verify category exists if provided
        if (category_id) {
          const category = await DatabaseHelpers.executeSelectOne(
            connection,
            CourseCategoryQueries.getCategoryById,
            [category_id]
          );

          if (!category) {
            res.status(400).json({
              status: 'error',
              message: 'Invalid category ID'
            });
            return;
          }
        }

        // Update the course
        if (updateImage) {
          // Update including course image
          await DatabaseHelpers.executeQuery(
            connection,
            CourseQueries.updateCourse,
            [
              title,
              description,
              finalCourseImage || null, // Convert undefined to null
              duration,
              JSON.stringify(processedLevels), // Store levels as JSON
              category_id,
              req.user?.id || null, // Convert undefined to null
              courseId
            ]
          );
        } else {
          // Update without changing course image
          await DatabaseHelpers.executeQuery(
            connection,
            CourseQueries.updateCourseWithoutImage,
            [
              title,
              description,
              duration,
              JSON.stringify(processedLevels), // Store levels as JSON
              category_id,
              req.user?.id || null, // Convert undefined to null
              courseId
            ]
          );
        }

        // Get updated course
        const updatedCourse = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [courseId]
        );

        // Parse levels from JSON for response
        if (updatedCourse && updatedCourse.levels) {
          try {
            updatedCourse.levels = JSON.parse(updatedCourse.levels);
          } catch (error) {
            // If JSON parsing fails, treat as comma-separated string
            if (typeof updatedCourse.levels === 'string') {
              updatedCourse.levels = updatedCourse.levels.split(',').map((level: string) => level.trim());
            }
          }
        }

        res.status(200).json({
          status: 'success',
          message: 'Course updated successfully',
          data: {
            course: updatedCourse
          }
        });
      });

    } catch (error) {
      console.error('Error updating course:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete course (Admin only)
   * DELETE /api/courses/:id
   */
  static async deleteCourse(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.id as string);

      if (isNaN(courseId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if course exists
        const course = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [courseId]
        );

        if (!course) {
          res.status(404).json({
            status: 'error',
            message: 'Course not found'
          });
          return;
        }

        // Delete all course contents first (to handle S3 files)
        const contents = await DatabaseHelpers.executeSelect(
          connection,
          'SELECT * FROM course_contents WHERE course_id = ?',
          [courseId]
        );

        // Delete S3 files for course contents
        for (const content of contents) {
          if (content.content_url && content.content_url.includes('amazonaws.com')) {
            try {
              const s3Key = content.content_url.split('/').pop();
              if (s3Key) {
                await S3Service.deleteFile(s3Key);
              }
            } catch (s3Error) {
              console.warn('Failed to delete S3 file:', s3Error);
              // Continue with database deletion even if S3 deletion fails
            }
          }
        }

        // Delete course (cascading will handle sections and contents)
        await DatabaseHelpers.executeQuery(
          connection,
          CourseQueries.deleteCourse,
          [req.user?.id || null, courseId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Course deleted successfully'
        });
      });

    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Create course section (Admin only)
   * POST /api/courses/:courseId/sections
   */
  static async createSection(req: CreateSectionRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      
      // Check if req.body exists and is not empty
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is required. Please ensure Content-Type is set to application/json and body contains section data.'
        });
        return;
      }
      
      const { title, description, sort_order = 0, is_free = false } = req.body;

      if (isNaN(courseId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Validate input data
        const sectionData = {
          course_id: courseId,
          title,
          description,
          sort_order,
          is_free
        };

        const validation = validateData(sectionData, courseSectionValidation.createSection);
        if (!validation.isValid) {
          res.status(400).json({
            status: 'error',
            message: 'Section validation failed',
            errors: validation.errors
          });
          return;
        }

        // Verify course exists
        const course = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [courseId]
        );

        if (!course) {
          res.status(404).json({
            status: 'error',
            message: 'Course not found'
          });
          return;
        }

        // Create the section
        const sectionId = await DatabaseHelpers.executeInsert(
          connection,
          CourseSectionQueries.createSection,
          [
            courseId,
            title || null,
            description || null,
            sort_order || 0,
            is_free || false,
            req.user?.id || null,
            req.user?.id || null
          ]
        );

        // Get the created section
        const createdSection = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseSectionQueries.getSectionById,
          [sectionId]
        );

        res.status(201).json({
          status: 'success',
          message: 'Course section created successfully',
          data: {
            section: createdSection
          }
        });
      });

    } catch (error) {
      console.error('Error creating course section:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get course sections
   * GET /api/courses/:courseId/sections
   */
  static async getCourseSections(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);

      if (isNaN(courseId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Verify course exists
        const course = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [courseId]
        );

        if (!course) {
          res.status(404).json({
            status: 'error',
            message: 'Course not found'
          });
          return;
        }

        // Get course sections
        const sections = await DatabaseHelpers.executeSelect(
          connection,
          CourseSectionQueries.getSectionsByCourse,
          [courseId]
        );

        // Get contents for each section and process signed URLs
        for (const section of sections) {
          section.contents = await DatabaseHelpers.executeSelect(
            connection,
            CourseContentQueries.getContentsBySection,
            [section.id]
          );
          
          // Generate signed URLs for all content in this section
          for (const content of section.contents) {
            await SignedUrlHelper.processContentSignedUrls(content);
          }
        }

        res.status(200).json({
          status: 'success',
          message: 'Course sections retrieved successfully',
          data: {
            course_id: courseId,
            course_title: course.title,
            sections
          }
        });
      });

    } catch (error) {
      console.error('Error getting course sections:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get section contents
   * GET /api/courses/:courseId/sections/:sectionId/contents
   */
  static async getSectionContents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const sectionId = parseInt(req.params.sectionId as string);

      if (isNaN(courseId) || isNaN(sectionId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID or section ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Verify section exists and belongs to the course
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT cs.*, c.title as course_title 
           FROM course_sections cs
           JOIN courses c ON cs.course_id = c.id
           WHERE cs.id = ? AND cs.course_id = ? AND cs.status = 1`,
          [sectionId, courseId]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Section not found'
          });
          return;
        }

        // Get section contents
        const contents = await DatabaseHelpers.executeSelect(
          connection,
          CourseContentQueries.getContentsBySection,
          [sectionId]
        );

        // For students, add progress information and auto-track section view
        let contentsWithProgress = contents;
        if (req.user!.roles.includes('Student')) {
          const student = await DatabaseHelpers.executeSelectOne(
            connection,
            'SELECT id FROM students WHERE user_id = ? AND status = 1',
            [req.user!.id]
          );

          if (student) {
            contentsWithProgress = await Promise.all(contents.map(async (content) => {
              const progress = await DatabaseHelpers.executeSelectOne(
                connection,
                `SELECT is_accessed, is_completed, accessed_at, completed_at 
                 FROM student_content_progress 
                 WHERE student_id = ? AND course_id = ? AND content_id = ?`,
                [student.id, courseId, content.id]
              );

              return {
                ...content,
                progress: {
                  is_accessed: progress?.is_accessed || false,
                  is_completed: progress?.is_completed || false,
                  accessed_at: progress?.accessed_at || null,
                  completed_at: progress?.completed_at || null
                }
              };
            }));
          }
        }

        // Generate signed URLs for all content
        for (const content of contentsWithProgress) {
          await processContentSignedUrls(content);
        }

        res.status(200).json({
          status: 'success',
          message: 'Section contents retrieved successfully',
          data: {
            section: {
              id: section.id,
              title: section.title,
              description: section.description,
              sort_order: section.sort_order,
              course_id: courseId,
              course_title: section.course_title
            },
            contents: contentsWithProgress,
            userRole: req.user!.roles[0],
            hasProgress: req.user!.roles.includes('Student')
          }
        });
      });

    } catch (error) {
      console.error('Error getting section contents:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Create course content (Admin only)
   * POST /api/courses/:courseId/sections/:sectionId/contents
   */
  static async createContent(req: CreateContentRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const sectionId = parseInt(req.params.sectionId as string);
      
      // Check if req.body exists and is not empty
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is required. Please ensure Content-Type is set to application/json and body contains content data.'
        });
        return;
      }
      
      const {
        title,
        description,
        content_type,
        content_url,
        content_text,
        youtube_url,
        file_name,
        file_size = 0,
        mime_type,
        duration = 0,
        sort_order = 0,
        is_free = false
      } = req.body;

      // Handle both content_text and content_data field names (content_data is alternative field name)
      const finalContentText = content_text || (req.body as any).content_data;

      if (isNaN(courseId) || isNaN(sectionId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID or section ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Prepare content data for validation
        const contentData = {
          course_id: courseId,
          section_id: sectionId,
          title,
          description,
          content_type,
          content_url,
          content_text: finalContentText, // Use the combined field
          youtube_url,
          file_name,
          file_size,
          mime_type,
          duration,
          sort_order,
          is_free
        };

        // Log content data for debugging (remove in production)
        console.log('🔍 Content data being validated:', {
          content_type,
          title,
          content_text: finalContentText ? `[${finalContentText.length} chars]` : finalContentText,
          content_url: content_url || '[not provided]'
        });

        const validation = validateData(contentData, courseContentValidation.createContent);
        if (!validation.isValid) {
          res.status(400).json({
            status: 'error',
            message: 'Content validation failed',
            errors: validation.errors,
            receivedData: {
              content_type,
              title: !!title,
              content_text: !!finalContentText,
              content_url: !!content_url,
              youtube_url: !!youtube_url
            }
          });
          return;
        }

        // Verify section exists and belongs to course
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT * FROM course_sections WHERE id = ? AND course_id = ? AND status = 1`,
          [sectionId, courseId]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Section not found or does not belong to this course'
          });
          return;
        }

        // Create the content
        const contentId = await DatabaseHelpers.executeInsert(
          connection,
          CourseContentQueries.createContent,
          [
            courseId,
            sectionId,
            title || null,
            description || null,
            content_type,
            content_url || null,
            finalContentText || null,
            youtube_url || null,
            file_name || null,
            file_size || null,
            mime_type || null,
            duration || 0,
            sort_order || 0,
            is_free || false,
            req.user?.id || null,
            req.user?.id || null
          ]
        );

        // Get the created content
        const createdContent = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseContentQueries.getContentById,
          [contentId]
        );

        // Generate signed URLs for the created content
        await processContentSignedUrls(createdContent);

        res.status(201).json({
          status: 'success',
          message: 'Course content created successfully',
          data: {
            content: createdContent
          }
        });
      });

    } catch (error) {
      console.error('Error creating course content:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Create course content with file upload (Admin only)
   * POST /api/courses/:courseId/sections/:sectionId/contents/upload
   */
  static async uploadContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const sectionId = parseInt(req.params.sectionId as string);
      
      // For file uploads, we need either req.file OR valid req.body, not necessarily both
      if ((!req.body || Object.keys(req.body).length === 0) && !req.file) {
        res.status(400).json({
          status: 'error',
          message: 'Request body and/or file is required. Please ensure you provide form data with content information.'
        });
        return;
      }
      
      const { title, description, content_type, duration = 0, sort_order = 0, is_free = false } = req.body || {};
      const file = req.file;

      if (isNaN(courseId) || isNaN(sectionId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID or section ID'
        });
        return;
      }

      if (!file) {
        res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
        return;
      }

      // Validate file
      const fileErrors = FileUploadValidator.getValidationErrors(file, content_type);
      if (fileErrors.length > 0) {
        res.status(400).json({
          status: 'error',
          message: 'File validation failed',
          errors: fileErrors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Validate input data
        const contentData = {
          course_id: courseId,
          section_id: sectionId,
          title,
          description,
          content_type,
          duration: parseInt(duration) || 0,
          sort_order: parseInt(sort_order) || 0,
          is_free: is_free === 'true' || is_free === true,
          file_size: file.size,
          mime_type: file.mimetype
        };

        const validation = validateData(contentData, courseContentValidation.createContent);
        if (!validation.isValid) {
          res.status(400).json({
            status: 'error',
            message: 'Content validation failed',
            errors: validation.errors
          });
          return;
        }

        // Verify section exists and belongs to course
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT cs.*, c.title as course_name 
           FROM course_sections cs
           JOIN courses c ON cs.course_id = c.id
           WHERE cs.id = ? AND cs.course_id = ? AND cs.status = 1`,
          [sectionId, courseId]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Section not found or does not belong to this course'
          });
          return;
        }

        try {
          // Upload file to S3 with descriptive names
          const uploadResult = await S3Service.uploadFile({
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            courseId,
            sectionId,
            contentType: content_type,
            courseName: section.course_name,
            sectionName: section.title
          });

          // Create content record in database
          const contentId = await DatabaseHelpers.executeInsert(
            connection,
            CourseContentQueries.createContent,
            [
              courseId,
              sectionId,
              title || null,
              description || null,
              S3Service.getFileTypeCategory(file.mimetype), // Use detected content type
              uploadResult.url || null, // Store full S3 URL
              null, // content_text
              null, // youtube_url (not applicable for file uploads)
              FileUploadValidator.sanitizeFileName(file.originalname) || null, // sanitized file_name
              file.size || null, // file_size
              file.mimetype || null, // mime_type
              parseInt(duration) || 0, // duration
              parseInt(sort_order) || 0, // sort_order
              contentData.is_free || false, // is_free
              req.user?.id || null, // created_by
              req.user?.id || null  // updated_by
            ]
          );

          // Get the created content
          const createdContent = await DatabaseHelpers.executeSelectOne(
            connection,
            CourseContentQueries.getContentById,
            [contentId]
          );

          // Generate signed URLs for the uploaded content
          await processContentSignedUrls(createdContent);

          res.status(201).json({
            status: 'success',
            message: 'Content uploaded successfully',
            data: {
              content: {
                ...createdContent,
                formatted_size: S3Service.formatFileSize(file.size)
              },
              upload_details: {
                s3_key: uploadResult.key,
                file_size: S3Service.formatFileSize(file.size),
                content_type_detected: S3Service.getFileTypeCategory(file.mimetype)
              }
            }
          });

        } catch (uploadError) {
          console.error('File upload error:', uploadError);
          res.status(500).json({
            status: 'error',
            message: 'Failed to upload file to storage'
          });
        }
      });

    } catch (error) {
      console.error('Error uploading course content:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get content with signed URL for secure access
   * GET /api/courses/:courseId/contents/:contentId/access
   */
  static async getContentAccess(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const contentId = parseInt(req.params.contentId as string);
      const expiresIn = parseInt(req.query.expires as string) || 3600; // Default 1 hour

      if (isNaN(courseId) || isNaN(contentId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID or content ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get content details
        const content = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT cc.*, cs.title as section_title, c.title as course_title 
           FROM course_contents cc
           JOIN course_sections cs ON cc.section_id = cs.id
           JOIN courses c ON cc.course_id = c.id
           WHERE cc.id = ? AND cc.course_id = ? AND cc.status = 1`,
          [contentId, courseId]
        );

        if (!content) {
          res.status(404).json({
            status: 'error',
            message: 'Content not found'
          });
          return;
        }

        // Auto-track access for students when they view content
        let studentProgress = null;
        if (req.user!.roles.includes('Student')) {
          const student = await DatabaseHelpers.executeSelectOne(
            connection,
            'SELECT id FROM students WHERE user_id = ? AND status = 1',
            [req.user!.id]
          );

          if (student) {
            // Check enrollment first
            const enrollment = await DatabaseHelpers.executeSelectOne(
              connection,
              `SELECT id FROM student_courses 
               WHERE student_id = ? AND course_id = ? AND status = 1`,
              [student.id, courseId]
            );

            if (!enrollment) {
              res.status(403).json({
                status: 'error',
                message: 'You are not enrolled in this course'
              });
              return;
            }

            // Auto-mark as accessed when viewing content
            await DatabaseHelpers.executeQuery(
              connection,
              `INSERT INTO student_content_progress 
               (student_id, course_id, content_id, is_accessed, accessed_at, created_by, updated_by)
               VALUES (?, ?, ?, ?, NOW(), ?, ?)
               ON DUPLICATE KEY UPDATE 
               is_accessed = VALUES(is_accessed), 
               accessed_at = COALESCE(accessed_at, VALUES(accessed_at)),
               updated_by = VALUES(updated_by)`,
              [student.id, courseId, contentId, true, req.user!.id, req.user!.id]
            );

            // Get updated progress
            studentProgress = await DatabaseHelpers.executeSelectOne(
              connection,
              `SELECT is_accessed, is_completed, accessed_at, completed_at 
               FROM student_content_progress 
               WHERE student_id = ? AND course_id = ? AND content_id = ?`,
              [student.id, courseId, contentId]
            );
          }
        } else if (req.user!.roles.includes('Institute Admin') && !req.user!.roles.includes('Admin')) {
          // Institute Admin: Check if course is offered by their institution
          const institutionCourse = await DatabaseHelpers.executeSelectOne(
            connection,
            `SELECT ic.id FROM institution_courses ic 
             JOIN institutions i ON ic.institution_id = i.id 
             WHERE i.email = ? AND ic.course_id = ? AND ic.status = 1`,
            [req.user!.email, courseId]
          );

          if (!institutionCourse) {
            res.status(403).json({
              status: 'error',
              message: 'This course is not offered by your institution'
            });
            return;
          }
        }
        // Admins have global access (no additional checks)

        // Generate signed URLs for all S3 content
        await processContentSignedUrls(content);

        // For direct access, return the appropriate URL
        let accessUrl = content.content_url || null;

        // For text content, return content_text instead of URL
        if (content.content_type === 'TEXT') {
          accessUrl = null; // Text content is returned in content_text field
        }

        res.status(200).json({
          status: 'success',
          message: 'Content access granted',
          data: {
            content: {
              id: content.id,
              title: content.title,
              description: content.description,
              content_type: content.content_type,
              access_url: accessUrl,
              progress: studentProgress ? {
                is_accessed: studentProgress.is_accessed || false,
                is_completed: studentProgress.is_completed || false,
                accessed_at: studentProgress.accessed_at || null,
                completed_at: studentProgress.completed_at || null
              } : null,
              content_text: content.content_text,
              file_name: content.file_name,
              file_size: content.file_size ? S3Service.formatFileSize(content.file_size) : null,
              mime_type: content.mime_type,
              duration: content.duration,
              is_free: content.is_free,
              section_title: content.section_title,
              course_title: content.course_title
            },
            access_details: {
              expires_at: new Date(Date.now() + (expiresIn * 1000)).toISOString(),
              expires_in_hours: expiresIn / 3600
            }
          }
        });
      });

    } catch (error) {
      console.error('Error getting content access:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all categories
   * GET /api/courses/categories
   */
  static async getAllCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const categories = await DatabaseHelpers.executeSelect(
          connection,
          CourseCategoryQueries.getAllCategories,
          []
        );

        res.status(200).json({
          status: 'success',
          message: 'Categories retrieved successfully',
          data: {
            categories
          }
        });
      });

    } catch (error) {
      console.error('Error getting categories:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Create a new category (Admin only)
   * POST /api/courses/categories
   */
  static async createCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check if req.body exists and is not empty
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is required. Please ensure Content-Type is set to application/json and body contains category data.'
        });
        return;
      }
      
      const { name, description } = req.body;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Validate input data
        const categoryData = { name, description };
        
        const validation = validateData(categoryData, courseCategoryValidation.createCategory);
        if (!validation.isValid) {
          res.status(400).json({
            status: 'error',
            message: 'Category validation failed',
            errors: validation.errors
          });
          return;
        }

        // Check if category name already exists
        const existingCategory = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT id FROM course_categories WHERE name = ? AND status = 1`,
          [name]
        );

        if (existingCategory) {
          res.status(400).json({
            status: 'error',
            message: 'Category with this name already exists'
          });
          return;
        }

        // Create the category
        const categoryId = await DatabaseHelpers.executeInsert(
          connection,
          CourseCategoryQueries.createCategory,
          [name || null, description || null, req.user?.id || null, req.user?.id || null]
        );

        // Get the created category
        const createdCategory = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseCategoryQueries.getCategoryById,
          [categoryId]
        );

        res.status(201).json({
          status: 'success',
          message: 'Category created successfully',
          data: {
            category: createdCategory
          }
        });
      });

    } catch (error) {
      console.error('Error creating category:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete content and associated S3 file (Admin only)  
   * DELETE /api/courses/:courseId/contents/:contentId
   */
  static async deleteContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const contentId = parseInt(req.params.contentId as string);

      if (isNaN(courseId) || isNaN(contentId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID or content ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get content details before deletion
        const content = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT * FROM course_contents WHERE id = ? AND course_id = ? AND status = 1`,
          [contentId, courseId]
        );

        if (!content) {
          res.status(404).json({
            status: 'error',
            message: 'Content not found'
          });
          return;
        }

        // Soft delete content from database
        await DatabaseHelpers.executeQuery(
          connection,
          CourseContentQueries.deleteContent,
          [req.user?.id, contentId]
        );

        // Delete file from S3 if it exists and is an S3 key
        if (content.content_url && !content.content_url.startsWith('http')) {
          try {
            await S3Service.deleteFile(content.content_url);
          } catch (s3Error) {
            console.error('Error deleting file from S3:', s3Error);
            // Don't fail the entire operation if S3 deletion fails
          }
        }

        res.status(200).json({
          status: 'success',
          message: 'Content deleted successfully',
          data: {
            deleted_content: {
              id: content.id,
              title: content.title,
              file_name: content.file_name
            }
          }
        });
      });

    } catch (error) {
      console.error('Error deleting content:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update course section (Admin only)
   * PUT /api/courses/:courseId/sections/:sectionId
   */
  static async updateSection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const sectionId = parseInt(req.params.sectionId as string);
      const { title, description, sort_order, is_free } = req.body;

      if (isNaN(courseId) || isNaN(sectionId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID or section ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Verify section exists and belongs to course
        const existingSection = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT * FROM course_sections WHERE id = ? AND course_id = ? AND status = 1`,
          [sectionId, courseId]
        );

        if (!existingSection) {
          res.status(404).json({
            status: 'error',
            message: 'Section not found'
          });
          return;
        }

        // Update section
        await DatabaseHelpers.executeQuery(
          connection,
          `UPDATE course_sections 
           SET title = ?, description = ?, sort_order = ?, is_free = ?, 
               updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND course_id = ?`,
          [
            title || existingSection.title,
            description || existingSection.description,
            sort_order || existingSection.sort_order,
            is_free !== undefined ? is_free : existingSection.is_free,
            req.user?.id,
            sectionId,
            courseId
          ]
        );

        // Get updated section
        const updatedSection = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT * FROM course_sections WHERE id = ? AND course_id = ?`,
          [sectionId, courseId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Section updated successfully',
          data: {
            section: updatedSection
          }
        });
      });

    } catch (error) {
      console.error('Error updating section:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete course section (Admin only)
   * DELETE /api/courses/:courseId/sections/:sectionId
   */
  static async deleteSection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const sectionId = parseInt(req.params.sectionId as string);

      if (isNaN(courseId) || isNaN(sectionId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID or section ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Verify section exists and belongs to course
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT * FROM course_sections WHERE id = ? AND course_id = ? AND status = 1`,
          [sectionId, courseId]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Section not found'
          });
          return;
        }

        // Check if section has contents
        const contentCount = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT COUNT(*) as count FROM course_contents WHERE section_id = ? AND status = 1`,
          [sectionId]
        );

        if (contentCount.count > 0) {
          res.status(400).json({
            status: 'error',
            message: 'Cannot delete section that contains content. Please delete all content first.',
            details: `Section contains ${contentCount.count} content items`
          });
          return;
        }

        // Soft delete section
        await DatabaseHelpers.executeQuery(
          connection,
          `UPDATE course_sections SET status = 0, updated_by = ? WHERE id = ? AND course_id = ?`,
          [req.user?.id, sectionId, courseId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Section deleted successfully',
          data: {
            deleted_section: {
              id: section.id,
              title: section.title,
              course_id: courseId
            }
          }
        });
      });

    } catch (error) {
      console.error('Error deleting section:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update course content (Admin only)
   * PUT /api/courses/:courseId/sections/:sectionId/contents/:contentId
   */
  static async updateContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const sectionId = parseInt(req.params.sectionId as string);
      const contentId = parseInt(req.params.contentId as string);
      
      const { 
        title, 
        description, 
        content_type, 
        content_url, 
        content_text,
        sort_order, 
        is_free, 
        duration 
      } = req.body;

      if (isNaN(courseId) || isNaN(sectionId) || isNaN(contentId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid course ID, section ID, or content ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Verify content exists and belongs to section/course
        const existingContent = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT * FROM course_contents 
           WHERE id = ? AND section_id = ? AND course_id = ? AND status = 1`,
          [contentId, sectionId, courseId]
        );

        if (!existingContent) {
          res.status(404).json({
            status: 'error',
            message: 'Content not found'
          });
          return;
        }

        // Update content
        await DatabaseHelpers.executeQuery(
          connection,
          `UPDATE course_contents 
           SET title = ?, description = ?, content_type = ?, content_url = ?, 
               content_text = ?, sort_order = ?, is_free = ?, duration = ?,
               updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND section_id = ? AND course_id = ?`,
          [
            title || existingContent.title,
            description || existingContent.description,
            content_type || existingContent.content_type,
            content_url || existingContent.content_url,
            content_text || existingContent.content_text,
            sort_order || existingContent.sort_order,
            is_free !== undefined ? is_free : existingContent.is_free,
            duration || existingContent.duration,
            req.user?.id,
            contentId,
            sectionId,
            courseId
          ]
        );

        // Get updated content
        const updatedContent = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseContentQueries.getContentById,
          [contentId]
        );

        // Generate signed URLs for the updated content
        await processContentSignedUrls(updatedContent);

        res.status(200).json({
          status: 'success',
          message: 'Content updated successfully',
          data: {
            content: updatedContent
          }
        });
      });

    } catch (error) {
      console.error('Error updating content:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get my course progress (Students only)
   * GET /api/courses/:courseId/my-progress
   */
  static async getMyProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);

      if (!req.user!.roles.includes('Student')) {
        res.status(403).json({
          status: 'error',
          message: 'Only students can view their own progress'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const student = await DatabaseHelpers.executeSelectOne(
          connection,
          'SELECT id FROM students WHERE user_id = ? AND status = 1',
          [req.user!.id]
        );

        if (!student) {
          res.status(404).json({
            status: 'error',
            message: 'Student record not found'
          });
          return;
        }

        // Check enrollment
        const enrollment = await DatabaseHelpers.executeSelectOne(
          connection,
          'SELECT id FROM student_courses WHERE student_id = ? AND course_id = ? AND status = 1',
          [student.id, courseId]
        );

        if (!enrollment) {
          res.status(403).json({
            status: 'error',
            message: 'You are not enrolled in this course'
          });
          return;
        }

        // Get course information
        const course = await DatabaseHelpers.executeSelectOne(
          connection,
          'SELECT id, title, description FROM courses WHERE id = ? AND status = 1',
          [courseId]
        );

        // Get detailed progress
        const progress = await DatabaseHelpers.executeSelect(
          connection,
          `SELECT cc.id, cc.title, cc.content_type, cs.title as section_title,
                  cc.sequence_number, cc.duration,
                  scp.is_accessed, scp.is_completed, scp.accessed_at, scp.completed_at
           FROM course_contents cc
           JOIN course_sections cs ON cc.section_id = cs.id
           LEFT JOIN student_content_progress scp ON cc.id = scp.content_id 
                     AND scp.student_id = ? AND scp.course_id = ?
           WHERE cc.course_id = ? AND cc.status = 1
           ORDER BY cs.sort_order ASC, cc.sequence_number ASC`,
          [student.id, courseId, courseId]
        );

        const totalContents = progress.length;
        const accessedCount = progress.filter(p => p.is_accessed).length;
        const completedCount = progress.filter(p => p.is_completed).length;

        res.status(200).json({
          status: 'success',
          message: 'Your course progress retrieved successfully',
          data: {
            course: course,
            progress: progress,
            summary: {
              total_contents: totalContents,
              accessed_contents: accessedCount,
              completed_contents: completedCount,
              access_percentage: totalContents > 0 ? Math.round((accessedCount / totalContents) * 100) : 0,
              completion_percentage: totalContents > 0 ? Math.round((completedCount / totalContents) * 100) : 0
            }
          }
        });
      });

    } catch (error) {
      console.error('Error fetching my progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get student progress (Admin/Institute Admin only)
   * GET /api/courses/:courseId/students/:studentId/progress
   */
  static async getStudentProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const courseId = parseInt(req.params.courseId as string);
      const studentId = parseInt(req.params.studentId as string);

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Institute Admin access check
        if (req.user!.roles.includes('Institute Admin') && !req.user!.roles.includes('Admin')) {
          const institutionCourse = await DatabaseHelpers.executeSelectOne(
            connection,
            `SELECT ic.id FROM institution_courses ic 
             JOIN institutions i ON ic.institution_id = i.id 
             WHERE i.email = ? AND ic.course_id = ? AND ic.status = 1`,
            [req.user!.email, courseId]
          );

          if (!institutionCourse) {
            res.status(403).json({
              status: 'error',
              message: 'This course is not offered by your institution'
            });
            return;
          }
        }

        // Get student and course info
        const student = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT s.id, u.first_name, u.last_name, u.email 
           FROM students s 
           JOIN users u ON s.user_id = u.id 
           WHERE s.id = ? AND s.status = 1`,
          [studentId]
        );

        const course = await DatabaseHelpers.executeSelectOne(
          connection,
          'SELECT id, title, description FROM courses WHERE id = ? AND status = 1',
          [courseId]
        );

        if (!student || !course) {
          res.status(404).json({
            status: 'error',
            message: 'Student or course not found'
          });
          return;
        }

        // Get detailed progress
        const progress = await DatabaseHelpers.executeSelect(
          connection,
          `SELECT cc.id, cc.title, cc.content_type, cs.title as section_title,
                  cc.sequence_number, cc.duration,
                  scp.is_accessed, scp.is_completed, scp.accessed_at, scp.completed_at
           FROM course_contents cc
           JOIN course_sections cs ON cc.section_id = cs.id
           LEFT JOIN student_content_progress scp ON cc.id = scp.content_id 
                     AND scp.student_id = ? AND scp.course_id = ?
           WHERE cc.course_id = ? AND cc.status = 1
           ORDER BY cs.sort_order ASC, cc.sequence_number ASC`,
          [studentId, courseId, courseId]
        );

        const totalContents = progress.length;
        const accessedCount = progress.filter(p => p.is_accessed).length;
        const completedCount = progress.filter(p => p.is_completed).length;

        res.status(200).json({
          status: 'success',
          message: 'Student progress retrieved successfully',
          data: {
            student: student,
            course: course,
            progress: progress,
            summary: {
              total_contents: totalContents,
              accessed_contents: accessedCount,
              completed_contents: completedCount,
              access_percentage: totalContents > 0 ? Math.round((accessedCount / totalContents) * 100) : 0,
              completion_percentage: totalContents > 0 ? Math.round((completedCount / totalContents) * 100) : 0
            }
          }
        });
      });

    } catch (error) {
      console.error('Error fetching student progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

}