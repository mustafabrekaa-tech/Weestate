import { redirect } from "next/navigation";

// The portfolio page grew into the reports dashboard.
export default function Portfolio() {
  redirect("/reports");
}
