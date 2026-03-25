import { Router } from 'express';
import { StudentController, InstituteAdminController } from '../controllers/studentController';
import { 
  authenticateToken, 
  adminOnly,
  adminOrInstituteAdminOnly, 
  apiRateLimit 
} from '../middlewares/auth';
import { wrapAsync } from '../utils/asyncHandler';

const router = Router();

/**
 * Student Management Routes
 * Base path: /api/students
 * All routes require authentication
 */

// Apply rate limiting to all student routes
router.use(apiRateLimit);

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * Student Creation Routes (Unified endpoint)
 */

// Create student (Admin can specify institution, Institute Admin uses their own)
router.post('/', adminOrInstituteAdminOnly, wrapAsync(StudentController.createStudent));

/**
 * Student CRUD Routes
 */

// Get all students (Admin only)
router.get('/', adminOnly, wrapAsync(StudentController.getAllStudents));

// Get my courses dashboard (Student dashboard cards)
router.get('/my-courses/dashboard', wrapAsync(StudentController.getMyCoursesCards));

// Get my enrolled courses (Student can view their own courses)
router.get('/my-courses', wrapAsync(StudentController.getMyEnrolledCourses));

// Get students by institution (Admin or Institute Admin)
router.get('/institution/:id', adminOrInstituteAdminOnly, wrapAsync(StudentController.getStudentsByInstitution));

// Get student by ID with complete details
router.get('/:id', adminOrInstituteAdminOnly, wrapAsync(StudentController.getStudentById));

// Update student (unified endpoint for all updates)
router.put('/:id', adminOrInstituteAdminOnly, wrapAsync(StudentController.updateStudent));

// Delete student (soft delete)
router.delete('/:id', adminOrInstituteAdminOnly, wrapAsync(StudentController.deleteStudent));

/**
 * Student Progress Tracking Routes
 */

// Track student content progress
router.post('/:studentId/courses/:courseId/content/:contentId/progress', 
  adminOrInstituteAdminOnly, 
  wrapAsync(StudentController.trackContentProgress)
);

// Get course progress for a student
router.get('/:studentId/courses/:courseId/progress', 
  adminOrInstituteAdminOnly, 
  wrapAsync(StudentController.getCourseProgress)
);

/**
 * Institute Admin Dashboard Routes
 */

// Get Institute Admin dashboard data
router.get('/institute-admin/dashboard', 
  adminOrInstituteAdminOnly, 
  wrapAsync(InstituteAdminController.getDashboard)
);

// Get students with their progress for Institute Admin
router.get('/institute-admin/students', 
  adminOrInstituteAdminOnly, 
  wrapAsync(InstituteAdminController.getStudentsWithProgress)
);

// Get specific course students progress for Institute Admin
router.get('/institute-admin/courses/:courseId/students', 
  adminOrInstituteAdminOnly, 
  wrapAsync(InstituteAdminController.getCourseStudentsProgress)
);

export default router;