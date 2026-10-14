import "reflect-metadata";
import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { DataSource } from "typeorm";
import { AppDataSource } from "./config/data-source";
import { errorHandler, notFound } from "./middlewares/error.middleware";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import blogRoutes from "./routes/blog.routes";
import articleRoutes from "./routes/article.routes";
import eventRoutes from "./routes/event.routes";
import paymentRoutes from "./routes/payment.routes";
import companyRoutes from "./routes/company.routes";
import categoryRoutes from "./routes/category.routes";
import rolePaymentRoutes from "./routes/role-payment.routes";

import fileRoutes from "./routes/file.routes";

const app = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/blogs", blogRoutes);
app.use("/api/v1/articles", articleRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/companies", companyRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/role-payments", rolePaymentRoutes);

app.use("/api/v1/files", fileRoutes);

app.use(notFound);
app.use(errorHandler);

async function cleanupOldMarketingTables() {
  const cleanupDs = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "wase_workflow",
    synchronize: false,
    logging: false,
  });

  try {
    await cleanupDs.initialize();
    await cleanupDs.query(`
      DELETE FROM notification
      WHERE parent_type IN ('paid_customer_submission', 'customer')
         OR resource_type IN ('payment_submitted', 'clarification_requested', 'clarification_response')
    `);
    await cleanupDs.query(`DROP TABLE IF EXISTS paid_customer_review CASCADE`);
    await cleanupDs.query(`DROP TABLE IF EXISTS paid_customer CASCADE`);
    await cleanupDs.query(`DROP TABLE IF EXISTS customer CASCADE`);
  } catch (e: any) {
    // Marketing cleanup is non-fatal
  } finally {
    if (cleanupDs.isInitialized) {
      await cleanupDs.destroy();
    }
  }
}

cleanupOldMarketingTables()
  .then(() => AppDataSource.initialize())
  .then(() => {
    app.listen(PORT, () => {
      // Server started
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });

export default app;
