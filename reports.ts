import { Router, type IRouter } from "express";
import { db, ordersTable, techniciansTable } from "@workspace/db";
import { eq, sql, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reports/orders", async (req, res) => {
  try {
    const { dateFrom, dateTo, technicianId, status, applianceType } = req.query;
    const conditions = [];
    if (dateFrom) conditions.push(gte(ordersTable.createdAt, new Date(String(dateFrom))));
    if (dateTo) {
      const toDate = new Date(String(dateTo));
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(ordersTable.createdAt, toDate));
    }
    if (technicianId) conditions.push(eq(ordersTable.technicianId, Number(technicianId)));
    if (status) conditions.push(eq(ordersTable.status, String(status)));
    if (applianceType) conditions.push(eq(ordersTable.applianceType, String(applianceType)));

    const orders = conditions.length > 0
      ? await db.select().from(ordersTable).where(and(...conditions)).orderBy(sql`${ordersTable.createdAt} DESC`)
      : await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} DESC`);

    const techs = await db.select({ id: techniciansTable.id, name: techniciansTable.name }).from(techniciansTable);
    const techMap = new Map(techs.map(t => [t.id, t.name]));

    const formattedOrders = orders.map(o => {
      const cost = o.cost !== null ? Number(o.cost) : null;
      const expenses = o.expenses !== null ? Number(o.expenses) : null;
      const net = cost !== null ? cost - (expenses ?? 0) : null;
      return {
        ...o,
        cost,
        expenses,
        net,
        companyPercentage: o.companyPercentage !== null ? Number(o.companyPercentage) : null,
        technicianPercentage: o.technicianPercentage !== null ? Number(o.technicianPercentage) : null,
        technicianName: o.technicianId ? (techMap.get(o.technicianId) ?? null) : null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      };
    });

    const completedOrders = formattedOrders.filter(o => o.status === "completed");
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.cost ?? 0), 0);
    const totalExpenses = completedOrders.reduce((sum, o) => sum + (o.expenses ?? 0), 0);
    const totalNet = completedOrders.reduce((sum, o) => sum + (o.net ?? 0), 0);
    const totalCompanyShare = completedOrders.reduce((sum, o) => {
      if (o.net !== null && o.companyPercentage) return sum + (o.net * o.companyPercentage / 100);
      return sum;
    }, 0);
    const totalTechnicianShare = completedOrders.reduce((sum, o) => {
      if (o.net !== null && o.technicianPercentage) return sum + (o.net * o.technicianPercentage / 100);
      return sum;
    }, 0);

    res.json({
      orders: formattedOrders,
      summary: {
        totalOrders: orders.length,
        completedOrders: completedOrders.length,
        totalRevenue,
        totalExpenses,
        totalNet,
        totalCompanyShare,
        totalTechnicianShare,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error getting orders report");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reports/technicians", async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const dateConditions = [];
    if (dateFrom) dateConditions.push(gte(ordersTable.createdAt, new Date(String(dateFrom))));
    if (dateTo) {
      const toDate = new Date(String(dateTo));
      toDate.setHours(23, 59, 59, 999);
      dateConditions.push(lte(ordersTable.createdAt, toDate));
    }

    const techs = await db.select().from(techniciansTable);

    const techReports = await Promise.all(techs.map(async (tech) => {
      const conditions = [eq(ordersTable.technicianId, tech.id), ...dateConditions];
      const orders = await db.select().from(ordersTable).where(and(...conditions));
      const completedOrders = orders.filter(o => o.status === "completed");
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.cost ? Number(o.cost) : 0), 0);
      const totalExpenses = completedOrders.reduce((sum, o) => sum + (o.expenses ? Number(o.expenses) : 0), 0);
      const totalNet = totalRevenue - totalExpenses;
      const techShare = completedOrders.reduce((sum, o) => {
        const cost = o.cost ? Number(o.cost) : 0;
        const exp = o.expenses ? Number(o.expenses) : 0;
        const net = cost - exp;
        const pct = o.technicianPercentage ? Number(o.technicianPercentage) : 0;
        return sum + (net * pct / 100);
      }, 0);

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        totalOrders: orders.length,
        completedOrders: completedOrders.length,
        totalRevenue,
        totalExpenses,
        totalNet,
        technicianShare: techShare,
      };
    }));

    const summary = {
      totalRevenue: techReports.reduce((s, t) => s + t.totalRevenue, 0),
      totalExpenses: techReports.reduce((s, t) => s + t.totalExpenses, 0),
      totalNet: techReports.reduce((s, t) => s + t.totalNet, 0),
      totalCompanyShare: 0,
      totalTechnicianShare: techReports.reduce((s, t) => s + t.technicianShare, 0),
    };

    res.json({ technicians: techReports, summary });
  } catch (err) {
    req.log.error({ err }, "Error getting technicians report");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
