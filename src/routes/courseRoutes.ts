import express from 'express';
import { CourseController } from '../controllers/courseController';
import { authenticateToken, adminOnly } from '../middlewares/auth';
import { uploadMiddleware, handleMulterError } from '../utils/uploadMiddleware';

// Define interface for authenticated request
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
}

const router = express.Router();

// Middleware to ensure all routes require authentication
router.use(authenticateToken);

/**
 * Course Routes
 */

// Get all courses (Public/Student view shows only published, Admin shows all)
router.get('/', CourseController.getAllCourses);

// Get all categories
router.get('/categories', CourseController.getAllCategories);

// Admin only - Create new category
router.post('/categories', adminOnly, CourseController.createCategory);

// Get course by ID with sections and contents
router.get('/:id', CourseController.getCourseById);

// Admin only routes - Create, Update, Delete courses
router.post('/', adminOnly, 
  (req, res, next) => {
    // Optional file upload for course image
    uploadMiddleware.single('course_image')(req, res, (error: any) => {
      if (error) {
        return res.status(400).json({
          status: 'error',
          message: handleMulterError(error)
        });
      }
      console.log('🛠️ After multer - req.body:', req.body);
      console.log('🛠️ After multer - req.file:', req.file ? 'File present' : 'No file');
      next();
    });
  },
  CourseController.createCourse
);

router.put('/:id', adminOnly,
  (req, res, next) => {
    // Optional file upload for course image
    uploadMiddleware.single('course_image')(req, res, (error: any) => {
      if (error) {
        return res.status(400).json({
          status: 'error',
          message: handleMulterError(error)
        });
      }
      console.log('🛠️ After multer UPDATE - req.body:', req.body);
      console.log('🛠️ After multer UPDATE - req.file:', req.file ? 'File present' : 'No file');
      next();
    });
  },
  CourseController.updateCourse
);

router.delete('/:id', adminOnly, CourseController.deleteCourse);

/**
 * Course Section Routes (Admin only)
 */

// Create section for a course
router.post('/:courseId/sections', adminOnly, CourseController.createSection);

/**
 * Course Content Routes (Admin only)
 */

// Create content for a section
router.post('/:courseId/sections/:sectionId/contents', adminOnly, CourseController.createContent);

/**
 * File Upload Routes (Admin only)
 */

// Upload single file as course content
router.post('/:courseId/sections/:sectionId/contents/upload', 
  adminOnly,
  (req, res, next) => {
    uploadMiddleware.single('file')(req, res, (error: any) => {
      if (error) {
        return res.status(400).json({
          status: 'error',
          message: handleMulterError(error)
        });
      }
      next();
    });
  },
  CourseController.uploadContent
);

/**
 * Content Access Routes
 */

// Get content with signed URL for secure access
router.get('/:courseId/contents/:contentId/access', CourseController.getContentAccess);

// Delete content (Admin only)
router.delete('/:courseId/contents/:contentId', adminOnly, CourseController.deleteContent);

export default router;