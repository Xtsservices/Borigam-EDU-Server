import { Request, Response } from 'express';
import { roleValidation, validateData } from '../utils/validations';
import { RoleQueries, UserQueries } from '../queries/userQueries';
import { DatabaseTransaction, DatabaseHelpers } from '../utils/database';

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

interface AssignRoleRequest extends AuthenticatedRequest {
  body: {
    user_id: number;
    role_id: number;
  };
}

interface RemoveRoleRequest extends AuthenticatedRequest {
  body: {
    user_id: number;
    role_id: number;
  };
}

export class RoleController {

  /**
   * Get all roles
   * GET /api/roles
   */
  static async getAllRoles(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const roles = await DatabaseHelpers.executeSelect(
          connection,
          `SELECT id, name, description, status, created_at, updated_at 
           FROM roles 
           WHERE status = 1 
           ORDER BY name`,
          []
        );

        res.status(200).json({
          status: 'success',
          message: 'Roles retrieved successfully',
          data: {
            roles: roles.map(role => ({
              id: role.id,
              name: role.name,
              description: role.description,
              status: role.status,
              createdAt: role.created_at,
              updatedAt: role.updated_at
            })),
            total: roles.length
          }
        });
      });

    } catch (error) {
      console.error('Get roles error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get role by ID
   * GET /api/roles/:id
   */
  static async getRoleById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const roleId = parseInt(Array.isArray(id) ? id[0] : id);

      if (isNaN(roleId) || roleId <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid role ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        const role = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleById,
          [roleId]
        );

        if (!role) {
          res.status(404).json({
            status: 'error',
            message: 'Role not found'
          });
          return;
        }

        // Get users with this role
        const usersWithRole = await DatabaseHelpers.executeSelect(
          connection,
          `SELECT u.id, u.first_name, u.last_name, u.email, ur.created_at as assigned_at
           FROM users u
           JOIN user_roles ur ON u.id = ur.user_id
           WHERE ur.role_id = ? AND ur.status = 1 AND u.status = 1
           ORDER BY u.first_name, u.last_name`,
          [roleId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Role retrieved successfully',
          data: {
            role: {
              id: role.id,
              name: role.name,
              description: role.description,
              status: role.status,
              users: usersWithRole.map(user => ({
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                assignedAt: user.assigned_at
              })),
              totalUsers: usersWithRole.length,
              createdAt: role.created_at,
              updatedAt: role.updated_at
            }
          }
        });
      });

    } catch (error) {
      console.error('Get role error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Assign role to user
   * POST /api/roles/assign
   */
  static async assignRole(req: AssignRoleRequest, res: Response): Promise<void> {
    try {
      const { user_id, role_id } = req.body;

      // Validate input data
      const roleData = { user_id, role_id, created_by: req.user?.id, updated_by: req.user?.id };
      const validation = validateData(roleData, roleValidation.assignRole);
      
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
        const userExists = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [user_id]
        );

        if (!userExists) {
          res.status(404).json({
            status: 'error',
            message: 'User not found'
          });
          return;
        }

        // Check if role exists
        const roleExists = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleById,
          [role_id]
        );

        if (!roleExists) {
          res.status(404).json({
            status: 'error',
            message: 'Role not found'
          });
          return;
        }

        // Check if user already has this role
        const existingAssignment = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.checkUserRole,
          [user_id, role_id]
        );

        if (existingAssignment) {
          res.status(400).json({
            status: 'error',
            message: 'User already has this role assigned'
          });
          return;
        }

        // Assign role to user
        await DatabaseHelpers.executeInsert(
          connection,
          RoleQueries.assignUserRole,
          [user_id, role_id, req.user?.id || user_id, req.user?.id || user_id]
        );

        // Get updated user details with roles
        const userWithRoles = await DatabaseHelpers.executeSelect(
          connection,
          RoleQueries.getUserRoles,
          [user_id]
        );

        res.status(200).json({
          status: 'success',
          message: 'Role assigned successfully',
          data: {
            userId: user_id,
            roleId: role_id,
            roleName: roleExists.name,
            userRoles: userWithRoles.map(role => ({
              id: role.role_id,
              name: role.role_name,
              description: role.description
            }))
          }
        });
      });

    } catch (error) {
      console.error('Assign role error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Remove role from user
   * POST /api/roles/remove
   */
  static async removeRole(req: RemoveRoleRequest, res: Response): Promise<void> {
    try {
      const { user_id, role_id } = req.body;

      // Validate input data
      const roleData = { user_id, role_id };
      const validation = validateData(roleData, roleValidation.assignRole);
      
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
        const userExists = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [user_id]
        );

        if (!userExists) {
          res.status(404).json({
            status: 'error',
            message: 'User not found'
          });
          return;
        }

        // Check if role exists
        const roleExists = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleById,
          [role_id]
        );

        if (!roleExists) {
          res.status(404).json({
            status: 'error',
            message: 'Role not found'
          });
          return;
        }

        // Check if user has this role
        const existingAssignment = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.checkUserRole,
          [user_id, role_id]
        );

        if (!existingAssignment) {
          res.status(400).json({
            status: 'error',
            message: 'User does not have this role assigned'
          });
          return;
        }

        // Prevent removing the last Admin role
        if (roleExists.name === 'Admin') {
          const adminCount = await DatabaseHelpers.executeSelectOne(
            connection,
            `SELECT COUNT(*) as admin_count 
             FROM user_roles ur 
             JOIN roles r ON ur.role_id = r.id 
             WHERE r.name = 'Admin' AND ur.status = 1`,
            []
          );

          if (adminCount.admin_count <= 1) {
            res.status(400).json({
              status: 'error',
              message: 'Cannot remove the last admin user'
            });
            return;
          }
        }

        // Remove role from user (soft delete)
        await DatabaseHelpers.executeQuery(
          connection,
          RoleQueries.removeUserRole,
          [req.user?.id || user_id, user_id, role_id]
        );

        // Get updated user details with roles
        const userWithRoles = await DatabaseHelpers.executeSelect(
          connection,
          RoleQueries.getUserRoles,
          [user_id]
        );

        res.status(200).json({
          status: 'success',
          message: 'Role removed successfully',
          data: {
            userId: user_id,
            roleId: role_id,
            roleName: roleExists.name,
            userRoles: userWithRoles.map(role => ({
              id: role.role_id,
              name: role.role_name,
              description: role.description
            }))
          }
        });
      });

    } catch (error) {
      console.error('Remove role error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get user roles
   * GET /api/roles/user/:id
   */
  static async getUserRoles(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = parseInt(Array.isArray(id) ? id[0] : id);

      if (isNaN(userId) || userId <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid user ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if user exists
        const userExists = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserById,
          [userId]
        );

        if (!userExists) {
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
          [userId]
        );

        res.status(200).json({
          status: 'success',
          message: 'User roles retrieved successfully',
          data: {
            userId: userId,
            userName: `${userExists.first_name} ${userExists.last_name}`,
            userEmail: userExists.email,
            roles: userRoles.map(role => ({
              id: role.role_id,
              name: role.role_name,
              description: role.description,
              assignedAt: role.created_at
            })),
            totalRoles: userRoles.length
          }
        });
      });

    } catch (error) {
      console.error('Get user roles error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get role statistics
   * GET /api/roles/statistics
   */
  static async getRoleStatistics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get role statistics
        const roleStats = await DatabaseHelpers.executeSelect(
          connection,
          `SELECT 
             r.id,
             r.name,
             r.description,
             COUNT(ur.user_id) as user_count
           FROM roles r
           LEFT JOIN user_roles ur ON r.id = ur.role_id AND ur.status = 1
           WHERE r.status = 1
           GROUP BY r.id, r.name, r.description
           ORDER BY user_count DESC, r.name`,
          []
        );

        const totalUsers = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT COUNT(*) as total FROM users WHERE status = 1`,
          []
        );

        res.status(200).json({
          status: 'success',
          message: 'Role statistics retrieved successfully',
          data: {
            roleStatistics: roleStats.map(stat => ({
              id: stat.id,
              name: stat.name,
              description: stat.description,
              userCount: parseInt(stat.user_count),
              percentage: totalUsers.total > 0 ? 
                ((parseInt(stat.user_count) / totalUsers.total) * 100).toFixed(1) : 0
            })),
            totalActiveUsers: totalUsers.total,
            totalRoles: roleStats.length
          }
        });
      });

    } catch (error) {
      console.error('Get role statistics error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}