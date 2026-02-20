import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { 
  authenticateToken, 
  adminOnly, 
  selfOrAdmin, 
  apiRateLimit 
} from '../middlewares/auth';

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
router.post('/', adminOnly, UserController.createUser);           // Create user
router.get('/', adminOnly, UserController.getAllUsers);          // Get all users
router.delete('/:id', adminOnly, UserController.deleteUser);     // Delete user

// Self or Admin routes
router.get('/:id', selfOrAdmin, UserController.getUserById);     // Get user by ID
router.put('/:id', selfOrAdmin, UserController.updateUser);      // Update user

export default router;