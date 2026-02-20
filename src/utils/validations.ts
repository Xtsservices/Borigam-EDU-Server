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