import { DateTime } from "luxon";
import { z } from "zod/v4";
import { month as monthSchema } from "../../common/validation/schemas";
import { MealView } from "../../nutrition/meals/meal.view";
import { MealsService } from "../../nutrition/meals/meals.service";
import { DailyTargets } from "../../nutrition/profile/energy";
import { ProfileService } from "../../nutrition/profile/profile.service";
import { weightSchema } from "../../nutrition/weight/dto/weight.dto";
import { WeightService } from "../../nutrition/weight/weight.service";
import { workoutSchema } from "../../nutrition/workouts/dto/workout.dto";
import { WorkoutsService } from "../../nutrition/workouts/workouts.service";
import { dayLabel, formatAmount, formatChange } from "../format";
import {
  checkId,
  dayOf,
  defineAction,
  defineTool,
  fields,
  monthOf,
  pastMoment,
  ToolContext,
  ToolError,
  Toolset,
  validate,
} from "./tool";

export type NutritionDeps = {
  meals: Pick<MealsService, "day" | "history" | "recordNow" | "get" | "remove">;
  workouts: Pick<WorkoutsService, "create" | "get" | "remove">;
  weight: Pick<WeightService, "list" | "record" | "remove">;
  profile: Pick<ProfileService, "get">;
};

type Totals = MealView["totals"];

/** Weigh-ins the model gets at most: enough for a trend, cheap in tokens. */
const WEIGHT_ENTRIES = 90;
const MAX_MEAL_TEXT = 1000;
const MAX_WORKOUT_MINUTES = 24 * 60;
const NO_PROFILE = "Профиль питания не заполнен: его заполняют в приложении «Питание»";

/** The food diary, workouts, weight and the daily targets. */
export function nutritionTools(deps: NutritionDeps): Toolset {
  return {
    tools: [
      nutritionDay(deps),
      nutritionHistory(deps),
      weightHistory(deps),
      nutritionProfile(deps),
      logMeal(deps),
      addWorkout(deps),
      recordWeight(deps),
      deleteMeal(deps),
      deleteWorkout(deps),
      deleteWeight(deps),
    ],
    actions: nutritionActions(deps),
  };
}

function nutritionActions(deps: NutritionDeps) {
  return {
    undo_meal: defineAction<{ id: string }>(async (ownerId, payload) => {
      await deps.meals.remove(ownerId, payload.id);

      return "↩️ Приём пищи удалён";
    }),

    delete_meal: defineAction<{ id: string }>(async (ownerId, payload) => {
      await deps.meals.remove(ownerId, payload.id);

      return "🗑 Приём пищи удалён";
    }),

    undo_workout: defineAction<{ id: string }>(async (ownerId, payload) => {
      await deps.workouts.remove(ownerId, payload.id);

      return "↩️ Тренировка удалена";
    }),

    delete_workout: defineAction<{ id: string }>(async (ownerId, payload) => {
      await deps.workouts.remove(ownerId, payload.id);

      return "🗑 Тренировка удалена";
    }),

    undo_weight: defineAction<{ date: string; previousKg: number | null }>(
      async (ownerId, payload) => {
        if (payload.previousKg !== null) {
          await deps.weight.record(ownerId, { date: payload.date, weightKg: payload.previousKg });

          return `↩️ Вес возвращён: ${formatAmount(payload.previousKg)} кг`;
        }

        await removeWeighIn(deps, ownerId, payload.date);

        return "↩️ Запись веса удалена";
      },
    ),

    delete_weight: defineAction<{ date: string }>(async (ownerId, payload) => {
      await removeWeighIn(deps, ownerId, payload.date);

      return "🗑 Запись веса удалена";
    }),
  };
}

function nutritionDay(deps: NutritionDeps) {
  return defineTool({
    name: "nutrition_day",
    description:
      "The food diary of a day: meals with dishes, calories and macros eaten, the daily targets, what is left to eat, and workouts with calories burned (they do not change the targets).",
    parameters: z.strictObject({ date: fields.date }),

    async run(context, args) {
      const date = dayOf(context, args.date);

      return dayReport(deps, context, date);
    },
  });
}

