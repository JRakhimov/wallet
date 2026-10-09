import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Sheet, SheetPresence } from "@ui/components/Sheet";
import { MealInput } from "../api";
import { preparePhoto, PreparedPhoto } from "../lib/image";

type Mode = "photo" | "text";

export type AddMealFlowHandle = {
  /** Opens the camera; must be called from a tap handler to be allowed by the browser. */
  startCamera: () => void;
  /** Opens the phone's photo library; same tap-handler requirement. */
  startGallery: () => void;
  startText: () => void;
};

const TITLES: Record<Mode, string> = { photo: "Фото еды", text: "Что вы съели?" };

/**
 * Collecting a meal: photo or text, comment and time. Recognition itself runs in the
 * background (see lib/pending-meals.ts), so the sheet closes as soon as the owner submits.
 */
export const AddMealFlow = forwardRef<
  AddMealFlowHandle,
  { timezone: string; onSubmit: (input: MealInput) => void }
>(function AddMealFlow({ timezone, onSubmit }, ref) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");

  useImperativeHandle(ref, () => ({
    startCamera: () => cameraInput.current?.click(),
    startGallery: () => galleryInput.current?.click(),
    startText: () => open("text"),
  }));

  useEffect(
    () => () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    },
    [preview],
  );

  function open(nextMode: Mode) {
    setMode(nextMode);
    setComment("");
    setError("");
    setTime(DateTime.now().setZone(timezone).toFormat("HH:mm"));
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) {
      return;
    }
    open("photo");
    setPhoto(null);
    setPreview(URL.createObjectURL(file));
    try {
      setPhoto(await preparePhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обработать фото");
    }
  }

  function close() {
    setMode(null);
    setPhoto(null);
    setPreview(null);
  }

  function submit() {
    const [hour, minute] = time.split(":").map(Number);
    const eatenAt = DateTime.now()
      .setZone(timezone)
      .set({ hour, minute, second: 0, millisecond: 0 });
    onSubmit({
      comment: comment.trim(),
      eatenAt: eatenAt.toISO()!,
      photo: mode === "photo" && photo ? photo : undefined,
    });
    close();
  }

  const canSubmit = mode === "photo" ? photo !== null : comment.trim().length > 0;

  return (
    <>
      {[
        { ref: cameraInput, capture: "environment" as const },
        { ref: galleryInput, capture: undefined },
      ].map(({ ref: inputRef, capture }, index) => (
        <input
          key={index}
          ref={inputRef}
          type="file"
          accept="image/*"
          capture={capture}
          hidden
          onChange={(event) => {
            void choosePhoto(event.target.files?.[0]);
            // Allow picking the same file again next time.
            event.target.value = "";
          }}
        />
      ))}
      <SheetPresence>
        {mode && (
          <Sheet title={TITLES[mode]} onClose={close}>
            <div className="sheet-body">
              {mode === "photo" && preview && (
                <img className="meal-photo-preview" src={preview} alt="Фото еды" />
              )}
              <label className="field-label">
                {mode === "photo" ? "Комментарий" : "Опишите еду и порции"}
                <textarea
                  className="field"
                  rows={mode === "photo" ? 2 : 4}
                  maxLength={1000}
                  autoFocus={mode === "text"}
                  placeholder={
                    mode === "photo"
                      ? "Необязательно: что это и сколько, например «плов, полтарелки»"
                      : "Например: 2 яйца, кусок хлеба, кофе с молоком"
                  }
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
              <label className="field-label">
                Время
                <input
                  className="field"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value || time)}
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button type="button" className="primary full" disabled={!canSubmit} onClick={submit}>
                {mode === "photo" && !photo && !error ? "Обрабатываем фото…" : "Распознать"}
              </button>
            </div>
          </Sheet>
        )}
      </SheetPresence>
    </>
  );
});
