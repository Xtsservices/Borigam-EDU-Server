import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import { userValidation, roleValidation, validateData } from '../utils/validations';
import { UserQueries, RoleQueries, LoginQueries } from '../queries/userQueries';
import { DatabaseTransaction, DatabaseHelpers } from '../utils/database';
import { EmailService } from '../utils/emailService';

// Define interfaces for better type safety
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
}

interface CreateUserRequest extends AuthenticatedRequest {
  body: {
    first_name: string;
    last_name?: string;
    email: string;
    phone?: string;
    password?: string; // Optional - auto-generated for institute admin/student
    role_id: number;
    status?: number;
  };
}

interface UpdateUserRequest extends AuthenticatedRequest {
  body: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    status?: number;
  };
  params: {
    id: string;
  };
}

export class UserController {

  /**
   * Create a new user
   * POST /api/users
   */
  static async createUser(req: CreateUserRequest, res: Response): Promise<void> {
    try {
      const { first_name, last_name, email, phone, password, role_id, status = 1 } = req.body;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // First, get the role to determine validation requirements
        const roleInfo = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleById,
          [role_id]
        );

        if (!roleInfo) {
          res.status(400).json({
            status: 'error',
            message: 'Invalid role ID'
          });
          return;
        }

        // Determine if this role requires manual password or auto-generated temp password
        const autoPasswordRoles = ['Institute Admin', 'Student'];
        const isAutoPasswordRole = autoPasswordRoles.includes(roleInfo.name);
        
        let finalPassword: string;
        
        if (isAutoPasswordRole) {
          // Auto-generate temporary password for Institute Admin and Student
          finalPassword = EmailService.generateTempPassword();
          
          // Validate user data without password requirement
          const userData = { first_name, last_name, email, phone, status };
          const validation = validateData(userData, Joi.object({
            first_name: userValidation.createUser.extract('first_name'),
            last_name: userValidation.createUser.extract('last_name'),
            email: userValidation.createUser.extract('email'),
            phone: userValidation.createUser.extract('phone'),
            status: userValidation.createUser.extract('status')
          }));
          
          if (!validation.isValid) {
            res.status(400).json({
              status: 'error',
              message: 'Validation failed',
              errors: validation.errors
            });
            return;
          }
        } else {
          // Manual password required for other roles (like Admin)
          if (!password) {
            res.status(400).json({
              status: 'error',
              message: 'Password is required for this role'
            });
            return;
          }
          
          finalPassword = password;
          
          // Validate with password requirement
          const userData = { first_name, last_name, email, phone, password: finalPassword, status };
          const validation = validateData(userData, userValidation.createUser);
          
          if (!validation.isValid) {
            res.status(400).json({
              status: 'error',
              message: 'Validation failed',
              errors: validation.errors
            });
            return;
          }
        }

        // Validate role ID only (user_id will be validated after user creation)
        const roleIdValidation = validateData({ role_id }, Joi.object({ 
          role_id: Joi.number().integer().positive().required() 
        }));
        
        if (!roleIdValidation.isValid) {
          res.status(400).json({
            status: 'error',
            message: 'Role validation failed',
            errors: roleIdValidation.errors
          });
          return;
        }

        // Check if email already exists
        const existingUser = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.checkEmailExists,
          [email]
        );

        if (existingUser) {
          res.status(400).json({
            status: 'error',
            message: 'Email address is already in use by another user'
          });
          return;
        }

        // Check if phone already exists (if provided)
        if (phone) {
          const existingPhone = await DatabaseHelpers.executeSelectOne(
            connection,
            UserQueries.checkPhoneExists,
            [phone]
          );

          if (existingPhone) {
            res.status(400).json({
              status: 'error',
              message: 'Phone number is already in use by another user'
            });
            return;
          }
        }

        // Create user
        const userId = await DatabaseHelpers.executeInsert(
          connection,
          UserQueries.createUser,
          [
            first_name,
            last_name || null,
            email,
            phone || null,
            status,
            req.user?.id || null,
            req.user?.id || null
          ]
        );

        // Assign role to user
        await DatabaseHelpers.executeInsert(
          connection,
          RoleQueries.assignUserRole,
          [userId, role_id, req.user?.id || userId, req.user?.id || userId]
        );

        // Hash password and create login record
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(finalPassword, saltRounds);

        await DatabaseHelpers.executeInsert(
          connection,
          LoginQueries.createLogin,
          [
            userId,
            email,
            hashedPassword,
            req.user?.id || userId,
            req.user?.id || userId
          ]
        );

