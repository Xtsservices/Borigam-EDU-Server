import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import roleRoutes from './roleRoutes';
import courseRoutes from './courseRoutes';
import institutionRoutes from './institutionRoutes';
import studentRoutes from './studentRoutes';

const router = Router();

/**
 * API Routes Configuration
 * All routes are prefixed with /api
 */

// Health check route (public)
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Authentication routes
router.use('/auth', authRoutes);

// User management routes
router.use('/users', userRoutes);

// Role management routes
router.use('/roles', roleRoutes);

// Course management routes
router.use('/courses', courseRoutes);

// Institution management routes
router.use('/institutions', institutionRoutes);

// Student management routes
router.use('/students', studentRoutes);

// 404 handler for API routes
router.use('/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'API endpoint not found',
    path: req.originalUrl
  });
});

export default router;