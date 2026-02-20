import Joi from 'joi';

// User validation schemas
export const userValidation = {
  // Create user validation
  createUser: Joi.object({
    first_name: Joi.string().min(2).max(100).required().messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 100 characters',
      'any.required': 'First name is required'
    }),
    last_name: Joi.string().min(2).max(100).optional().messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 100 characters'
    }),
    email: Joi.string().email().max(150).required().messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email cannot exceed 150 characters',
      'any.required': 'Email is required'
    }),
    phone: Joi.string().pattern(/^[0-9]{10}$/).optional().messages({
      'string.pattern.base': 'Phone number must be exactly 10 digits'
    }),
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
    status: Joi.number().integer().min(0).max(1).default(1).messages({
      'number.min': 'Status must be 0 or 1',
      'number.max': 'Status must be 0 or 1'
    }),
    created_by: Joi.number().integer().optional(),
    updated_by: Joi.number().integer().optional()
  }),

  // Update user validation
  updateUser: Joi.object({
    first_name: Joi.string().min(2).max(100).optional(),
    last_name: Joi.string().min(2).max(100).optional(),
    email: Joi.string().email().max(150).optional(),
    phone: Joi.string().pattern(/^[0-9]{10}$/).optional(),
    status: Joi.number().integer().min(0).max(1).optional(),
    updated_by: Joi.number().integer().optional()
  }),

  // User ID validation
  userId: Joi.number().integer().positive().required().messages({
    'number.positive': 'User ID must be a positive integer',
    'any.required': 'User ID is required'
  })
};

// Role validation schemas
export const roleValidation = {
  assignRole: Joi.object({
    user_id: Joi.number().integer().positive().required(),
    role_id: Joi.number().integer().positive().required(),
    created_by: Joi.number().integer().optional(),
    updated_by: Joi.number().integer().optional()
  })
};

// Login validation schemas
export const loginValidation = {
  createLogin: Joi.object({
    user_id: Joi.number().integer().positive().required(),
    email: Joi.string().email().max(150).required(),
    password_hash: Joi.string().required(),
    created_by: Joi.number().integer().optional(),
    updated_by: Joi.number().integer().optional()
  }),

  loginCredentials: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  })
};

// Common validation helper
export const validateData = (data: any, schema: Joi.ObjectSchema) => {
  const { error, value } = schema.validate(data, { abortEarly: false });
  
  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    return { isValid: false, errors: errorMessages, data: null };
  }
  
  return { isValid: true, errors: [], data: value };
};

// Course validation schemas
export const courseValidation = {
  // Create course validation
  createCourse: Joi.object({
    title: Joi.string().max(255).required().messages({
      'string.max': 'Course title cannot exceed 255 characters',
      'any.required': 'Course title is required'
    }),
    description: Joi.string().min(10).max(5000).required().messages({
      'string.min': 'Course description must be at least 10 characters',
      'string.max': 'Course description cannot exceed 5000 characters',
      'any.required': 'Course description is required'
    }),
    course_image: Joi.string().uri().max(500).allow(null).optional().messages({
      'string.uri': 'Course image must be a valid URL',
      'string.max': 'Course image URL cannot exceed 500 characters'
    }),
    duration: Joi.string().max(100).required().messages({
      'string.max': 'Duration cannot exceed 100 characters',
      'any.required': 'Duration is required'
    }),
    levels: Joi.array().items(
      Joi.string().custom((value, helpers) => {
        const normalizedValue = value.toUpperCase();
        if (!['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(normalizedValue)) {
          return helpers.error('levels.invalid');
        }
        return normalizedValue;
      })
    ).min(1).required().messages({
      'array.min': 'At least one level must be selected',
      'levels.invalid': 'Level must be one of: BEGINNER, INTERMEDIATE, ADVANCED (case insensitive)',
      'any.required': 'Levels are required'
    }),
    category_id: Joi.number().integer().positive().required().messages({
      'number.positive': 'Category ID must be a positive integer',
      'any.required': 'Category ID is required'
    })
  }),

  // Update course validation
  updateCourse: Joi.object({
    title: Joi.string().max(255).optional(),
    description: Joi.string().min(10).max(5000).optional(),
    course_image: Joi.string().uri().max(500).allow(null).optional(),
    duration: Joi.string().max(100).optional(),
    levels: Joi.array().items(
      Joi.string().custom((value, helpers) => {
        const normalizedValue = value.toUpperCase();
        if (!['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(normalizedValue)) {
          return helpers.error('levels.invalid');
        }
        return normalizedValue;
      })
    ).min(1).optional().messages({
      'levels.invalid': 'Level must be one of: BEGINNER, INTERMEDIATE, ADVANCED (case insensitive)'
    }),
    category_id: Joi.number().integer().positive().optional()
  }),

  // Course ID validation
  courseId: Joi.number().integer().positive().required().messages({
    'number.positive': 'Course ID must be a positive integer',
    'any.required': 'Course ID is required'
  })
};

// Course Section validation schemas
export const courseSectionValidation = {
  // Create section validation
  createSection: Joi.object({
    course_id: Joi.number().integer().positive().required().messages({
      'number.positive': 'Course ID must be a positive integer',
      'any.required': 'Course ID is required'
    }),
    title: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Section title must be at least 2 characters',
      'string.max': 'Section title cannot exceed 255 characters',
      'any.required': 'Section title is required'
    }),
    description: Joi.string().max(1000).optional().messages({
      'string.max': 'Section description cannot exceed 1000 characters'
    }),
    sort_order: Joi.number().integer().min(0).default(0).messages({
      'number.min': 'Sort order cannot be negative'
    }),
    is_free: Joi.boolean().default(false)
  }),

  // Update section validation
  updateSection: Joi.object({
    title: Joi.string().min(2).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    sort_order: Joi.number().integer().min(0).optional(),
    is_free: Joi.boolean().optional()
  }),

  // Section ID validation
  sectionId: Joi.number().integer().positive().required().messages({
    'number.positive': 'Section ID must be a positive integer',
    'any.required': 'Section ID is required'
  })
};