function nutritionHistory(deps: NutritionDeps) {
  return defineTool({
    name: "nutrition_history",
    description:
      "Calories and macros eaten per day of a month, number of meals and calories burned in workouts, with the daily calorie target.",
    parameters: z.strictObject({ month: fields.month }),

    async run(context, args) {
      const month = validate(monthSchema, monthOf(context, args.month));

      const [history, profile] = await Promise.all([
        deps.meals.history(context.ownerId, month),
        deps.profile.get(context.ownerId),
      ]);

      return { ...history, targetKcal: profile?.targets.kcal ?? null };
    },
  });
}

function weightHistory(deps: NutritionDeps) {
  return defineTool({
    name: "weight_history",
    description: `Body weight log, oldest first (the last ${WEIGHT_ENTRIES} weigh-ins), the current weight and its change over 7 and 30 days.`,
    parameters: z.strictObject({}),

    async run(context) {
      const weight = await deps.weight.list(context.ownerId);

      return {
        current: weight.current,
        change7: weight.change7,
        change30: weight.change30,
        entries: weight.entries
          .slice(-WEIGHT_ENTRIES)
          .map(({ date, weightKg }) => ({ date, weightKg })),
      };
    },
  });
}

function nutritionProfile(deps: NutritionDeps) {
  return defineTool({
    name: "nutrition_profile",
    description:
      "Body data, goal (lose, maintain or gain weight) and the daily targets of calories, protein, fat and carbohydrates.",
    parameters: z.strictObject({}),

    async run(context) {
      const profile = await deps.profile.get(context.ownerId);
      if (!profile) {
        return { profile: null, hint: NO_PROFILE };
      }

      return {
        sex: profile.sex,
        age: profile.age,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
        tdee: profile.tdee,
        targets: profile.targets,
      };
    },
  });
}

function logMeal(deps: NutritionDeps) {
  return defineTool({
    name: "log_meal",
    description:
      "Recognizes what was eaten from the description and/or the attached photo and saves it to the food diary right away (the user can undo it). Use it whenever the user tells or shows what they ate.",
    parameters: z.strictObject({
      description: z
        .string()
        .describe(
          "Dishes and portions in the user's words, e.g. «плов, примерно 300 г, чай без сахара»",
        ),
      usePhoto: z.boolean().describe("true to recognize the photo attached to this message"),
      date: fields.date,
      time: fields.time,
    }),

    async run(context, args) {
      if (args.usePhoto && !context.photo) {
        throw new ToolError("К этому сообщению не приложено фото");
      }

      const comment = args.description.trim().slice(0, MAX_MEAL_TEXT);
      if (!comment && !args.usePhoto) {
        throw new ToolError("Опишите, что было съедено");
      }

      const eatenAt = pastMoment(context, args.date, args.time);
      const upload = args.usePhoto && context.photo ? context.photo : null;

      const meal = await deps.meals.recordNow(
        context.ownerId,
        {
          comment,
          eatenAt: eatenAt.toJSDate(),
          upload: upload && { photo: upload.full, thumbnail: upload.thumbnail },
        },
        context.nextKey(),
      );

      const dishes = meal.items.map((item) => `${item.name} ${formatAmount(item.grams)} г`);
      const recorded = `🍽 Записал: ${dishes.join(", ")} — ${formatTotals(meal.totals)}`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_meal",
        payload: { id: meal.id },
        summary: recorded,
        label: meal.items[0]?.name ?? "еда",
      });

      const today = await dayReport(deps, context, eatenAt.toISODate()!);

      return {
        recorded,
        assumptions: meal.assumptions,
        day: { eaten: today.eaten, targets: today.targets, left: today.left },
      };
    },
  });
}

