/**
 * Exam Queries
 */

export class ExamTypeQueries {
  // Create exam type
  static readonly createExamType = `
    INSERT INTO exam_types (name, description, status, created_by)
    VALUES (?, ?, ?, ?)
  `;

  // Get all exam types
  static readonly getAllExamTypes = `
    SELECT id, name, description, status, created_at, updated_at
    FROM exam_types
    WHERE status = 1
    ORDER BY name
  `;

  // Get exam type by ID
  static readonly getExamTypeById = `
    SELECT id, name, description, status, created_at, updated_at
    FROM exam_types
    WHERE id = ? AND status = 1
  `;

  // Get exam type by name
  static readonly getExamTypeByName = `
    SELECT id, name, description, status
    FROM exam_types
    WHERE name = ? AND status = 1
  `;

  // Update exam type
  static readonly updateExamType = `
    UPDATE exam_types
    SET name = ?, description = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  // Delete exam type (soft delete)
  static readonly deleteExamType = `
    UPDATE exam_types SET status = 0, updated_by = ? WHERE id = ?
  `;
}

export class ExamQueries {
  // Create exam
  static readonly createExam = `
    INSERT INTO exams (course_id, exam_type_id, exam_name, duration, duration_unit, description, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Get all exams for a course
  static readonly getExamsByCourse = `
    SELECT 
      e.id,
      e.course_id,
      e.exam_type_id,
      e.exam_name,
      e.duration,
      e.duration_unit,
      e.description,
      e.status,
      et.name as exam_type_name,
      c.title as course_title,
      e.created_by,
      e.created_at,
      e.updated_at
    FROM exams e
    LEFT JOIN exam_types et ON e.exam_type_id = et.id
    LEFT JOIN courses c ON e.course_id = c.id
    WHERE e.course_id = ? AND e.status = 1
    ORDER BY e.created_at DESC
  `;

  // Get exam by ID with dropdown info
  static readonly getExamById = `
    SELECT 
      e.id,
      e.course_id,
      e.exam_type_id,
      e.exam_name,
      e.duration,
      e.duration_unit,
      e.description,
      e.status,
      et.name as exam_type_name,
      c.title as course_title
    FROM exams e
    LEFT JOIN exam_types et ON e.exam_type_id = et.id
    LEFT JOIN courses c ON e.course_id = c.id
    WHERE e.id = ? AND e.status = 1
  `;

  // Get all exams (for admin or filtering)
  static readonly getAllExams = `
    SELECT 
      e.id,
      e.course_id,
      e.exam_type_id,
      e.exam_name,
      e.duration,
      e.duration_unit,
      e.description,
      et.name as exam_type_name,
      c.title as course_title,
      e.created_at,
      e.updated_at
    FROM exams e
    LEFT JOIN exam_types et ON e.exam_type_id = et.id
    LEFT JOIN courses c ON e.course_id = c.id
    WHERE e.status = 1
    ORDER BY c.title, e.exam_name
  `;

  // Update exam
  static readonly updateExam = `
    UPDATE exams
    SET exam_type_id = ?, exam_name = ?, duration = ?, duration_unit = ?, description = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  // Delete exam (soft delete)
  static readonly deleteExam = `
    UPDATE exams SET status = 0, updated_by = ? WHERE id = ?
  `;

  // Check if exam with name exists in course
  static readonly checkExamExists = `
    SELECT id FROM exams WHERE course_id = ? AND exam_name = ? AND id != ? AND status = 1
  `;
}

export class ExamSectionQueries {
  // Create exam section
  static readonly createExamSection = `
    INSERT INTO exam_sections (exam_id, section_name, description, sort_order, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  // Get all sections for an exam
  static readonly getSectionsByExam = `
    SELECT 
      id,
      exam_id,
      section_name,
      description,
      sort_order,
      status,
      created_at,
      updated_at
    FROM exam_sections
    WHERE exam_id = ? AND status = 1
    ORDER BY sort_order ASC
  `;

  // Get section by ID
  static readonly getSectionById = `
    SELECT 
      id,
      exam_id,
      section_name,
      description,
      sort_order,
      status
    FROM exam_sections
    WHERE id = ? AND status = 1
  `;

  // Update exam section
  static readonly updateExamSection = `
    UPDATE exam_sections
    SET section_name = ?, description = ?, sort_order = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  // Delete exam section (soft delete)
  static readonly deleteExamSection = `
    UPDATE exam_sections SET status = 0, updated_by = ? WHERE id = ?
  `;

  // Get max sort order for exam
  static readonly getMaxSortOrder = `
    SELECT MAX(sort_order) as max_order FROM exam_sections WHERE exam_id = ? AND status = 1
  `;
}

export class ExamMaterialQueries {
  // Create exam material
  static readonly createExamMaterial = `
    INSERT INTO exam_materials (
      exam_section_id, material_name, material_type, video_type, 
      content_url, pdf_file_url, duration, description, sort_order, status, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Get all materials for an exam section
  static readonly getMaterialsBySection = `
    SELECT 
      id,
      exam_section_id,
      material_name,
      material_type,
      video_type,
      content_url,
      pdf_file_url,
      duration,
      description,
      sort_order,
      status,
      created_at,
      updated_at
    FROM exam_materials
    WHERE exam_section_id = ? AND status = 1
    ORDER BY sort_order ASC
  `;

  // Get material by ID
  static readonly getMaterialById = `
    SELECT 
      id,
      exam_section_id,
      material_name,
      material_type,
      video_type,
      content_url,
      pdf_file_url,
      duration,
      description,
      sort_order,
      status
    FROM exam_materials
    WHERE id = ? AND status = 1
  `;

  // Get all materials for an exam (with section info)
  static readonly getMaterialsByExam = `
    SELECT 
      em.id,
      em.exam_section_id,
      em.material_name,
      em.material_type,
      em.video_type,
      em.content_url,
      em.pdf_file_url,
      em.duration,
      em.description,
      em.sort_order,
      es.section_name,
      es.sort_order as section_order
    FROM exam_materials em
    JOIN exam_sections es ON em.exam_section_id = es.id
    WHERE es.exam_id = ? AND em.status = 1 AND es.status = 1
    ORDER BY es.sort_order, em.sort_order ASC
  `;

  // Update exam material
  static readonly updateExamMaterial = `
    UPDATE exam_materials
    SET material_name = ?, material_type = ?, video_type = ?, 
        content_url = ?, pdf_file_url = ?, duration = ?, description = ?, 
        sort_order = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  // Delete exam material (soft delete)
  static readonly deleteExamMaterial = `
    UPDATE exam_materials SET status = 0, updated_by = ? WHERE id = ?
  `;

  // Get max sort order for section
  static readonly getMaxSortOrderForSection = `
    SELECT MAX(sort_order) as max_order FROM exam_materials WHERE exam_section_id = ? AND status = 1
  `;
}

export class ExamViewQueries {
  // Get exams for student (only exams from their enrolled courses)
  static readonly getExamsForStudent = `
    SELECT 
      e.id,
      e.exam_name,
      e.duration,
      e.duration_unit,
      e.description,
      et.name as exam_type_name,
      c.title as course_title,
      c.id as course_id,
      e.created_at
    FROM exams e
    JOIN courses c ON e.course_id = c.id
    JOIN student_courses sc ON c.id = sc.course_id
    LEFT JOIN exam_types et ON e.exam_type_id = et.id
    WHERE sc.student_id = ? AND e.status = 1 AND c.status = 1 AND sc.status = 1
    ORDER BY c.title, e.exam_name
  `;

  // Get exam details for student (includes sections and materials)
  static readonly getExamDetailsForStudent = `
    SELECT 
      e.id,
      e.exam_name,
      e.duration,
      e.duration_unit,
      e.description,
      et.name as exam_type_name,
      c.title as course_title
    FROM exams e
    JOIN courses c ON e.course_id = c.id
    JOIN student_courses sc ON c.id = sc.course_id
    LEFT JOIN exam_types et ON e.exam_type_id = et.id
    WHERE e.id = ? AND sc.student_id = ? AND e.status = 1
  `;

  // Get exams for institute admin (only exams from their institution's courses)
  static readonly getExamsForInstitute = `
    SELECT 
      e.id,
      e.exam_name,
      e.duration,
      e.duration_unit,
      e.description,
      et.name as exam_type_name,
      c.title as course_title,
      c.id as course_id,
      e.created_at
    FROM exams e
    JOIN courses c ON e.course_id = c.id
    JOIN institution_courses ic ON c.id = ic.course_id
    LEFT JOIN exam_types et ON e.exam_type_id = et.id
    WHERE ic.institution_id = ? AND e.status = 1 AND c.status = 1 AND ic.status = 1
    ORDER BY c.title, e.exam_name
  `;

  // Get exam details for institute admin
  static readonly getExamDetailsForInstitute = `
    SELECT 
      e.id,
      e.exam_name,
      e.duration,
      e.duration_unit,
      e.description,
      et.name as exam_type_name,
      c.title as course_title
    FROM exams e
    JOIN courses c ON e.course_id = c.id
    JOIN institution_courses ic ON c.id = ic.course_id
    LEFT JOIN exam_types et ON e.exam_type_id = et.id
    WHERE e.id = ? AND ic.institution_id = ? AND e.status = 1
  `;
}