// Course Content validation schemas
export const courseContentValidation = {
  // Create content validation (with file upload support)
  createContent: Joi.object({
    course_id: Joi.number().integer().positive().required(),
    section_id: Joi.number().integer().positive().required(),
    title: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Content title must be at least 2 characters',
      'string.max': 'Content title cannot exceed 255 characters',
      'any.required': 'Content title is required'
    }),
    description: Joi.string().max(2000).optional(),
    content_type: Joi.string().valid(
      'TEXT', 'PDF', 'DOC', 'DOCX', 'IMAGE', 'VIDEO', 'YOUTUBE', 'QUIZ', 'ASSIGNMENT', 'AUDIO'
    ).required().messages({
      'any.only': 'Content type must be one of: TEXT, PDF, DOC, DOCX, IMAGE, VIDEO, YOUTUBE, QUIZ, ASSIGNMENT, AUDIO',
      'any.required': 'Content type is required'
    }),
    content_url: Joi.string().max(1000).optional(),
    content_text: Joi.string().when('content_type', {
      is: 'TEXT',
      then: Joi.string().required().messages({
        'any.required': 'Content text is required for TEXT content type'
      }),
      otherwise: Joi.string().optional()
    }),
    youtube_url: Joi.string().uri().when('content_type', {
      is: 'YOUTUBE',
      then: Joi.string().pattern(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//).required().messages({
        'string.pattern.base': 'Please provide a valid YouTube URL',
        'any.required': 'YouTube URL is required for YOUTUBE content type'
      }),
      otherwise: Joi.string().optional()
    }),
    file_name: Joi.string().max(255).optional(),
    file_size: Joi.number().integer().min(0).max(104857600).optional().messages({
      'number.max': 'File size cannot exceed 100MB'
    }),
    mime_type: Joi.string().max(100).optional(),
    duration: Joi.number().integer().min(0).default(0).messages({
      'number.min': 'Duration cannot be negative'
    }),
    sort_order: Joi.number().integer().min(0).default(0),
    is_free: Joi.boolean().default(false)
  }),

  // Update content validation
  updateContent: Joi.object({
    title: Joi.string().min(2).max(255).optional(),
    description: Joi.string().max(2000).optional(),
    content_type: Joi.string().valid(
      'TEXT', 'PDF', 'DOC', 'DOCX', 'IMAGE', 'VIDEO', 'YOUTUBE', 'QUIZ', 'ASSIGNMENT', 'AUDIO'
    ).optional(),
    content_url: Joi.string().max(1000).optional(),
    content_text: Joi.string().optional(),
    youtube_url: Joi.string().uri().pattern(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//).optional(),
    file_name: Joi.string().max(255).optional(),
    file_size: Joi.number().integer().min(0).max(104857600).optional(),
    mime_type: Joi.string().max(100).optional(),
    duration: Joi.number().integer().min(0).optional(),
    sort_order: Joi.number().integer().min(0).optional(),
    is_free: Joi.boolean().optional()
  }),

  // File upload validation
  fileUpload: Joi.object({
    course_id: Joi.number().integer().positive().required(),
    section_id: Joi.number().integer().positive().required(),
    content_type: Joi.string().valid('PDF', 'DOC', 'DOCX', 'IMAGE', 'VIDEO', 'AUDIO').required()
  }),

  // Bulk content upload validation
  bulkUpload: Joi.object({
    course_id: Joi.number().integer().positive().required(),
    section_id: Joi.number().integer().positive().required(),
    content_type: Joi.string().valid('PDF', 'DOC', 'DOCX', 'IMAGE', 'VIDEO', 'AUDIO').required(),
    files: Joi.array().min(1).max(10).required().messages({
      'array.min': 'At least one file is required',
      'array.max': 'Maximum 10 files allowed per upload'
    })
  })
};

// Course Category validation schemas
export const courseCategoryValidation = {
  createCategory: Joi.object({
    name: Joi.string().min(2).max(100).required().messages({
      'string.min': 'Category name must be at least 2 characters',
      'string.max': 'Category name cannot exceed 100 characters',
      'any.required': 'Category name is required'
    }),
    description: Joi.string().max(500).optional().messages({
      'string.max': 'Description cannot exceed 500 characters'
    })
  })
};



// Course Rating validation
export const courseRatingValidation = {
  createRating: Joi.object({
    course_id: Joi.number().integer().positive().required(),
    rating: Joi.number().integer().min(1).max(5).required().messages({
      'number.min': 'Rating must be at least 1',
      'number.max': 'Rating cannot exceed 5',
      'any.required': 'Rating is required'
    }),
    review: Joi.string().max(1000).optional().messages({
      'string.max': 'Review cannot exceed 1000 characters'
    })
  })
};