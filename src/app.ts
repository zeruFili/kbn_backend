import "reflect-metadata";
import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { DataSource } from "typeorm";
import { AppDataSource } from "./config/data-source";
import { errorHandler, notFound } from "./middlewares/error.middleware";
import { seedMembershipCategories } from "./seeds/seed-membership-categories";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import articleRoutes from "./routes/article.routes";
import eventRoutes from "./routes/event.routes";
import paymentRoutes from "./routes/payment.routes";
import companyRoutes from "./routes/company.routes";
import categoryRoutes from "./routes/category.routes";
import rolePaymentRoutes from "./routes/role-payment.routes";
import eventRegistrationRoutes from "./routes/event-registration.routes";
import loveGiftRoutes from "./routes/love-gift.routes";
import featuredRoutes from "./routes/featured.routes";

import fileRoutes from "./routes/file.routes";

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  "https://kbnep.com",
  "https://www.kbnep.com",
  "https://back.kbnep.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8443",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8443",
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin) ||
      /^https?:\/\/(.+\.)?kbnep\.com(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  optionsSuccessStatus: 200,
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/articles", articleRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/companies", companyRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/role-payments", rolePaymentRoutes);
app.use("/api/v1/event-registrations", eventRegistrationRoutes);
app.use("/api/v1/love-gifts", loveGiftRoutes);
app.use("/api/v1/featured", featuredRoutes);

app.use("/api/v1/files", fileRoutes);

app.use(notFound);
app.use(errorHandler);

async function cleanupOldMarketingTables(dataSource: DataSource) {
  try {
    await dataSource.query(`
      DELETE FROM notification
      WHERE parent_type IN ('paid_customer_submission', 'customer')
         OR resource_type IN ('payment_submitted', 'clarification_requested', 'clarification_response')
    `);
    await dataSource.query(`DROP TABLE IF EXISTS paid_customer_review CASCADE`);
    await dataSource.query(`DROP TABLE IF EXISTS paid_customer CASCADE`);
    await dataSource.query(`DROP TABLE IF EXISTS customer CASCADE`);
  } catch (e: any) {
    // Marketing cleanup is non-fatal
  }
}

const server = app.listen(PORT, () => {
  console.log(`[App] Server is running on port ${PORT}`);
});

AppDataSource.initialize()
  .then(async () => {
    console.log("[App] Database connected successfully");
    await cleanupOldMarketingTables(AppDataSource);
    try {
      await seedMembershipCategories(AppDataSource);
    } catch (seedErr: any) {
      console.warn("[App] Membership categories seed notice:", seedErr?.message);
    }
  })
  .catch((error) => {
    console.error("[App] Database connection failed:", error);
  });

export default app;
