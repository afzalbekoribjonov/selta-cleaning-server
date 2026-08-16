import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { employeeAdminRouter } from "./routes/employeeAdmin";
import { ordersRouter } from "./routes/orders";
import { bootstrapRouter } from "./routes/bootstrap";

const app = express();

app.use(cors());
app.use(express.json());

// Render sog'ligini tekshirish uchun, va bepul reja "uxlab qolishi"ni
// oldini olish uchun tashqi keep-alive xizmati shu manzilga so'rov yuboradi.
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/", authRouter);
app.use("/", employeeAdminRouter);
app.use("/", ordersRouter);
app.use("/", bootstrapRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`Selta Cleaning server ${port} portda ishga tushdi`);
});
