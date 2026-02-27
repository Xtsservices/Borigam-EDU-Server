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
import { 
  CourseQueries,
  CourseSectionQueries,
  CourseContentQueries
} from '../queries/courseQueries';
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
    studentId?: number;
    institutionId?: number;
  };
}

interface CreateStudentRequest extends AuthenticatedRequest {
  body: {
    first_name: string;
    last_name?: string;
    email: string;
    mobile?: string;
    institution_id?: number; // Optional - only for Admin, auto-determined for Institute Admin
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
    course_ids?: number[]; // Optional - if provided, replaces all student courses
    add_course_ids?: number[]; // Optional - adds these courses to existing ones
    remove_course_ids?: number[]; // Optional - removes these courses from student
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
   * Create student (unified endpoint for Admin and Institute Admin)
   * POST /api/students
   */
  static async createStudent(req: CreateStudentRequest, res: Response): Promise<void> {
    try {
      // Check if user has required role
      if (!req.user || (!req.user.roles.includes('Admin') && !req.user.roles.includes('Institute Admin'))) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only administrators and institute administrators can create students.'
        });
        return;
      }

      // Check if request body exists
      if (!req.body) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is missing. Please send JSON data with Content-Type: application/json'
        });
        return;
      }

      const { first_name, last_name, email, mobile, institution_id, course_ids, status = 1 } = req.body;
      const isAdmin = req.user.roles.includes('Admin');
      const isInstituteAdmin = req.user.roles.includes('Institute Admin');

      // Role-based validation for institution_id
      if (isAdmin && !institution_id) {
        res.status(400).json({
          status: 'error',
          message: 'Institution ID is required for admin users'
        });
        return;
      }

      if (isInstituteAdmin && institution_id) {
        res.status(400).json({
          status: 'error',
          message: 'Institution ID should not be provided for institute admin users'
        });
        return;
      }

      // Validate input data based on role
      const validationSchema = isAdmin 
        ? studentValidation.createStudentByAdmin 
        : studentValidation.createStudentByInstituteAdmin;

      const validationData = isAdmin 
        ? { first_name, last_name, email, mobile, institution_id, course_ids, status }
        : { first_name, last_name, email, mobile, course_ids, status };

      const validation = validateData(validationData, validationSchema);
      
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validation.errors
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Determine institution_id based on user role
        let finalInstitutionId: number;

        if (isAdmin) {
          finalInstitutionId = institution_id!;
        } else {
          // Institute Admin - get their institution
          const adminInstitutionId = await StudentController.getInstituteAdminInstitution(req.user!.id, connection);
          if (!adminInstitutionId) {
            res.status(400).json({
              status: 'error',
              message: 'Institution not found for the current institute administrator'
            });
            return;
          }
          finalInstitutionId = adminInstitutionId;
        }

        // Check if student email already exists
        const existingStudent = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentByEmail,
          [email]
        );

        if (existingStudent) {
          res.status(400).json({
            status: 'error',
            message: 'Email address is already in use by another student'
          });
          return;
        }

        // Check if student mobile already exists
        const existingMobile = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.checkMobileExists,
          [mobile]
        );

        if (existingMobile) {
          res.status(400).json({
            status: 'error',
            message: 'Mobile number is already in use by another student'
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

        // Check if user with this mobile already exists
        const existingUserMobile = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.checkPhoneExists,
          [mobile]
        );

        if (existingUserMobile) {
          res.status(400).json({
            status: 'error',
            message: 'Mobile number is already in use by another user'
          });
          return;
        }

        // Validate institution exists
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionQueries.getInstitutionById,
          [finalInstitutionId]
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
            [finalInstitutionId, courseId]
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
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 6: Assign student to institution
        await DatabaseHelpers.executeInsert(
          connection,
          InstituteStudentsQueries.assignStudentToInstitution,
          [finalInstitutionId, studentId, req.user!.id, req.user!.id]
        );

        // Step 7: Enroll student in courses
        for (const courseId of course_ids) {
          await DatabaseHelpers.executeQuery(
            connection,
            StudentCoursesQueries.upsertStudentCourse,
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
              status
            },
            institution: {
              id: finalInstitutionId,
              name: institution.name
            },
            enrolledCourses: validCourses.map(course => ({
              course_id: course.id,
              title: course.title
            })),
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
  static async createStudentByInstituteAdmin(req: CreateStudentRequest, res: Response): Promise<void> {
    try {
      // Check institute admin role
      if (!req.user || !req.user.roles.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only institute administrators can perform this action.'
        });
        return;
      }

      // Debug: Log request body to see what's being received
      console.log('📝 Request body received:', req.body);
      console.log('📝 Content-Type:', req.headers['content-type']);

      // Check if request body exists
      if (!req.body) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is missing. Please send JSON data with Content-Type: application/json'
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
        
        // Check if student email already exists
        const existingStudent = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentByEmail,
          [email]
        );

        if (existingStudent) {
          res.status(400).json({
            status: 'error',
            message: 'Email address is already in use by another student'
          });
          return;
        }

        // Check if student mobile already exists
        const existingMobile = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.checkMobileExists,
          [mobile]
        );

        if (existingMobile) {
          res.status(400).json({
            status: 'error',
            message: 'Mobile number is already in use by another student'
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

        // Check if user with this mobile already exists
        const existingUserMobile = await DatabaseHelpers.executeSelectOne(
          connection,
          UserQueries.checkPhoneExists,
          [mobile]
        );

        if (existingUserMobile) {
          res.status(400).json({
            status: 'error',
            message: 'Mobile number is already in use by another user'
          });
          return;
        }

        // Get Institute Admin's institution
        const institution = await StudentController.getInstituteAdminInstitution(req.user!.id, connection);
        
        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found for this administrator'
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
            [institution, courseId]
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
            req.user!.id,
            req.user!.id
          ]
        );

        // Step 6: Assign student to institution
        await DatabaseHelpers.executeInsert(
          connection,
          InstituteStudentsQueries.assignStudentToInstitution,
          [institution, studentId, req.user!.id, req.user!.id]
        );

        // Step 7: Enroll student in courses
        for (const courseId of course_ids) {
          await DatabaseHelpers.executeQuery(
            connection,
            StudentCoursesQueries.upsertStudentCourse,
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
            institutionName: 'Institute', // Will be resolved from institution ID
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
          message: 'Student created successfully by Institute Admin',
          data: {
            student: {
              id: studentId,
              first_name,
              last_name: last_name || null,
              email,
              mobile: mobile || null,
              institution_id: institution,
              status: 1
            },
            courses: validCourses,
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

      await DatabaseTransaction.executeTransaction(async (connection) => {
        
        // Get all students with their details (institution and courses)
        const rawData = await DatabaseHelpers.executeSelect(
          connection,
          StudentQueries.getAllStudentsWithDetails,
          []
        );

        // Group data by student_id
        const studentMap = new Map();

        for (const row of rawData) {
          const studentId = row.student_id;

          if (!studentMap.has(studentId)) {
            studentMap.set(studentId, {
              id: row.student_id,
              first_name: row.first_name,
              last_name: row.last_name,
              email: row.email,
              mobile: row.mobile,
              status: row.status,
              created_by: row.created_by,
              updated_by: row.updated_by,
              created_at: row.student_created_at,
              updated_at: row.student_updated_at,
              institution: row.institution_id ? {
                id: row.institution_id,
                name: row.institution_name
              } : null,
              enrolled_courses: [],
              courses_count: 0
            });
          }

          // Add course if it exists
          if (row.course_id) {
            const student = studentMap.get(studentId);
            // Check if course is already added (to avoid duplicates)
            const courseExists = student.enrolled_courses.some(c => c.id === row.course_id);
            if (!courseExists) {
              student.enrolled_courses.push({
                id: row.course_id,
                title: row.course_title,
                description: row.course_description,
                course_image: row.course_image,
                duration: row.course_duration,
                category_name: row.category_name,
                enrollment_date: row.enrollment_date,
                progress: row.progress,
                completion_date: row.completion_date
              });
              student.courses_count++;
            }
          }
        }

        // Convert map to array
        const students = Array.from(studentMap.values());

        res.status(200).json({
          status: 'success',
          data: {
            students
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

        // Get all students by institution
        const students = await DatabaseHelpers.executeSelect(
          connection,
          InstituteStudentsQueries.getInstitutionStudents,
          [institutionId]
        );

        res.status(200).json({
          status: 'success',
          data: {
            students,
            institution_id: institutionId
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
              course_image: row.course_image,
              course_duration: row.course_duration,
              category_name: row.category_name,
              enrollment_date: row.enrollment_date,
              progress: row.progress ? `${row.progress}%` : '0%',
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
   * Update student (unified endpoint for all updates)
   * PUT /api/students/:id
   */
  static async updateStudent(req: UpdateStudentRequest, res: Response): Promise<void> {
    try {
      // Check admin or institute admin role
      if (!StudentController.checkAdminOrInstituteAdminRole(req, res)) {
        return;
      }

      const studentId = parseInt(req.params.id as string);
      const {
        first_name,
        last_name,
        email,
        mobile,
        status,
        course_ids,
        add_course_ids,
        remove_course_ids
      } = req.body;

      // Validate student ID
      if (!studentId || isNaN(studentId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid student ID'
        });
        return;
      }

      // Validate that user is not trying to conflict course operations
      const courseOperations = [course_ids, add_course_ids, remove_course_ids].filter(op => op && op.length > 0);
      if (courseOperations.length > 1) {
        res.status(400).json({
          status: 'error',
          message: 'Cannot perform multiple course operations simultaneously. Use either course_ids (replace all), add_course_ids, or remove_course_ids.'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if student exists
        const existingStudent = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentById,
          [studentId]
        );

        if (!existingStudent) {
          res.status(404).json({
            status: 'error',
            message: 'Student not found'
          });
          return;
        }

        // Get the user record for this student using email
        const existingUser = await DatabaseHelpers.executeSelectOne(
          connection,
          'SELECT id FROM users WHERE email = ? AND status = 1',
          [existingStudent.email]
        );

        if (!existingUser) {
          res.status(404).json({
            status: 'error',
            message: 'Associated user record not found for this student'
          });
          return;
        }

        // If Institute Admin, verify they can access this student
        if (req.user!.roles.includes('Institute Admin') && !req.user!.roles.includes('Admin')) {
          const adminInstitution = await StudentController.getInstituteAdminInstitution(req.user!.id, connection);
          
          const studentInstitution = await DatabaseHelpers.executeSelectOne(
            connection,
            'SELECT i.id FROM institutions i JOIN institute_students ins ON i.id = ins.institution_id WHERE ins.student_id = ? AND ins.status = 1',
            [studentId]
          );
          
          if (!studentInstitution || adminInstitution !== studentInstitution.id) {
            res.status(403).json({
              status: 'error',
              message: 'Access denied. You can only update students from your own institution.'
            });
            return;
          }
        }

        // Validate email uniqueness (if email is being updated)
        if (email && email !== existingStudent.email) {
          const existingEmail = await DatabaseHelpers.executeSelectOne(
            connection,
            StudentQueries.getStudentByEmail,
            [email]
          );

          if (existingEmail) {
            res.status(400).json({
              status: 'error',
              message: 'Email address is already in use by another student'
            });
            return;
          }

          // Also check users table
          const existingUserEmail = await DatabaseHelpers.executeSelectOne(
            connection,
            UserQueries.getUserByEmail,
            [email]
          );

          if (existingUserEmail && existingUserEmail.id !== existingUser.id) {
            res.status(400).json({
              status: 'error',
              message: 'Email address is already in use by another user'
            });
            return;
          }
        }

        // Validate mobile uniqueness (if mobile is being updated)
        if (mobile && mobile !== existingStudent.mobile) {
          const existingMobile = await DatabaseHelpers.executeSelectOne(
            connection,
            StudentQueries.checkMobileExists,
            [mobile]
          );

          if (existingMobile && existingMobile.student_id !== studentId) {
            res.status(400).json({
              status: 'error',
              message: 'Mobile number is already in use by another student'
            });
            return;
          }
        }

        // Update student basic information if any fields are provided
        const hasBasicUpdates = first_name || last_name || email || mobile || status !== undefined;
        
        if (hasBasicUpdates) {
          const updateFields = [];
          const updateValues = [];

          if (first_name) {
            updateFields.push('first_name = ?');
            updateValues.push(first_name);
          }
          if (last_name !== undefined) {
            updateFields.push('last_name = ?');
            updateValues.push(last_name || null);
          }
          if (email) {
            updateFields.push('email = ?');
            updateValues.push(email);
          }
          if (mobile !== undefined) {
            updateFields.push('mobile = ?');  
            updateValues.push(mobile || null);
          }
          if (status !== undefined) {
            updateFields.push('status = ?');
            updateValues.push(status);
          }

          updateFields.push('updated_by = ?', 'updated_at = CURRENT_TIMESTAMP');
          updateValues.push(req.user!.id);

          const updateQuery = `UPDATE students SET ${updateFields.join(', ')} WHERE id = ?`;
          updateValues.push(studentId);

          await DatabaseHelpers.executeQuery(connection, updateQuery, updateValues);

          // Also update the users table if email is changed
          if (email && email !== existingStudent.email) {
            await DatabaseHelpers.executeQuery(
              connection,
              'UPDATE users SET email = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [email, req.user!.id, existingUser.id]
            );

            // Update login table
            await DatabaseHelpers.executeQuery(
              connection,
              'UPDATE login SET username = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
              [email, req.user!.id, existingUser.id]
            );
          }

          // Update users table for other fields
          if (first_name || last_name || mobile !== undefined) {
            const userUpdateFields = [];
            const userUpdateValues = [];

            if (first_name) {
              userUpdateFields.push('first_name = ?');
              userUpdateValues.push(first_name);
            }
            if (last_name !== undefined) {
              userUpdateFields.push('last_name = ?');
              userUpdateValues.push(last_name || null);
            }
            if (mobile !== undefined) {
              userUpdateFields.push('phone = ?');
              userUpdateValues.push(mobile || null);
            }

            if (userUpdateFields.length > 0) {
              userUpdateFields.push('updated_by = ?', 'updated_at = CURRENT_TIMESTAMP');
              userUpdateValues.push(req.user!.id);
              userUpdateValues.push(existingUser.id);

              const userUpdateQuery = `UPDATE users SET ${userUpdateFields.join(', ')} WHERE id = ?`;
              await DatabaseHelpers.executeQuery(connection, userUpdateQuery, userUpdateValues);
            }
          }
        }

        // Handle course operations
        let updatedCourses = [];
        
        if (course_ids && course_ids.length > 0) {
          // Replace all courses
          await StudentController.validateInstitutionCourses(connection, studentId, course_ids);
          
          // Remove all existing courses
          await DatabaseHelpers.executeQuery(
            connection,
            'UPDATE student_courses SET status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?',
            [req.user!.id, studentId]
          );

          // Add new courses
          for (const courseId of course_ids) {
            await DatabaseHelpers.executeQuery(
              connection,
              StudentCoursesQueries.upsertStudentCourse,
              [studentId, courseId, req.user!.id, req.user!.id]
            );
          }

          updatedCourses = await StudentController.getStudentCourses(connection, studentId);

        } else if (add_course_ids && add_course_ids.length > 0) {
          // Add courses to existing ones
          await StudentController.validateInstitutionCourses(connection, studentId, add_course_ids);
          
          for (const courseId of add_course_ids) {
            // Check if student is already enrolled
            const existingEnrollment = await DatabaseHelpers.executeSelectOne(
              connection,
              'SELECT id FROM student_courses WHERE student_id = ? AND course_id = ? AND status = 1',
              [studentId, courseId]
            );

            if (!existingEnrollment) {
              await DatabaseHelpers.executeQuery(
                connection,
                StudentCoursesQueries.upsertStudentCourse,
                [studentId, courseId, req.user!.id, req.user!.id]
              );
            }
          }

          updatedCourses = await StudentController.getStudentCourses(connection, studentId);

        } else if (remove_course_ids && remove_course_ids.length > 0) {
          // Remove specified courses
          for (const courseId of remove_course_ids) {
            await DatabaseHelpers.executeQuery(
              connection,
              'UPDATE student_courses SET status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ? AND course_id = ?',
              [req.user!.id, studentId, courseId]
            );
          }

          updatedCourses = await StudentController.getStudentCourses(connection, studentId);
        }

        // Get updated student information
        const updatedStudent = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentById,
          [studentId]
        );

        // Get institution information
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          `SELECT i.id, i.name FROM institutions i 
           JOIN institute_students ins ON i.id = ins.institution_id 
           WHERE ins.student_id = ? AND ins.status = 1`,
          [studentId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Student updated successfully',
          data: {
            student: {
              id: updatedStudent.id,
              first_name: updatedStudent.first_name,
              last_name: updatedStudent.last_name,
              email: updatedStudent.email,
              mobile: updatedStudent.mobile,
              status: updatedStudent.status,
              updated_at: updatedStudent.updated_at
            },
            institution: institution ? {
              id: institution.id,
              name: institution.name
            } : null,
            courses: updatedCourses
          }
        });
      });

    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while updating student'
      });
    }
  }

  /**
   * Delete student (soft delete)
   * DELETE /api/students/:id
   */
  static async deleteStudent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check admin or institute admin role
      if (!StudentController.checkAdminOrInstituteAdminRole(req, res)) {
        return;
      }

      const studentId = parseInt(req.params.id as string);

      if (!studentId || isNaN(studentId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid student ID'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if student exists
        const existingStudent = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentById,
          [studentId]
        );

        if (!existingStudent) {
          res.status(404).json({
            status: 'error',
            message: 'Student not found'
          });
          return;
        }

        // Get the user record for this student using email
        const existingUser = await DatabaseHelpers.executeSelectOne(
          connection,
          'SELECT id FROM users WHERE email = ? AND status = 1',
          [existingStudent.email]
        );

        if (!existingUser) {
          res.status(404).json({
            status: 'error',
            message: 'Associated user record not found for this student'
          });
          return;
        }

        // If Institute Admin, verify they can access this student
        if (req.user!.roles.includes('Institute Admin') && !req.user!.roles.includes('Admin')) {
          const adminInstitution = await StudentController.getInstituteAdminInstitution(req.user!.id, connection);
          
          const studentInstitution = await DatabaseHelpers.executeSelectOne(
            connection,
            'SELECT i.id FROM institutions i JOIN institute_students ins ON i.id = ins.institution_id WHERE ins.student_id = ? AND ins.status = 1',
            [studentId]
          );
          
          if (!studentInstitution || adminInstitution !== studentInstitution.id) {
            res.status(403).json({
              status: 'error',
              message: 'Access denied. You can only delete students from your own institution.'
            });
            return;
          }
        }

        // Soft delete student
        await DatabaseHelpers.executeQuery(
          connection,
          'UPDATE students SET status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [req.user!.id, studentId]
        );

        // Soft delete user
        await DatabaseHelpers.executeQuery(
          connection,
          'UPDATE users SET status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [req.user!.id, existingUser.id]
        );

        // Soft delete student courses
        await DatabaseHelpers.executeQuery(
          connection,
          'UPDATE student_courses SET status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?',
          [req.user!.id, studentId]
        );

        // Soft delete institution assignment
        await DatabaseHelpers.executeQuery(
          connection,
          'UPDATE institute_students SET status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?',
          [req.user!.id, studentId]
        );

        res.status(200).json({
          status: 'success',
          message: 'Student deleted successfully'
        });
      });

    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while deleting student'
      });
    }
  }

  // Helper methods for the update functionality
  private static async validateInstitutionCourses(connection: any, studentId: number, courseIds: number[]): Promise<void> {
    // Get student's institution
    const studentInstitution = await DatabaseHelpers.executeSelectOne(
      connection,
      'SELECT i.id FROM institutions i JOIN institute_students ins ON i.id = ins.institution_id WHERE ins.student_id = ? AND ins.status = 1',
      [studentId]
    );

    if (!studentInstitution) {
      throw new Error('Student institution not found');
    }

    // Validate all courses are offered by the institution
    for (const courseId of courseIds) {
      const institutionCourse = await DatabaseHelpers.executeSelectOne(
        connection,
        'SELECT id FROM institution_courses WHERE institution_id = ? AND course_id = ? AND status = 1',
        [studentInstitution.id, courseId]
      );

      if (!institutionCourse) {
        const course = await DatabaseHelpers.executeSelectOne(connection, 'SELECT title FROM courses WHERE id = ?', [courseId]);
        throw new Error(`Course "${course?.title || courseId}" is not offered by the student's institution`);
      }
    }
  }

  /**
   * Get logged-in student's enrolled courses with full details
   * GET /api/students/my-courses
   * Accessible to students (authenticated users)
   */
  static async getMyEnrolledCourses(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Must be authenticated
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Try to find student record by email
        let student = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentQueries.getStudentByEmail,
          [req.user!.email]
        );

        // If student record doesn't exist, return empty courses list
        // (User might be admin or other role without student profile)
        if (!student) {
          console.log(`ℹ️ No student profile found for user: ${req.user!.email}`);
          res.status(200).json({
            status: 'success',
            data: {
              student: {
                id: req.user!.id,
                first_name: req.user!.first_name,
                last_name: req.user!.last_name,
                email: req.user!.email,
                has_student_profile: false
              },
              courses: [],
              total_courses: 0,
              message: 'You do not have an active student profile. Please contact your administrator.'
            }
          });
          return;
        }

        // Get all enrolled courses with basic details
        const enrolledCourses = await DatabaseHelpers.executeSelect(
          connection,
          StudentCoursesQueries.getStudentCourses,
          [student.id]
        );

        if (!enrolledCourses || enrolledCourses.length === 0) {
          res.status(200).json({
            status: 'success',
            data: {
              student: {
                id: student.id,
                first_name: student.first_name,
                last_name: student.last_name,
                email: student.email,
                has_student_profile: true
              },
              courses: [],
              total_courses: 0,
              message: 'You have not enrolled in any courses yet.'
            }
          });
          return;
        }

        // Enrich each course with sections and contents
        const coursesWithDetails = await Promise.all(
          enrolledCourses.map(async (course: any) => {
            try {
              // Get sections for this course
              const sections = await DatabaseHelpers.executeSelect(
                connection,
                CourseSectionQueries.getSectionsByCourse,
                [course.course_id]
              );

              // Get contents for each section
              const enrichedSections = await Promise.all(
                sections.map(async (section: any) => {
                  const contents = await DatabaseHelpers.executeSelect(
                    connection,
                    CourseContentQueries.getContentsBySection,
                    [section.id]
                  );

                  return {
                    id: section.id,
                    title: section.title,
                    description: section.description,
                    sort_order: section.sort_order,
                    is_free: section.is_free,
                    content_count: section.content_count,
                    contents: contents.map((content: any) => ({
                      id: content.id,
                      title: content.title,
                      description: content.description,
                      content_type: content.content_type,
                      duration: content.duration,
                      sort_order: content.sort_order,
                      is_free: content.is_free
                    }))
                  };
                })
              );

              // Get progress for this course
              const progressData = await DatabaseHelpers.executeSelectOne(
                connection,
                StudentProgressQueries.getCourseProgressPercentage,
                [student.id, course.course_id, course.course_id]
              );

              return {
                id: course.course_id,
                title: course.title,
                description: course.description,
                course_image: course.course_image,
                duration: course.duration,
                category_name: course.category_name,
                enrollment_date: course.enrollment_date,
                completion_date: course.completion_date,
                progress: `${course.progress || 0}%`,
                progress_value: course.progress || 0,
                total_contents: progressData?.total_contents || 0,
                completed_contents: progressData?.completed_contents || 0,
                sections: enrichedSections
              };
            } catch (courseError) {
              console.error(`Error processing course ${course.course_id}:`, courseError);
              // Return course with minimal data if processing fails
              return {
                id: course.course_id,
                title: course.title,
                description: course.description,
                course_image: course.course_image,
                duration: course.duration,
                category_name: course.category_name,
                enrollment_date: course.enrollment_date,
                completion_date: course.completion_date,
                progress: `${course.progress || 0}%`,
                progress_value: course.progress || 0,
                total_contents: 0,
                completed_contents: 0,
                sections: []
              };
            }
          })
        );

        res.status(200).json({
          status: 'success',
          data: {
            student: {
              id: student.id,
              first_name: student.first_name,
              last_name: student.last_name,
              email: student.email,
              has_student_profile: true
            },
            courses: coursesWithDetails,
            total_courses: coursesWithDetails.length
          }
        });
      });

    } catch (error) {
      console.error('Error fetching enrolled courses:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching enrolled courses',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  private static async getStudentCourses(connection: any, studentId: number): Promise<any[]> {
    return await DatabaseHelpers.executeSelect(
      connection,
      `SELECT c.id, c.title, sc.enrollment_date 
       FROM student_courses sc 
       JOIN courses c ON sc.course_id = c.id 
       WHERE sc.student_id = ? AND sc.status = 1`,
      [studentId]
    );
  }

  /**
   * Track student content progress
   * POST /api/students/:studentId/courses/:courseId/content/:contentId/progress
   */
  static async trackContentProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { studentId, courseId, contentId } = req.params;
      const { is_completed = true, time_spent = 0 } = req.body;

      // Validate parameters
      if (!studentId || !courseId || !contentId) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required parameters: studentId, courseId, contentId'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
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

        // Validate course exists and student is enrolled
        const enrollment = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentCoursesQueries.checkCourseEnrollment,
          [parseInt(studentId as string), parseInt(courseId as string)]
        );

        if (!enrollment) {
          res.status(404).json({
            status: 'error',
            message: 'Student is not enrolled in this course'
          });
          return;
        }

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

        // Update overall course progress from content completion
        await DatabaseHelpers.executeQuery(
          connection,
          StudentProgressQueries.updateCourseProgressFromContent,
          [parseInt(studentId as string), parseInt(studentId as string), parseInt(courseId as string)]
        );

        // Get updated progress
        const progressData = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentProgressQueries.getCourseProgressPercentage,
          [parseInt(studentId as string), parseInt(courseId as string), parseInt(courseId as string)]
        );

        res.status(200).json({
          status: 'success',
          message: 'Content progress tracked successfully',
          data: {
            progress_percentage: progressData?.progress_percentage || 0,
            total_contents: progressData?.total_contents || 0,
            completed_contents: progressData?.completed_contents || 0,
            formatted_progress: `${progressData?.progress_percentage || 0}%`
          }
        });
      });

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

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Validate student and enrollment
        const enrollment = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentCoursesQueries.checkCourseEnrollment,
          [parseInt(studentId as string), parseInt(courseId as string)]
        );

        if (!enrollment) {
          res.status(404).json({
            status: 'error',
            message: 'Student is not enrolled in this course'
          });
          return;
        }

        // Get progress percentage
        const progressData = await DatabaseHelpers.executeSelectOne(
          connection,
          StudentProgressQueries.getCourseProgressPercentage,
          [parseInt(studentId as string), parseInt(courseId as string), parseInt(courseId as string)]
        );

        // Get section-wise progress
        const sectionProgress = await DatabaseHelpers.executeSelect(
          connection,
          StudentProgressQueries.getSectionProgressForCourse,
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
            formatted_progress: `${progressData?.progress_percentage || 0}%`,
            total_contents: progressData?.total_contents || 0,
            completed_contents: progressData?.completed_contents || 0,
            section_progress: sectionProgress,
            content_details: detailedProgress
          }
        });
      });

    } catch (error) {
      console.error('Error getting course progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching progress'
      });
    }
  }

  /**
   * STUDENT MY COURSES DASHBOARD
   * GET /api/students/my-courses/dashboard
   * Returns card counts for the authenticated student
   * - Enrolled Courses: Total courses enrolled by student
   * - In Progress: Courses not yet completed
   * - Completed: Courses 100% completed
   */
  static async getMyCoursesCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const studentId = req.user?.studentId;

      console.log(`🔍 Student Dashboard - User:`, {
        id: req.user?.id,
        email: req.user?.email,
        roles: req.user?.roles,
        studentId: studentId
      });

      // Validate student ID
      if (!studentId) {
        console.warn(`⚠️ No student ID found in token for user ${req.user?.id}`);
        res.status(403).json({
          status: 'error',
          message: 'Student ID not found in token. User must be a Student.'
        });
        return;
      }

      console.log(`📊 Fetching dashboard data for student ${studentId}...`);

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Execute all queries in parallel
        const [
          enrolledResult,
          inProgressResult,
          completedResult
        ] = await Promise.all([
          DatabaseHelpers.executeQuery(
            connection,
            'SELECT COUNT(*) as total FROM student_courses WHERE student_id = ? AND status = 1',
            [studentId]
          ),
          DatabaseHelpers.executeQuery(
            connection,
            'SELECT COUNT(*) as total FROM student_courses WHERE student_id = ? AND status = 1 AND progress < 100',
            [studentId]
          ),
          DatabaseHelpers.executeQuery(
            connection,
            'SELECT COUNT(*) as total FROM student_courses WHERE student_id = ? AND status = 1 AND progress = 100',
            [studentId]
          )
        ]);

        console.log(`✅ Dashboard data fetched:`, {
          enrolledCourses: enrolledResult[0]?.total,
          inProgress: inProgressResult[0]?.total,
          completed: completedResult[0]?.total
        });

        res.status(200).json({
          status: 'success',
          data: {
            enrolledCourses: enrolledResult[0]?.total || 0,
            inProgress: inProgressResult[0]?.total || 0,
            completed: completedResult[0]?.total || 0
          }
        });
      });
    } catch (error) {
      console.error('❌ Error fetching student courses dashboard:', error);
      console.error('📋 Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch student courses dashboard',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
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

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Get institution ID for the Institute Admin
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user!.id]
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
            statistics: dashboardStats ? {
              total_students: dashboardStats.total_students || 0,
              total_courses: dashboardStats.total_courses || 0,
              students_completed_courses: dashboardStats.students_completed_courses || 0,
              students_in_progress: dashboardStats.students_in_progress || 0,
              overall_average_progress: `${dashboardStats.overall_average_progress || 0}%`
            } : null,
            courses: coursesWithStats?.map((course: any) => ({
              ...course,
              average_progress: `${course.average_progress || 0}%`
            })),
            recent_activities: recentActivities?.map((activity: any) => ({
              ...activity,
              progress: `${activity.progress || 0}%`
            }))
          }
        });
      });

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

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Get institution ID for the Institute Admin
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user!.id]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found for this administrator'
          });
          return;
        }

        // Get all students with progress (without pagination)
        const getStudentsWithProgressQuery = `
          SELECT 
            s.id as student_id,
            s.first_name,
            s.last_name,
            s.email,
            s.mobile,
            s.created_at as student_created_at,
            c.id as course_id,
            c.title as course_title,
            c.course_image,
            sc.enrollment_date,
            sc.progress,
            sc.completion_date,
            CASE 
              WHEN sc.progress = 100 THEN 'Completed'
              WHEN sc.progress > 0 THEN 'In Progress'
              ELSE 'Not Started'
            END as status
          FROM institute_students ins
          JOIN students s ON ins.student_id = s.id AND s.status = 1
          LEFT JOIN student_courses sc ON s.id = sc.student_id AND sc.status = 1
          LEFT JOIN courses c ON sc.course_id = c.id AND c.status = 1
          WHERE ins.institution_id = ? AND ins.status = 1
          ORDER BY s.first_name, s.last_name, c.title
        `;

        const studentsWithProgress = await DatabaseHelpers.executeSelect(
          connection,
          getStudentsWithProgressQuery,
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
              course_image: row.course_image,
              enrollment_date: row.enrollment_date,
              progress: `${row.progress || 0}%`,
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
            students
          }
        });
      });

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

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Get institution ID for the Institute Admin
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user!.id]
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
            students: courseStudents?.map((student: any) => ({
              ...student,
              progress: `${student.progress || 0}%`
            }))
          }
        });
      });

    } catch (error) {
      console.error('Error getting course students progress:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error occurred while fetching course progress'
      });
    }
  }

}