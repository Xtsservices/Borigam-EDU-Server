import { Request, Response } from 'express';
import { AdminQueries } from '../queries/adminQueries';
import { DatabaseTransaction, DatabaseHelpers } from '../utils/database';
import db from '../../db';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
}

export class AdminController {

  /**
   * DASHBOARD SCREEN
   * GET /api/admin/dashboard
   * Returns all 6 card counts in a single response
   */
  static async getDashboardCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Execute all queries in parallel
        const [
          totalStudentsResult,
          totalInstitutionsResult,
          totalCoursesResult,
          totalExamsResult,
          topCoursesResult,
          activeUsersResult
        ] = await Promise.all([
          DatabaseHelpers.executeQuery(connection, AdminQueries.getTotalStudents),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getTotalInstitutions),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getTotalCourses),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getTotalExams),
          DatabaseHelpers.executeSelect(connection, AdminQueries.getTopCourses),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getActiveUsers)
        ]);

        res.status(200).json({
          status: 'success',
          data: {
            totalStudents: totalStudentsResult[0]?.total || 0,
            totalInstitutions: totalInstitutionsResult[0]?.total || 0,
            totalCourses: totalCoursesResult[0]?.total || 0,
            totalExams: totalExamsResult[0]?.total || 0,
            topCourses: topCoursesResult || [],
            activeUsers: activeUsersResult[0]?.total || 0
          }
        });
      });
    } catch (error) {
      console.error('❌ Error fetching dashboard cards:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch dashboard cards'
      });
    }
  }

  /**
   * STUDENTS SCREEN
   * GET /api/admin/students
   * Returns all 3 card counts in a single response
   */
  static async getStudentsCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Execute all queries in parallel
        const [
          totalStudentsResult,
          activeStudentsResult,
          totalEnrollmentsResult
        ] = await Promise.all([
          DatabaseHelpers.executeQuery(connection, AdminQueries.getStudentsTotalCount),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getActiveStudents),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getTotalEnrollments)
        ]);

        res.status(200).json({
          status: 'success',
          data: {
            totalStudents: totalStudentsResult[0]?.total || 0,
            activeStudents: activeStudentsResult[0]?.total || 0,
            totalEnrollments: totalEnrollmentsResult[0]?.total || 0
          }
        });
      });
    } catch (error) {
      console.error('❌ Error fetching students cards:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch students cards'
      });
    }
  }

  /**
   * COURSES SCREEN
   * GET /api/admin/courses
   * Returns all 3 card counts in a single response
   */
  static async getCoursesCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Execute all queries in parallel
        const [
          totalCoursesResult,
          totalEnrolledResult,
          avgStudentsResult
        ] = await Promise.all([
          DatabaseHelpers.executeQuery(connection, AdminQueries.getCoursesTotalCount),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getTotalStudentsEnrolled),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getAvgStudentsPerCourse)
        ]);

        res.status(200).json({
          status: 'success',
          data: {
            totalCourses: totalCoursesResult[0]?.total || 0,
            totalEnrolled: totalEnrolledResult[0]?.total || 0,
            avgStudentsPerCourse: avgStudentsResult[0]?.avg_students || 0
          }
        });
      });
    } catch (error) {
      console.error('❌ Error fetching courses cards:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch courses cards'
      });
    }
  }

  /**
   * INSTITUTIONS SCREEN
   * GET /api/admin/institutions
   * Returns all 3 card counts in a single response
   */
  static async getInstitutionsCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Execute all queries in parallel
        const [
          totalInstitutionsResult,
          activeInstitutionsResult,
          totalCoursesResult
        ] = await Promise.all([
          DatabaseHelpers.executeQuery(connection, AdminQueries.getInstitutionsTotalCount),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getActiveInstitutions),
          DatabaseHelpers.executeQuery(connection, AdminQueries.getTotalInstitutionCourses)
        ]);

        res.status(200).json({
          status: 'success',
          data: {
            totalInstitutions: totalInstitutionsResult[0]?.total || 0,
            activeInstitutions: activeInstitutionsResult[0]?.total || 0,
            totalCourses: totalCoursesResult[0]?.total || 0
          }
        });
      });
    } catch (error) {
      console.error('❌ Error fetching institutions cards:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch institutions cards'
      });
    }
  }

  /**
   * EXAMS SCREEN
   * GET /api/admin/exams
   * Returns all card counts in a single response
   */
  static async getExamsCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        const result = await DatabaseHelpers.executeQuery(connection, AdminQueries.getExamsTotalCount);

        res.status(200).json({
          status: 'success',
          data: {
            totalExams: result[0]?.total || 0
          }
        });
      });
    } catch (error) {
      console.error('❌ Error fetching exams cards:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch exams cards'
      });
    }
  }
}
