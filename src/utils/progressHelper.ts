/**
 * Progress Calculation Helper Functions
 * Handles all progress tracking and formatting for courses
 */

export class ProgressHelper {
  
  /**
   * Format progress decimal to percentage string
   * @param progress - Decimal progress value (0.00 - 100.00)
   * @returns Formatted percentage string (e.g., "50%", "10%", "0%")
   */
  static formatProgressAsPercentage(progress: number): string {
    if (!progress || isNaN(progress)) {
      return '0%';
    }
    return `${Math.round(progress)}%`;
  }

  /**
   * Calculate overall course progress based on total and completed contents
   * @param totalContents - Total number of contents in course
   * @param completedContents - Number of completed contents
   * @returns Progress percentage (0-100)
   */
  static calculateProgressPercentage(totalContents: number, completedContents: number): number {
    if (totalContents === 0) {
      return 0;
    }
    return Math.round((completedContents / totalContents) * 100);
  }

  /**
   * Calculate section-based progress
   * If course has N sections, each section is worth (100/N)%
   * Within each section, progress is based on content completion
   * 
   * @param totalSections - Total number of sections in course
   * @param sectionProgressData - Array of section progress data
   * @returns Overall course progress percentage
   */
  static calculateSectionBasedProgress(
    totalSections: number,
    sectionProgressData: Array<{
      section_id: number;
      total_contents: number;
      completed_contents: number;
    }>
  ): number {
    if (totalSections === 0 || sectionProgressData.length === 0) {
      return 0;
    }

    const progressPerSection = 100 / totalSections;
    let totalProgress = 0;

    sectionProgressData.forEach(section => {
      if (section.total_contents === 0) {
        // If section has no contents, consider it 0% progress
        return;
      }
      
      const sectionProgress = (section.completed_contents / section.total_contents) * progressPerSection;
      totalProgress += sectionProgress;
    });

    return Math.round(totalProgress);
  }

  /**
   * Get progress status label
   * @param progressPercentage - Progress percentage (0-100)
   * @returns Status label
   */
  static getProgressStatus(progressPercentage: number): string {
    if (progressPercentage === 0) {
      return 'Not Started';
    } else if (progressPercentage < 100) {
      return 'In Progress';
    } else {
      return 'Completed';
    }
  }

  /**
   * Format progress data for API response
   * @param progress - Raw progress value from database
   * @param totalContents - Total contents in course
   * @param completedContents - Completed contents count
   * @returns Formatted progress object
   */
  static formatProgressResponse(
    progress: number,
    totalContents: number = 0,
    completedContents: number = 0
  ) {
    const progressPercentage = progress || 0;
    
    return {
      progress_percentage: progressPercentage,
      formatted_progress: this.formatProgressAsPercentage(progressPercentage),
      status: this.getProgressStatus(progressPercentage),
      total_contents: totalContents,
      completed_contents: completedContents
    };
  }

  /**
   * Calculate completion date eligibility
   * @param progressPercentage - Progress percentage
   * @returns Boolean indicating if course is completed
   */
  static isCoursesCompleted(progressPercentage: number): boolean {
    return progressPercentage >= 100;
  }
}
