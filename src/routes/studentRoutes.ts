import { Router } from 'express';
import { StudentController, InstituteAdminController } from '../controllers/studentController';
import { 
  authenticateToken, 
  adminOnly,
  adminOrInstituteAdminOnly, 
  apiRateLimit 
} from '../middlewares/auth';

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
router.post('/', adminOrInstituteAdminOnly, StudentController.createStudent);

/**
 * Student CRUD Routes
 */

// Get all students (Admin only)
router.get('/', adminOnly, StudentController.getAllStudents);

// Get my courses dashboard (Student dashboard cards)
router.get('/my-courses/dashboard', StudentController.getMyCoursesCards);

// Get my enrolled courses (Student can view their own courses)
router.get('/my-courses', StudentController.getMyEnrolledCourses);

// Get students by institution (Admin or Institute Admin)
router.get('/institution/:id', adminOrInstituteAdminOnly, StudentController.getStudentsByInstitution);

// Get student by ID with complete details
router.get('/:id', adminOrInstituteAdminOnly, StudentController.getStudentById);

// Update student (unified endpoint for all updates)
router.put('/:id', adminOrInstituteAdminOnly, StudentController.updateStudent);

// Delete student (soft delete)
router.delete('/:id', adminOrInstituteAdminOnly, StudentController.deleteStudent);

/**
 * Student Progress Tracking Routes
 */

// Track student content progress
router.post('/:studentId/courses/:courseId/content/:contentId/progress', 
  adminOrInstituteAdminOnly, 
  StudentController.trackContentProgress
);

// Get course progress for a student
router.get('/:studentId/courses/:courseId/progress', 
  adminOrInstituteAdminOnly, 
  StudentController.getCourseProgress
);

/**
 * Institute Admin Dashboard Routes
 */

// Get Institute Admin dashboard data
router.get('/institute-admin/dashboard', 
  adminOrInstituteAdminOnly, 
  InstituteAdminController.getDashboard
);

// Get students with their progress for Institute Admin
router.get('/institute-admin/students', 
  adminOrInstituteAdminOnly, 
  InstituteAdminController.getStudentsWithProgress
);

// Get specific course students progress for Institute Admin
router.get('/institute-admin/courses/:courseId/students', 
  adminOrInstituteAdminOnly, 
  InstituteAdminController.getCourseStudentsProgress
);

export default router;