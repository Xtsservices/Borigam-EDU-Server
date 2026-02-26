// Student-related database queries
export class StudentQueries {
  
  // Student CRUD operations
  static readonly createStudent = `
    INSERT INTO students (first_name, last_name, email, mobile, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  static readonly getStudentById = `
    SELECT *
    FROM students
    WHERE id = ? AND status = 1
  `;

  static readonly getStudentByEmail = `
    SELECT *
    FROM students
    WHERE email = ? AND status = 1
  `;

  static readonly getStudentByUserId = `
    SELECT *
    FROM students
    WHERE id = ? AND status = 1
  `;

  static readonly getAllStudents = `
    SELECT *
    FROM students
    WHERE status = 1
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  static readonly getAllStudentsBase = `
    SELECT *
    FROM students
    WHERE status = 1
    ORDER BY created_at DESC
  `;

  static readonly updateStudent = `
    UPDATE students 
    SET first_name = ?, last_name = ?, email = ?, mobile = ?, updated_by = ?
    WHERE id = ? AND status = 1
  `;

  static readonly deleteStudent = `
    UPDATE students SET status = 0, updated_by = ? WHERE id = ?
  `;

  static readonly checkEmailExists = `
    SELECT id FROM students WHERE email = ?
  `;

  static readonly checkMobileExists = `
    SELECT id FROM students WHERE mobile = ?
  `;

  static readonly getStudentCount = `
    SELECT COUNT(*) as count FROM students WHERE status = 1
  `;

  // Get student with institution and courses
  static readonly getStudentWithDetails = `
    SELECT 
      s.id as student_id, s.first_name, s.last_name, s.email, s.mobile,
      s.created_at as student_created_at,
      i.id as institution_id, i.name as institution_name,
      c.id as course_id, c.title as course_title, c.description as course_description,
      c.course_image, c.duration as course_duration,
      sc.enrollment_date, sc.progress, sc.completion_date,
      cc.name as category_name
    FROM students s
    LEFT JOIN institute_students ins ON s.id = ins.student_id AND ins.status = 1
    LEFT JOIN institutions i ON ins.institution_id = i.id AND i.status = 1
    LEFT JOIN student_courses sc ON s.id = sc.student_id AND sc.status = 1
    LEFT JOIN courses c ON sc.course_id = c.id AND c.status = 1
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    WHERE s.id = ? AND s.status = 1
    ORDER BY sc.enrollment_date DESC
  `;
}

// Institute Students CRUD operations
export class InstituteStudentsQueries {
  
  static readonly assignStudentToInstitution = `
    INSERT INTO institute_students (institution_id, student_id, created_by, updated_by)
    VALUES (?, ?, ?, ?)
  `;

  static readonly removeStudentFromInstitution = `
    UPDATE institute_students 
    SET status = 0, updated_by = ? 
    WHERE institution_id = ? AND student_id = ?
  `;

  static readonly getInstitutionStudents = `
    SELECT 
      s.id as student_id, s.first_name, s.last_name, s.email, s.mobile,
      ins.created_at as assigned_at
    FROM institute_students ins
    JOIN students s ON ins.student_id = s.id AND s.status = 1
    WHERE ins.institution_id = ? AND ins.status = 1
    ORDER BY ins.created_at DESC
  `;

  static readonly getStudentInstitutions = `
    SELECT 
      i.id as institution_id, i.name as institution_name, i.email, i.phone,
      ins.created_at as assigned_at
    FROM institute_students ins
    JOIN institutions i ON ins.institution_id = i.id AND i.status = 1
    WHERE ins.student_id = ? AND ins.status = 1
    ORDER BY ins.created_at DESC
  `;

  static readonly checkStudentInstitutionAssignment = `
    SELECT id FROM institute_students 
    WHERE institution_id = ? AND student_id = ? AND status = 1
  `;

