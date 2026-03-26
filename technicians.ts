import { Router, type IRouter } from "express";
import { db, techniciansTable, ordersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/technicians", async (req, res) => {
  try {
    const technicians = await db
      .select()
      .from(techniciansTable)
      .orderBy(techniciansTable.createdAt);

    const activeOrdersResult = await db
      .select({
        technicianId: ordersTable.technicianId,
        count: sql<number>`count(*)::int`,
      })
      .from(ordersTable)
      .where(
        sql`${ordersTable.status} IN ('pending', 'in_progress') AND ${ordersTable.technicianId} IS NOT NULL`
      )
      .groupBy(ordersTable.technicianId);

    const completedOrdersResult = await db
      .select({
        technicianId: ordersTable.technicianId,
        count: sql<number>`count(*)::int`,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.status, "completed"),
          sql`${ordersTable.technicianId} IS NOT NULL`
        )
      )
      .groupBy(ordersTable.technicianId);

    const activeMap = new Map(
      activeOrdersResult.map((r) => [r.technicianId, r.count])
    );
    const completedMap = new Map(
      completedOrdersResult.map((r) => [r.technicianId, r.count])
    );

    const result = technicians.map((t) => ({
      ...t,
      activeOrdersCount: activeMap.get(t.id) ?? 0,
      completedOrdersCount: completedMap.get(t.id) ?? 0,
      createdAt: t.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing technicians");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/technicians", async (req, res) => {
  try {
    const { name, phone, specialization, isActive } = req.body;
    if (!name || !phone || !specialization) {
      return res
        .status(400)
        .json({ error: "name, phone, and specialization are required" });
    }
    const [technician] = await db
      .insert(techniciansTable)
      .values({
        name,
        phone,
        specialization,
        isActive: isActive !== undefined ? isActive : true,
      })
      .returning();
    res.status(201).json({
      ...technician,
      activeOrdersCount: 0,
      completedOrdersCount: 0,
      createdAt: technician.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating technician");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/technicians/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, phone, specialization, isActive } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (specialization !== undefined) updateData.specialization = specialization;
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedAt = new Date();

    const [technician] = await db
      .update(techniciansTable)
      .set(updateData)
      .where(eq(techniciansTable.id, id))
      .returning();

    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }

    const [activeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.technicianId, id),
          sql`${ordersTable.status} IN ('pending', 'in_progress')`
        )
      );

    const [completedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.technicianId, id),
          eq(ordersTable.status, "completed")
        )
      );

    res.json({
      ...technician,
      activeOrdersCount: activeCount?.count ?? 0,
      completedOrdersCount: completedCount?.count ?? 0,
      createdAt: technician.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating technician");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/technicians/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(techniciansTable).where(eq(techniciansTable.id, id));
    res.json({ success: true, message: "Technician deleted successfully" });
  } catch (err) {
    req.log.error({ err }, "Error deleting technician");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