function addWorkout(deps: NutritionDeps) {
  return defineTool({
    name: "add_workout",
    description:
      "Records a workout with the calories burned right away (the user can undo it). The calories come from the user or their watch.",
    parameters: z.strictObject({
      kcal: z.number().describe("Kilocalories burned"),
      minutes: z.number().nullable().describe("Length in minutes, when said"),
      note: z.string().describe("Kind of workout, 1-3 lowercase words, e.g. «бег»"),
      date: fields.date,
      time: fields.time,
    }),

    async run(context, args) {
      const performedAt = pastMoment(context, args.date, args.time);
      const minutes = args.minutes === null ? null : Math.round(args.minutes);

      const input = validate(workoutSchema, {
        performedAt: performedAt.toISO(),
        kcal: Math.round(args.kcal),
        durationMin: minutes && minutes >= 1 && minutes <= MAX_WORKOUT_MINUTES ? minutes : null,
        note: args.note.trim().slice(0, 100),
      });

      const workout = await deps.workouts.create(context.ownerId, input, context.nextKey());

      const kind = workout.note ? `Тренировка (${workout.note})` : "Тренировка";
      const duration = workout.durationMin ? ` · ${workout.durationMin} мин` : "";
      const recorded = `${kind}: ${formatAmount(workout.kcal)} ккал${duration} записана`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_workout",
        payload: { id: workout.id },
        summary: recorded,
        label: workout.note || "тренировка",
      });

      return { recorded, workoutId: workout.id };
    },
  });
}

function recordWeight(deps: NutritionDeps) {
  return defineTool({
    name: "record_weight",
    description:
      "Records the body weight of a day right away; a second weigh-in on the same day replaces the first. The latest weigh-in becomes the profile weight and the targets follow it.",
    parameters: z.strictObject({
      kg: z.number().describe("Kilograms with up to one decimal, e.g. 82.4"),
      date: fields.date,
    }),

    async run(context, args) {
      const date = dayOf(context, args.date);
      if (date > context.now.toISODate()!) {
        throw new ToolError("Дата не может быть в будущем");
      }

      const input = validate(weightSchema, { date, weightKg: Math.round(args.kg * 10) / 10 });
      const before = (await deps.weight.list(context.ownerId)).entries.find(
        (entry) => entry.date === date,
      );

      const summary = await deps.weight.record(context.ownerId, input);

      const day = date === context.now.toISODate() ? "" : ` за ${dayLabel(date, context.now)}`;
      const change =
        summary.change7 === null ? "" : ` · ${formatChange(summary.change7)} за неделю`;
      const recorded = `Вес ${formatAmount(input.weightKg)} кг${day} записан${change}`;

      context.recorded.push(recorded);
      context.offer({
        kind: "undo",
        action: "undo_weight",
        payload: { date, previousKg: before?.weightKg ?? null },
        summary: recorded,
        label: `вес ${formatAmount(input.weightKg)} кг`,
      });

      return {
        recorded,
        current: summary.current,
        change7: summary.change7,
        change30: summary.change30,
      };
    },
  });
}

