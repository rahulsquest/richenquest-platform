#!/usr/bin/env node
/**
 * Local Founder Operations API, for developing and verifying the console.
 *
 * DEVELOPMENT ONLY. This is the REAL API — the same router, the same pipeline,
 * the same permission model, the same endpoints — assembled with the in-memory
 * CRM port. That port implements the same interface as Zoho and is exercised by
 * the same integration suite, so what is absent is durability and Zoho's own HTTP
 * shape, not correctness.
 *
 * It exists so the console can be driven end to end without writing test rows
 * into the founder's live CRM — which, unlike a database, cannot be truncated.
 *
 * Usage:
 *   node functions/ops/scripts/dev-ops-server.mjs
 *
 * Then set ops_api.base_url in website/src/data/platform.json to the printed
 * origin, rebuild the site, and open the printed console link.
 */

import { randomBytes } from "node:crypto";

import { createOpsServer } from "../api/service.mjs";
import { memoryCrmPort, MODULES } from "../crm-port.mjs";
import { memoryStore, appendEvent } from "../../record/log.mjs";
import { issueToken } from "../../record/identity/auth.mjs";

const PORT = Number(process.env.OPS_API_PORT || 8788);
const SITE_ORIGIN = process.env.SITE_ORIGIN || "http://localhost:8080";
const SECRET = process.env.RECORD_TOKEN_SECRET || randomBytes(32).toString("hex");
const FOUNDER = "usr_founder";

const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();
const inMinutes = (n) => new Date(Date.now() + n * 60_000).toISOString();
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * A realistic working set. Shaped to exercise the states that matter — a breached
 * promise, an unassigned lead, an overdue task — because a demo where everything
 * is fine proves nothing about the screen you actually need at 9am.
 */
