import { RowDataPacket } from "mysql2/promise";
import bcrypt from 'bcrypt';
import { userValidation, validateData } from './src/utils/validations';
import { UserQueries, RoleQueries, LoginQueries } from './src/queries/userQueries';
import { DatabaseTransaction, DatabaseHelpers } from './src/utils/database';

export async function initializeDatabase(): Promise<void> {
    try {
        // Import db after environment variables are loaded
        const mysql = await import("mysql2/promise");
        
        // First, connect without specifying database to create it
        const tempConnection = await mysql.default.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: Number(process.env.DB_PORT) || 3306,
        });

        // Create database if it doesn't exist
        await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
        console.log(`✅ Database '${process.env.DB_NAME}' created/verified`);
        await tempConnection.end();

        // Now connect to the specific database
        const db = await import("./db");
        const connection = await db.default.getConnection();
        

        // Users
        await connection.query(`
            CREATE TABLE if not exists users (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100),
                email VARCHAR(150) UNIQUE NOT NULL,
                phone VARCHAR(15) UNIQUE,
                status SMALLINT DEFAULT 1,
                created_by BIGINT,
                updated_by BIGINT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                temp_created_at DATETIME,
                temp_updated_at DATETIME,
                CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id),
                CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);

        // Roles
        await connection.query(`
            CREATE TABLE if not exists roles (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                status SMALLINT DEFAULT 1,
                created_by BIGINT,
                updated_by BIGINT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);

        // User Roles
        await connection.query(`
            CREATE TABLE if not exists user_roles (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                role_id BIGINT NOT NULL,
                status SMALLINT DEFAULT 1,
                created_by BIGINT,
                updated_by BIGINT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                temp_created_at DATETIME,
                temp_updated_at DATETIME,
                UNIQUE(user_id, role_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);
        
        await connection.query(`
            CREATE TABLE if not exists login (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                last_login DATETIME,
                created_by BIGINT,
                updated_by BIGINT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);        
      
        await connection.query(`
            CREATE TABLE if not exists login_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                login_id BIGINT,
                login_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                logout_time DATETIME NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                login_status SMALLINT DEFAULT 1,
                FOREIGN KEY (login_id) REFERENCES login(id)
            );
        `);

        // Course Categories
        await connection.query(`
            CREATE TABLE if not exists course_categories (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                status SMALLINT DEFAULT 1,
                created_by BIGINT,
                updated_by BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);

        // Courses
        await connection.query(`
            CREATE TABLE if not exists courses (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                course_image VARCHAR(500),
                duration VARCHAR(100),
                levels JSON,
                category_id BIGINT,
                status SMALLINT DEFAULT 1,
                created_by BIGINT,
                updated_by BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES course_categories(id),
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);

        // Course Sections (Subjects)
        await connection.query(`
            CREATE TABLE if not exists course_sections (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                course_id BIGINT NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                sort_order INT DEFAULT 0,
                is_free BOOLEAN DEFAULT FALSE,
                status SMALLINT DEFAULT 1,
                created_by BIGINT,
                updated_by BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);

        // Course Contents
        await connection.query(`
            CREATE TABLE if not exists course_contents (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                course_id BIGINT NOT NULL,
                section_id BIGINT,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                content_type ENUM(
                    'TEXT',
                    'YOUTUBE',
                    'PDF',
                    'DOC',
                    'DOCX',
                    'IMAGE', 
                    'VIDEO',
                    'AUDIO',
                    'QUIZ',
                    'ASSIGNMENT'
                ) NOT NULL,
                content_url VARCHAR(1000),
                file_path VARCHAR(500),
                file_size BIGINT DEFAULT 0,
                mime_type VARCHAR(100),
                content_text LONGTEXT,
                file_name VARCHAR(255),
                youtube_url VARCHAR(500),
                sort_order INT DEFAULT 0,
                duration INT DEFAULT 0,
                is_free BOOLEAN DEFAULT FALSE,
                status SMALLINT DEFAULT 1,
                created_by BIGINT,
                updated_by BIGINT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_content_course (course_id),
                INDEX idx_section_id (section_id),
                INDEX idx_content_type (content_type),
                INDEX idx_content_order (sort_order),
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                FOREIGN KEY (section_id) REFERENCES course_sections(id),
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            );
        `);

        // Course Ratings & Reviews
        await connection.query(`
            CREATE TABLE if not exists course_ratings (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                course_id BIGINT NOT NULL,
                student_id BIGINT NOT NULL,
                rating TINYINT CHECK (rating >= 1 AND rating <= 5),
                review TEXT,
                is_approved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_rating (course_id, student_id),
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Insert static roles if they don't exist
        const roles = [
            { name: 'Admin', description: 'System administrator with full access' },
            { name: 'Institute Admin', description: 'Institute administrator with institute management access' },
            { name: 'Student', description: 'Student with course access and learning capabilities' }
        ];

        for (const role of roles) {
            await connection.query(`
                INSERT IGNORE INTO roles (name, description, status) 
                VALUES (?, ?, 1)
            `, [role.name, role.description]);
        }
        

        // Create default admin user
        await createDefaultAdminUser(connection);

        connection.release();
        console.log("🎉 Database schema initialization completed successfully!");

    } catch (error) {
        console.error("❌ Error initializing database:", error);
        throw error;
    }
}

// Function to create default admin user
async function createDefaultAdminUser(connection: any): Promise<void> {
    try {
        
        // Admin user data
        const adminData = {
            first_name: 'Borigam',
            last_name: 'Admin',
            email: 'admin@borigamedu.com',
            phone: '9701646859',
            password: 'Admin@123$',
            status: 1,
            created_by: 1,
            updated_by: 1
        };

        // Validate admin data
        const validation = validateData(adminData, userValidation.createUser);
        if (!validation.isValid) {
            console.error("❌ Admin user validation failed:", validation.errors);
            return;
        }

        // Check if admin user already exists
        const existingUser = await DatabaseHelpers.executeSelectOne(
            connection, 
            UserQueries.getUserByEmail, 
            [adminData.email]
        );

        if (existingUser) {
            return;
        }

        // Use transaction for admin user creation
        await DatabaseTransaction.executeTransaction(async (txConnection) => {
            
            // Step 1: Create admin user
            const userId = await DatabaseHelpers.executeInsert(
                txConnection,
                UserQueries.createUser,
                [
                    adminData.first_name,
                    adminData.last_name,
                    adminData.email,
                    adminData.phone,
                    adminData.status,
                    null, // created_by will be null for first user
                    null  // updated_by will be null for first user
                ]
            );

            console.log(`✅ Admin user created with ID: ${userId}`);

            // Step 2: Get Admin role ID
            const adminRole = await DatabaseHelpers.executeSelectOne(
                txConnection,
                RoleQueries.getRoleByName,
                ['Admin']
            );

            if (!adminRole) {
                throw new Error('Admin role not found');
            }

            // Step 3: Assign Admin role to user
            await DatabaseHelpers.executeInsert(
                txConnection,
                RoleQueries.assignUserRole,
                [userId, adminRole.id, userId, userId]
            );

            console.log(`✅ Admin role assigned to user`);

            // Step 4: Hash password and create login record
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(adminData.password, saltRounds);

            await DatabaseHelpers.executeInsert(
                txConnection,
                LoginQueries.createLogin,
                [
                    userId,
                    adminData.email,
                    hashedPassword,
                    userId,
                    userId
                ]
            );

            console.log(`✅ Login credentials created for admin user`);

            // Update the created_by and updated_by fields to reference the admin user
            await DatabaseHelpers.executeQuery(
                txConnection,
                'UPDATE users SET created_by = ?, updated_by = ? WHERE id = ?',
                [userId, userId, userId]
            );

            console.log(`✅ Admin user audit fields updated`);
        });

    } catch (error) {
        console.error("❌ Error creating default admin user:", error);
        throw error;
    }
}

// Function to check database connection
export async function checkDatabaseConnection(): Promise<boolean> {
    try {
        // Import db after environment variables are loaded
        const db = await import("./db");
        const connection = await db.default.getConnection();
        await connection.ping();
        connection.release();
        console.log("✅ Database connection successful");
        return true;
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        return false;
    }
}