/**
 * Exam Controller
 * Handles exam management for Admin, Institute Admin, and Students
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import {
  ExamTypeQueries,
  ExamQueries,
  ExamSectionQueries,
  ExamMaterialQueries,
  ExamViewQueries
} from '../queries/examQueries';
import { CourseQueries } from '../queries/courseQueries';
import { InstitutionStudentQueries } from '../queries/studentQueries';
import { DatabaseTransaction, DatabaseHelpers } from '../utils/database';
import { validateData, examValidation } from '../utils/validations';
import { S3Service } from '../utils/s3Service';
import { SignedUrlHelper } from '../utils/signedUrlHelper';

/**
 * Helper function to generate signed URLs for exam materials
 */
async function processExamMaterialSignedUrls(material: any): Promise<void> {
  await SignedUrlHelper.processExamMaterialSignedUrls(material);
}

/**
 * Exam Type Controller
 */
export class ExamTypeController {
  /**
   * Create exam type (Admin only)
   * POST /api/exams/types
   */
  static async createExamType(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can create exam types.'
        });
        return;
      }

      // Check if request body exists
      if (!req.body) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is empty. Make sure to send JSON data with Content-Type: application/json header'
        });
        return;
      }

      const { name, description } = req.body;

      // Validate input
      const validation = validateData(
        { name, description },
        examValidation.createExamType
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
        // Check if exam type already exists
        const existing = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamTypeQueries.getExamTypeByName,
          [name]
        );

        if (existing) {
          res.status(400).json({
            status: 'error',
            message: 'Exam type with this name already exists'
          });
          return;
        }

        // Create exam type
        const result = await DatabaseHelpers.executeQuery(
          connection,
          ExamTypeQueries.createExamType,
          [name, description || null, 1, req.user!.id]
        );

        res.status(201).json({
          status: 'success',
          message: 'Exam type created successfully',
          data: {
            id: result.insertId,
            name,
            description
          }
        });
      });

    } catch (error) {
      console.error('Error creating exam type:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all exam types
   * GET /api/exams/types
   */
  static async getAllExamTypes(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await DatabaseTransaction.executeTransaction(async (connection) => {
        const examTypes = await DatabaseHelpers.executeSelect(
          connection,
          ExamTypeQueries.getAllExamTypes,
          []
        );

        res.status(200).json({
          status: 'success',
          data: {
            exam_types: examTypes || [],
            total: (examTypes || []).length
          }
        });
      });

    } catch (error) {
      console.error('Error fetching exam types:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get exam type by ID
   * GET /api/exams/types/:id
   */
  static async getExamTypeById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        const examType = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamTypeQueries.getExamTypeById,
          [parseInt(id as string)]
        );

        if (!examType) {
          res.status(404).json({
            status: 'error',
            message: 'Exam type not found'
          });
          return;
        }

        res.status(200).json({
          status: 'success',
          data: examType
        });
      });

    } catch (error) {
      console.error('Error fetching exam type:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update exam type (Admin only)
   * PUT /api/exams/types/:id
   */
  static async updateExamType(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can update exam types.'
        });
        return;
      }

      const { id } = req.params;
      const { name, description } = req.body;

      // Validate input
      const validation = validateData(
        { name, description },
        examValidation.createExamType
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
        // Check if exam type exists
        const examType = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamTypeQueries.getExamTypeById,
          [parseInt(id as string)]
        );

        if (!examType) {
          res.status(404).json({
            status: 'error',
            message: 'Exam type not found'
          });
          return;
        }

        // Update exam type
        await DatabaseHelpers.executeQuery(
          connection,
          ExamTypeQueries.updateExamType,
          [name, description || null, req.user!.id, parseInt(id as string)]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam type updated successfully'
        });
      });

    } catch (error) {
      console.error('Error updating exam type:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete exam type (Admin only)
   * DELETE /api/exams/types/:id
   */
  static async deleteExamType(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can delete exam types.'
        });
        return;
      }

      const { id } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if exam type exists
        const examType = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamTypeQueries.getExamTypeById,
          [parseInt(id as string)]
        );

        if (!examType) {
          res.status(404).json({
            status: 'error',
            message: 'Exam type not found'
          });
          return;
        }

        // Delete exam type
        await DatabaseHelpers.executeQuery(
          connection,
          ExamTypeQueries.deleteExamType,
          [req.user!.id, parseInt(id as string)]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam type deleted successfully'
        });
      });

    } catch (error) {
      console.error('Error deleting exam type:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

/**
 * Exam Controller
 */
export class ExamController {
  /**
   * Create exam (Admin only)
   * POST /api/exams
   */
  static async createExam(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can create exams.'
        });
        return;
      }

      // Check if request body exists
      if (!req.body) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is empty. Make sure to send JSON data with Content-Type: application/json header'
        });
        return;
      }

      const { course_id, exam_type_id, exam_name, duration, duration_unit, description } = req.body;

      // Validate input
      const validation = validateData(
        { course_id, exam_type_id, exam_name, duration, duration_unit, description },
        examValidation.createExam
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

        // Check if exam type exists
        const examType = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamTypeQueries.getExamTypeById,
          [exam_type_id]
        );

        if (!examType) {
          res.status(404).json({
            status: 'error',
            message: 'Exam type not found'
          });
          return;
        }

        // Create exam
        const result = await DatabaseHelpers.executeQuery(
          connection,
          ExamQueries.createExam,
          [
            course_id,
            exam_type_id,
            exam_name,
            duration,
            duration_unit || 'MINUTES',
            description || null,
            1,
            req.user!.id
          ]
        );

        res.status(201).json({
          status: 'success',
          message: 'Exam created successfully',
          data: {
            id: result.insertId,
            exam_name,
            course_id,
            exam_type_id,
            duration,
            duration_unit: duration_unit || 'MINUTES'
          }
        });
      });

    } catch (error) {
      console.error('Error creating exam:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get exams by course
   * GET /api/exams/course/:courseId
   */
  static async getExamsByCourse(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        const exams = await DatabaseHelpers.executeSelect(
          connection,
          ExamQueries.getExamsByCourse,
          [parseInt(courseId as string)]
        );

        res.status(200).json({
          status: 'success',
          data: {
            exams: exams || [],
            total: (exams || []).length
          }
        });
      });

    } catch (error) {
      console.error('Error fetching exams:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get exam by ID
   * GET /api/exams/:id
   */
  static async getExamById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        const exam = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamQueries.getExamById,
          [parseInt(id as string)]
        );

        if (!exam) {
          res.status(404).json({
            status: 'error',
            message: 'Exam not found'
          });
          return;
        }

        // Get sections and materials
        const sections = await DatabaseHelpers.executeSelect(
          connection,
          ExamSectionQueries.getSectionsByExam,
          [parseInt(id as string)]
        );

        // Get materials for each section
        const enrichedSections = await Promise.all(
          sections.map(async (section: any) => {
            const materials = await DatabaseHelpers.executeSelect(
              connection,
              ExamMaterialQueries.getMaterialsBySection,
              [section.id]
            );
            
            // Generate signed URLs for all materials
            for (const material of materials) {
              await processExamMaterialSignedUrls(material);
            }
            
            return { ...section, materials };
          })
        );

        res.status(200).json({
          status: 'success',
          data: {
            exam,
            sections: enrichedSections
          }
        });
      });

    } catch (error) {
      console.error('Error fetching exam:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update exam (Admin only)
   * PUT /api/exams/:id
   */
  static async updateExam(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can update exams.'
        });
        return;
      }

      const { id } = req.params;
      const { exam_type_id, exam_name, duration, duration_unit, description } = req.body;

      // Validate input
      const validation = validateData(
        { exam_type_id, exam_name, duration, duration_unit, description },
        examValidation.updateExam
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
        // Check if exam exists
        const exam = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamQueries.getExamById,
          [parseInt(id as string)]
        );

        if (!exam) {
          res.status(404).json({
            status: 'error',
            message: 'Exam not found'
          });
          return;
        }

        // Update exam
        await DatabaseHelpers.executeQuery(
          connection,
          ExamQueries.updateExam,
          [
            exam_type_id || exam.exam_type_id,
            exam_name || exam.exam_name,
            duration !== undefined ? duration : exam.duration,
            duration_unit || exam.duration_unit,
            description !== undefined ? description : exam.description,
            req.user!.id,
            parseInt(id as string)
          ]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam updated successfully'
        });
      });

    } catch (error) {
      console.error('Error updating exam:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete exam (Admin only)
   * DELETE /api/exams/:id
   */
  static async deleteExam(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can delete exams.'
        });
        return;
      }

      const { id } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if exam exists
        const exam = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamQueries.getExamById,
          [parseInt(id as string)]
        );

        if (!exam) {
          res.status(404).json({
            status: 'error',
            message: 'Exam not found'
          });
          return;
        }

        // Delete exam
        await DatabaseHelpers.executeQuery(
          connection,
          ExamQueries.deleteExam,
          [req.user!.id, parseInt(id as string)]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam deleted successfully'
        });
      });

    } catch (error) {
      console.error('Error deleting exam:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all exams
   * GET /api/exams/all
   */
  static async getAllExams(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const institutionId = req.user?.institutionId;
      const roleId = req.user?.roleId;
      
      await DatabaseTransaction.executeTransaction(async (connection) => {
        let examsQuery = '';
        let queryParams: any[] = [];

        // Filter by institution for institute admin and students
        if (roleId === 3 || roleId === 4) { // Institute admin or student
          examsQuery = `
            SELECT 
              e.id,
              e.exam_name as name,
              e.description,
              e.created_at as exam_date,
              e.duration as duration_minutes,
              e.status,
              c.title as course_name,
              et.name as exam_type
            FROM exams e
            LEFT JOIN courses c ON e.course_id = c.id
            LEFT JOIN institution_courses ic ON c.id = ic.course_id
            LEFT JOIN exam_types et ON e.exam_type_id = et.id
            WHERE ic.institution_id = ? AND e.status = 1
            ORDER BY e.created_at DESC
          `;
          queryParams = [institutionId];
        } else {
          // For global admin, show all exams
          examsQuery = `
            SELECT 
              e.id,
              e.exam_name as name,
              e.description,
              e.created_at as exam_date,
              e.duration as duration_minutes,
              e.status,
              c.title as course_name,
              et.name as exam_type,
              i.name as institution_name
            FROM exams e
            LEFT JOIN courses c ON e.course_id = c.id
            LEFT JOIN institution_courses ic ON c.id = ic.course_id
            LEFT JOIN institutions i ON ic.institution_id = i.id
            LEFT JOIN exam_types et ON e.exam_type_id = et.id
            WHERE e.status = 1
            ORDER BY e.created_at DESC
          `;
        }

        const exams = await DatabaseHelpers.executeQuery(connection, examsQuery, queryParams);

        res.status(200).json({
          status: 'success',
          data: exams,
          message: `Found ${exams.length} exams`
        });
      });

    } catch (error) {
      console.error('Error fetching all exams:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

/**
 * Exam Section Controller
 */
export class ExamSectionController {
  /**
   * Create exam section (Admin only)
   * POST /api/exams/sections
   */
  static async createExamSection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can create exam sections.'
        });
        return;
      }

      // Check if request body exists
      if (!req.body) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is empty. Make sure to send JSON data with Content-Type: application/json header'
        });
        return;
      }

      const { exam_id, section_name, description, sort_order } = req.body;

      // Validate input
      const validation = validateData(
        { exam_id, section_name, description, sort_order },
        examValidation.createExamSection
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
        // Check if exam exists
        const exam = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamQueries.getExamById,
          [exam_id]
        );

        if (!exam) {
          res.status(404).json({
            status: 'error',
            message: 'Exam not found'
          });
          return;
        }

        // Get max sort order if not provided
        let finalSortOrder = sort_order;
        if (!finalSortOrder) {
          const maxOrder = await DatabaseHelpers.executeSelectOne(
            connection,
            ExamSectionQueries.getMaxSortOrder,
            [exam_id]
          );
          finalSortOrder = (maxOrder?.max_order || 0) + 1;
        }

        // Create exam section
        const result = await DatabaseHelpers.executeQuery(
          connection,
          ExamSectionQueries.createExamSection,
          [exam_id, section_name, description || null, finalSortOrder, 1, req.user!.id]
        );

        res.status(201).json({
          status: 'success',
          message: 'Exam section created successfully',
          data: {
            id: result.insertId,
            exam_id,
            section_name,
            sort_order: finalSortOrder
          }
        });
      });

    } catch (error) {
      console.error('Error creating exam section:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get sections by exam ID
   * GET /api/exams/:examId/sections
   */
  static async getSectionsByExam(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { examId } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if exam exists
        const exam = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamQueries.getExamById,
          [parseInt(examId as string)]
        );

        if (!exam) {
          res.status(404).json({
            status: 'error',
            message: 'Exam not found'
          });
          return;
        }

        const sections = await DatabaseHelpers.executeSelect(
          connection,
          ExamSectionQueries.getSectionsByExam,
          [parseInt(examId as string)]
        );

        res.status(200).json({
          status: 'success',
          data: {
            exam_id: parseInt(examId as string),
            sections: sections || [],
            total: (sections || []).length
          }
        });
      });

    } catch (error) {
      console.error('Error fetching exam sections:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update exam section (Admin only)
   * PUT /api/exams/sections/:id
   */
  static async updateExamSection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can update exam sections.'
        });
        return;
      }

      const { id } = req.params;
      const { section_name, description, sort_order } = req.body;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if section exists
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamSectionQueries.getSectionById,
          [parseInt(id as string)]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Exam section not found'
          });
          return;
        }

        // Update section
        await DatabaseHelpers.executeQuery(
          connection,
          ExamSectionQueries.updateExamSection,
          [
            section_name || section.section_name,
            description !== undefined ? description : section.description,
            sort_order !== undefined ? sort_order : section.sort_order,
            req.user!.id,
            parseInt(id as string)
          ]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam section updated successfully'
        });
      });

    } catch (error) {
      console.error('Error updating exam section:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete exam section (Admin only)
   * DELETE /api/exams/sections/:id
   */
  static async deleteExamSection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can delete exam sections.'
        });
        return;
      }

      const { id } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if section exists
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamSectionQueries.getSectionById,
          [parseInt(id as string)]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Exam section not found'
          });
          return;
        }

        // Delete section
        await DatabaseHelpers.executeQuery(
          connection,
          ExamSectionQueries.deleteExamSection,
          [req.user!.id, parseInt(id as string)]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam section deleted successfully'
        });
      });

    } catch (error) {
      console.error('Error deleting exam section:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

/**
 * Exam Material Controller
 */
export class ExamMaterialController {
  /**
   * Create exam material (Admin only) - Unified endpoint
   * Handles both JSON (video URLs) and file uploads
   * POST /api/exams/materials
   * 
   * Usage:
   * 1. For Video/YouTube: Send as form-data with fields: exam_section_id, material_name, material_type, video_type, content_url, duration
   * 2. For File Upload: Send as form-data with fields: exam_section_id, material_name, material_type, file (actual file)
   */
  static async createExamMaterial(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can create exam materials.'
        });
        return;
      }

      if (!req.body) {
        res.status(400).json({
          status: 'error',
          message: 'Request body is empty. Provide required fields.'
        });
        return;
      }

      const exam_section_id = parseInt(req.body.exam_section_id as string);
      const material_name = req.body.material_name as string;
      const material_type = req.body.material_type as string; // VIDEO_SOLUTION or QUESTION_PAPER
      const video_type = req.body.video_type as string || null; // YOUTUBE or UPLOAD
      const content_url = req.body.content_url as string || null; // For YouTube URLs
      const duration = req.body.duration ? parseInt(req.body.duration as string) : null;
      const description = req.body.description as string || null;
      const sort_order = req.body.sort_order ? parseInt(req.body.sort_order as string) : null;
      const file = req.file; // For file uploads

      // Validate required fields
      if (!exam_section_id || !material_name || !material_type) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields: exam_section_id, material_name, material_type'
        });
        return;
      }

      // Validate material type
      if (!['VIDEO_SOLUTION', 'QUESTION_PAPER'].includes(material_type)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid material_type. Use: VIDEO_SOLUTION or QUESTION_PAPER'
        });
        return;
      }

      // Handle VIDEO_SOLUTION (requires video_type and content_url)
      if (material_type === 'VIDEO_SOLUTION') {
        if (!video_type || !content_url) {
          res.status(400).json({
            status: 'error',
            message: 'For VIDEO_SOLUTION, provide: video_type (YOUTUBE/UPLOAD) and content_url'
          });
          return;
        }

        if (!['YOUTUBE', 'UPLOAD'].includes(video_type)) {
          res.status(400).json({
            status: 'error',
            message: 'Invalid video_type. Use: YOUTUBE or UPLOAD'
          });
          return;
        }
      }

      // Handle QUESTION_PAPER (requires file or use form field)
      if (material_type === 'QUESTION_PAPER') {
        if (!file && !req.body.pdf_file_url) {
          res.status(400).json({
            status: 'error',
            message: 'For QUESTION_PAPER, upload a file or provide pdf_file_url'
          });
          return;
        }
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if section exists
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamSectionQueries.getSectionById,
          [exam_section_id]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Exam section not found'
          });
          return;
        }

        // Get max sort order if not provided
        let finalSortOrder = sort_order;
        if (!finalSortOrder) {
          const maxOrder = await DatabaseHelpers.executeSelectOne(
            connection,
            ExamMaterialQueries.getMaxSortOrderForSection,
            [exam_section_id]
          );
          finalSortOrder = (maxOrder?.max_order || 0) + 1;
        }

        let finalPdfUrl = req.body.pdf_file_url as string || null;
        let fileSize = null;
        let fileKey = null;

        // If file is provided, upload to S3
        if (file) {
          // Validate file type
          const allowedMimeTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
          
          if (!allowedMimeTypes.includes(file.mimetype)) {
            res.status(400).json({
              status: 'error',
              message: 'Invalid file type. Allowed: PDF, DOC, DOCX, PPT, PPTX'
            });
            return;
          }

          // Upload to S3
          const uploadResult = await S3Service.uploadFile({
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            courseId: section.course_id || 1,
            sectionId: exam_section_id,
            contentType: 'EXAM_MATERIAL'
          });

          finalPdfUrl = uploadResult.url;
          fileSize = file.size;
          fileKey = uploadResult.key;
        }

        // Create material in database
        const result = await DatabaseHelpers.executeQuery(
          connection,
          ExamMaterialQueries.createExamMaterial,
          [
            exam_section_id,
            material_name,
            material_type,
            material_type === 'VIDEO_SOLUTION' ? video_type : null,
            material_type === 'VIDEO_SOLUTION' ? content_url : null,
            material_type === 'QUESTION_PAPER' ? finalPdfUrl : null,
            material_type === 'VIDEO_SOLUTION' ? duration : null,
            description,
            finalSortOrder,
            1,
            req.user!.id
          ]
        );

        res.status(201).json({
          status: 'success',
          message: 'Exam material created successfully',
          data: {
            id: result.insertId,
            exam_section_id,
            material_name,
            material_type,
            video_type: material_type === 'VIDEO_SOLUTION' ? video_type : null,
            content_url: material_type === 'VIDEO_SOLUTION' ? content_url : null,
            pdf_file_url: material_type === 'QUESTION_PAPER' ? finalPdfUrl : null,
            duration: material_type === 'VIDEO_SOLUTION' ? duration : null,
            description,
            file_size: fileSize,
            file_key: fileKey,
            sort_order: finalSortOrder
          }
        });
      });

    } catch (error) {
      console.error('Error creating exam material:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create exam material'
      });
    }
  }

  /**
   * Get materials by exam section
   * GET /api/exams/sections/:sectionId/materials
   */
  static async getMaterialsBySection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { sectionId } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if section exists
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamSectionQueries.getSectionById,
          [parseInt(sectionId as string)]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Exam section not found'
          });
          return;
        }

        const materials = await DatabaseHelpers.executeSelect(
          connection,
          ExamMaterialQueries.getMaterialsBySection,
          [parseInt(sectionId as string)]
        );

        // Generate signed URLs for all materials
        if (materials && materials.length > 0) {
          for (const material of materials) {
            await processExamMaterialSignedUrls(material);
          }
        }

        res.status(200).json({
          status: 'success',
          data: {
            section_id: parseInt(sectionId as string),
            materials: materials || [],
            total: (materials || []).length
          }
        });
      });

    } catch (error) {
      console.error('Error fetching exam materials:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update exam material (Admin only)
   * PUT /api/exams/materials/:id
   */
  static async updateExamMaterial(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can update exam materials.'
        });
        return;
      }

      const { id } = req.params;
      const {
        material_name,
        material_type,
        video_type,
        content_url,
        pdf_file_url,
        duration,
        description,
        sort_order
      } = req.body;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if material exists
        const material = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamMaterialQueries.getMaterialById,
          [parseInt(id as string)]
        );

        if (!material) {
          res.status(404).json({
            status: 'error',
            message: 'Exam material not found'
          });
          return;
        }

        // Update material
        await DatabaseHelpers.executeQuery(
          connection,
          ExamMaterialQueries.updateExamMaterial,
          [
            material_name || material.material_name,
            material_type || material.material_type,
            video_type !== undefined ? video_type : material.video_type,
            content_url !== undefined ? content_url : material.content_url,
            pdf_file_url !== undefined ? pdf_file_url : material.pdf_file_url,
            duration !== undefined ? duration : material.duration,
            description !== undefined ? description : material.description,
            sort_order !== undefined ? sort_order : material.sort_order,
            req.user!.id,
            parseInt(id as string)
          ]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam material updated successfully'
        });
      });

    } catch (error) {
      console.error('Error updating exam material:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Upload exam material file (Admin only)
   * POST /api/exams/materials/upload/:sectionId
   */
  static async uploadExamMaterialFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can upload exam materials.'
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          status: 'error',
          message: 'No file provided. Please upload a file.'
        });
        return;
      }

      const { sectionId } = req.params;
      const { material_name, material_type } = req.body;

      // Validate inputs
      if (!material_name || !material_type) {
        res.status(400).json({
          status: 'error',
          message: 'Material name and type are required'
        });
        return;
      }

      if (!['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX'].includes(material_type)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid material type. Allowed types: PDF, DOC, DOCX, PPT, PPTX'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if section exists
        const section = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamSectionQueries.getSectionById,
          [parseInt(sectionId as string)]
        );

        if (!section) {
          res.status(404).json({
            status: 'error',
            message: 'Exam section not found'
          });
          return;
        }

        // Upload file to S3
        const uploadResult = await S3Service.uploadFile({
          buffer: req.file!.buffer,
          originalName: req.file!.originalname,
          mimeType: req.file!.mimetype,
          courseId: section.course_id || 1,
          sectionId: parseInt(sectionId as string),
          contentType: 'EXAM_MATERIAL'
        });

        const maxOrder = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamMaterialQueries.getMaxSortOrderForSection,
          [parseInt(sectionId as string)]
        );
        const finalSortOrder = (maxOrder?.max_order || 0) + 1;

        // Create material record in database
        const result = await DatabaseHelpers.executeQuery(
          connection,
          ExamMaterialQueries.createExamMaterial,
          [
            parseInt(sectionId as string),
            material_name,
            'QUESTION_PAPER',
            null,
            null,
            uploadResult.url, // Store S3 URL as pdf_file_url
            null,
            `${material_type} file`,
            finalSortOrder,
            1,
            req.user!.id
          ]
        );

        res.status(201).json({
          status: 'success',
          message: 'Exam material file uploaded successfully',
          data: {
            id: result.insertId,
            exam_section_id: parseInt(sectionId as string),
            material_name,
            material_type,
            pdf_file_url: uploadResult.url,
            file_size: req.file!.size,
            file_key: uploadResult.key,
            sort_order: finalSortOrder
          }
        });
      });

    } catch (error) {
      console.error('Error uploading exam material file:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to upload exam material file'
      });
    }
  }

  /**
   * Delete exam material (Admin only)
   * DELETE /api/exams/materials/:id
   */
  static async deleteExamMaterial(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Admins can delete exam materials.'
        });
        return;
      }

      const { id } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        // Check if material exists
        const material = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamMaterialQueries.getMaterialById,
          [parseInt(id as string)]
        );

        if (!material) {
          res.status(404).json({
            status: 'error',
            message: 'Exam material not found'
          });
          return;
        }

        // Delete material
        await DatabaseHelpers.executeQuery(
          connection,
          ExamMaterialQueries.deleteExamMaterial,
          [req.user!.id, parseInt(id as string)]
        );

        res.status(200).json({
          status: 'success',
          message: 'Exam material deleted successfully'
        });
      });

    } catch (error) {
      console.error('Error deleting exam material:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

/**
 * Exam View Controller - For viewing exams (Students & Institute Admin)
 */
export class ExamViewController {
  /**
   * Get exams for student (from enrolled courses)
   * GET /api/exams/student/my-exams
   */
  static async getMyExams(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Get student ID from email
      const studentQuery = `SELECT id FROM students WHERE email = ? AND status = 1`;
      
      await DatabaseTransaction.executeTransaction(async (connection) => {
        const student = await DatabaseHelpers.executeSelectOne(
          connection,
          studentQuery,
          [req.user!.email]
        );

        if (!student) {
          res.status(200).json({
            status: 'success',
            data: {
              exams: [],
              total: 0,
              message: 'No student profile found'
            }
          });
          return;
        }

        const exams = await DatabaseHelpers.executeSelect(
          connection,
          ExamViewQueries.getExamsForStudent,
          [student.id]
        );

        res.status(200).json({
          status: 'success',
          data: {
            exams: exams || [],
            total: (exams || []).length
          }
        });
      });

    } catch (error) {
      console.error('Error fetching student exams:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get exam details for student
   * GET /api/exams/student/:examId
   */
  static async getExamDetailsForStudent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { examId } = req.params;

      const studentQuery = `SELECT id FROM students WHERE email = ? AND status = 1`;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        const student = await DatabaseHelpers.executeSelectOne(
          connection,
          studentQuery,
          [req.user!.email]
        );

        if (!student) {
          res.status(404).json({
            status: 'error',
            message: 'Student profile not found'
          });
          return;
        }

        const exam = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamViewQueries.getExamDetailsForStudent,
          [parseInt(examId as string), student.id]
        );

        if (!exam) {
          res.status(404).json({
            status: 'error',
            message: 'Exam not found or you do not have access to it'
          });
          return;
        }

        // Get sections and materials
        const materials = await DatabaseHelpers.executeSelect(
          connection,
          ExamMaterialQueries.getMaterialsByExam,
          [parseInt(examId as string)]
        );

        // Group materials by section and generate signed URLs
        const sectionsMap = new Map();
        for (const material of materials) {
          // Generate signed URLs
          await processExamMaterialSignedUrls(material);
          
          if (!sectionsMap.has(material.exam_section_id)) {
            sectionsMap.set(material.exam_section_id, {
              section_name: material.section_name,
              sort_order: material.section_order,
              materials: []
            });
          }
          sectionsMap.get(material.exam_section_id).materials.push(material);
        }

        const sections = Array.from(sectionsMap.values()).sort((a: any, b: any) => a.sort_order - b.sort_order);

        res.status(200).json({
          status: 'success',
          data: {
            exam,
            sections
          }
        });
      });

    } catch (error) {
      console.error('Error fetching exam details:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get exams for institute admin
   * GET /api/exams/institute-admin/exams
   */
  static async getInstitutionExams(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Institute Admins can access this endpoint.'
        });
        return;
      }

      await DatabaseTransaction.executeTransaction(async (connection) => {
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user!.id]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        const exams = await DatabaseHelpers.executeSelect(
          connection,
          ExamViewQueries.getExamsForInstitute,
          [institution.id]
        );

        res.status(200).json({
          status: 'success',
          data: {
            exams: exams || [],
            total: (exams || []).length,
            institution_id: institution.id
          }
        });
      });

    } catch (error) {
      console.error('Error fetching institution exams:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get exam details for institute admin
   * GET /api/exams/institute-admin/:examId
   */
  static async getInstitutionExamDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.roles.includes('Institute Admin')) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Only Institute Admins can access this endpoint.'
        });
        return;
      }

      const { examId } = req.params;

      await DatabaseTransaction.executeTransaction(async (connection) => {
        const institution = await DatabaseHelpers.executeSelectOne(
          connection,
          InstitutionStudentQueries.getInstitutionByAdminUserId,
          [req.user!.id]
        );

        if (!institution) {
          res.status(404).json({
            status: 'error',
            message: 'Institution not found'
          });
          return;
        }

        const exam = await DatabaseHelpers.executeSelectOne(
          connection,
          ExamViewQueries.getExamDetailsForInstitute,
          [parseInt(examId as string), institution.id]
        );

        if (!exam) {
          res.status(404).json({
            status: 'error',
            message: 'Exam not found or you do not have access to it'
          });
          return;
        }

        // Get materials
        const materials = await DatabaseHelpers.executeSelect(
          connection,
          ExamMaterialQueries.getMaterialsByExam,
          [parseInt(examId as string)]
        );

        // Group materials by section and generate signed URLs
        const sectionsMap = new Map();
        for (const material of materials) {
          // Generate signed URLs
          await processExamMaterialSignedUrls(material);
          
          if (!sectionsMap.has(material.exam_section_id)) {
            sectionsMap.set(material.exam_section_id, {
              section_name: material.section_name,
              sort_order: material.section_order,
              materials: []
            });
          }
          sectionsMap.get(material.exam_section_id).materials.push(material);
        }

        const sections = Array.from(sectionsMap.values()).sort((a: any, b: any) => a.sort_order - b.sort_order);

        res.status(200).json({
          status: 'success',
          data: {
            exam,
            sections
          }
        });
      });

    } catch (error) {
      console.error('Error fetching institution exam details:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}