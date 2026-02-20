import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { loginValidation, validateData } from '../utils/validations';
import { LoginQueries, UserQueries, RoleQueries, LoginHistoryQueries } from '../queries/userQueries';
import { DatabaseTransaction, DatabaseHelpers } from '../utils/database';
import { EmailService } from '../utils/emailService';

// Define interfaces for better type safety
interface LoginRequest extends Request {
  body: {
    email: string;
    password: string;
  };
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
}

interface ForgotPasswordRequest extends Request {
  body: {
    email: string;
  };
}

interface ResetPasswordRequest extends Request {
  body: {
    token: string;
    newPassword: string;
  };
}

export class AuthController {
  
  /**
   * User Login
   * POST /api/auth/login
   */
  static async login(req: LoginRequest, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      // Validate input data
      const validation = validateData({ email, password }, loginValidation.loginCredentials);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get user login details
        const loginDetails = await DatabaseHelpers.executeSelectOne(
          connection,
          LoginQueries.getLoginByEmail,
          [email]
        );

        if (!loginDetails) {
          res.status(401).json({
            status: 'error',
            message: 'Invalid email or password'
          });
          return;
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, loginDetails.password_hash);
        if (!isPasswordValid) {
          res.status(401).json({
            status: 'error',
            message: 'Invalid email or password'
          });
          return;
        }

        // Check if user is active
        if (loginDetails.user_status !== 1) {
          res.status(401).json({
            status: 'error',
            message: 'User account is inactive'
          });
          return;
        }

        // Get user roles
        const userRoles = await DatabaseHelpers.executeSelect(
          connection,
          RoleQueries.getUserRoles,
          [loginDetails.user_id]
        );

        const roleNames = userRoles.map(role => role.role_name);

        // Generate JWT token
        const tokenPayload = {
          userId: loginDetails.user_id,
          email: loginDetails.email,
          firstName: loginDetails.first_name,
          lastName: loginDetails.last_name,
          roles: roleNames
        };

        const token = jwt.sign(
          tokenPayload,
          process.env.JWT_SECRET || 'your-secret-key',
          { expiresIn: '24h' }
        );

        // Update last login time
        await DatabaseHelpers.executeQuery(
          connection,
          LoginQueries.updateLastLogin,
          [loginDetails.id]
        );

        // Create login history record
        const userAgent = req.headers['user-agent'] || '';
        const ipAddress = req.ip || req.connection.remoteAddress || '';
        
        await DatabaseHelpers.executeInsert(
          connection,
          LoginHistoryQueries.createLoginHistory,
          [loginDetails.id, ipAddress, userAgent]
        );

        res.status(200).json({
          status: 'success',
          message: 'Login successful',
          data: {
            token,
            user: {
              id: loginDetails.user_id,
              firstName: loginDetails.first_name,
              lastName: loginDetails.last_name,
              email: loginDetails.email,
              roles: roleNames
            }
          }
        });
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get Current User Profile
   * GET /api/auth/profile
   */
  static async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get detailed user information
        const userDetails = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [req.user!.id]
        );

        if (!userDetails) {
          res.status(404).json({
            status: 'error',
            message: 'User not found'
          });
          return;
        }

        // Get user roles
        const userRoles = await DatabaseHelpers.executeSelect(
          connection,
          RoleQueries.getUserRoles,
          [req.user!.id]
        );