        // Get created user details with role
        const createdUser = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [userId]
        );

        const userRoles = await DatabaseHelpers.executeSelect(
          connection,
          RoleQueries.getUserRoles,
          [userId]
        );

        // Send credentials email for auto-password roles
        if (isAutoPasswordRole) {
          try {
            const emailSent = await EmailService.sendCredentialsEmail({
              firstName: createdUser.first_name,
              lastName: createdUser.last_name,
              email: createdUser.email,
              tempPassword: finalPassword,
              role: roleInfo.name
            });

            if (!emailSent) {
              console.warn(`⚠️ Failed to send credentials email to ${email}`);
            }
          } catch (emailError) {
            console.error('Email sending error:', emailError);
            // Don't fail the user creation if email fails
          }
        }

        res.status(201).json({
          status: 'success',
          message: isAutoPasswordRole 
            ? 'User created successfully. Login credentials have been sent to their email.' 
            : 'User created successfully',
          data: {
            user: {
              id: createdUser.id,
              firstName: createdUser.first_name,
              lastName: createdUser.last_name,
              email: createdUser.email,
              phone: createdUser.phone,
              status: createdUser.status,
              roles: userRoles.map(role => ({
                id: role.role_id,
                name: role.role_name,
                description: role.description
              })),
              createdAt: createdUser.created_at,
              updatedAt: createdUser.updated_at
            }
          }
        });
      });

    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all users
   * GET /api/users
   */
  static async getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const users = await DatabaseHelpers.executeSelect(
          connection,
          UserQueries.getAllUsers,
          []
        );

        // Get roles for each user
        const usersWithRoles = await Promise.all(
          users.map(async (user) => {
            const userRoles = await DatabaseHelpers.executeSelect(
              connection,
              RoleQueries.getUserRoles,
              [user.id]
            );

            return {
              id: user.id,
              firstName: user.first_name,
              lastName: user.last_name,
              email: user.email,
              phone: user.phone,
              status: user.status,
              roles: userRoles.map(role => ({
                id: role.role_id,
                name: role.role_name,
                description: role.description
              })),
              createdAt: user.created_at,
              updatedAt: user.updated_at
            };
          })
        );

        res.status(200).json({
          status: 'success',
          message: 'Users retrieved successfully',
          data: {
            users: usersWithRoles,
            total: usersWithRoles.length
          }
        });
      });

    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  static async getUserById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const parsedId = parseInt(Array.isArray(id) ? id[0] : id);

      // Validate user ID
      const validation = validateData({ id: parsedId }, Joi.object({ id: userValidation.userId }));
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid user ID',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const user = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [parsedId]
        );

        if (!user) {
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
          [user.id]
        );

        res.status(200).json({
          status: 'success',
          message: 'User retrieved successfully',
          data: {
            user: {
              id: user.id,
              firstName: user.first_name,
              lastName: user.last_name,
              email: user.email,
              phone: user.phone,
              status: user.status,
              roles: userRoles.map(role => ({
                id: role.role_id,
                name: role.role_name,
                description: role.description
              })),
              createdAt: user.created_at,
              updatedAt: user.updated_at
            }
          }
        });
      });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update user
   * PUT /api/users/:id
   */
  static async updateUser(req: UpdateUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const parsedId = parseInt(Array.isArray(id) ? id[0] : id);
      const { first_name, last_name, email, phone, status } = req.body;

      // Validate user ID
      const idValidation = validateData({ id: parsedId }, Joi.object({ id: userValidation.userId }));
      if (!idValidation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid user ID',
          errors: idValidation.errors
        });
        return;
      }

      // Validate update data
      const updateData = { first_name, last_name, email, phone, status, updated_by: req.user?.id };
      const validation = validateData(updateData, userValidation.updateUser);
      
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if user exists
        const existingUser = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [parsedId]
        );

        if (!existingUser) {
          res.status(404).json({
            status: 'error',
            message: 'User not found'
          });
          return;
        }

        // Check if email already exists (if changed)
        if (email && email !== existingUser.email) {
          const emailExists = await DatabaseHelpers.executeSelectOne(
            connection,
            UserQueries.checkEmailExists,
            [email]
          );

          if (emailExists) {
            res.status(400).json({
              status: 'error',
              message: 'Email address is already in use by another user'
            });
            return;
          }
        }

        // Check if phone already exists (if changed)
        if (phone && phone !== existingUser.phone) {
          const phoneExists = await DatabaseHelpers.executeSelectOne(
            connection,
            UserQueries.checkPhoneExists,
            [phone]
          );

          if (phoneExists) {
            res.status(400).json({
              status: 'error',
              message: 'Phone number is already in use by another user'
            });
            return;
          }
        }

        // Update user
        await DatabaseHelpers.executeQuery(
          connection,
          UserQueries.updateUser,
          [
            first_name || existingUser.first_name,
            last_name || existingUser.last_name,
            email || existingUser.email,
            phone || existingUser.phone,
            status !== undefined ? status : existingUser.status,
            req.user?.id || existingUser.updated_by,
            parsedId
          ]
        );

        // Get updated user details
        const updatedUser = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [parsedId]
        );

        const userRoles = await DatabaseHelpers.executeSelect(
          connection,
          RoleQueries.getUserRoles,
          [parsedId]
        );

        res.status(200).json({
          status: 'success',
          message: 'User updated successfully',
          data: {
            user: {
              id: updatedUser.id,
              firstName: updatedUser.first_name,
              lastName: updatedUser.last_name,
              email: updatedUser.email,
              phone: updatedUser.phone,
              status: updatedUser.status,
              roles: userRoles.map(role => ({
                id: role.role_id,
                name: role.role_name,
                description: role.description
              })),
              createdAt: updatedUser.created_at,
              updatedAt: updatedUser.updated_at
            }
          }
        });
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete user (soft delete)
   * DELETE /api/users/:id
   */
  static async deleteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const parsedId = parseInt(Array.isArray(id) ? id[0] : id);

      // Validate user ID
      const validation = validateData({ id: parsedId }, Joi.object({ id: userValidation.userId }));
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid user ID',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if user exists
        const existingUser = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [parsedId]
        );

        if (!existingUser) {
          res.status(404).json({
            status: 'error',
            message: 'User not found'
          });
          return;
        }

        // Prevent self-deletion
        if (req.user?.id === parsedId) {
          res.status(400).json({
            status: 'error',
            message: 'Cannot delete your own account'
          });
          return;
        }

        // Soft delete user
        await DatabaseHelpers.executeQuery(
          connection,
          UserQueries.deleteUser,
          [req.user?.id || null, parsedId]
        );

        res.status(200).json({
          status: 'success',
          message: 'User deleted successfully'
        });
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}