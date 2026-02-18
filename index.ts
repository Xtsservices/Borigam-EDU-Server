import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Sample API: http://localhost:${PORT}/api/samples`);
});

export default app;
