import { PoolConnection } from 'mysql2/promise';

// User-related database queries
export class UserQueries {
  
  // Create a new user
  static createUser = `
    INSERT INTO users (first_name, last_name, email, phone, status, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  // Get user by ID
  static getUserById = `
    SELECT id, first_name, last_name, email, phone, status, created_by, updated_by, created_at, updated_at
    FROM users 
    WHERE id = ? AND status = 1
  `;

  // Get user by email
  static getUserByEmail = `
    SELECT id, first_name, last_name, email, phone, status, created_by, updated_by, created_at, updated_at
    FROM users 
    WHERE email = ? AND status = 1
  `;

  // Update user
  static updateUser = `
    UPDATE users 
    SET first_name = ?, last_name = ?, email = ?, phone = ?, status = ?, updated_by = ?
    WHERE id = ?
  `;

  // Soft delete user
  static deleteUser = `
    UPDATE users 
    SET status = 0, updated_by = ?
    WHERE id = ?
  `;

  // Get all users
  static getAllUsers = `
    SELECT id, first_name, last_name, email, phone, status, created_by, updated_by, created_at, updated_at
    FROM users 
    WHERE status = 1
    ORDER BY created_at DESC
  `;

  // Check if email exists
  static checkEmailExists = `
    SELECT id FROM users WHERE email = ?
  `;

  // Check if phone exists
  static checkPhoneExists = `
    SELECT id FROM users WHERE phone = ?
  `;
}

// Role-related database queries
export class RoleQueries {
  
  // Get role by name
  static getRoleByName = `
    SELECT id, name, description, status 
    FROM roles 
    WHERE name = ? AND status = 1
  `;

  // Get role by ID
  static getRoleById = `
    SELECT id, name, description, status 
    FROM roles 
    WHERE id = ? AND status = 1
  `;

  // Assign role to user
  static assignUserRole = `
    INSERT INTO user_roles (user_id, role_id, status, created_by, updated_by)
    VALUES (?, ?, 1, ?, ?)
  `;

  // Get user roles
  static getUserRoles = `
    SELECT ur.id, ur.user_id, ur.role_id, r.name as role_name, r.description, ur.status
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ? AND ur.status = 1
  `;

  // Remove user role
  static removeUserRole = `
    UPDATE user_roles 
    SET status = 0, updated_by = ?
    WHERE user_id = ? AND role_id = ?
  `;

  // Check if user has role
  static checkUserRole = `
    SELECT id FROM user_roles 
    WHERE user_id = ? AND role_id = ? AND status = 1
  `;
}

// Login-related database queries
export class LoginQueries {
  
  // Create login record
  static createLogin = `
    INSERT INTO login (user_id, email, password_hash, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?)
  `;

  // Get login by email
  static getLoginByEmail = `
    SELECT l.id, l.user_id, l.email, l.password_hash, l.last_login,
           u.first_name, u.last_name, u.status as user_status
    FROM login l
    JOIN users u ON l.user_id = u.id
    WHERE l.email = ? AND u.status = 1
  `;

  // Update last login time
  static updateLastLogin = `
    UPDATE login 
    SET last_login = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  // Update password
  static updatePassword = `
    UPDATE login 
    SET password_hash = ?, updated_by = ?
    WHERE user_id = ?
  `;

  // Get login by user ID
  static getLoginByUserId = `
    SELECT id, user_id, email, last_login
    FROM login 
    WHERE user_id = ?
  `;
}

// Login History database queries
export class LoginHistoryQueries {
  
  // Create login history record
  static createLoginHistory = `
    INSERT INTO login_history (login_id, login_time, ip_address, user_agent, login_status)
    VALUES (?, CURRENT_TIMESTAMP, ?, ?, 1)
  `;

  // Update logout time
  static updateLogoutTime = `
    UPDATE login_history 
    SET logout_time = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  // Get user login history
  static getUserLoginHistory = `
    SELECT lh.id, lh.login_time, lh.logout_time, lh.ip_address, lh.user_agent, lh.login_status
    FROM login_history lh
    JOIN login l ON lh.login_id = l.id
    WHERE l.user_id = ?
    ORDER BY lh.login_time DESC
    LIMIT 10
  `;

  // Update password in login table
  static updatePassword = `
    UPDATE login 
    SET password_hash = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `;
}