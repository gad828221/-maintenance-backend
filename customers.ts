import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/customers", async (req, res) => {
  try {
    const customers = await db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        phone: customersTable.phone,
        address: customersTable.address,
        createdAt: customersTable.createdAt,
      })
      .from(customersTable)
      .orderBy(customersTable.createdAt);

    const { ordersTable } = await import("@workspace/db");
    const ordersCountResult = await db
      .select({
        customerId: ordersTable.customerId,
        count: sql<number>`count(*)::int`,
      })
      .from(ordersTable)
      .groupBy(ordersTable.customerId);

    const orderCountMap = new Map(
      ordersCountResult.map((r) => [r.customerId, r.count])
    );

    const result = customers.map((c) => ({
      ...c,
      totalOrders: orderCountMap.get(c.id) ?? 0,
      createdAt: c.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing customers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name || !phone || !address) {
      return res.status(400).json({ error: "name, phone, and address are required" });
    }
    const [customer] = await db
      .insert(customersTable)
      .values({ name, phone, address })
      .returning();
    res.status(201).json({
      ...customer,
      totalOrders: 0,
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating customer");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, phone, address } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    updateData.updatedAt = new Date();

    const [customer] = await db
      .update(customersTable)
      .set(updateData)
      .where(eq(customersTable.id, id))
      .returning();

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const { ordersTable } = await import("@workspace/db");
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(eq(ordersTable.customerId, id));

    res.json({
      ...customer,
      totalOrders: countResult?.count ?? 0,
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error updating customer");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.json({ success: true, message: "Customer deleted successfully" });
  } catch (err) {
    req.log.error({ err }, "Error deleting customer");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
