import { Router } from "express";
import { db, countriesTable, portsTable, currenciesTable, vehicleBrandsTable, vehicleModelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/reference/countries
router.get("/reference/countries", async (_req, res) => {
  const countries = await db
    .select()
    .from(countriesTable)
    .where(eq(countriesTable.isActive, true))
    .orderBy(countriesTable.name);
  res.json(countries.map((c) => ({ id: c.id, name: c.name, code: c.code, region: c.region })));
});

// GET /api/reference/ports
router.get("/reference/ports", async (_req, res) => {
  const ports = await db
    .select()
    .from(portsTable)
    .where(eq(portsTable.isActive, true))
    .orderBy(portsTable.name);
  res.json(ports.map((p) => ({ id: p.id, name: p.name, code: p.code, city: p.city, portType: p.portType })));
});

// GET /api/reference/currencies
router.get("/reference/currencies", async (_req, res) => {
  const currencies = await db
    .select()
    .from(currenciesTable)
    .where(eq(currenciesTable.isActive, true))
    .orderBy(currenciesTable.name);
  res.json(currencies.map((c) => ({ id: c.id, name: c.name, code: c.code, symbol: c.symbol })));
});

// GET /api/reference/brands
router.get("/reference/brands", async (_req, res) => {
  const brands = await db
    .select()
    .from(vehicleBrandsTable)
    .where(eq(vehicleBrandsTable.isActive, true))
    .orderBy(vehicleBrandsTable.name);
  res.json(brands.map((b) => ({ id: b.id, name: b.name, countryOfOrigin: b.countryOfOrigin, logoUrl: b.logoUrl })));
});

// GET /api/reference/models?brandId=
router.get("/reference/models", async (req, res) => {
  const { brandId } = req.query as Record<string, string>;

  const rows = await db
    .select()
    .from(vehicleModelsTable)
    .where(
      brandId
        ? eq(vehicleModelsTable.brandId, brandId)
        : eq(vehicleModelsTable.isActive, true),
    )
    .orderBy(vehicleModelsTable.name);

  res.json(rows.map((m) => ({ id: m.id, brandId: m.brandId, name: m.name })));
});

export default router;
