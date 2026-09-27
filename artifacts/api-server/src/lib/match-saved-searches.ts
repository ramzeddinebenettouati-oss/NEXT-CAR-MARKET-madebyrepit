import { db, savedSearchesTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createNotification } from "./notifications";
import { sendVehicleMatchEmail } from "./mailer";
import type { vehicleListingsTable } from "@workspace/db";

type Vehicle = typeof vehicleListingsTable.$inferSelect;

interface SavedSearchFilters {
  search?: string;
  condition?: string;
  fuelType?: string;
  evOnly?: boolean;
  inStock?: boolean;
  color?: string;
  priceMin?: string;
  priceMax?: string;
  yearMin?: string;
  yearMax?: string;
}

const EV_FUEL_TYPES = new Set(["electric", "hybrid", "phev"]);

function vehicleMatchesFilters(vehicle: Vehicle, filters: SavedSearchFilters): boolean {
  const { search, condition, fuelType, evOnly, inStock, color, priceMin, priceMax, yearMin, yearMax } = filters;

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    const haystack = `${vehicle.brandName} ${vehicle.modelName}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  if (condition && condition !== "all") {
    if (vehicle.condition !== condition) return false;
  }

  if (evOnly) {
    if (!EV_FUEL_TYPES.has(vehicle.fuelType)) return false;
  } else if (fuelType && fuelType !== "all") {
    if (vehicle.fuelType !== fuelType) return false;
  }

  if (inStock) {
    if ((vehicle.quantity ?? 0) <= 0) return false;
  }

  if (color && color.trim()) {
    const c = color.trim().toLowerCase();
    if (!vehicle.exteriorColor?.toLowerCase().includes(c)) return false;
  }

  const price = Number(vehicle.fobPriceUsd ?? 0);
  if (priceMin && priceMin.trim()) {
    if (price < Number(priceMin)) return false;
  }
  if (priceMax && priceMax.trim()) {
    if (price > Number(priceMax)) return false;
  }

  if (yearMin && yearMin.trim()) {
    if ((vehicle.year ?? 0) < Number(yearMin)) return false;
  }
  if (yearMax && yearMax.trim()) {
    if ((vehicle.year ?? 0) > Number(yearMax)) return false;
  }

  return true;
}

export async function matchAndNotifySavedSearches(vehicle: Vehicle): Promise<void> {
  try {
    const searches = await db
      .select()
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.notify, true));

    if (searches.length === 0) return;

    const matchingSearches = searches.filter(s =>
      vehicleMatchesFilters(vehicle, s.filters as SavedSearchFilters)
    );

    if (matchingSearches.length === 0) return;

    const userIds = [...new Set(matchingSearches.map(s => s.userId))];
    const users = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(
        userIds.length === 1
          ? eq(usersTable.id, userIds[0])
          : inArray(usersTable.id, userIds)
      );

    const userMap = new Map(users.map(u => [u.id, u.email]));

    await Promise.all(
      matchingSearches.map(async (s) => {
        const email = userMap.get(s.userId);

        await createNotification({
          userId: s.userId,
          type: "saved_search_match",
          title: `New match: ${vehicle.brandName} ${vehicle.modelName} ${vehicle.year}`,
          body: `A vehicle matching your saved search "${s.name}" is now available.`,
          vehicleId: vehicle.id,
        });

        if (email) {
          await sendVehicleMatchEmail({
            toEmail: email,
            savedSearchName: s.name,
            vehicle: {
              id: vehicle.id,
              brandName: vehicle.brandName ?? "",
              modelName: vehicle.modelName ?? "",
              year: vehicle.year ?? 0,
              condition: vehicle.condition ?? "",
              fuelType: vehicle.fuelType ?? "",
              fobPriceUsd: vehicle.fobPriceUsd ?? "0",
            },
          });
        }
      })
    );
  } catch (err) {
    console.error("[match-saved-searches] Error:", err);
  }
}
