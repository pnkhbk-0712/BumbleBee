import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import userRoutes from "./routes/users.js";
import beehiveRoutes from "./routes/beehives.js";

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Route chính
app.use("/api/users", userRoutes);
app.use("/api/beehives", beehiveRoutes);

// Route kiểm tra
app.get("/", (req, res) => {
  res.send("✅ Backend Node.js đang hoạt động!");
});

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
