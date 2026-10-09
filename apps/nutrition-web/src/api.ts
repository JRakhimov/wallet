/** Nutrition API: response types and requests. */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiUrl, authHeaders, request } from "@ui/lib/api-client";

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "high" | "very_high";
export type Goal = "lose" | "maintain" | "gain";

export type DailyTargets = { kcal: number; proteinG: number; fatG: number; carbsG: number };

/** Body data entered by the owner (PUT /nutrition/profile). */
export type BodyData = {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  deficitPercent: number;
  surplusPercent: number;
};

export type NutritionProfile = BodyData & {
  age: number;
  /** Calories burned per day at complete rest. */
  bmr: number;
  /** Calories burned per day with activity. */
  tdee: number;
  /** Set when the goal's calories were raised to a safe floor. */
  limitedBy: "bmr" | "minimum" | null;
  calculated: DailyTargets;
  /** Effective targets: manual values where set, calculated otherwise. */
  targets: DailyTargets;
  overridden: Record<keyof DailyTargets, boolean>;
};

/** Manual targets; `null` returns a target to the calculated value. */
export type TargetOverrides = Record<keyof DailyTargets, number | null>;

export const PROFILE_QUERY_KEY = ["nutrition", "profile"];

export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () =>
      (await request<{ profile: NutritionProfile | null }>("/nutrition/profile")).profile,
    enabled,
  });
}

/** Returns a function that runs a profile request and puts the result into the cache. */
export function useProfileUpdate() {
  const queryClient = useQueryClient();
  return async (send: () => Promise<NutritionProfile>) => {
    const profile = await send();
    queryClient.setQueryData(PROFILE_QUERY_KEY, profile);
    return profile;
  };
}

export function saveBodyData(data: BodyData) {
  return request<NutritionProfile>("/nutrition/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function saveTargets(targets: TargetOverrides) {
  return request<NutritionProfile>("/nutrition/profile/targets", {
    method: "PUT",
    body: JSON.stringify(targets),
  });
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export type Confidence = "low" | "medium" | "high";

export type MealItem = {
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** From the LLM; null for items entered by hand. */
  confidence: Confidence | null;
};

export type Totals = Pick<MealItem, "kcal" | "proteinG" | "fatG" | "carbsG">;

export type Meal = {
  id: string;
  eatenAt: string;
  source: "photo" | "text";
  /**
   * Analyzing: the model is working. Failed: see `error`. Draft: recognized, not reviewed yet.
   * Confirmed: part of the diary.
   */
  status: "analyzing" | "failed" | "draft" | "confirmed";
  /** Owner-facing reason when status is failed. */
  error: string;
  comment: string;
  photoId: string | null;
  totals: Totals;
  items: MealItem[];
  assumptions: string[];
  questions: string[];
};

export type Day = { date: string; totals: Totals; meals: Meal[] };

export const dayQueryKey = (date: string) => ["nutrition", "day", date];

export function useDay(date: string) {
  return useQuery({
    queryKey: dayQueryKey(date),
    queryFn: () => request<Day>(`/nutrition/days/${date}`),
  });
}

export type DaySummary = { date: string; mealCount: number; totals: Totals };

export const historyQueryKey = (month: string) => ["nutrition", "history", month];

/** Totals per day of a month (YYYY-MM), newest day first. */
export function useHistory(month: string) {
  return useQuery({
    queryKey: historyQueryKey(month),
    queryFn: () => request<{ month: string; days: DaySummary[] }>(`/nutrition/history/${month}`),
  });
}

export const PENDING_MEALS_KEY = ["nutrition", "pending"];
const PENDING_POLL_MS = 2000;

/**
 * Meals that are not in the diary yet: being recognized, failed, or waiting for review.
 * Polls while the model is working, so the card turns into a draft by itself.
 */
export function usePendingMealList(enabled: boolean) {
  return useQuery({
    queryKey: PENDING_MEALS_KEY,
    queryFn: async () => (await request<{ meals: Meal[] }>("/nutrition/meals/pending")).meals,
    enabled,
    refetchInterval: (query) =>
      query.state.data?.some((meal) => meal.status === "analyzing") ? PENDING_POLL_MS : false,
  });
}

export function retryMeal(id: string) {
  return request<Meal>(`/nutrition/meals/${id}/retry`, { method: "POST" });
}

/** What the owner sends for recognition; the photo is already resized (see lib/image.ts). */
export type MealInput = {
  comment: string;
  eatenAt: string;
  photo?: { full: Blob; thumbnail: Blob };
};

/** Uploads a meal for recognition; it comes back as "analyzing". `idempotencyKey` makes retries safe. */
export function analyzeMeal(input: MealInput, idempotencyKey: string) {
  const form = new FormData();
  form.append("comment", input.comment);
  form.append("eatenAt", input.eatenAt);
  if (input.photo) {
    form.append("photo", input.photo.full, "meal.jpg");
    form.append("thumbnail", input.photo.thumbnail, "meal.thumb.jpg");
  }
  return request<Meal>("/nutrition/meals/analyze", {
    method: "POST",
    body: form,
    key: idempotencyKey,
  });
}

export function reanalyzeMeal(id: string, clarification: string) {
  return request<Meal>(`/nutrition/meals/${id}/reanalyze`, {
    method: "POST",
    body: JSON.stringify({ clarification }),
  });
}

export type SaveMealInput = { eatenAt: string; comment: string; items: MealItem[] };

/** Saves reviewed items; a draft becomes part of the diary. */
export function saveMeal(id: string, input: SaveMealInput) {
  return request<Meal>(`/nutrition/meals/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteMeal(id: string) {
  return request<{ ok: true }>(`/nutrition/meals/${id}`, { method: "DELETE" });
}

/**
 * Object URL of a meal photo. <img> cannot send the auth header, so the photo is fetched
 * with it; the URL is not persisted because it is only valid in this page session.
 */
export function usePhotoUrl(photoId: string | null, size: "thumb" | "full") {
  return useQuery({
    queryKey: ["nutrition", "photo", photoId, size],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/nutrition/photos/${photoId}?size=${size}`), {
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error("Не удалось загрузить фото");
      }
      return URL.createObjectURL(await response.blob());
    },
    enabled: Boolean(photoId),
    staleTime: Infinity,
    meta: { persist: false },
  });
}
