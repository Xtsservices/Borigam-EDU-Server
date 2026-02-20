import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken, loginRateLimit } from '../middlewares/auth';

const router = Router();

/**
 * Authentication Routes
 * Base path: /api/auth
 */

// Public routes - No authentication required
router.post('/login', loginRateLimit, AuthController.login);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);

// Protected routes - Authentication required
router.get('/profile', authenticateToken, AuthController.getProfile);
router.put('/change-password', authenticateToken, AuthController.changePassword);
router.get('/login-history', authenticateToken, AuthController.getLoginHistory);
router.post('/logout', authenticateToken, AuthController.logout);

export default router;