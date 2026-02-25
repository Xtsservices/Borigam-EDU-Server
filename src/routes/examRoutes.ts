import { Router } from 'express';
import {
  ExamTypeController,
  ExamController,
  ExamSectionController,
  ExamMaterialController,
  ExamViewController
} from '../controllers/examController';
import { authenticateToken, adminOnly, apiRateLimit } from '../middlewares/auth';

const router = Router();

/**
 * Exam Management Routes
 * Base path: /api/exams
 */

// Apply rate limiting and authentication to all routes
router.use(apiRateLimit);
router.use(authenticateToken);

/**
 * EXAM TYPE ROUTES - Admin only
 */

// Create exam type
router.post('/types', adminOnly, ExamTypeController.createExamType);

// Get all exam types
router.get('/types', ExamTypeController.getAllExamTypes);

// Get exam type by ID
router.get('/types/:id', ExamTypeController.getExamTypeById);

// Update exam type
router.put('/types/:id', adminOnly, ExamTypeController.updateExamType);

// Delete exam type
router.delete('/types/:id', adminOnly, ExamTypeController.deleteExamType);

/**
 * EXAM ROUTES - Admin only (create/update/delete), All can view own
 */

// Create exam
router.post('/', adminOnly, ExamController.createExam);

// Get exams by course
router.get('/course/:courseId', ExamController.getExamsByCourse);

// Get exam by ID
router.get('/:id', ExamController.getExamById);

// Update exam
router.put('/:id', adminOnly, ExamController.updateExam);

// Delete exam
router.delete('/:id', adminOnly, ExamController.deleteExam);

/**
 * EXAM SECTION ROUTES - Admin only
 */

// Create exam section
router.post('/sections', adminOnly, ExamSectionController.createExamSection);

// Get sections by exam ID
router.get('/:examId/sections', ExamSectionController.getSectionsByExam);

// Update exam section
router.put('/sections/:id', adminOnly, ExamSectionController.updateExamSection);

// Delete exam section
router.delete('/sections/:id', adminOnly, ExamSectionController.deleteExamSection);

/**
 * EXAM MATERIAL ROUTES - Admin only (create/update/delete), All can view
 */

// Create exam material
router.post('/materials', adminOnly, ExamMaterialController.createExamMaterial);

// Get materials by section
router.get('/sections/:sectionId/materials', ExamMaterialController.getMaterialsBySection);

// Update exam material
router.put('/materials/:id', adminOnly, ExamMaterialController.updateExamMaterial);

// Delete exam material
router.delete('/materials/:id', adminOnly, ExamMaterialController.deleteExamMaterial);

/**
 * EXAM VIEW ROUTES - Student and Institute Admin can view their exams
 */

// Get exams for student
router.get('/student/my-exams', ExamViewController.getMyExams);

// Get exam details for student
router.get('/student/:examId', ExamViewController.getExamDetailsForStudent);

// Get exams for institute admin
router.get('/institute-admin/exams', ExamViewController.getInstitutionExams);

// Get exam details for institute admin
router.get('/institute-admin/:examId', ExamViewController.getInstitutionExamDetails);

export default router;
