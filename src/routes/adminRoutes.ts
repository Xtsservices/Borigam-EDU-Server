import express from 'express';
import { AdminController } from '../controllers/adminController';
import { authenticateToken, adminOnly } from '../middlewares/auth';

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

// Middleware to ensure all routes require authentication and admin privileges
router.use(authenticateToken);
router.use(adminOnly);

/**
 * DASHBOARD SCREEN
 * Single API endpoint that returns all 6 card counts
 * Endpoint: GET /api/admin/dashboard
 * Returns: totalStudents, totalInstitutions, totalCourses, totalExams, topCourses, activeUsers
 */
router.get('/dashboard', AdminController.getDashboardCards);

/**
 * STUDENTS SCREEN
 * Single API endpoint that returns all 3 card counts
 * Endpoint: GET /api/admin/students
 * Returns: totalStudents, activeStudents, totalEnrollments
 */
router.get('/students', AdminController.getStudentsCards);

/**
 * COURSES SCREEN
 * Single API endpoint that returns all 2 card counts
 * Endpoint: GET /api/admin/courses
 * Returns: totalCourses, totalEnrolled
 */
router.get('/courses', AdminController.getCoursesCards);

/**
 * INSTITUTIONS SCREEN
 * Single API endpoint that returns all 3 card counts
 * Endpoint: GET /api/admin/institutions
 * Returns: totalInstitutions, activeInstitutions, totalCourses
 */
router.get('/institutions', AdminController.getInstitutionsCards);

/**
 * EXAMS SCREEN
 * Single API endpoint that returns all card counts
 * Endpoint: GET /api/admin/exams
 * Returns: totalExams
 */
router.get('/exams', AdminController.getExamsCards);

export default router;
