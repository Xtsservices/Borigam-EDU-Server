import { Router } from 'express';
import { InstitutionController } from '../controllers/institutionController';
import { 
  authenticateToken, 
  adminOnly, 
  apiRateLimit 
} from '../middlewares/auth';

const router = Router();

/**
 * Institution Management Routes
 * Base path: /api/institutions
 * All routes require authentication and admin role
 */

// Apply rate limiting to all institution routes
router.use(apiRateLimit);

// Apply authentication to all routes
router.use(authenticateToken);

// Apply admin-only middleware to all routes (only admins can manage institutions)
router.use(adminOnly);

/**
 * Institution CRUD Routes
 */

// Create new institution
router.post('/', InstitutionController.createInstitution);

// Get all institutions with pagination
router.get('/', InstitutionController.getAllInstitutions);

// Get institution by ID with courses
router.get('/:id', InstitutionController.getInstitutionById);

// Update institution
router.put('/:id', InstitutionController.updateInstitution);

// Delete institution (soft delete)
router.delete('/:id', InstitutionController.deleteInstitution);

/**
 * Institution Course Management Routes
 */

// Get available courses for institution (not yet assigned)
router.get('/:id/available-courses', InstitutionController.getAvailableCoursesForInstitution);

// Update institution courses (replace all assignments)
router.put('/:id/courses', InstitutionController.updateInstitutionCourses);

// Add single course to institution
router.post('/:id/courses', InstitutionController.addCourseToInstitution);

// Remove course from institution
router.delete('/:id/courses/:courseId', InstitutionController.removeCourseFromInstitution);

export default router;