        res.status(200).json({
          status: 'success',
          message: 'Profile retrieved successfully',
          data: {
            user: {
              id: userDetails.id,
              firstName: userDetails.first_name,
              lastName: userDetails.last_name,
              email: userDetails.email,
              phone: userDetails.phone,
              status: userDetails.status,
              roles: userRoles.map(role => ({
                id: role.role_id,
                name: role.role_name,
                description: role.description
              })),
              createdAt: userDetails.created_at,
              updatedAt: userDetails.updated_at
            }
          }
        });
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Change Password
   * PUT /api/auth/change-password
   */
  static async changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated'
        });
        return;
      }

      // Validate new password
      const validation = validateData({ password: newPassword }, loginValidation.loginCredentials);
      
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get current password hash
        const loginDetails = await DatabaseHelpers.executeSelectOne(
          connection,
          LoginQueries.getLoginByEmail,
          [req.user!.email]
        );

        if (!loginDetails) {
          res.status(404).json({
            status: 'error',
            message: 'User login details not found'
          });
          return;
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, loginDetails.password_hash);
        if (!isCurrentPasswordValid) {
          res.status(400).json({
            status: 'error',
            message: 'Current password is incorrect'
          });
          return;
        }

        // Hash new password
        const saltRounds = 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await DatabaseHelpers.executeQuery(
          connection,
          LoginQueries.updatePassword,
          [hashedNewPassword, req.user!.id, req.user!.id]
        );

        res.status(200).json({
          status: 'success',
          message: 'Password changed successfully'
        });
      });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get Login History
   * GET /api/auth/login-history
   */
  static async getLoginHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const loginHistory = await DatabaseHelpers.executeSelect(
          connection,
          LoginHistoryQueries.getUserLoginHistory,
          [req.user!.id]
        );

        res.status(200).json({
          status: 'success',
          message: 'Login history retrieved successfully',
          data: {
            history: loginHistory
          }
        });
      });

    } catch (error) {
      console.error('Get login history error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Logout (Optional - for token blacklisting in future)
   * POST /api/auth/logout
   */
  static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // For now, just return success
      // In a production app, you might want to blacklist the token
      res.status(200).json({
        status: 'success',
        message: 'Logout successful'
      });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Forgot Password - Send reset link to email
   * POST /api/auth/forgot-password
   */
  static async forgotPassword(req: ForgotPasswordRequest, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      // Validate email
      const validation = validateData({ email }, Joi.object({
        email: Joi.string().email().required()
      }));

      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Please provide a valid email address',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if user exists and is active
        const user = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserByEmail,
          [email]
        );

        if (!user || user.status !== 1) {
          // Don't reveal if user exists or not for security
          res.status(200).json({
            status: 'success',
            message: 'If an account with that email exists, you will receive a password reset link shortly.'
          });
          return;
        }

        // Generate JWT reset token with 1 hour expiry
        const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
        const resetToken = jwt.sign(
          {
            userId: user.id,
            email: user.email,
            purpose: 'password_reset'
          },
          jwtSecret,
          { expiresIn: '1h' }
        );

        // Generate reset link
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`;

        // Send password reset email
        const emailSent = await EmailService.sendPasswordResetEmail({
          firstName: user.first_name,
          resetLink,
          email: user.email
        });

        if (!emailSent) {
          res.status(500).json({
            status: 'error',
            message: 'Failed to send reset email. Please try again later.'
          });
          return;
        }

        res.status(200).json({
          status: 'success',
          message: 'Password reset link sent to your email address.'
        });
      });

    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Reset Password - Update password using JWT reset token
   * POST /api/auth/reset-password
   */
  static async resetPassword(req: ResetPasswordRequest, res: Response): Promise<void> {
    try {
      const { token, newPassword } = req.body;

      // Validate input
      const validation = validateData({ token, newPassword }, Joi.object({
        token: Joi.string().required(),
        newPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
          'string.min': 'Password must be at least 8 characters',
          'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        })
      }));

      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      // Verify JWT reset token
      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      
      try {
        const decoded: any = jwt.verify(token, jwtSecret);
        
        if (decoded.purpose !== 'password_reset') {
          res.status(400).json({
            status: 'error',
            message: 'Invalid reset token'
          });
          return;
        }

        await DatabaseTransaction.executeTransaction(async (connection) => {
          
          // Verify user still exists and is active
          const user = await DatabaseHelpers.executeSelectOne(
            connection,
            UserQueries.getUserById,
            [decoded.userId]
          );

          if (!user || user.status !== 1) {
            res.status(400).json({
              status: 'error',
              message: 'User account not found or inactive'
            });
            return;
          }

          // Hash new password
          const saltRounds = 12;
          const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

          // Update password in login table
          await DatabaseHelpers.executeQuery(
            connection,
            LoginQueries.updatePassword,
            [hashedPassword, decoded.userId, decoded.userId]
          );

          res.status(200).json({
            status: 'success',
            message: 'Password reset successfully. You can now login with your new password.'
          });
        });

      } catch (jwtError: any) {
        if (jwtError.name === 'TokenExpiredError') {
          res.status(400).json({
            status: 'error',
            message: 'Reset link has expired. Please request a new one.'
          });
        } else {
          res.status(400).json({
            status: 'error',
            message: 'Invalid reset token'
          });
        }
        return;
      }

    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}