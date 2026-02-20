// Course-related database queries
export class CourseQueries {
  
  // Course CRUD operations
  static readonly createCourse = `
    INSERT INTO courses (title, description, course_image, duration, levels, category_id, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  static readonly getCourseById = `
    SELECT c.*, cat.name as category_name
    FROM courses c
    LEFT JOIN course_categories cat ON c.category_id = cat.id
    WHERE c.id = ? AND c.status = 1
  `;

  // Note: LIMIT/OFFSET parameters handled by string interpolation due to MySQL binding issues
  static readonly getAllCoursesBase = `
    SELECT c.*, cat.name as category_name
    FROM courses c
    LEFT JOIN course_categories cat ON c.category_id = cat.id
    WHERE c.status = 1
    ORDER BY c.created_at DESC
  `;

  static readonly getAllCourses = `
    SELECT c.*, cat.name as category_name
    FROM courses c
    LEFT JOIN course_categories cat ON c.category_id = cat.id
    WHERE c.status = 1
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `;

  static readonly updateCourse = `
    UPDATE courses 
    SET title = ?, description = ?, course_image = ?, duration = ?, levels = ?, 
        category_id = ?, updated_by = ?
    WHERE id = ? AND status = 1
  `;

  static readonly updateCourseWithoutImage = `
    UPDATE courses 
    SET title = ?, description = ?, duration = ?, levels = ?, 
        category_id = ?, updated_by = ?
    WHERE id = ? AND status = 1
  `;

  static readonly deleteCourse = `
    UPDATE courses SET status = 0, updated_by = ? WHERE id = ?
  `;

  static readonly getCourseCount = `
    SELECT COUNT(*) as total FROM courses WHERE status = 1
  `;

  static readonly getCoursesByCategory = `
    SELECT c.*, cat.name as category_name
    FROM courses c
    LEFT JOIN course_categories cat ON c.category_id = cat.id
    WHERE c.category_id = ? AND c.status = 1
    ORDER BY c.created_at DESC
  `;

  static readonly getCoursesByLevel = `
    SELECT c.*, cat.name as category_name
    FROM courses c
    LEFT JOIN course_categories cat ON c.category_id = cat.id
    WHERE JSON_CONTAINS(c.levels, ?) AND c.status = 1
    ORDER BY c.created_at DESC
  `;
}

// Course Category queries
export class CourseCategoryQueries {
  
  static readonly getAllCategories = `
    SELECT id, name, description, status, created_at, updated_at 
    FROM course_categories 
    WHERE status = 1 
    ORDER BY name
  `;

  static readonly getCategoryById = `
    SELECT id, name, description, status, created_at, updated_at 
    FROM course_categories 
    WHERE id = ? AND status = 1
  `;

  static readonly createCategory = `
    INSERT INTO course_categories (name, description, created_by, updated_by)
    VALUES (?, ?, ?, ?)
  `;

  static readonly updateCategory = `
    UPDATE course_categories 
    SET name = ?, description = ?, updated_by = ?
    WHERE id = ? AND status = 1
  `;

  static readonly deleteCategory = `
    UPDATE course_categories SET status = 0, updated_by = ? WHERE id = ?
  `;
}

// Course Section queries
export class CourseSectionQueries {
  
  static readonly createSection = `
    INSERT INTO course_sections (course_id, title, description, sort_order, is_free, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  static readonly getSectionById = `
    SELECT * FROM course_sections WHERE id = ? AND status = 1
  `;

  static readonly getSectionsByCourse = `
    SELECT cs.*, 
           (SELECT COUNT(*) FROM course_contents WHERE section_id = cs.id AND status = 1) as content_count
    FROM course_sections cs
    WHERE cs.course_id = ? AND cs.status = 1
    ORDER BY cs.sort_order
  `;

  static readonly updateSection = `
    UPDATE course_sections 
    SET title = ?, description = ?, sort_order = ?, is_free = ?, updated_by = ?
    WHERE id = ? AND status = 1
  `;

  static readonly deleteSection = `
    UPDATE course_sections SET status = 0, updated_by = ? WHERE id = ?
  `;

  static readonly reorderSections = `
    UPDATE course_sections SET sort_order = ? WHERE id = ?
  `;
}

// Course Content queries
export class CourseContentQueries {
  
  static readonly createContent = `
    INSERT INTO course_contents (
      course_id, section_id, title, description, content_type, content_url, 
      content_text, youtube_url, file_name, file_size, mime_type, duration, sort_order, 
      is_free, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  static readonly getContentById = `
    SELECT * FROM course_contents WHERE id = ? AND status = 1
  `;

  static readonly getContentsBySection = `
    SELECT * FROM course_contents 
    WHERE section_id = ? AND status = 1
    ORDER BY sort_order
  `;

  static readonly getContentsByCourse = `
    SELECT cc.*, cs.title as section_title
    FROM course_contents cc
    JOIN course_sections cs ON cc.section_id = cs.id
    WHERE cc.course_id = ? AND cc.status = 1
    ORDER BY cs.sort_order, cc.sort_order
  `;

  static readonly updateContent = `
    UPDATE course_contents 
    SET title = ?, description = ?, content_type = ?, content_url = ?,
        content_text = ?, file_name = ?, file_size = ?, mime_type = ?,
        duration = ?, sort_order = ?, is_free = ?, updated_by = ?
    WHERE id = ? AND status = 1
  `;

  static readonly deleteContent = `
    UPDATE course_contents SET status = 0, updated_by = ? WHERE id = ?
  `;

  static readonly reorderContent = `
    UPDATE course_contents SET sort_order = ? WHERE id = ?
  `;
}



// Course Rating queries
export class CourseRatingQueries {
  
  static readonly createRating = `
    INSERT INTO course_ratings (course_id, student_id, rating, review)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE rating = VALUES(rating), review = VALUES(review)
  `;

  static readonly getCourseRatings = `
    SELECT cr.*, CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) as student_name
    FROM course_ratings cr
    JOIN users u ON cr.student_id = u.id
    WHERE cr.course_id = ? AND cr.is_approved = 1
    ORDER BY cr.created_at DESC
  `;

  static readonly approveRating = `
    UPDATE course_ratings SET is_approved = 1 WHERE id = ?
  `;

  static readonly getCourseAverageRating = `
    SELECT AVG(rating) as average_rating, COUNT(*) as total_ratings
    FROM course_ratings 
    WHERE course_id = ? AND is_approved = 1
  `;
}