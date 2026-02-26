import { Request, Response } from 'express';
import { InstituteAdminQueries } from '../queries/instituteAdminQueries';
import { DatabaseTransaction, DatabaseHelpers } from '../utils/database';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
    institutionId?: number;
  };
}

export class InstituteAdminController {

  /**
   * DASHBOARD SCREEN
   * GET /api/institute-admin/dashboard
   * Returns all 4 card counts for the authenticated institute
   * Institution ID is extracted from JWT token (req.user.institutionId)
   * - Total Students in the institution
   * - Total Courses offered by the institution
   * - Total Exams for the courses the institution is offering
   * - Top Courses by student enrollment in the institution
   */
  static async getDashboardCards(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Extract institution ID from authenticated user token
      const institutionId = req.user?.institutionId;
      
      // Debug logging
      console.log(`🔍 User roles: ${req.user?.roles?.join(', ')}`);
      console.log(`🔍 Institution ID from token: ${institutionId}`);
      console.log(`🔍 Full user object:`, {
        id: req.user?.id,
        email: req.user?.email,
        roles: req.user?.roles,
        institutionId: req.user?.institutionId
      });

      // Check if user is Institute Admin
      if (!req.user?.roles?.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Only Institute Admins can access this endpoint'
        });
        return;
      }

      // Validate institution ID
      if (!institutionId) {
        console.error(`❌ Institution ID not found for Institute Admin user ${req.user?.id}`);
        res.status(403).json({
          status: 'error',
          message: 'Institution ID not found in token. User must be assigned to an institution.'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Execute all queries in parallel
        const [
          totalStudentsResult,
          totalCoursesResult,
          totalExamsResult,
          topCoursesResult
        ] = await Promise.all([
          DatabaseHelpers.executeQuery(
            connection,
            InstituteAdminQueries.getTotalStudentsByInstitution,
            [institutionId]
          ),
          DatabaseHelpers.executeQuery(
            connection,
            InstituteAdminQueries.getTotalCoursesByInstitution,
            [institutionId]
          ),
          DatabaseHelpers.executeQuery(
            connection,
            InstituteAdminQueries.getTotalExamsByInstitution,
            [institutionId]
          ),
          DatabaseHelpers.executeSelect(
            connection,
            InstituteAdminQueries.getTopCoursesByInstitution,
            [institutionId]
          )
        ]);

        console.log(`✅ Dashboard data fetched for institution ${institutionId}`);

        res.status(200).json({
          status: 'success',
          data: {
            totalStudents: totalStudentsResult[0]?.total || 0,
            totalCourses: totalCoursesResult[0]?.total || 0,
            totalExams: totalExamsResult[0]?.total || 0,
            topCourses: topCoursesResult || []
          }
        });
      });
    } catch (error) {
      console.error('❌ Error fetching institute dashboard cards:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch institute dashboard cards'
      });
    }
  }
}
