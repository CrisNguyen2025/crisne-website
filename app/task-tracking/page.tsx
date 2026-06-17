import type { Metadata } from "next";
import { TaskTrackingClient } from "./task-tracking-client";

export const metadata: Metadata = {
  title: "Task Tracking",
  description: "Sprint-based task tracking board with FO, CMS, and BO tabs.",
};

export default function TaskTrackingPage() {
  return <TaskTrackingClient />;
}
