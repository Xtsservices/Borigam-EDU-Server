import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables FIRST before importing any modules that use them
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

// Debug: Check if environment variables are loaded
console.log('🔍 Environment variables loaded:');
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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);


// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);


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
    
    // Start server after successful database initialization
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
    });
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
