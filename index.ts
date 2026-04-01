import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables FIRST before importing any modules that use them
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
console.log(`🚀 Starting server in ${nodeEnv.toUpperCase()} mode`);
console.log(`📁 Loading environment from: ${envFile}`);
dotenv.config({ path: envFile });

// Debug: Check if environment variables are loaded
console.log('🔍 Environment variables loaded:');
console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   - DB_HOST: ${process.env.DB_HOST}`);
console.log(`   - DB_USER: ${process.env.DB_USER}`);
console.log(`   - DB_NAME: ${process.env.DB_NAME}`);
console.log(`   - DB_PASSWORD: ${process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]'}`);
console.log(`   - JWT_SECRET: ${process.env.JWT_SECRET ? '[SET]' : '[NOT SET]'}`);

// Now import modules that depend on environment variables
import { initializeDatabase } from "./schema";
import authRoutes from "./src/routes/authRoutes";
import userRoutes from "./src/routes/userRoutes";
import roleRoutes from "./src/routes/roleRoutes";
import courseRoutes from "./src/routes/courseRoutes";
import institutionRoutes from "./src/routes/institutionRoutes";
import studentRoutes from "./src/routes/studentRoutes";
import examRoutes from "./src/routes/examRoutes";
import adminRoutes from "./src/routes/adminRoutes";
import instituteAdminRoutes from "./src/routes/instituteAdminRoutes";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Increase limits for large file uploads - Support up to 16GB files
// Note: Express limits are for request parsing, actual multer limits are configured in uploadMiddleware.ts
app.use(express.json({ limit: '16gb' }));
app.use(express.urlencoded({ extended: true, limit: '16gb' }));

// Configure request timeout middleware for large file uploads
// Set request timeout to 30 minutes (1800000 ms) to avoid 504 Gateway Timeout
app.use((req, res, next) => {
  // Don't set timeout for health checks
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  
  // Set timeout to 30 minutes for all other requests (especially file uploads)
  req.socket.setTimeout(30 * 60 * 1000); // 30 minutes in milliseconds
  next();
});

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);


// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/institute-admin', instituteAdminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API 404 handler for unmatched API routes - using middleware function instead of pattern
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      status: 'error',
      message: 'API endpoint not found',
      path: req.originalUrl
    });
  } else {
    next();
  }
});

// Legacy health check endpoint (keeping for backward compatibility)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.originalUrl
  });
});

// Database initialization function
async function startServer() {
  try {
    // Initialize database and create tables
    await initializeDatabase();
    
    // Start server after successful database initialization
    const server = app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
    });
    
    // Configure timeouts for large file uploads
    // Set socket timeout to 30 minutes (1800000 ms) - allows large file uploads
    server.timeout = 30 * 60 * 1000;
    server.keepAliveTimeout = 31 * 60 * 1000; // Slightly higher than timeout
    server.headersTimeout = 35 * 60 * 1000; // Even higher for headers
    
    console.log(`⏱️  Server timeout configured: ${server.timeout / 1000 / 60} minutes`);
    
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Sample API endpoints
app.get("/api/samples", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "List of samples",
    data: [
      { id: 1, name: "Sample 1", description: "This is sample 1" },
      { id: 2, name: "Sample 2", description: "This is sample 2" },
      { id: 3, name: "Sample 3", description: "This is sample 3" },
    ],
  });
});

app.get("/api/samples/:id", (req, res) => {
  const { id } = req.params;
  res.status(200).json({
    status: "success",
    message: `Sample with ID ${id}`,
    data: {
      id: parseInt(id),
      name: `Sample ${id}`,
      description: `This is sample ${id}`,
    },
  });
});

app.post("/api/samples", (req, res) => {
  const { name, description } = req.body;
  res.status(201).json({
    status: "success",
    message: "Sample created successfully",
    data: {
      id: Math.floor(Math.random() * 1000),
      name,
      description,
    },
  });
});

app.put("/api/samples/:id", (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  res.status(200).json({
    status: "success",
    message: "Sample updated successfully",
    data: {
      id: parseInt(id),
      name,
      description,
    },
  });
});

app.delete("/api/samples/:id", (req, res) => {
  const { id } = req.params;
  res.status(200).json({
    status: "success",
    message: `Sample with ID ${id} deleted successfully`,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

// Start the server
startServer();

export default app;
