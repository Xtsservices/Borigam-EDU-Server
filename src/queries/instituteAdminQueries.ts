// Institute Admin Dashboard related database queries
export class InstituteAdminQueries {
  
  /**
   * DASHBOARD SCREEN QUERIES
   */

  /**
   * Get total students in a specific institution
   * Filters by institution_id
   */
  static readonly getTotalStudentsByInstitution = `
    SELECT COUNT(DISTINCT s.id) as total
    FROM students s
    INNER JOIN institute_students inst_stud ON s.id = inst_stud.student_id
    WHERE inst_stud.institution_id = ? AND s.status = 1 AND inst_stud.status = 1
  `;

  /**
   * Get total courses offered by a specific institution
   * Filters by institution_id
   */
  static readonly getTotalCoursesByInstitution = `
    SELECT COUNT(DISTINCT c.id) as total
    FROM courses c
    INNER JOIN institution_courses ic ON c.id = ic.course_id
    WHERE ic.institution_id = ? AND c.status = 1 AND ic.status = 1
  `;

  /**
   * Get total exams for courses offered by a specific institution
   * Filters by institution_id
   */
  static readonly getTotalExamsByInstitution = `
    SELECT COUNT(DISTINCT e.id) as total
    FROM exams e
    INNER JOIN courses c ON e.course_id = c.id
    INNER JOIN institution_courses ic ON c.id = ic.course_id
    WHERE ic.institution_id = ? AND e.status = 1 AND c.status = 1 AND ic.status = 1
  `;

  /**
   * Get top 5 courses by student enrollment for a specific institution
   * Returns: course name and number of students enrolled
   * Filters by institution_id
   */
  static readonly getTopCoursesByInstitution = `
    SELECT 
      c.id,
      c.title as course_name,
      COUNT(DISTINCT sc.student_id) as student_count
    FROM courses c
    INNER JOIN institution_courses ic ON c.id = ic.course_id
    LEFT JOIN student_courses sc ON c.id = sc.course_id AND sc.status = 1
    WHERE ic.institution_id = ? AND c.status = 1 AND ic.status = 1
    GROUP BY c.id, c.title
    ORDER BY student_count DESC
    LIMIT 5
  `;
}
