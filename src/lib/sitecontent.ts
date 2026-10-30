// The fixed content of the public website. Each part can be switched off in
// the admin portal (platform_settings.site_hidden).

export const SECTIONS: [string, string][] = [
  ["stats", "Numbers strip under the top banner"],
  ["features", "Features"],
  ["site3d", "3D site"],
  ["workflow", "How it works"],
  ["security", "Security"],
  ["plans", "Plans"],
  ["prices", "Plan prices (off shows \"Talk to us\")"],
  ["faq", "Questions (FAQ)"],
  ["contact", "Demo request form"],
  ["chat", "\"Chat with us\" WhatsApp button"],
  ["contacts", "Contact details in the footer"],
  ["social", "Social icons in the footer"],
];

export const FEATURES: { t: string; d: string; i: string }[] = [
  { t: "Budget and cost control", d: "Budgets by phase and cost code, revisions with approval, committed and actual cost, EAC and CPI.", i: "M10 3v14M14 6.5C14 5 12.5 4 10 4S6 5 6 7s2 2.5 4 3 4 1 4 3-1.5 3-4 3-4-1-4-2.5" },
  { t: "Schedule and progress", d: "Import Primavera P6 or MS Project, record monthly progress and see planned against actual with SPI.", i: "M3 16l4-5 3 3 4-6 3 3M3 3v14h14" },
  { t: "Contracts and payments", d: "Contracts, BOQ, payment certificates with retention and advance recovery, and variations, all routed for approval.", i: "M5 3h7l3 3v11H5zM12 3v3h3M8 10h5M8 13h5" },
  { t: "Procurement", d: "Purchase requests from site to award, with a suppliers and contractors directory.", i: "M3 4h2l2 9h9l2-6H6M8 16.5a1 1 0 1 0 0 .01M15 16.5a1 1 0 1 0 0 .01" },
  { t: "Sales and units", d: "Unit inventory, reservations and sales, prices and payment plans, live availability by phase and building.", i: "M4 10l6-6 6 6M6 8.5V16h8V8.5M9 16v-3h2v3" },
  { t: "Handover and community", d: "Snag lists, handover appointments, and owner requests after delivery.", i: "M12 3a4 4 0 1 1-3.5 6L3 14.5V17h2.5v-2h2v-2h2l1-1A4 4 0 0 1 12 3z" },
  { t: "Facility management", d: "Work orders, assets and maintenance once the compound is lived in.", i: "M14.5 3.5a3.5 3.5 0 0 0-4.6 4.4L3.5 14.3a1.4 1.4 0 0 0 2 2l6.4-6.4a3.5 3.5 0 0 0 4.4-4.6l-2 2-2-.5-.5-2z" },
  { t: "Approvals between departments", d: "Every document moves step by step: site, technical office, cost control, finance. Everyone sees what waits on them.", i: "M3 10h4l2-4 2 8 2-4h4" },
  { t: "Excel in, Excel out", d: "Start from the sheets you already keep. Templates for units, BOQ, budgets, contracts, customers and more.", i: "M4 3h12v14H4zM4 8h12M4 13h12M9 3v14" },
];

export const FAQ: [string, string][] = [
  ["Do we have to change how our departments work?", "No. You set the steps and approval limits for each document to match how your company already signs things off."],
  ["Can we bring our existing data?", "Yes. Upload units, BOQ, budgets, contracts, suppliers, customers and schedules from Excel, Primavera P6 or MS Project."],
  ["Where is our data kept?", "In a secure database in Frankfurt, Germany, separate from every other company's. Sign-in always needs an authenticator app code."],
  ["Does it work on phones?", "Yes. It runs in the browser on phones, tablets and computers, so site teams can record progress from the field."],
  ["Can it carry our own name and logo?", "Yes. Your workspace gets its own address, your logo and colours, and can run on your own domain."],
];

