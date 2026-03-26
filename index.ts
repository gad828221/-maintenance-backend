import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import techniciansRouter from "./technicians";
import customersRouter from "./customers";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ordersRouter);
router.use(techniciansRouter);
router.use(customersRouter);
router.use(dashboardRouter);
router.use(reportsRouter);

export default router;