  // Get students by institution for Institute Admin
  static readonly getStudentsByInstitution = `
    SELECT 
      s.id as student_id, s.first_name, s.last_name, s.email, s.mobile,
      s.created_at as student_created_at,
      ins.created_at as assigned_at
    FROM institute_students ins
    JOIN students s ON ins.student_id = s.id AND s.status = 1
    WHERE ins.institution_id = ? AND ins.status = 1
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `;

  static readonly getStudentsByInstitutionCount = `
    SELECT COUNT(*) as count 
    FROM institute_students ins
    JOIN students s ON ins.student_id = s.id AND s.status = 1
    WHERE ins.institution_id = ? AND ins.status = 1
  `;
}

// Student Courses CRUD operations
export class StudentCoursesQueries {
  
  static readonly enrollStudentInCourse = `
    INSERT INTO student_courses (student_id, course_id, created_by, updated_by)
    VALUES (?, ?, ?, ?)
  `;

  static readonly upsertStudentCourse = `
    INSERT INTO student_courses (student_id, course_id, created_by, updated_by)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      status = 1, 
      updated_by = VALUES(updated_by), 
      updated_at = CURRENT_TIMESTAMP
  `;

  static readonly unenrollStudentFromCourse = `
    UPDATE student_courses 
    SET status = 0, updated_by = ? 
    WHERE student_id = ? AND course_id = ?
  `;

  static readonly getStudentCourses = `
    SELECT 
      sc.id as enrollment_id,
      c.id as course_id, c.title, c.description, c.course_image, c.duration,
      cc.name as category_name,
      sc.enrollment_date, sc.progress, sc.completion_date
    FROM student_courses sc
    JOIN courses c ON sc.course_id = c.id AND c.status = 1
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    WHERE sc.student_id = ? AND sc.status = 1
    ORDER BY sc.enrollment_date DESC
  `;

  static readonly getCourseStudents = `
    SELECT 
      s.id as student_id, s.first_name, s.last_name, s.email, s.mobile,
      sc.enrollment_date, sc.progress, sc.completion_date
    FROM student_courses sc
    JOIN students s ON sc.student_id = s.id AND s.status = 1
    WHERE sc.course_id = ? AND sc.status = 1
    ORDER BY sc.enrollment_date DESC
  `;

  static readonly checkCourseEnrollment = `
    SELECT id FROM student_courses 
    WHERE student_id = ? AND course_id = ? AND status = 1
  `;

  static readonly updateCourseProgress = `
    UPDATE student_courses 
    SET progress = ?, updated_by = ?
    WHERE student_id = ? AND course_id = ? AND status = 1
  `;

  static readonly completeCourse = `
    UPDATE student_courses 
    SET progress = 100.00, completion_date = CURRENT_TIMESTAMP, updated_by = ?
    WHERE student_id = ? AND course_id = ? AND status = 1
  `;

  // Remove all course enrollments for a student
  static readonly unenrollAllCourses = `
    UPDATE student_courses 
    SET status = 0, updated_by = ? 
    WHERE student_id = ?
  `;

  // Get available courses for student enrollment (courses from student's institution)
  static readonly getAvailableCoursesForStudent = `
    SELECT DISTINCT c.id, c.title, c.description, cc.name as category_name
    FROM courses c
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    JOIN institution_courses ic ON c.id = ic.course_id AND ic.status = 1
    JOIN institute_students ins ON ic.institution_id = ins.institution_id AND ins.status = 1
    WHERE c.status = 1 
    AND ins.student_id = ?
    AND c.id NOT IN (
      SELECT course_id 
      FROM student_courses 
      WHERE student_id = ? AND status = 1
    )
    ORDER BY c.title ASC
  `;
}

// Institution-specific queries for student management
export class InstitutionStudentQueries {
  
  // Get courses offered by specific institution (for Institute Admin)
  static readonly getInstitutionCourses = `
    SELECT DISTINCT c.id, c.title, c.description, cc.name as category_name
    FROM courses c
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    JOIN institution_courses ic ON c.id = ic.course_id AND ic.status = 1
    WHERE c.status = 1 AND ic.institution_id = ?
    ORDER BY c.title ASC
  `;

