// What each page of a project is for, shown at the top of the page so nobody has to guess.

export type Section = {
  slug: string;
  label: string;
  title: string;
  purpose: string;
  tips?: [string, string][];
  icon: "home" | "map" | "keys" | "build" | "calendar" | "cube" | "cost" | "sheet" | "doc" | "sales" | "layers" | "upload" | "gear" | "cash" | "contract";
  main?: boolean;
};

export const SECTIONS: Section[] = [
  {
    slug: "", label: "Project overview", title: "Project overview", icon: "home", main: true,
    purpose: "Where this project stands today: progress against plan, money, units and what is waiting on someone.",
  },
  {
    slug: "console", label: "Units and map", title: "Units and map", icon: "map", main: true,
    purpose: "Every unit on the masterplan, coloured by stage. Select units to see their record and update many at once.",
    tips: [
      ["Pick a cluster", "from the chips or on the plan to zoom the list to it."],
      ["Click units", "to select them. Click again to drop one. Shift-drag on the plan to take a block."],
      ["Act in the side panel:", "move them to the next handover stage, record progress or set a date. Every move is logged."],
    ],
  },
  {
    slug: "delivery", label: "Handover", title: "Handover pipeline", icon: "keys", main: true,
    purpose: "Every unit moves from site to its client through nine stages. Pick a stage to see its units and who acts next.",
    tips: [
      ["Each box is a stage.", "The number is how many units are in it today."],
      ["Click a stage", "to list its units, oldest first, with their contract dates."],
      ["Move units on", "from their row, or open them on the map to move many at once."],
    ],
  },
  {
    slug: "construction", label: "Construction progress", title: "Construction progress", icon: "build", main: true,
    purpose: "How much is built against the plan, by phase, cluster, building and work stage. Site records progress every week.",
    tips: [
      ["Read the bars:", "dark is built, the gold line is where the plan says we should be today."],
      ["Click a cluster or building", "to see its units and their work stages."],
      ["Record this week's progress", "on the unit map: select units, pick the stages, enter the percent."],
    ],
  },
  {
    slug: "schedule", label: "Schedule", title: "Schedule", icon: "calendar", main: true,
    purpose: "Phases and activities on one timeline, with their links (finish-to-start, start-to-start, finish-to-finish) and the critical path.",
    tips: [
      ["Bars fill", "as work is built; red bars are on the critical path."],
      ["Edit an activity", "to change its dates, its links or its progress."],
      ["Import", "a Primavera P6 (.xer) or MS Project (.xml) file to replace the plan."],
    ],
  },
  { slug: "site", label: "3D site", title: "3D site", icon: "cube", main: true, purpose: "The site in 3D and on the satellite map, with every unit coloured by its status." },
  { slug: "budget", label: "Budget and cost", title: "Budget and cost", icon: "cost", purpose: "Budget, commitments and actual cost by cost item, with what is left to spend." },
  { slug: "boq", label: "Bill of quantities", title: "Bill of quantities", icon: "sheet", purpose: "Quantities and rates for every work item, the base for contracts and certificates." },
  { slug: "contracts", label: "Contracts and payments", title: "Contracts and payments", icon: "contract", purpose: "Every contract with its value, variations, certified work and payments made." },
  { slug: "cashflow", label: "Cash flow", title: "Cash flow", icon: "cash", purpose: "Money in from sales and money out to contractors, month by month." },
  { slug: "units", label: "Units and sales", title: "Units and sales", icon: "sales", purpose: "Every unit with its type, area, price and sales status." },
  { slug: "documents", label: "Documents", title: "Documents", icon: "doc", purpose: "Every workflow document of this project: certificates, variations, purchases, sales and handovers." },
  { slug: "structure", label: "Phases and buildings", title: "Phases, clusters and buildings", icon: "layers", purpose: "How the project is split into phases, clusters, buildings and units." },
  { slug: "masterplan", label: "Masterplan", title: "Masterplan", icon: "map", purpose: "Upload the masterplan and mark where each unit is. The unit console's Tile map, Masterplan and 3D views are drawn from it." },
  { slug: "import", label: "Import from Excel", title: "Import from Excel", icon: "upload", purpose: "Upload budget, schedule, units and other data from a spreadsheet or a P6 file." },
  { slug: "settings", label: "Project setup", title: "Project setup", icon: "gear", purpose: "Name, location, dates, the masterplan and who works on this project." },
];

export const SECTION_BY_SLUG = Object.fromEntries(SECTIONS.map((s) => [s.slug, s]));
