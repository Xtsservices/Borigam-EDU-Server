import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import { 
  studentValidation, 
  userValidation, 
  validateData 
} from '../utils/validations';
import { 
  StudentQueries, 
  InstituteStudentsQueries,
  StudentCoursesQueries,
  InstitutionStudentQueries,
  StudentProgressQueries,
  AdminDashboardQueries
} from '../queries/studentQueries';
import { 
  UserQueries, 
  RoleQueries, 
  LoginQueries 
} from '../queries/userQueries';
import { CourseQueries } from '../queries/courseQueries';
import { InstitutionQueries } from '../queries/institutionQueries';
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

interface CreateStudentByAdminRequest extends AuthenticatedRequest {
  body: {
    first_name: string;
    last_name?: string;
    email: string;
    mobile?: string;
    institution_id: number;
    course_ids: number[];
    status?: number;
  };
}

interface CreateStudentByInstituteAdminRequest extends AuthenticatedRequest {
  body: {
    first_name: string;
    last_name?: string;
    email: string;
    mobile?: string;
    course_ids: number[];
    status?: number;
  };
}

interface UpdateStudentRequest extends AuthenticatedRequest {
  body: {
    first_name?: string;
    last_name?: string;
    email?: string;
    mobile?: string;
    status?: number;
  };
}

interface EnrollCourseRequest extends AuthenticatedRequest {
  body: {
    course_id: number;
  };
}

interface EnrollMultipleCoursesRequest extends AuthenticatedRequest {
  body: {
    course_ids: number[];
  };
}

export class StudentController {

