import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { 
  authenticateToken, 
  adminOnly, 
  selfOrAdmin, 
  apiRateLimit 
} from '../middlewares/auth';
import { wrapAsync } from '../utils/asyncHandler';

const router = Router();

/**
 * User Management Routes
 * Base path: /api/users
 * All routes require authentication
 */

// Apply rate limiting to all user routes
router.use(apiRateLimit);

// Apply authentication to all routes
router.use(authenticateToken);

// Admin only routes
router.post('/', adminOnly, wrapAsync(UserController.createUser));           // Create user
router.get('/', adminOnly, wrapAsync(UserController.getAllUsers));          // Get all users
router.delete('/:id', adminOnly, wrapAsync(UserController.deleteUser));     // Delete user

// Self or Admin routes
router.get('/:id', selfOrAdmin, wrapAsync(UserController.getUserById));     // Get user by ID
router.put('/:id', selfOrAdmin, wrapAsync(UserController.updateUser));      // Update user

export default router;