import { Task } from "../api";

/** What every tasks page gets from App. */
export type TaskPageProps = {
  tasks: Task[];
  timezone: string;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
};