  /**
   * Check if user has admin role
   */
  private static checkAdminRole(req: AuthenticatedRequest, res: Response): boolean {
    if (!req.user || !req.user.roles.includes('Admin')) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied. Only administrators can perform this action.'
      });
      return false;
    }
    return true;
  }

  /**
   * Check if user has admin or institute admin role
   */
  private static checkAdminOrInstituteAdminRole(req: AuthenticatedRequest, res: Response): boolean {
    if (!req.user || (!req.user.roles.includes('Admin') && !req.user.roles.includes('Institute Admin'))) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied. Only administrators or institute administrators can perform this action.'
      });
      return false;
    }
    return true;
  }

  /**
   * Get user's institution ID if they are Institute Admin
   */
  private static async getInstituteAdminInstitution(userId: number, connection: any): Promise<number | null> {
    const institution = await DatabaseHelpers.executeSelectOne(
      connection,
      InstitutionStudentQueries.getInstitutionByAdminUserId,
      [userId]
    );
    return institution ? institution.id : null;
  }

  /**
   * Create student by Admin (requires institution selection)
   * POST /api/students/admin
   */
  static async createStudentByAdmin(req: CreateStudentByAdminRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!StudentController.checkAdminRole(req, res)) {
        return;
      }

      const { first_name, last_name, email, mobile, institution_id, course_ids, status = 1 } = req.body;

      // Validate input data
      const validation = validateData(
        { first_name, last_name, email, mobile, institution_id, course_ids, status }, 
        studentValidation.createStudentByAdmin
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
        
        // Check if student email already exists
        const existingStudent = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentByEmail,
          [email]
        );

        if (existingStudent) {
          res.status(400).json({
            status: 'error',
            message: 'A student with this email already exists'
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
            message: 'A user with this email already exists'
          });
          return;
        }

        // Validate institution exists
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institution_id]
        );

        if (!institution) {
          res.status(400).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        // Validate all course IDs exist and belong to the institution
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

          // Check if course is offered by the institution
          const institutionCourse = await DatabaseHelpers.executeSelectOne(
            connection,
            'SELECT id FROM institution_courses WHERE institution_id = ? AND course_id = ? AND status = 1',
            [institution_id, courseId]
          );

          if (!institutionCourse) {
            res.status(400).json({
              status: 'error',
              message: `Course "${course.title}" is not offered by the selected institution`
            });
            return;
          }

          validCourses.push(course);
        }

        // Step 1: Create Student user
        const tempPassword = EmailService.generateTempPassword();

        const studentUserId = await DatabaseHelpers.executeInsert(
          connection,
          UserQueries.createUser,
          [
            first_name,
            last_name || null,
            email,
            mobile || null,
            status,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 2: Get Student role ID
        const studentRole = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleByName,
          ['Student']
        );

        if (!studentRole) {
          res.status(500).json({
            status: 'error',
            message: 'Student role not found in system'
          });
          return;
        }

        // Step 3: Assign Student role to user
        await DatabaseHelpers.executeInsert(
          connection,
          RoleQueries.assignUserRole,
          [studentUserId, studentRole.id, req.user!.id, req.user!.id]
        );

        // Step 4: Create login credentials
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

        await DatabaseHelpers.executeInsert(
          connection,
          LoginQueries.createLogin,
          [
            studentUserId,
            email,
            hashedPassword,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 5: Create student record
        const studentId = await DatabaseHelpers.executeInsert(
          connection,
          StudentQueries.createStudent,
          [
            first_name,
            last_name || null,
            email,
            mobile || null,
            studentUserId,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 6: Assign student to institution
        await DatabaseHelpers.executeInsert(
          connection,
          InstituteStudentsQueries.assignStudentToInstitution,
          [institution_id, studentId, req.user!.id, req.user!.id]
        );

        // Step 7: Enroll student in courses
        for (const courseId of course_ids) {
          await DatabaseHelpers.executeInsert(
            connection,
            StudentCoursesQueries.enrollStudentInCourse,
            [studentId, courseId, req.user!.id, req.user!.id]
          );
        }

        // Step 8: Send welcome email to student
        try {
          const emailSent = await EmailService.sendStudentWelcomeEmail({
            firstName: first_name,
            lastName: last_name,
            email,
            tempPassword,
            institutionName: institution.name,
            courses: validCourses
          });

          if (!emailSent) {
            console.warn(`⚠️ Failed to send credentials email to ${email}`);
          }
        } catch (emailError) {
          console.error('Error sending welcome email:', emailError);
          // Continue without failing the student creation
        }

        res.status(201).json({
          status: 'success',
          message: 'Student created successfully',
          data: {
            student: {
              id: studentId,
              first_name,
              last_name: last_name || null,
              email,
              mobile: mobile || null,
              institution: {
                id: institution_id,
                name: institution.name
              },
              courses: validCourses,
              status
            },
            credentials_sent: true
          }
        });
      });

    } catch (error) {
      console.error('Error creating student by admin:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while creating student'
      });
    }
  }

  /**
   * Create student by Institute Admin (uses admin's institution)
   * POST /api/students/institute-admin
   */
  static async createStudentByInstituteAdmin(req: CreateStudentByInstituteAdminRequest, res: Response): Promise<void> {
    try {
      // Check institute admin role
      if (!req.user || !req.user.roles.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only institute administrators can perform this action.'
        });
        return;
      }

      const { first_name, last_name, email, mobile, course_ids, status = 1 } = req.body;

      // Validate input data
      const validation = validateData(
        { first_name, last_name, email, mobile, course_ids, status }, 
        studentValidation.createStudentByInstituteAdmin
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
        
        // Get Institute Admin's institution
        const institution_id = await StudentController.getInstituteAdminInstitution(req.user!.id, connection);

        if (!institution_id) {
          res.status(400).json({
            status: 'error',
            message: 'Institution not found for the current institute administrator'
          });
          return;
        }

        // Get institution details
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [institution_id]
        );

        // Check if student email already exists
        const existingStudent = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentByEmail,
          [email]
        );

        if (existingStudent) {
          res.status(400).json({
            status: 'error',
            message: 'A student with this email already exists'
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
            message: 'A user with this email already exists'
          });
          return;
        }

        // Validate all course IDs exist and belong to the institution
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

          // Check if course is offered by the institution
          const institutionCourse = await DatabaseHelpers.executeSelectOne(
            connection,
            'SELECT id FROM institution_courses WHERE institution_id = ? AND course_id = ? AND status = 1',
            [institution_id, courseId]
          );

          if (!institutionCourse) {
            res.status(400).json({
              status: 'error',
              message: `Course "${course.title}" is not offered by your institution`
            });
            return;
          }

          validCourses.push(course);
        }

        // Step 1: Create Student user
        const tempPassword = EmailService.generateTempPassword();

        const studentUserId = await DatabaseHelpers.executeInsert(
          connection,
          UserQueries.createUser,
          [
            first_name,
            last_name || null,
            email,
            mobile || null,
            status,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 2: Get Student role ID
        const studentRole = await DatabaseHelpers.executeSelectOne(
          connection,
          RoleQueries.getRoleByName,
          ['Student']
        );

        if (!studentRole) {
          res.status(500).json({
            status: 'error',
            message: 'Student role not found in system'
          });
          return;
        }

        // Step 3: Assign Student role to user
        await DatabaseHelpers.executeInsert(
          connection,
          RoleQueries.assignUserRole,
          [studentUserId, studentRole.id, req.user!.id, req.user!.id]
        );

        // Step 4: Create login credentials
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

        await DatabaseHelpers.executeInsert(
          connection,
          LoginQueries.createLogin,
          [
            studentUserId,
            email,
            hashedPassword,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 5: Create student record
        const studentId = await DatabaseHelpers.executeInsert(
          connection,
          StudentQueries.createStudent,
          [
            first_name,
            last_name || null,
            email,
            mobile || null,
            studentUserId,
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 6: Assign student to institution
        await DatabaseHelpers.executeInsert(
          connection,
          InstituteStudentsQueries.assignStudentToInstitution,
          [institution_id, studentId, req.user!.id, req.user!.id]
        );

        // Step 7: Enroll student in courses
        for (const courseId of course_ids) {
          await DatabaseHelpers.executeInsert(
            connection,
            StudentCoursesQueries.enrollStudentInCourse,
            [studentId, courseId, req.user!.id, req.user!.id]
          );
        }

        // Step 8: Send welcome email to student
        try {
          const emailSent = await EmailService.sendStudentWelcomeEmail({
            firstName: first_name,
            lastName: last_name,
            email,
            tempPassword,
            institutionName: institution.name,
            courses: validCourses
          });

          if (!emailSent) {
            console.warn(`⚠️ Failed to send credentials email to ${email}`);
          }
        } catch (emailError) {
          console.error('Error sending welcome email:', emailError);
          // Continue without failing the student creation
        }

        res.status(201).json({
          status: 'success',
          message: 'Student created successfully',
          data: {
            student: {
              id: studentId,
              first_name,
              last_name: last_name || null,
              email,
              mobile: mobile || null,
              institution: {
                id: institution_id,
                name: institution.name
              },
              courses: validCourses,
              status
            },
            credentials_sent: true
          }
        });
      });

    } catch (error) {
      console.error('Error creating student by institute admin:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while creating student'
      });
    }
  }

  /**
   * Get all students (Admin only)
   * GET /api/students
   */
  static async getAllStudents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin role
      if (!StudentController.checkAdminRole(req, res)) {
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get students with pagination
        const students = await DatabaseHelpers.executeSelect(
          connection,
          StudentQueries.getAllStudents,
          [limit, offset]
        );

        // Get total count
        const countResult = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentCount,
          []
        );

        const totalCount = countResult?.count || 0;
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
          status: 'success',
          data: {
            students,
            pagination: {
              current_page: page,
              total_pages: totalPages,
              total_count: totalCount,
              limit
            }
          }
        });
      });

    } catch (error) {
      console.error('Error fetching students:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching students'
      });
    }
  }

  /**
   * Get students by institution (Institute Admin)
   * GET /api/students/institution/:id
   */
  static async getStudentsByInstitution(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin or institute admin role
      if (!StudentController.checkAdminOrInstituteAdminRole(req, res)) {
        return;
      }

      const institutionId = parseInt(req.params.id as string);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // Validate institution ID
      const validation = validateData({ id: institutionId }, Joi.object({ id: studentValidation.institutionId }));
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid institution ID',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // If Institute Admin, verify they can access this institution
        if (req.user!.roles.includes('Institute Admin') && !req.user!.roles.includes('Admin')) {
          const adminInstitution = await StudentController.getInstituteAdminInstitution(req.user!.id, connection);
          
          if (adminInstitution !== institutionId) {
            res.status(403).json({
              status: 'error',
              message: 'Access denied. You can only view students from your own institution.'
            });
            return;
          }
        }

        // Get students by institution with pagination
        const students = await DatabaseHelpers.executeSelect(
          connection,
          InstituteStudentsQueries.getStudentsByInstitution,
          [institutionId, limit, offset]
        );

        // Get total count
        const countResult = await DatabaseHelpers.executeSelectOne(
          connection,
          InstituteStudentsQueries.getStudentsByInstitutionCount,
          [institutionId]
        );

        const totalCount = countResult?.count || 0;
        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
          status: 'success',
          data: {
            students,
            institution_id: institutionId,
            pagination: {
              current_page: page,
              total_pages: totalPages,
              total_count: totalCount,
              limit
            }
          }
        });
      });

    } catch (error) {
      console.error('Error fetching students by institution:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching students'
      });
    }
  }

  /**
   * Get student by ID with complete details
   * GET /api/students/:id
   */
  static async getStudentById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin or institute admin role
      if (!StudentController.checkAdminOrInstituteAdminRole(req, res)) {
        return;
      }

      const studentId = parseInt(req.params.id as string);

      // Validate student ID
      const validation = validateData({ id: studentId }, Joi.object({ id: studentValidation.studentId }));
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid student ID',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get student with complete details
        const studentData = await DatabaseHelpers.executeSelect(
          connection,
          StudentQueries.getStudentWithDetails,
          [studentId]
        );

        if (!studentData.length) {
          res.status(404).json({
            status: 'error',
            message: 'Student not found'
          });
          return;
        }

        // If Institute Admin, verify they can access this student
        if (req.user!.roles.includes('Institute Admin') && !req.user!.roles.includes('Admin')) {
          const adminInstitution = await StudentController.getInstituteAdminInstitution(req.user!.id, connection);
          const studentInstitution = studentData[0].institution_id;
          
          if (adminInstitution !== studentInstitution) {
            res.status(403).json({
              status: 'error',
              message: 'Access denied. You can only view students from your own institution.'
            });
            return;
          }
        }

        // Process the data to group courses under student
        const student = {
          id: studentData[0].student_id,
          first_name: studentData[0].first_name,
          last_name: studentData[0].last_name,
          email: studentData[0].email,
          mobile: studentData[0].mobile,
          created_at: studentData[0].student_created_at,
          institution: studentData[0].institution_id ? {
            id: studentData[0].institution_id,
            name: studentData[0].institution_name
          } : null,
          courses: studentData
            .filter(row => row.course_id) // Filter out null courses
            .map(row => ({
              id: row.course_id,
              title: row.course_title,
              description: row.course_description,
              category_name: row.category_name,
              enrollment_date: row.enrollment_date,
              progress: row.progress,
              completion_date: row.completion_date
            }))
        };

        res.status(200).json({
          status: 'success',
          data: { student }
        });
      });

    } catch (error) {
      console.error('Error fetching student:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching student'
      });
    }
  }

  /**
   * Track student content progress
   * POST /api/students/:studentId/courses/:courseId/content/:contentId/progress
   */
  static async trackContentProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { studentId, courseId, contentId } = req.params;
      const { is_completed = true, time_spent = 0 } = req.body;

      // Get database connection
      const db = await import("../../db");
      const connection = await db.default.getConnection();

      try {
        // Validate student exists
        const student = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentById,
          [parseInt(studentId as string)]
        );

      if (!student) {
        res.status(404).json({
          status: 'error',
          message: 'Student not found'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Track content progress
        await DatabaseHelpers.executeQuery(
          connection,
          StudentProgressQueries.trackContentProgress,
          [
            parseInt(studentId as string),
            parseInt(courseId as string),
            parseInt(contentId as string),
            is_completed,
            is_completed ? new Date() : null,
            time_spent,
            parseInt(studentId as string),
            parseInt(studentId as string)
          ]
        );

        // Update overall course progress
        await DatabaseHelpers.executeQuery(
          connection,
          StudentProgressQueries.updateCourseProgressFromContent,
          [parseInt(studentId as string), parseInt(studentId as string), parseInt(courseId as string)]
        );

        res.status(200).json({
          status: 'success',
          message: 'Content progress tracked successfully'
        });
      });

      } finally {
        connection.release();
      }

    } catch (error) {
      console.error('Error tracking content progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while tracking progress'
      });
    }
  }

  /**
   * Get course progress percentage for a student
   * GET /api/students/:studentId/courses/:courseId/progress
   */
  static async getCourseProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { studentId, courseId } = req.params;

      // Get database connection
      const db = await import("../../db");
      const connection = await db.default.getConnection();

      try {
        // Get progress percentage
        const progressData = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentProgressQueries.getCourseProgressPercentage,
          [parseInt(studentId as string), parseInt(courseId as string)]
        );

        // Get detailed progress
        const detailedProgress = await DatabaseHelpers.executeSelect(
          connection,
          StudentProgressQueries.getDetailedCourseProgress,
          [parseInt(studentId as string), parseInt(courseId as string), parseInt(courseId as string)]
        );

        res.status(200).json({
          status: 'success',
          data: {
            progress_percentage: progressData?.progress_percentage || 0,
            total_contents: progressData?.total_contents || 0,
            completed_contents: progressData?.completed_contents || 0,
            content_details: detailedProgress
          }
        });
      } finally {
        connection.release();
      }

    } catch (error) {
      console.error('Error getting course progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching progress'
      });
    }
  }

}

