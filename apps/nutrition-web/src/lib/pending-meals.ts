import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  analyzeMeal,
  deleteMeal,
  Meal,
  MealInput,
  PENDING_MEALS_KEY,
  retryMeal,
  usePendingMealList,
} from "../api";

/** A meal that is not in the diary yet, as the diary list shows it. */
export type PendingMeal = {
  id: string;
  status: "analyzing" | "ready" | "failed";
  eatenAt: string;
  photoId: string | null;
  /** Object URL of the local photo thumbnail while the upload is in flight. */
  preview: string | null;
  error: string;
  /** The server's meal; null until the upload has reached the server. */
  meal: Meal | null;
};

export type PendingMeals = ReturnType<typeof usePendingMeals>;

/** A meal on its way to the server. Only photos and text from this session live here. */
type Upload = { id: string; input: MealInput; preview: string | null; error: string };

const STATUSES: Record<Meal["status"], PendingMeal["status"]> = {
  analyzing: "analyzing",
  failed: "failed",
  draft: "ready",
  confirmed: "ready",
};

/**
 * Meals waiting for recognition or review. The server owns their state (so it survives a
 * reload); this hook only adds what the server cannot know yet: meals still uploading.
 */
export function usePendingMeals(enabled: boolean) {
  const queryClient = useQueryClient();
  const serverMeals = usePendingMealList(enabled);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: PENDING_MEALS_KEY });

  function patchUpload(id: string, changes: Partial<Upload>) {
    setUploads((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function dropUpload(upload: Upload) {
    if (upload.preview) {
      URL.revokeObjectURL(upload.preview);
    }
    setUploads((list) => list.filter((item) => item.id !== upload.id));
  }

  async function send(upload: Upload) {
    patchUpload(upload.id, { error: "" });
    try {
      // The id doubles as the idempotency key, so a retry never creates a second meal.
      await analyzeMeal(upload.input, upload.id);
      await refresh();
      dropUpload(upload);
    } catch (e) {
      patchUpload(upload.id, {
        error: e instanceof Error ? e.message : "Не удалось отправить приём пищи",
      });
    }
  }

  function start(input: MealInput) {
    const upload: Upload = {
      id: crypto.randomUUID(),
      input,
      preview: input.photo ? URL.createObjectURL(input.photo.thumbnail) : null,
      error: "",
    };
    setUploads((list) => [upload, ...list]);
    void send(upload);
  }

  const pending: PendingMeal[] = [
    ...uploads.map((upload) => ({
      id: upload.id,
      status: upload.error ? ("failed" as const) : ("analyzing" as const),
      eatenAt: upload.input.eatenAt,
      photoId: null,
      preview: upload.preview,
      error: upload.error,
      meal: null,
    })),
    ...(serverMeals.data ?? []).map((meal) => ({
      id: meal.id,
      status: STATUSES[meal.status],
      eatenAt: meal.eatenAt,
      photoId: meal.photoId,
      preview: null,
      error: meal.error,
      meal,
    })),
  ];

  async function retry(entry: PendingMeal) {
    const upload = uploads.find((item) => item.id === entry.id);
    if (upload) {
      return send(upload);
    }
    if (entry.meal) {
      await retryMeal(entry.meal.id).catch(() => undefined);
      await refresh();
    }
  }

  /** Removes the card and deletes the meal on the server (best effort for drafts). */
  async function dismiss(entry: PendingMeal) {
    const upload = uploads.find((item) => item.id === entry.id);
    if (upload) {
      dropUpload(upload);
      return;
    }
    queryClient.setQueryData<Meal[]>(PENDING_MEALS_KEY, (list) =>
      list?.filter((meal) => meal.id !== entry.id),
    );
    await deleteMeal(entry.id).catch(() => undefined);
    await refresh();
  }

  /** A correction produced a new version of the draft. */
  function update(meal: Meal) {
    queryClient.setQueryData<Meal[]>(PENDING_MEALS_KEY, (list) =>
      list?.map((item) => (item.id === meal.id ? meal : item)),
    );
  }

  return { pending, start, retry, dismiss, update, refresh };
}
