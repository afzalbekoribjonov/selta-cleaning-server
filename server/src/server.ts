import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { employeeAdminRouter } from "./routes/employeeAdmin";
import { ordersRouter } from "./routes/orders";
import { bootstrapRouter } from "./routes/bootstrap";
import { payrollRouter } from "./routes/payroll";
import { productsRouter } from "./routes/products";
import { expensesRouter } from "./routes/expenses";
import { tasksRouter } from "./routes/tasks";

const app = express();

app.use(cors());
app.use(express.json());

// Render sog'ligini tekshirish uchun, va bepul reja "uxlab qolishi"ni
// oldini olish uchun tashqi keep-alive xizmati (masalan UptimeRobot) har
// ~10 daqiqada shu manzilga so'rov yuboradi. GET va HEAD ikkalasi ham
// aniq belgilangan — UptimeRobot standart holatda HEAD so'rov yuboradi.
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.head("/health", (_req, res) => res.status(200).end());

app.use("/", authRouter);
app.use("/", employeeAdminRouter);
app.use("/", ordersRouter);
app.use("/", bootstrapRouter);
app.use("/", payrollRouter);
app.use("/", productsRouter);
app.use("/", expensesRouter);
app.use("/", tasksRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`Selta Cleaning server ${port} portda ishga tushdi`);
});
