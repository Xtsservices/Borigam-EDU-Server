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
 * Student Creation Routes (Different logic for Admin vs Institute Admin)
 */

// Admin creates student (requires institution selection)
router.post('/admin', adminOnly, StudentController.createStudentByAdmin);

// Institute Admin creates student (uses their institution)
router.post('/institute-admin', adminOrInstituteAdminOnly, StudentController.createStudentByInstituteAdmin);

/**
 * Student CRUD Routes
 */

// Get all students (Admin only)
router.get('/', adminOnly, StudentController.getAllStudents);

// Get students by institution (Admin or Institute Admin)
router.get('/institution/:id', adminOrInstituteAdminOnly, StudentController.getStudentsByInstitution);

// Get student by ID with complete details
router.get('/:id', adminOrInstituteAdminOnly, StudentController.getStudentById);

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