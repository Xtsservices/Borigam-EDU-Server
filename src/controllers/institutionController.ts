import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import { 
  institutionValidation, 
  userValidation, 
  validateData 
} from '../utils/validations';
import { 
  InstitutionQueries, 
  InstitutionCoursesQueries 
} from '../queries/institutionQueries';
import { 
  UserQueries, 
  RoleQueries, 
  LoginQueries 
} from '../queries/userQueries';
import { CourseQueries } from '../queries/courseQueries';
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

interface CreateInstitutionRequest extends AuthenticatedRequest {
  body: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    course_ids: number[];
    status?: number;
  };
}

interface UpdateInstitutionRequest extends AuthenticatedRequest {
  body: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: number;
  };
}

interface UpdateInstitutionCoursesRequest extends AuthenticatedRequest {
  body: {
    course_ids: number[];
  };
}

interface AddCourseToInstitutionRequest extends AuthenticatedRequest {
  body: {
    course_id: number;
  };
}

export class InstitutionController {

  /**
   * Check if user has admin role
   */
  private static checkAdminRole(req: AuthenticatedRequest, res: Response): boolean {
    if (!req.user || !req.user.roles.includes('Admin')) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied. Only administrators can manage institutions.'
      });
      return false;
    }
    return true;
  }

  /**
   * Create a new institution
   * POST /api/institutions
   */
  static async createInstitution(req: CreateInstitutionRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const { name, email, phone, address, course_ids, status = 1 } = req.body;

      // Validate input data
      const validation = validateData(
        { name, email, phone, address, course_ids, status }, 
        institutionValidation.createInstitution
      );
      
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if institution email already exists
        const existingInstitution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionByEmail,
          [email]
        );

        if (existingInstitution) {
          res.status(400).json({
            status: 'error',
            message: 'Email address is already in use by another institution'
          });
          return;
        }

        // Check if institution phone already exists
        const existingPhone = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.checkPhoneExists,
          [phone]
        );

        if (existingPhone) {
          res.status(400).json({
            status: 'error',
            message: 'Phone number is already in use by another institution'
          });
          return;
        }

        // Check if user with this email already exists
        const existingUser = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.getUserByEmail,
          [email]
        );

        if (existingUser) {
          res.status(400).json({
            status: 'error',
            message: 'Email address is already in use by another user'
          });
          return;
        }

        // Check if user with this phone already exists
        const existingUserPhone = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.checkPhoneExists,
          [phone]
        );

        if (existingUserPhone) {
          res.status(400).json({
            status: 'error',
            message: 'Phone number is already in use by another user'
          });
          return;
        }

        // Validate all course IDs exist
        const validCourses = [];
        for (const courseId of course_ids) {
          const course = await DatabaseHelpers.executeSelectOne(
            connection,
            CourseQueries.getCourseById,
            [courseId]
          );

          if (!course) {
            res.status(400).json({
              status: 'error',
              message: `Course with ID ${courseId} not found`
            });
            return;
          }
          validCourses.push(course);
        }

        // Step 1: Create Institute Admin user
        const tempPassword = EmailService.generateTempPassword();
        
        // Extract first and last name from institution name
        const nameParts = name.trim().split(' ');
        const firstName = nameParts[0] || name;
        const lastName = nameParts.slice(1).join(' ') || 'Admin';

        const adminUserId = await DatabaseHelpers.executeInsert(
          connection,
          UserQueries.createUser,
          [
            firstName,
            lastName,
            email,
            phone || null,
            status,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 2: Get Institute Admin role ID
        const instituteAdminRole = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleByName,
          ['Institute Admin']
        );

        if (!instituteAdminRole) {
          res.status(500).json({
            status: 'error',
            message: 'Institute Admin role not found in system'
          });
          return;
        }

        // Step 3: Assign Institute Admin role to user
        await DatabaseHelpers.executeInsert(
          connection,
          RoleQueries.assignUserRole,
          [adminUserId, instituteAdminRole.id, req.user!.id, req.user!.id]
        );

        // Step 4: Create login credentials
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

        await DatabaseHelpers.executeInsert(
          connection,
          LoginQueries.createLogin,
          [
            adminUserId,
            email,
            hashedPassword,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 5: Create institution record
        const institutionId = await DatabaseHelpers.executeInsert(
          connection,
          InstitutionQueries.createInstitution,
          [
            name,
            email,
            phone || null,
            address || null,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 6: Assign courses to institution
        for (const courseId of course_ids) {
          await DatabaseHelpers.executeInsert(
            connection,
            InstitutionCoursesQueries.addCourseToInstitution,
            [institutionId, courseId, req.user!.id, req.user!.id]
          );
        }

        // Step 7: Send welcome email to institution admin
        try {
          const emailSent = await EmailService.sendCredentialsEmail({
            firstName,
            lastName,
            email,
            tempPassword,
            role: 'Institute Admin'
          });

          if (!emailSent) {
            console.warn(`⚠️ Failed to send credentials email to ${email}`);
          }
        } catch (emailError) {
          console.error('Error sending welcome email:', emailError);
          // Continue without failing the institution creation
        }

        // Get created institution with courses
        const createdInstitution = await DatabaseHelpers.executeSelect(
          connection,
          InstitutionQueries.getInstitutionWithCourses,
          [institutionId]
        );

        res.status(201).json({
          status: 'success',
          message: 'Institution created successfully',
          data: {
            institution: {
              id: institutionId,
              name,
              email,
              phone: phone || null,
              address: address || null,
              status,
              courses: validCourses
            },
            admin_credentials_sent: true
          }
        });
      });

    } catch (error) {
      console.error('Error creating institution:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while creating institution'
      });
    }
  }

  /**
   * Get all institutions with pagination
   * GET /api/institutions
   */
  static async getAllInstitutions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get all institutions
        const institutions = await DatabaseHelpers.executeSelect(
          connection,
          InstitutionQueries.getAllInstitutionsBase,
          []
        );

        res.status(200).json({
          status: 'success',
          data: {
            institutions
          }
        });
      });

    } catch (error) {
      console.error('Error fetching institutions:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching institutions'
      });
    }
  }

  /**
   * Get institution by ID with courses
   * GET /api/institutions/:id
   */
  static async getInstitutionById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);

      // Validate institution ID
      const validation = validateData({ id: institutionId }, Joi.object({ id: institutionValidation.institutionId }));
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get institution with courses
        const institutionData = await DatabaseHelpers.executeSelect(
          connection,
          InstitutionQueries.getInstitutionWithCourses,
          [institutionId]
        );

        if (!institutionData.length) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        // Process the data to group courses under institution
        const institution = {
          id: institutionData[0].institution_id,
          name: institutionData[0].institution_name,
          email: institutionData[0].email,
          phone: institutionData[0].phone,
          address: institutionData[0].address,
          created_at: institutionData[0].institution_created_at,
          courses: institutionData
            .filter(row => row.course_id) // Filter out null courses
            .map(row => ({
              id: row.course_id,
              title: row.course_title,
              description: row.course_description,
              category_name: row.category_name,
              added_at: row.course_added_at
            }))
        };

        res.status(200).json({
          status: 'success',
          data: { institution }
        });
      });

    } catch (error) {
      console.error('Error fetching institution:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching institution'
      });
    }
  }

  /**
   * Update institution
   * PUT /api/institutions/:id
   */
  static async updateInstitution(req: UpdateInstitutionRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);
      const { name, email, phone, address, status } = req.body;

      // Validate institution ID
      const idValidation = validateData({ id: institutionId }, Joi.object({ id: institutionValidation.institutionId }));
      if (!idValidation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID',
          errors: idValidation.errors
        });
        return;
      }

      // Validate input data
      const validation = validateData(
        { name, email, phone, address, status }, 
        institutionValidation.updateInstitution
      );
      
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if institution exists
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institutionId]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        // Check if new email already exists (if email is being updated)
        if (email && email !== institution.email) {
          const existingInstitution = await DatabaseHelpers.executeSelectOne(
            connection,
            InstitutionQueries.getInstitutionByEmail,
            [email]
          );

          if (existingInstitution) {
            res.status(400).json({
              status: 'error',
              message: 'Email address is already in use by another institution'
            });
            return;
          }

          // Also check if user exists with this email
          const existingUser = await DatabaseHelpers.executeSelectOne(
            connection,
            UserQueries.getUserByEmail,
            [email]
          );

          if (existingUser && existingUser.email !== institution.email) {
            res.status(400).json({
              status: 'error',
              message: 'Email address is already in use by another user'
            });
            return;
          }
        }

        // Check if new phone already exists (if phone is being updated)
        if (phone && phone !== institution.phone) {
          const existingInstitution = await DatabaseHelpers.executeSelectOne(
            connection,
            InstitutionQueries.checkPhoneExists,
            [phone]
          );

          if (existingInstitution) {
            res.status(400).json({
              status: 'error',
              message: 'Phone number is already in use by another institution'
            });
            return;
          }

          // Also check if user exists with this phone
          const existingUser = await DatabaseHelpers.executeSelectOne(
            connection,
            UserQueries.checkPhoneExists,
            [phone]
          );

          if (existingUser) {
            res.status(400).json({
              status: 'error',
              message: 'Phone number is already in use by another user'
            });
            return;
          }
        }

        // Update institution
        await DatabaseHelpers.executeQuery(
          connection,
          InstitutionQueries.updateInstitution,
          [
            name || institution.name,
            email || institution.email,
            phone !== undefined ? phone : institution.phone,
            address !== undefined ? address : institution.address,
            req.user!.id,
            institutionId
          ]
        );

        // Update admin user if email or name changed
        if (email && email !== institution.email) {
          // Extract first and last name from institution name for admin user update
          const nameParts = (name || institution.name).trim().split(' ');
          const firstName = nameParts[0] || (name || institution.name);
          const lastName = nameParts.slice(1).join(' ') || 'Admin';

          // Find the institute admin user for this institution by email
          const instituteAdminRole = await DatabaseHelpers.executeSelectOne(
            connection,
            RoleQueries.getRoleByName,
            ['Institute Admin']
          );

          if (instituteAdminRole) {
            // Find users with Institute Admin role and matching old email
            const adminUsers = await DatabaseHelpers.executeSelect(
              connection,
              'SELECT u.id FROM users u JOIN user_roles ur ON u.id = ur.user_id WHERE ur.role_id = ? AND u.email = ? AND u.status = 1',
              [instituteAdminRole.id, institution.email]
            );

            if (adminUsers.length > 0) {
              const adminUserId = adminUsers[0].id;
              
              // Update user email
              await DatabaseHelpers.executeQuery(
                connection,
                UserQueries.updateUser,
                [
                  firstName,
                  lastName,
                  email,
                  phone !== undefined ? phone : institution.phone,
                  institution.status,
                  req.user!.id,
                  adminUserId
                ]
              );

              // Update login email
              await DatabaseHelpers.executeQuery(
                connection,
                'UPDATE login SET email = ? WHERE user_id = ?',
                [email, adminUserId]
              );
            }
          }
        }

        // Get updated institution
        const updatedInstitution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institutionId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Institution updated successfully',
          data: { institution: updatedInstitution }
        });
      });

    } catch (error) {
      console.error('Error updating institution:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while updating institution'
      });
    }
  }

  /**
   * Delete institution (soft delete)
   * DELETE /api/institutions/:id
   */
  static async deleteInstitution(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);

      // Validate institution ID
      const validation = validateData({ id: institutionId }, Joi.object({ id: institutionValidation.institutionId }));
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if institution exists
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institutionId]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        // Soft delete institution
        await DatabaseHelpers.executeQuery(
          connection,
          InstitutionQueries.deleteInstitution,
          [req.user!.id, institutionId]
        );

        // Find and soft delete associated Institute Admin user
        const instituteAdminRole = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleByName,
          ['Institute Admin']
        );

        if (instituteAdminRole) {
          const adminUsers = await DatabaseHelpers.executeSelect(
            connection,
            'SELECT u.id FROM users u JOIN user_roles ur ON u.id = ur.user_id WHERE ur.role_id = ? AND u.email = ? AND u.status = 1',
            [instituteAdminRole.id, institution.email]
          );

          if (adminUsers.length > 0) {
            await DatabaseHelpers.executeQuery(
              connection,
              UserQueries.deleteUser,
              [req.user!.id, adminUsers[0].id]
            );
          }
        }

        res.status(200).json({
          status: 'success',
          message: 'Institution deleted successfully'
        });
      });

    } catch (error) {
      console.error('Error deleting institution:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while deleting institution'
      });
    }
  }

  /**
   * Update institution courses
   * PUT /api/institutions/:id/courses
   */
  static async updateInstitutionCourses(req: UpdateInstitutionCoursesRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);
      const { course_ids } = req.body;

      // Validate institution ID
      const idValidation = validateData({ id: institutionId }, Joi.object({ id: institutionValidation.institutionId }));
      if (!idValidation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID',
          errors: idValidation.errors
        });
        return;
      }

      // Validate course IDs
      const validation = validateData(
        { course_ids }, 
        institutionValidation.updateInstitutionCourses
      );
      
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if institution exists
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institutionId]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        // Validate all course IDs exist
        const validCourses = [];
        for (const courseId of course_ids) {
          const course = await DatabaseHelpers.executeSelectOne(
            connection,
            CourseQueries.getCourseById,
            [courseId]
          );

          if (!course) {
            res.status(400).json({
              status: 'error',
              message: `Course with ID ${courseId} not found`
            });
            return;
          }
          validCourses.push(course);
        }

        // Remove all existing course associations
        await DatabaseHelpers.executeQuery(
          connection,
          InstitutionCoursesQueries.updateInstitutionCourses,
          [req.user!.id, institutionId]
        );

        // Add new course associations
        for (const courseId of course_ids) {
          await DatabaseHelpers.executeInsert(
            connection,
            InstitutionCoursesQueries.addCourseToInstitution,
            [institutionId, courseId, req.user!.id, req.user!.id]
          );
        }

        // Get updated institution courses
        const institutionCourses = await DatabaseHelpers.executeSelect(
          connection,
          InstitutionCoursesQueries.getInstitutionCourses,
          [institutionId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Institution courses updated successfully',
          data: {
            institution_id: institutionId,
            courses: institutionCourses
          }
        });
      });

    } catch (error) {
      console.error('Error updating institution courses:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while updating institution courses'
      });
    }
  }

  /**
   * Add single course to institution
   * POST /api/institutions/:id/courses
   */
  static async addCourseToInstitution(req: AddCourseToInstitutionRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);
      const { course_id } = req.body;

      // Validate institution ID
      const idValidation = validateData({ id: institutionId }, Joi.object({ id: institutionValidation.institutionId }));
      if (!idValidation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID',
          errors: idValidation.errors
        });
        return;
      }

      // Validate course ID
      const validation = validateData(
        { course_id }, 
        institutionValidation.addCourseToInstitution
      );
      
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if institution exists
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institutionId]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        // Check if course exists
        const course = await DatabaseHelpers.executeSelectOne(
          connection,
          CourseQueries.getCourseById,
          [course_id]
        );

        if (!course) {
          res.status(404).json({
            status: 'error',
            message: 'Course not found'
          });
          return;
        }

        // Check if course is already assigned
        const existingAssignment = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionCoursesQueries.checkCourseAssignment,
          [institutionId, course_id]
        );

        if (existingAssignment) {
          res.status(400).json({
            status: 'error',
            message: 'Course is already assigned to this institution'
          });
          return;
        }

        // Add course to institution
        await DatabaseHelpers.executeInsert(
          connection,
          InstitutionCoursesQueries.addCourseToInstitution,
          [institutionId, course_id, req.user!.id, req.user!.id]
        );

        res.status(201).json({
          status: 'success',
          message: 'Course added to institution successfully',
          data: {
            institution_id: institutionId,
            course_id,
            course_title: course.title
          }
        });
      });

    } catch (error) {
      console.error('Error adding course to institution:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while adding course to institution'
      });
    }
  }

  /**
   * Remove course from institution
   * DELETE /api/institutions/:id/courses/:courseId
   */
  static async removeCourseFromInstitution(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);
      const courseId = parseInt(req.params.courseId as string);

      // Validate IDs
      const institutionIdValidation = validateData({ id: institutionId }, Joi.object({ id: institutionValidation.institutionId }));
      const courseIdValidation = validateData({ course_id: courseId }, institutionValidation.addCourseToInstitution);
      
      if (!institutionIdValidation.isValid || !courseIdValidation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID or course ID',
          errors: [...institutionIdValidation.errors, ...courseIdValidation.errors]
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if assignment exists
        const existingAssignment = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionCoursesQueries.checkCourseAssignment,
          [institutionId, courseId]
        );

        if (!existingAssignment) {
          res.status(404).json({
            status: 'error',
            message: 'Course assignment not found'
          });
          return;
        }

        // Remove course from institution
        await DatabaseHelpers.executeQuery(
          connection,
          InstitutionCoursesQueries.removeCourseFromInstitution,
          [req.user!.id, institutionId, courseId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Course removed from institution successfully'
        });
      });

    } catch (error) {
      console.error('Error removing course from institution:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while removing course from institution'
      });
    }
  }

  /**
   * Get available courses for institution
   * GET /api/institutions/:id/available-courses
   */
  static async getAvailableCoursesForInstitution(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!InstitutionController.checkAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);

      // Validate institution ID
      const validation = validateData({ id: institutionId }, Joi.object({ id: institutionValidation.institutionId }));
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Check if institution exists
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institutionId]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        // Get available courses
        const availableCourses = await DatabaseHelpers.executeSelect(
          connection,
          InstitutionCoursesQueries.getAvailableCoursesForInstitution,
          [institutionId]
        );

        res.status(200).json({
          status: 'success',
          data: {
            institution_id: institutionId,
            available_courses: availableCourses
          }
        });
      });

    } catch (error) {
      console.error('Error fetching available courses:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching available courses'
      });
    }
  }
}