  // Get institution by Institute Admin user ID
  static readonly getInstitutionByAdminUserId = `
    SELECT i.id, i.name, i.email, i.phone, i.address
    FROM institutions i
    JOIN users u ON i.email = u.email
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.id = ? AND r.name = 'Institute Admin' AND i.status = 1 AND u.status = 1
  `;

  // Check if user is Institute Admin of specific institution
  static readonly checkInstituteAdmin = `
    SELECT i.id
    FROM institutions i
    JOIN users u ON i.email = u.email
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.id = ? AND i.id = ? AND r.name = 'Institute Admin' 
    AND i.status = 1 AND u.status = 1
  `;

  // Get institutions for Admin dropdown
  static readonly getAllInstitutionsForDropdown = `
    SELECT id, name 
    FROM institutions 
    WHERE status = 1 
    ORDER BY name ASC
  `;
}

// Student Progress Tracking Queries
export class StudentProgressQueries {
  
  // Create student content progress tracking table if not exists
  static readonly createStudentContentProgressTable = `
    CREATE TABLE IF NOT EXISTS student_content_progress (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT NOT NULL,
      course_id BIGINT NOT NULL,
      content_id BIGINT NOT NULL,
      is_completed BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMP NULL,
      time_spent INT DEFAULT 0,
      created_by BIGINT,
      updated_by BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_student_content (student_id, course_id, content_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (content_id) REFERENCES course_contents(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES students(id),
      FOREIGN KEY (updated_by) REFERENCES students(id)
    )
  `;

  // Track student content progress
  static readonly trackContentProgress = `
    INSERT INTO student_content_progress (student_id, course_id, content_id, is_completed, completed_at, time_spent, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      is_completed = VALUES(is_completed),
      completed_at = VALUES(completed_at),
      time_spent = time_spent + VALUES(time_spent),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP
  `;

  // Get course content completion percentage for a student
  static readonly getCourseProgressPercentage = `
    SELECT 
      COUNT(cc.id) as total_contents,
      SUM(CASE WHEN scp.is_completed = TRUE THEN 1 ELSE 0 END) as completed_contents,
      ROUND((SUM(CASE WHEN scp.is_completed = TRUE THEN 1 ELSE 0 END) / COUNT(cc.id)) * 100, 2) as progress_percentage
    FROM course_contents cc
    LEFT JOIN student_content_progress scp ON cc.id = scp.content_id 
      AND scp.student_id = ? AND scp.course_id = ?
    WHERE cc.course_id = ? AND cc.status = 1
  `;

  // Get detailed course progress for a student
  static readonly getDetailedCourseProgress = `
    SELECT 
      cc.id as content_id,
      cc.title as content_title,
      cc.content_type,
      cc.sort_order,
      cs.title as section_title,
      CASE WHEN scp.is_completed IS NULL THEN FALSE ELSE scp.is_completed END as is_completed,
      scp.completed_at,
      scp.time_spent
    FROM course_contents cc
    JOIN course_sections cs ON cc.section_id = cs.id
    LEFT JOIN student_content_progress scp ON cc.id = scp.content_id 
      AND scp.student_id = ? AND scp.course_id = ?
    WHERE cc.course_id = ? AND cc.status = 1
    ORDER BY cs.sort_order, cc.sort_order
  `;

  // Get progress breakdown by section for a student
  static readonly getSectionProgressForCourse = `
    SELECT 
      cs.id as section_id,
      cs.title as section_title,
      cs.sort_order,
      COUNT(DISTINCT cc.id) as total_contents,
      COUNT(DISTINCT scp.id) as completed_contents,
      ROUND((COUNT(DISTINCT scp.id) / COUNT(DISTINCT cc.id)) * 100, 2) as section_progress
    FROM course_sections cs
    LEFT JOIN course_contents cc ON cs.id = cc.section_id AND cc.status = 1
    LEFT JOIN student_content_progress scp ON cc.id = scp.content_id 
      AND scp.student_id = ? AND scp.is_completed = TRUE
    WHERE cs.course_id = ? AND cs.status = 1
    GROUP BY cs.id, cs.title, cs.sort_order
    ORDER BY cs.sort_order
  `;

