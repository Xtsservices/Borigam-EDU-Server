import express from 'express';
import { InstituteAdminController } from '../controllers/instituteAdminController';
import { authenticateToken } from '../middlewares/auth';

// Define interface for authenticated request
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
    institutionId?: number;
  };
}

const router = express.Router();

// Middleware to ensure all routes require authentication
router.use(authenticateToken);

/**
 * INSTITUTE ADMIN DASHBOARD SCREEN
 * Single API endpoint that returns all 4 card counts for the authenticated institute
 * Endpoint: GET /api/institute-admin/dashboard
 * Institution ID is extracted from JWT token
 * Returns: totalStudents, totalCourses, totalExams, topCourses
 */
router.get('/dashboard', InstituteAdminController.getDashboardCards);

export default router;
