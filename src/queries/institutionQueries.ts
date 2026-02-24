// Institution-related database queries
export class InstitutionQueries {
  
  // Institution CRUD operations
  static readonly createInstitution = `
    INSERT INTO institutions (name, email, phone, address, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  static readonly getInstitutionById = `
    SELECT id, name, email, phone, address, status, created_by, updated_by, created_at, updated_at
    FROM institutions
    WHERE id = ? AND status = 1
  `;

  static readonly getInstitutionByEmail = `
    SELECT id, name, email, phone, address, status, created_by, updated_by, created_at, updated_at
    FROM institutions 
    WHERE email = ? AND status = 1
  `;

  static readonly getAllInstitutions = `
    SELECT id, name, email, phone, address, status, created_by, updated_by, created_at, updated_at
    FROM institutions
    WHERE status = 1
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  static readonly getAllInstitutionsBase = `
    SELECT id, name, email, phone, address, status, created_by, updated_by, created_at, updated_at
    FROM institutions
    WHERE status = 1
    ORDER BY created_at DESC
  `;

  static readonly updateInstitution = `
    UPDATE institutions 
    SET name = ?, email = ?, phone = ?, address = ?, updated_by = ?
    WHERE id = ? AND status = 1
  `;

  static readonly deleteInstitution = `
    UPDATE institutions SET status = 0, updated_by = ? WHERE id = ?
  `;

  static readonly checkEmailExists = `
    SELECT id FROM institutions WHERE email = ?
  `;

  static readonly checkPhoneExists = `
    SELECT id FROM institutions WHERE phone = ?
  `;

  // Get institution with courses
  static readonly getInstitutionWithCourses = `
    SELECT 
      i.id as institution_id, i.name as institution_name, i.email, i.phone, i.address,
      i.created_at as institution_created_at,
      c.id as course_id, c.title as course_title, c.description as course_description,
      cc.name as category_name,
      ic.created_at as course_added_at
    FROM institutions i
    LEFT JOIN institution_courses ic ON i.id = ic.institution_id AND ic.status = 1
    LEFT JOIN courses c ON ic.course_id = c.id AND c.status = 1
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    WHERE i.id = ? AND i.status = 1
    ORDER BY ic.created_at DESC
  `;

  static readonly getInstitutionCount = `
    SELECT COUNT(*) as count FROM institutions WHERE status = 1
  `;

  // Get all institutions with course details
  static readonly getAllInstitutionsWithCourses = `
    SELECT 
      i.id as institution_id, 
      i.name as institution_name, 
      i.email, 
      i.phone, 
      i.address,
      i.status,
      i.created_by,
      i.updated_by,
      i.created_at as institution_created_at,
      i.updated_at as institution_updated_at,
      c.id as course_id, 
      c.title as course_title, 
      c.description as course_description,
      c.course_image,
      c.duration,
      cc.name as category_name,
      ic.created_at as course_added_at
    FROM institutions i
    LEFT JOIN institution_courses ic ON i.id = ic.institution_id AND ic.status = 1
    LEFT JOIN courses c ON ic.course_id = c.id AND c.status = 1
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    WHERE i.status = 1
    ORDER BY i.created_at DESC, ic.created_at DESC
  `;
}

// Institution Courses CRUD operations
export class InstitutionCoursesQueries {
  
  static readonly addCourseToInstitution = `
    INSERT INTO institution_courses (institution_id, course_id, created_by, updated_by)
    VALUES (?, ?, ?, ?)
  `;

  static readonly upsertCourseToInstitution = `
    INSERT INTO institution_courses (institution_id, course_id, created_by, updated_by)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      status = 1, 
      updated_by = VALUES(updated_by), 
      updated_at = CURRENT_TIMESTAMP
  `;

  static readonly checkExistingCourseAssignment = `
    SELECT id, status FROM institution_courses 
    WHERE institution_id = ? AND course_id = ?
  `;

  static readonly reactivateCourseAssignment = `
    UPDATE institution_courses 
    SET status = 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE institution_id = ? AND course_id = ?
  `;

  static readonly removeCourseFromInstitution = `
    UPDATE institution_courses 
    SET status = 0, updated_by = ? 
    WHERE institution_id = ? AND course_id = ?
  `;

  static readonly getInstitutionCourses = `
    SELECT 
      ic.id as institution_course_id,
      c.id as course_id, c.title, c.description, c.course_image, c.duration,
      cc.name as category_name,
      ic.created_at as added_at
    FROM institution_courses ic
    JOIN courses c ON ic.course_id = c.id AND c.status = 1
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    WHERE ic.institution_id = ? AND ic.status = 1
    ORDER BY ic.created_at DESC
  `;

  static readonly checkCourseAssignment = `
    SELECT id FROM institution_courses 
    WHERE institution_id = ? AND course_id = ? AND status = 1
  `;

  static readonly getInstitutionsForCourse = `
    SELECT 
      i.id as institution_id, i.name as institution_name, i.email, i.phone,
      ic.created_at as assigned_at
    FROM institution_courses ic
    JOIN institutions i ON ic.institution_id = i.id AND i.status = 1
    WHERE ic.course_id = ? AND ic.status = 1
    ORDER BY ic.created_at DESC
  `;

  // Get available courses not assigned to an institution
  static readonly getAvailableCoursesForInstitution = `
    SELECT c.id, c.title, c.description, cc.name as category_name
    FROM courses c
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    WHERE c.status = 1 
    AND c.id NOT IN (
      SELECT course_id 
      FROM institution_courses 
      WHERE institution_id = ? AND status = 1
    )
    ORDER BY c.title ASC
  `;

  // Update multiple course assignments
  static readonly updateInstitutionCourses = `
    UPDATE institution_courses 
    SET status = 0, updated_by = ? 
    WHERE institution_id = ?
  `;
}