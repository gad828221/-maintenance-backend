import { Router, type IRouter } from "express";
import { db, ordersTable, techniciansTable } from "@workspace/db";
import { eq, sql, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `MG-${year}${month}${day}-${random}`;
}

async function formatOrder(order: typeof ordersTable.$inferSelect) {
  let technicianName: string | null = null;
  if (order.technicianId) {
    const [tech] = await db
      .select({ name: techniciansTable.name })
      .from(techniciansTable)
      .where(eq(techniciansTable.id, order.technicianId));
    technicianName = tech?.name ?? null;
  }
  const cost = order.cost !== null ? Number(order.cost) : null;
  const expenses = order.expenses !== null ? Number(order.expenses) : null;
  const net = cost !== null ? cost - (expenses ?? 0) : null;
  return {
    ...order,
    cost,
    expenses,
    net,
    companyPercentage: order.companyPercentage !== null ? Number(order.companyPercentage) : null,
    technicianPercentage: order.technicianPercentage !== null ? Number(order.technicianPercentage) : null,
    technicianName,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.get("/orders", async (req, res) => {
  try {
    const { status, applianceType, technicianId, dateFrom, dateTo } = req.query;
    const conditions = [];
    if (status) conditions.push(eq(ordersTable.status, String(status)));
    if (applianceType) conditions.push(eq(ordersTable.applianceType, String(applianceType)));
    if (technicianId) conditions.push(eq(ordersTable.technicianId, Number(technicianId)));
    if (dateFrom) conditions.push(gte(ordersTable.createdAt, new Date(String(dateFrom))));
    if (dateTo) {
      const toDate = new Date(String(dateTo));
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(ordersTable.createdAt, toDate));
    }

    const orders = conditions.length > 0
      ? await db.select().from(ordersTable).where(and(...conditions)).orderBy(sql`${ordersTable.createdAt} DESC`)
      : await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} DESC`);

    const formatted = await Promise.all(orders.map(formatOrder));
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Error listing orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(await formatOrder(order));
  } catch (err) {
    req.log.error({ err }, "Error getting order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const {
      customerId, serialNumber, customerName, customerPhone, customerAddress,
      applianceType, applianceBrand, problemDescription, technicianId,
      scheduledDate, cost, expenses, companyPercentage, technicianPercentage, notes,
    } = req.body;

    if (!customerName || !customerPhone || !customerAddress || !applianceType || !applianceBrand || !problemDescription) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let orderNumber = generateOrderNumber();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber));
      if (existing.length === 0) break;
      orderNumber = generateOrderNumber();
      attempts++;
    }

    const [order] = await db.insert(ordersTable).values({
      orderNumber,
      serialNumber: serialNumber ?? null,
      customerId: customerId ?? null,
      customerName,
      customerPhone,
      customerAddress,
      applianceType,
      applianceBrand,
      problemDescription,
      status: "pending",
      technicianId: technicianId ?? null,
      scheduledDate: scheduledDate ?? null,
      cost: cost !== undefined && cost !== null ? String(cost) : null,
      expenses: expenses !== undefined && expenses !== null ? String(expenses) : null,
      companyPercentage: companyPercentage !== undefined && companyPercentage !== null ? String(companyPercentage) : null,
      technicianPercentage: technicianPercentage !== undefined && technicianPercentage !== null ? String(technicianPercentage) : null,
      notes: notes ?? null,
    }).returning();

    res.status(201).json(await formatOrder(order));
  } catch (err) {
    req.log.error({ err }, "Error creating order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      serialNumber, status, technicianId, scheduledDate, completionDate,
      cost, expenses, companyPercentage, technicianPercentage, notes,
      customerName, customerPhone, customerAddress,
      applianceType, applianceBrand, problemDescription,
    } = req.body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (status !== undefined) updateData.status = status;
    if (technicianId !== undefined) updateData.technicianId = technicianId;
    if (scheduledDate !== undefined) updateData.scheduledDate = scheduledDate;
    if (completionDate !== undefined) updateData.completionDate = completionDate;
    if (cost !== undefined) updateData.cost = cost !== null ? String(cost) : null;
    if (expenses !== undefined) updateData.expenses = expenses !== null ? String(expenses) : null;
    if (companyPercentage !== undefined) updateData.companyPercentage = companyPercentage !== null ? String(companyPercentage) : null;
    if (technicianPercentage !== undefined) updateData.technicianPercentage = technicianPercentage !== null ? String(technicianPercentage) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (customerAddress !== undefined) updateData.customerAddress = customerAddress;
    if (applianceType !== undefined) updateData.applianceType = applianceType;
    if (applianceBrand !== undefined) updateData.applianceBrand = applianceBrand;
    if (problemDescription !== undefined) updateData.problemDescription = problemDescription;

    const [order] = await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, id)).returning();
    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json(await formatOrder(order));
  } catch (err) {
    req.log.error({ err }, "Error updating order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    res.json({ success: true, message: "Order deleted successfully" });
  } catch (err) {
    req.log.error({ err }, "Error deleting order");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
