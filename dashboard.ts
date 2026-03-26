import { Router, type IRouter } from "express";
import { db, ordersTable, techniciansTable, customersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/stats", async (req, res) => {
  try {
    const [orderStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        inProgress: sql<number>`count(*) filter (where status = 'in_progress')::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where status = 'cancelled')::int`,
      })
      .from(ordersTable);

    const [techStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where is_active = true)::int`,
      })
      .from(techniciansTable);

    const [customerStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
      })
      .from(customersTable);

    const ordersByAppliance = await db
      .select({
        applianceType: ordersTable.applianceType,
        count: sql<number>`count(*)::int`,
      })
      .from(ordersTable)
      .groupBy(ordersTable.applianceType);

    const recentOrders = await db
      .select()
      .from(ordersTable)
      .orderBy(sql`${ordersTable.createdAt} DESC`)
      .limit(5);

    res.json({
      totalOrders: orderStats?.total ?? 0,
      pendingOrders: orderStats?.pending ?? 0,
      inProgressOrders: orderStats?.inProgress ?? 0,
      completedOrders: orderStats?.completed ?? 0,
      cancelledOrders: orderStats?.cancelled ?? 0,
      totalTechnicians: techStats?.total ?? 0,
      activeTechnicians: techStats?.active ?? 0,
      totalCustomers: customerStats?.total ?? 0,
      ordersByAppliance,
      recentOrders: recentOrders.map((o) => ({
        ...o,
        cost: o.cost !== null ? Number(o.cost) : null,
        technicianName: null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
