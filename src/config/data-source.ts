import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
import path from "path";
import * as Entities from "../entities";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "wase_workflow",

  synchronize: true,
  logging: true,
  ssl:
    process.env.DB_SSL === "true" || process.env.DB_SSL === "require"
      ? { rejectUnauthorized: false }
      : false,

  entities: Object.values(Entities),
  migrations: [__dirname + "/../migrations/**/*.{ts,js}"],
  subscribers: [],
});
