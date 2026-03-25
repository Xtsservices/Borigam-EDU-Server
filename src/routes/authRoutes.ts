import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken, loginRateLimit } from '../middlewares/auth';
import { wrapAsync } from '../utils/asyncHandler';

const router = Router();

/**
 * Authentication Routes
 * Base path: /api/auth
 */

// Public routes - No authentication required
router.post('/login', loginRateLimit, wrapAsync(AuthController.login));
router.post('/forgot-password', wrapAsync(AuthController.forgotPassword));
router.post('/reset-password', wrapAsync(AuthController.resetPassword));

// Protected routes - Authentication required
router.get('/profile', authenticateToken, wrapAsync(AuthController.getProfile));
router.get('/myprofile', authenticateToken, wrapAsync(AuthController.getMyProfile));
router.put('/profile', authenticateToken, wrapAsync(AuthController.updateProfile));
router.put('/change-password', authenticateToken, wrapAsync(AuthController.changePassword));
router.get('/login-history', authenticateToken, wrapAsync(AuthController.getLoginHistory));
router.post('/logout', authenticateToken, wrapAsync(AuthController.logout));

export default router;