  // Update course progress in student_courses based on content completion
  static readonly updateCourseProgressFromContent = `
    UPDATE student_courses sc
    SET progress = (
      SELECT ROUND((SUM(CASE WHEN scp.is_completed = TRUE THEN 1 ELSE 0 END) / COUNT(cc.id)) * 100, 2)
      FROM course_contents cc
      LEFT JOIN student_content_progress scp ON cc.id = scp.content_id 
        AND scp.student_id = sc.student_id AND scp.course_id = sc.course_id
      WHERE cc.course_id = sc.course_id AND cc.status = 1
    ),
    completion_date = CASE 
      WHEN (
        SELECT ROUND((SUM(CASE WHEN scp.is_completed = TRUE THEN 1 ELSE 0 END) / COUNT(cc.id)) * 100, 2)
        FROM course_contents cc
        LEFT JOIN student_content_progress scp ON cc.id = scp.content_id 
          AND scp.student_id = sc.student_id AND scp.course_id = sc.course_id
        WHERE cc.course_id = sc.course_id AND cc.status = 1
      ) >= 100 THEN CURRENT_TIMESTAMP
      ELSE NULL
    END,
    updated_by = ?
    WHERE sc.student_id = ? AND sc.course_id = ? AND sc.status = 1
  `;
}

// Institute Admin Dashboard Queries  
export class AdminDashboardQueries {
  
  // Get Institute Admin's students with their course progress
  static readonly getInstituteStudentsWithProgress = `
    SELECT 
      s.id as student_id,
      s.first_name,
      s.last_name,
      s.email,
      s.mobile,
      s.created_at as student_created_at,
      c.id as course_id,
      c.title as course_title,
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
    LIMIT ? OFFSET ?
  `;

  // Get count of students for pagination
  static readonly getInstituteStudentsCount = `
    SELECT COUNT(DISTINCT s.id) as count
    FROM institute_students ins
    JOIN students s ON ins.student_id = s.id AND s.status = 1
    WHERE ins.institution_id = ? AND ins.status = 1
  `;

  // Get courses offered by institution with student statistics
  static readonly getInstitutionCoursesWithStats = `
    SELECT 
      c.id as course_id,
      c.title as course_title,
      c.description,
      c.duration,
      cc.name as category_name,
      COUNT(DISTINCT sc.student_id) as total_students,
      COUNT(DISTINCT CASE WHEN sc.progress = 100 THEN sc.student_id END) as completed_students,
      COUNT(DISTINCT CASE WHEN sc.progress > 0 AND sc.progress < 100 THEN sc.student_id END) as in_progress_students,
      COUNT(DISTINCT CASE WHEN sc.progress = 0 OR sc.progress IS NULL THEN sc.student_id END) as not_started_students,
      ROUND(AVG(sc.progress), 2) as average_progress
    FROM institution_courses ic
    JOIN courses c ON ic.course_id = c.id AND c.status = 1
    LEFT JOIN course_categories cc ON c.category_id = cc.id
    LEFT JOIN student_courses sc ON c.id = sc.course_id AND sc.status = 1
    LEFT JOIN institute_students ins ON sc.student_id = ins.student_id 
      AND ins.institution_id = ic.institution_id AND ins.status = 1
    WHERE ic.institution_id = ? AND ic.status = 1
    GROUP BY c.id, c.title, c.description, c.duration, cc.name
    ORDER BY c.title
  `;

