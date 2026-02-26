// Admin Dashboard related database queries
export class AdminQueries {
  
  /**
   * DASHBOARD SCREEN QUERIES
   */

  /**
   * Get total students count (Overall students from all institutions)
   */
  static readonly getTotalStudents = `
    SELECT COUNT(*) as total FROM students WHERE status = 1
  `;

  /**
   * Get total institutions count
   */
  static readonly getTotalInstitutions = `
    SELECT COUNT(*) as total FROM institutions WHERE status = 1
  `;

  /**
   * Get total courses count (Total courses added by admin)
   */
  static readonly getTotalCourses = `
    SELECT COUNT(*) as total FROM courses WHERE status = 1
  `;

  /**
   * Get total exams count
   */
  static readonly getTotalExams = `
    SELECT COUNT(*) as total FROM exams WHERE status = 1
  `;

  /**
   * Get top 5 courses by student enrollment
   * Returns: course name and number of students enrolled
   */
  static readonly getTopCourses = `
    SELECT 
      c.id,
      c.title as course_name,
      COUNT(sc.student_id) as student_count
    FROM courses c
    LEFT JOIN student_courses sc ON c.id = sc.course_id AND sc.status = 1
    WHERE c.status = 1
    GROUP BY c.id, c.title
    ORDER BY student_count DESC
    LIMIT 5
  `;

  /**
   * Get total active users count
   */
  static readonly getActiveUsers = `
    SELECT COUNT(*) as total FROM users WHERE status = 1
  `;

  /**
   * STUDENTS SCREEN QUERIES
   */

  /**
   * Get total students count (including active and inactive)
   */
  static readonly getStudentsTotalCount = `
    SELECT COUNT(*) as total FROM students
  `;

  /**
   * Get active students count
   */
  static readonly getActiveStudents = `
    SELECT COUNT(*) as total FROM students WHERE status = 1
  `;

  /**
   * Get total enrollments (Total courses enrolled by active students)
   */
  static readonly getTotalEnrollments = `
    SELECT COUNT(DISTINCT sc.id) as total 
    FROM student_courses sc
    JOIN students s ON sc.student_id = s.id
    WHERE sc.status = 1 AND s.status = 1
  `;

  /**
   * COURSES SCREEN QUERIES
   */

  /**
   * Get total courses count
   */
  static readonly getCoursesTotalCount = `
    SELECT COUNT(*) as total FROM courses WHERE status = 1
  `;

  /**
   * Get total students enrolled across all courses
   */
  static readonly getTotalStudentsEnrolled = `
    SELECT COUNT(DISTINCT student_id) as total 
    FROM student_courses 
    WHERE status = 1
  `;

  /**
   * Get average students per course
   */
  static readonly getAvgStudentsPerCourse = `
    SELECT 
      ROUND(AVG(student_count), 2) as avg_students
    FROM (
      SELECT COUNT(sc.student_id) as student_count
      FROM courses c
      LEFT JOIN student_courses sc ON c.id = sc.course_id AND sc.status = 1
      WHERE c.status = 1
      GROUP BY c.id
    ) as course_enrollments
  `;

  /**
   * INSTITUTIONS SCREEN QUERIES
   */

  /**
   * Get total institutions count
   */
  static readonly getInstitutionsTotalCount = `
    SELECT COUNT(*) as total FROM institutions WHERE status = 1
  `;

  /**
   * Get active institutions count (Institutions which are offering courses)
   */
  static readonly getActiveInstitutions = `
    SELECT COUNT(DISTINCT i.id) as total 
    FROM institutions i
    INNER JOIN institution_courses ic ON i.id = ic.institution_id AND ic.status = 1
    WHERE i.status = 1
  `;

  /**
   * Get total courses count offered by all institutions
   */
  static readonly getTotalInstitutionCourses = `
    SELECT COUNT(DISTINCT course_id) as total 
    FROM institution_courses 
    WHERE status = 1
  `;

  /**
   * EXAMS SCREEN QUERIES
   */

  /**
   * Get total exams count
   */
  static readonly getExamsTotalCount = `
    SELECT COUNT(*) as total FROM exams WHERE status = 1
  `;
}