function deleteMeal(deps: NutritionDeps) {
  return defineTool({
    name: "delete_meal",
    description:
      "Deletes a meal found with nutrition_day. Nothing is deleted until the user taps «Подтвердить».",
    parameters: z.strictObject({ mealId: z.string() }),

    async run(context, args) {
      const meal = await deps.meals.get(context.ownerId, checkId(args.mealId, "приём пищи"));

      const eatenAt = DateTime.fromISO(meal.eatenAt).setZone(context.timezone);
      const dishes = meal.items.map((item) => item.name).join(", ") || meal.comment;
      const when = `${dayLabel(eatenAt.toISODate()!, context.now)} в ${eatenAt.toFormat("HH:mm")}`;
      const summary = `Удалить приём пищи ${when}: ${dishes} — ${formatAmount(meal.totals.kcal)} ккал?`;

      context.offer({
        kind: "confirm",
        action: "delete_meal",
        payload: { id: meal.id },
        summary,
        label: "удалить еду",
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

function deleteWorkout(deps: NutritionDeps) {
  return defineTool({
    name: "delete_workout",
    description:
      "Deletes a workout found with nutrition_day. Nothing is deleted until the user taps «Подтвердить».",
    parameters: z.strictObject({ workoutId: z.string() }),

    async run(context, args) {
      const workout = await deps.workouts.get(
        context.ownerId,
        checkId(args.workoutId, "тренировка"),
      );

      const performedAt = DateTime.fromISO(workout.performedAt).setZone(context.timezone);
      const note = workout.note ? ` (${workout.note})` : "";
      const summary = `Удалить тренировку ${dayLabel(performedAt.toISODate()!, context.now)}${note}: ${formatAmount(workout.kcal)} ккал?`;

      context.offer({
        kind: "confirm",
        action: "delete_workout",
        payload: { id: workout.id },
        summary,
        label: "удалить тренировку",
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

function deleteWeight(deps: NutritionDeps) {
  return defineTool({
    name: "delete_weight",
    description:
      "Deletes the weigh-in of a day. Nothing is deleted until the user taps «Подтвердить».",
    parameters: z.strictObject({ date: z.string().describe("yyyy-MM-dd of the weigh-in") }),

    async run(context, args) {
      const date = dayOf(context, args.date);
      const entry = (await deps.weight.list(context.ownerId)).entries.find(
        (item) => item.date === date,
      );
      if (!entry) {
        throw new ToolError("За этот день вес не записан");
      }

      const summary = `Удалить вес ${formatAmount(entry.weightKg)} кг за ${dayLabel(date, context.now)}?`;

      context.offer({
        kind: "confirm",
        action: "delete_weight",
        payload: { date },
        summary,
        label: "удалить вес",
      });

      return { status: "waiting_for_confirmation", summary };
    },
  });
}

/** A day of the diary with targets and what is left; shared by nutrition_day and log_meal. */
async function dayReport(deps: NutritionDeps, context: ToolContext, date: string) {
  const [day, profile] = await Promise.all([
    deps.meals.day(context.ownerId, date),
    deps.profile.get(context.ownerId),
  ]);

  const timeOf = (iso: string) => DateTime.fromISO(iso).setZone(context.timezone).toFormat("HH:mm");

  return {
    date: day.date,
    eaten: day.totals,
    targets: profile?.targets ?? null,
    left: profile ? leftOf(profile.targets, day.totals) : null,
    burnedKcal: day.burnedKcal,
    meals: day.meals.map((meal) => ({
      id: meal.id,
      time: timeOf(meal.eatenAt),
      comment: meal.comment,
      totals: meal.totals,
      items: meal.items.map(({ name, grams, kcal }) => ({ name, grams, kcal })),
    })),
    workouts: day.workouts.map((workout) => ({
      id: workout.id,
      time: timeOf(workout.performedAt),
      kcal: workout.kcal,
      durationMin: workout.durationMin,
      note: workout.note,
    })),
    ...(!profile && { hint: NO_PROFILE }),
  };
}

/** Targets minus what was eaten; negative means over the target. */
function leftOf(targets: DailyTargets, eaten: Totals) {
  const left = (key: keyof Totals) => Math.round((targets[key] - eaten[key]) * 10) / 10;

  return {
    kcal: left("kcal"),
    proteinG: left("proteinG"),
    fatG: left("fatG"),
    carbsG: left("carbsG"),
  };
}

/** "640 ккал (Б 25 · Ж 30 · У 70)". */
function formatTotals(totals: Totals) {
  const macros = [
    `Б ${formatAmount(totals.proteinG)}`,
    `Ж ${formatAmount(totals.fatG)}`,
    `У ${formatAmount(totals.carbsG)}`,
  ];

  return `${formatAmount(totals.kcal)} ккал (${macros.join(" · ")})`;
}

async function removeWeighIn(deps: NutritionDeps, ownerId: string, date: string) {
  const entry = (await deps.weight.list(ownerId)).entries.find((item) => item.date === date);
  if (entry) {
    await deps.weight.remove(ownerId, entry.id);
  }
}
