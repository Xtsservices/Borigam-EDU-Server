import { Router } from 'express';
import { RoleController } from '../controllers/roleController';
import { 
  authenticateToken, 
  adminOnly, 
  instituteAdminOrAdmin,
  apiRateLimit 
} from '../middlewares/auth';

const router = Router();

/**
 * Role Management Routes
 * Base path: /api/roles
 * All routes require authentication
 */

// Apply rate limiting to all role routes
router.use(apiRateLimit);

// Apply authentication to all routes
router.use(authenticateToken);

// Routes accessible by Admin and Institute Admin
router.get('/', instituteAdminOrAdmin, RoleController.getAllRoles);          // Get all roles
router.get('/statistics', instituteAdminOrAdmin, RoleController.getRoleStatistics);  // Get role statistics
router.get('/user/:id', instituteAdminOrAdmin, RoleController.getUserRoles);  // Get user roles
router.get('/:id', instituteAdminOrAdmin, RoleController.getRoleById);       // Get role by ID

// Admin only routes (role assignment/removal)
router.post('/assign', adminOnly, RoleController.assignRole);               // Assign role to user
router.post('/remove', adminOnly, RoleController.removeRole);               // Remove role from user

export default router;