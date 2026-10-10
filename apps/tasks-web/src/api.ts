/** Tasks API: response types, the list query and the requests that change it. */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@ui/lib/api-client";

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

/** What the owner enters for a task; a note is a task without a date. */
export type TaskInput = {
  title: string;
  note: string;
  /** yyyy-MM-dd in the owner's timezone. */
  dueDate: string | null;
  /** HH:mm; null for the whole day. */
  dueTime: string | null;
  repeat: Repeat;
  /** ISO weekdays 1–7 for a weekly repeat. */
  repeatDays: number[];
};

export type Task = TaskInput & {
  id: string;
  doneAt: string | null;
  snoozeAt: string | null;
  version: number;
  createdAt: string;
};

export const TASKS_QUERY_KEY = ["tasks"];

export function useTasks(enabled: boolean) {
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: () => request<Task[]>("/tasks"),
    enabled,
  });
}

export function createTask(input: TaskInput, key: string) {
  return request<Task>("/tasks", { method: "POST", body: JSON.stringify(input), key });
}

export function updateTask(task: Task, input: TaskInput) {
  return request<Task>(`/tasks/${task.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...input, version: task.version }),
  });
}

/** A one-off task becomes done; a repeating one moves on to its next date. */
export function completeTask(task: Task) {
  return request<Task>(`/tasks/${task.id}/done`, {
    method: "POST",
    body: JSON.stringify({ version: task.version }),
  });
}

export function reopenTask(task: Task) {
  return request<Task>(`/tasks/${task.id}/reopen`, {
    method: "POST",
    body: JSON.stringify({ version: task.version }),
  });
}

export function deleteTask(task: Task) {
  return request<{ ok: true }>(`/tasks/${task.id}`, {
    method: "DELETE",
    body: JSON.stringify({ version: task.version }),
  });
}

/** Puts a changed task into the cached list, or takes a deleted one out of it. */
export function useTaskCache() {
  const queryClient = useQueryClient();

  return {
    put(task: Task) {
      queryClient.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks = []) => {
        const exists = tasks.some((item) => item.id === task.id);

        return exists ? tasks.map((item) => (item.id === task.id ? task : item)) : [...tasks, task];
      });
    },

    drop(id: string) {
      queryClient.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks = []) =>
        tasks.filter((item) => item.id !== id),
      );
    },

    refresh() {
      return queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    },
  };
}