const crm = memoryCrmPort({
  [MODULES.leads]: [
    { id: "lead_1", First_Name: "Aarav", Last_Name: "Kumar", Email: "aarav@example.com", Phone: "+91 98765 43210",
      Lead_Status: "New", Lead_Source: "Website Form", Created_Time: minutesAgo(47),
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "lead_2", First_Name: "Priya", Last_Name: "Sharma", Email: "priya@example.com", Phone: "+91 91234 56789",
      Lead_Status: "New", Lead_Source: "WhatsApp", Created_Time: minutesAgo(3),
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "lead_3", First_Name: "Rohit", Last_Name: "Verma", Email: "rohit@example.com",
      Lead_Status: "Contacted", Lead_Source: "Referral", Created_Time: minutesAgo(1500),
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "lead_4", First_Name: "Sneha", Last_Name: "Rao", Email: "sneha@example.com",
      Lead_Status: "New", Lead_Source: "Instagram", Created_Time: minutesAgo(210), "Owner.id": null },
    { id: "lead_5", First_Name: "Bikash", Last_Name: "Thapa", Email: "bikash@example.com",
      Lead_Status: "Qualified", Lead_Source: "Education Fair", Created_Time: minutesAgo(4300),
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
  ],
  [MODULES.students]: [
    { id: "case_1", Deal_Name: "Aarav Kumar — Italy MSc", Stage: "Documents in Progress", Amount: 120000,
      Career_Record_Id: "sub_aarav01", Destination_Country: "Italy", Visa_Status: "Lodged",
      Service_Package: "Full Service",
      Closing_Date: "2026-09-01", Modified_Time: minutesAgo(180), "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "case_2", Deal_Name: "Rohit Verma — Germany BSc", Stage: "Agreement Signed", Amount: 90000,
      Closing_Date: "2026-10-15", Modified_Time: minutesAgo(900), "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "case_3", Deal_Name: "Bikash Thapa — Japan Language", Stage: "Counseling Done", Amount: 45000,
      Closing_Date: "2026-11-20", Modified_Time: minutesAgo(2600), "Owner.id": FOUNDER, "Owner.name": "Founder" },
  ],
  [MODULES.tasks]: [
    { id: "task_1", Subject: "Call Aarav about DSU deadline", Status: "Not Started", Priority: "High",
      Due_Date: "2026-07-24", Created_Time: minutesAgo(3000), "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "task_2", Subject: "Send Priya the Italy guide", Status: "Not Started", Priority: "Normal",
      Due_Date: "2026-07-27", Created_Time: minutesAgo(400), "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "task_3", Subject: "Chase Bologna agreement", Status: "Completed", Priority: "Normal",
      Due_Date: "2026-07-20", Created_Time: minutesAgo(9000), "Owner.id": FOUNDER, "Owner.name": "Founder" },
  ],
  [MODULES.collaborators]: [
    { id: "acc_1", Account_Name: "Università di Bologna", Account_Type: "University",
      Website: "https://unibo.it", Billing_Country: "Italy", Partnership_Stage: "Active",
      Partnership_Type: "Exchange", Accreditation: "MIUR recognised · EUA member",
      Campus_List: "Bologna, Rimini, Forlì, Cesena",
      International_Office_Contact: "Giulia Rossi", International_Office_Email: "intl@unibo.example",
      Agreement_Status: "Signed", Agreement_Signed_On: "2026-01-15",
      Agreement_Expires_On: daysFromNow(420), Created_Time: minutesAgo(300_000),
      Modified_Time: minutesAgo(4000), "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "acc_2", Account_Name: "Sapienza Università di Roma", Account_Type: "University",
      Billing_Country: "Italy", Partnership_Stage: "In Discussion", Agreement_Status: "Drafted",
      Agreement_Expires_On: daysFromNow(38), Created_Time: minutesAgo(150_000),
      Modified_Time: minutesAgo(9000), "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "acc_3", Account_Name: "EduBridge Agents", Account_Type: "Recruitment Agent",
      Billing_Country: "Nepal", Partnership_Stage: "Contacted", Agreement_Status: "None",
      Created_Time: minutesAgo(120_000), Modified_Time: minutesAgo(90_000),
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
  ],
  [MODULES.contacts]: [
    { id: "con_1", First_Name: "Giulia", Last_Name: "Rossi", Email: "giulia@unibo.example",
      Title: "Head of International", Created_Time: minutesAgo(200_000),
      "Account_Name.id": "acc_1", "Account_Name.name": "Università di Bologna",
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
  ],
  [MODULES.offerings]: [
    { id: "off_1", Product_Name: "MSc Data Science", Product_Category: "Degree", Degree_Level: "Master's",
      Unit_Price: 12000, Tuition_Currency: "EUR", Duration: "2 years", Intakes: "September, February",
      Application_Deadline: daysFromNow(45), Product_Active: true,
      "Vendor_Name.id": "acc_1", "Vendor_Name.name": "Università di Bologna",
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "off_2", Product_Name: "BA International Relations", Product_Category: "Degree", Degree_Level: "Bachelor's",
      Unit_Price: 9000, Tuition_Currency: "EUR", Duration: "3 years", Intakes: "September",
      Application_Deadline: daysFromNow(12), Product_Active: true,
      "Vendor_Name.id": "acc_1", "Vendor_Name.name": "Università di Bologna",
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "off_3", Product_Name: "DSU need-based grant", Product_Category: "Scholarship",
      Description: "Regional need-based support, by right for eligible students.",
      Application_Deadline: daysFromNow(20), Product_Active: true,
      "Vendor_Name.id": "acc_1", "Vendor_Name.name": "Università di Bologna",
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "off_4", Product_Name: "Erasmus+ semester exchange", Product_Category: "Exchange",
      Intakes: "September, January", Application_Deadline: daysFromNow(-8), Product_Active: true,
      "Vendor_Name.id": "acc_1", "Vendor_Name.name": "Università di Bologna",
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
  ],
  [MODULES.meetings]: [
    { id: "evt_1", Event_Title: "Annual intake review", Start_DateTime: minutesAgo(60_000),
      Venue: "Bologna", Created_Time: minutesAgo(70_000),
      "What_Id.id": "acc_1", "What_Id.name": "Università di Bologna",
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
    { id: "evt_2", Event_Title: "Scholarship planning call", Start_DateTime: inMinutes(8_000),
      Venue: "Zoom", Created_Time: minutesAgo(900),
      "What_Id.id": "acc_1", "What_Id.name": "Università di Bologna",
      "Owner.id": FOUNDER, "Owner.name": "Founder" },
  ],
});

/* A real Career Record for the worked case, written through the real appendEvent:
   hash-chained, invariant-checked, classified. If any event below were invalid,
   this server would refuse to start rather than serve a fictional workspace. */
const record = memoryStore();
const staff = { kind: "human", id: FOUNDER, role: "counsellor" };
const rec = (type, payload, occurredAt) =>
  appendEvent(record, { subjectId: "sub_aarav01", type, actor: staff, payload, occurredAt });

await rec("profile.created", { origin_country: "India" }, minutesAgo(300_000));
await rec("counselling.session_held", { topic: "Destination shortlisting" }, minutesAgo(120_000));
await rec("document.submitted", { document: "Passport scan" }, minutesAgo(100_000));
await rec("document.verified", { document: "Passport scan" }, minutesAgo(90_000));
await rec("document.submitted", { document: "Class XII marksheet" }, minutesAgo(80_000));
await rec("document.rejected", { document: "Class XII marksheet" }, minutesAgo(70_000));
await rec("application.submitted", { institution: "Università di Bologna", programme: "MSc Data Science" }, minutesAgo(60_000));
await rec("admission.offered", { institution: "Università di Bologna" }, minutesAgo(9_000));
await rec("application.submitted", { institution: "Sapienza Università di Roma", programme: "MSc Economics" }, minutesAgo(55_000));
await rec("visa.applied", {}, minutesAgo(20_000));
await rec("counselling.session_held", { topic: "Visa interview preparation" }, minutesAgo(15_000));

const server = createOpsServer({ crm, record, secret: SECRET, cors: { allowed: [SITE_ORIGIN] } });
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const token = issueToken({ sub: FOUNDER, role: "administrator", ops_role: "administrator" }, SECRET, { ttlSeconds: 7200 }).token;
const base = `http://127.0.0.1:${PORT}`;

console.log("");
console.log(`  Founder Operations API (development, in-memory)  ${base}`);
console.log(`  CORS allows                                     ${SITE_ORIGIN}`);
console.log("");
console.log("  1. set website/src/data/platform.json → ops_api.base_url:");
console.log(`     "${base.replace("127.0.0.1", "localhost")}"`);
console.log("  2. node website/build.mjs && node website/serve.mjs");
console.log("  3. open:");
console.log("");
console.log(`  ${SITE_ORIGIN}/console/#token=${encodeURIComponent(token)}`);
console.log("");
console.log("  Ctrl-C to stop. Nothing is persisted.");
