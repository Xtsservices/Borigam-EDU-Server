-- Migration: Fix sort_order DEFAULT values
-- Description: Change DEFAULT 0 to DEFAULT 1 for sort_order columns
-- This ensures new sections and content append at the end, not at position 0

ALTER TABLE course_sections MODIFY sort_order INT DEFAULT 1;
ALTER TABLE course_contents MODIFY sort_order INT DEFAULT 1;

-- Verify changes
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME IN ('course_sections', 'course_contents') 
AND COLUMN_NAME = 'sort_order';