  // Get specific course students with detailed progress for Institute Admin
  static readonly getCourseStudentsProgress = `
    SELECT 
      s.id as student_id,
      s.first_name,
      s.last_name,
      s.email,
      s.mobile,
      sc.enrollment_date,
      sc.progress,
      sc.completion_date,
      CASE 
        WHEN sc.progress = 100 THEN 'Completed'
        WHEN sc.progress > 0 THEN 'In Progress'
        ELSE 'Not Started'
      END as status,
      (
        SELECT COUNT(*)
        FROM course_contents cc
        WHERE cc.course_id = ? AND cc.status = 1
      ) as total_contents,
      (
        SELECT COUNT(*)
        FROM course_contents cc
        JOIN student_content_progress scp ON cc.id = scp.content_id
        WHERE cc.course_id = ? 
          AND scp.student_id = s.id 
          AND scp.is_completed = TRUE
          AND cc.status = 1
      ) as completed_contents
    FROM institute_students ins
    JOIN students s ON ins.student_id = s.id AND s.status = 1
    JOIN student_courses sc ON s.id = sc.student_id AND sc.status = 1
    WHERE ins.institution_id = ? 
      AND sc.course_id = ? 
      AND ins.status = 1
    ORDER BY sc.progress DESC, s.first_name, s.last_name
  `;

  // Get Institute Admin dashboard summary statistics
  static readonly getInstituteDashboardStats = `
    SELECT 
      COUNT(DISTINCT ins.student_id) as total_students,
      COUNT(DISTINCT ic.course_id) as total_courses,
      COUNT(DISTINCT CASE WHEN sc.progress = 100 THEN sc.student_id END) as students_completed_courses,
      COUNT(DISTINCT CASE WHEN sc.progress > 0 AND sc.progress < 100 THEN sc.student_id END) as students_in_progress,
      ROUND(AVG(sc.progress), 2) as overall_average_progress
    FROM institutions i
    LEFT JOIN institute_students ins ON i.id = ins.institution_id AND ins.status = 1
    LEFT JOIN institution_courses ic ON i.id = ic.institution_id AND ic.status = 1
    LEFT JOIN student_courses sc ON ins.student_id = sc.student_id AND ic.course_id = sc.course_id AND sc.status = 1
    WHERE i.id = ? AND i.status = 1
  `;

  // Get recent student activities (enrollments, completions)
  static readonly getRecentStudentActivities = `
    SELECT 
      s.first_name,
      s.last_name,
      c.title as course_title,
      sc.enrollment_date,
      sc.completion_date,
      sc.progress,
      'enrollment' as activity_type
    FROM institute_students ins
    JOIN students s ON ins.student_id = s.id AND s.status = 1
    JOIN student_courses sc ON s.id = sc.student_id AND sc.status = 1
    JOIN courses c ON sc.course_id = c.id AND c.status = 1
    WHERE ins.institution_id = ? AND ins.status = 1
    ORDER BY sc.created_at DESC
    LIMIT 10
  `;

  /**
   * STUDENT DASHBOARD QUERIES
   */

  /**
   * Get total enrolled courses for a student
   */
  static readonly getTotalEnrolledCourses = `
    SELECT COUNT(DISTINCT course_id) as total
    FROM student_courses 
    WHERE student_id = ? AND status = 1
  `;

  /**
   * Get total in-progress courses for a student (not completed)
   */
  static readonly getInProgressCourses = `
    SELECT COUNT(DISTINCT course_id) as total
    FROM student_courses 
    WHERE student_id = ? AND status = 1 AND completion_date IS NULL
  `;

  /**
   * Get total completed courses for a student
   */
  static readonly getCompletedCourses = `
    SELECT COUNT(DISTINCT course_id) as total
    FROM student_courses 
    WHERE student_id = ? AND status = 1 AND completion_date IS NOT NULL
  `;

  /**
   * Get average progress across all enrolled courses for a student
   */
  static readonly getAverageProgress = `
    SELECT ROUND(AVG(progress), 2) as avg_progress
    FROM student_courses 
    WHERE student_id = ? AND status = 1
  `;
}