// Institute Admin Controller for Dashboard functionalities
export class InstituteAdminController {

  /**
   * Get Institute Admin dashboard data
   * GET /api/institute-admin/dashboard
   */
  static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Institute Administrators can access this endpoint.'
        });
        return;
      }

      // Get database connection
      const db = await import("../../db");
      const connection = await db.default.getConnection();

      try {
        // Get institution ID for the Institute Admin
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user.id]
        );

      if (!institution) {
        res.status(404).json({
          status: 'error',
          message: 'Institution not found for this administrator'
        });
        return;
      }

        // Get dashboard statistics
        const dashboardStats = await DatabaseHelpers.executeSelectOne(
          connection,
          AdminDashboardQueries.getInstituteDashboardStats,
          [institution.id]
        );

        // Get courses with statistics
        const coursesWithStats = await DatabaseHelpers.executeSelect(
          connection,
          AdminDashboardQueries.getInstitutionCoursesWithStats,
          [institution.id]
        );

        // Get recent activities
        const recentActivities = await DatabaseHelpers.executeSelect(
          connection,
          AdminDashboardQueries.getRecentStudentActivities,
          [institution.id]
        );

        res.status(200).json({
          status: 'success',
          data: {
            institution: {
              id: institution.id,
              name: institution.name,
              email: institution.email
            },
            statistics: dashboardStats,
            courses: coursesWithStats,
            recent_activities: recentActivities
          }
        });
      } finally {
        connection.release();
      }

    } catch (error) {
      console.error('Error getting dashboard data:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching dashboard data'
      });
    }
  }

  /**
   * Get students with progress for Institute Admin
   * GET /api/institute-admin/students
   */
  static async getStudentsWithProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Institute Administrators can access this endpoint.'
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // Get database connection
      const db = await import("../../db");
      const connection = await db.default.getConnection();

      try {
        // Get institution ID for the Institute Admin
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user.id]
        );

      if (!institution) {
        res.status(404).json({
          status: 'error',
          message: 'Institution not found for this administrator'
        });
        return;
      }

        // Get students with progress
        const studentsWithProgress = await DatabaseHelpers.executeSelect(
          connection,
          AdminDashboardQueries.getInstituteStudentsWithProgress,
          [institution.id, limit, offset]
        );

        // Get total count for pagination
        const totalCount = await DatabaseHelpers.executeSelectOne(
          connection,
          AdminDashboardQueries.getInstituteStudentsCount,
          [institution.id]
        );

      // Group students by student ID to organize course progress
      const groupedStudents = studentsWithProgress.reduce((acc: any, row: any) => {
        const studentId = row.student_id;
        
        if (!acc[studentId]) {
          acc[studentId] = {
            student_id: row.student_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            mobile: row.mobile,
            student_created_at: row.student_created_at,
            courses: []
          };
        }

        if (row.course_id) {
          acc[studentId].courses.push({
            course_id: row.course_id,
            course_title: row.course_title,
            enrollment_date: row.enrollment_date,
            progress: row.progress,
            completion_date: row.completion_date,
            status: row.status
          });
        }

        return acc;
      }, {});

      const students = Object.values(groupedStudents);

        res.status(200).json({
          status: 'success',
          data: {
            students,
            pagination: {
              current_page: page,
              total_pages: Math.ceil((totalCount?.count || 0) / limit),
              total_students: totalCount?.count || 0,
              per_page: limit
            }
          }
        });
      } finally {
        connection.release();
      }

    } catch (error) {
      console.error('Error getting students with progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching students'
      });
    }
  }

  /**
   * Get specific course students progress for Institute Admin
   * GET /api/institute-admin/courses/:courseId/students
   */
  static async getCourseStudentsProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Institute Administrators can access this endpoint.'
        });
        return;
      }

      const { courseId } = req.params;

      // Get database connection
      const db = await import("../../db");
      const connection = await db.default.getConnection();

      try {
        // Get institution ID for the Institute Admin
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user.id]
        );

      if (!institution) {
        res.status(404).json({
          status: 'error',
          message: 'Institution not found for this administrator'
        });
        return;
      }

        // Get course students with detailed progress
        const courseStudents = await DatabaseHelpers.executeSelect(
          connection,
          AdminDashboardQueries.getCourseStudentsProgress,
          [parseInt(courseId as string), parseInt(courseId as string), institution.id, parseInt(courseId as string)]
        );

        res.status(200).json({
          status: 'success',
          data: {
            course_id: parseInt(courseId as string),
            students: courseStudents
          }
        });
      } finally {
        connection.release();
      }

    } catch (error) {
      console.error('Error getting course students progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching course progress'
      });
    }
  }

}