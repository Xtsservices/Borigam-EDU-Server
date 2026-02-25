import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Request interface to include user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token and adds user info to request
 */
export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        status: 'error',
        message: 'Access token required'
      });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    jwt.verify(token, jwtSecret, (err, decoded: any) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          res.status(401).json({
            status: 'error',
            message: 'Token has expired'
          });
          return;
        }
        
        if (err.name === 'JsonWebTokenError') {
          res.status(401).json({
            status: 'error',
            message: 'Invalid token'
          });
          return;
        }

        res.status(403).json({
          status: 'error',
          message: 'Token verification failed'
        });
        return;
      }

      // Add user info to request
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        first_name: decoded.firstName,
        last_name: decoded.lastName,
        roles: decoded.roles || []
      };

      next();
    });

  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

/**
 * Role-based Authorization Middleware
 * Checks if user has required role(s)
 */
export const authorizeRoles = (...requiredRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated'
        });
        return;
      }

      const userRoles = req.user.roles || [];
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        res.status(403).json({
          status: 'error',
          message: 'Insufficient permissions',
          required: requiredRoles,
          userRoles: userRoles
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Authorization middleware error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Optional Authentication Middleware
 * Adds user info to request if token is present, but doesn't require it
 */
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token provided, continue without user info
      next();
      return;
    }

    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    jwt.verify(token, jwtSecret, (err, decoded: any) => {
      if (!err && decoded) {
        // Valid token, add user info
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          first_name: decoded.firstName,
          last_name: decoded.lastName,
          roles: decoded.roles || []
        };
      }
      // Continue regardless of token validity
      next();
    });

  } catch (error) {
    // Continue even if there's an error
    next();
  }
};

/**
 * Admin Only Middleware
 * Shorthand for admin role authorization
 */
export const adminOnly = authorizeRoles('Admin');

/**
 * Institute Admin or Admin Middleware
 * Allows both admin and institute admin roles
 */
export const instituteAdminOrAdmin = authorizeRoles('Admin', 'Institute Admin');

/**
 * Self or Admin Middleware
 * Allows access if user is accessing their own data or is an admin
 */
export const selfOrAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes('Admin');
    const targetUserId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const isSelf = req.user.id === targetUserId;

    if (isAdmin || isSelf) {
      next();
      return;
    }

    res.status(403).json({
      status: 'error',
      message: 'Can only access your own data or admin required'
    });

  } catch (error) {
    console.error('Self or admin middleware error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

/**
 * Request Rate Limiting Middleware (Basic implementation)
 * Can be enhanced with Redis for production use
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now > value.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);

export const rateLimit = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      
      const clientData = requestCounts.get(clientIP);
      
      if (!clientData || now > clientData.resetTime) {
        // Reset or initialize count
        requestCounts.set(clientIP, {
          count: 1,
          resetTime: now + windowMs
        });
        next();
        return;
      }

      if (clientData.count >= maxRequests) {
        res.status(429).json({
          status: 'error',
          message: 'Too many requests, please try again later',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
        return;
      }

      clientData.count++;
      next();

    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      next(); // Continue on error
    }
  };
};

/**
 * Clear rate limit for a specific IP (call on successful login)
 */
export const clearRateLimit = (req: Request): void => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  requestCounts.delete(clientIP);
};

// Pre-configured rate limiters with environment variable support
// Configure via environment variables: LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MINUTES, API_RATE_LIMIT_MAX, API_RATE_LIMIT_WINDOW_SECONDS
const LOGIN_RATE_LIMIT_MAX = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '15', 10);
const LOGIN_RATE_LIMIT_WINDOW_MS = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES || '15', 10) * 60 * 1000;
const API_RATE_LIMIT_MAX = parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10);
const API_RATE_LIMIT_WINDOW_MS = parseInt(process.env.API_RATE_LIMIT_WINDOW_SECONDS || '60', 10) * 1000;

export const loginRateLimit = rateLimit(LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS); // Configurable login attempts
export const apiRateLimit = rateLimit(API_RATE_LIMIT_MAX, API_RATE_LIMIT_WINDOW_MS); // Configurable API rate limit

/**
 * Admin or Institute Admin Only Middleware
 * Allows access if user has either Admin or Institute Admin role
 */
export const adminOrInstituteAdminOnly = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
      return;
    }

    if (!req.user.roles.includes('Admin') && !req.user.roles.includes('Institute Admin')) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied. Admin or Institute Admin role required.'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Admin or Institute Admin middleware error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};