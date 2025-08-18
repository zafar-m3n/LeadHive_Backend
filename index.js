const express = require("express");
const morgan = require("morgan");
const colors = require("colors");
const dotenv = require("dotenv");
const cors = require("cors");
const { connectDB } = require("./config/database");

// ✅ Load env variables
dotenv.config();

// ✅ Connect to Database
connectDB();

// ✅ Create Express App
const app = express();

// ✅ Middleware
app.use(express.json());
app.use(morgan("dev"));

app.use(
  cors({
    origin: [process.env.NODE_LEADHIVE_FRONTEND_URL, "http://localhost:5173"],
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  })
);

// ✅ Serve static uploads folder
app.use("/uploads", express.static("uploads"));

// ✅ Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const teamRoutes = require("./routes/teamRoutes");
const leadRoutes = require("./routes/leadRoutes");
const savedFilterRoutes = require("./routes/savedFilterRoutes");
const supportingRoutes = require("./routes/supportingRoutes");
const leadsUploadRoutes = require("./routes/leadsUploadRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

// ✅ Use Routes
app.use("/api/v1/auth", authRoutes);
app.use("api/v1/users", userRoutes);
app.use("api/v1/teams", teamRoutes);
app.use("api/v1/leads", leadRoutes);
app.use("api/v1/filters", savedFilterRoutes);
app.use("api/v1/supports", supportingRoutes);
app.use("api/v1/leads/upload", leadsUploadRoutes);
app.use("api/v1/dashboard", dashboardRoutes);

// ✅ Root Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "LeadHive API is running..." });
});

// ✅ Define Port
const PORT = process.env.NODE_LEADHIVE_PORT || 8080;

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`LeadHive server running on port ${PORT} in ${process.env.NODE_LEADHIVE_MODE} mode`.bgCyan.white);
});
