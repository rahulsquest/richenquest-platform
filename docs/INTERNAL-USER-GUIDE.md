# Internal User Guide — Internal Release v1

For everyone working inside RichenQuest. What the console does, what each role
may do, and the handful of things worth understanding before you rely on it.

---

## Getting in

You will be sent a **link**, not a password. Open it and you are in.

There is no password anywhere in this system. That is deliberate: there is no
password to lose, and none for anyone else to steal.

Sessions are **short**. When one ends you are shown why and asked for a new link.
Signing out clears this device immediately — it does **not** revoke a link that is
still valid elsewhere, so if you think a link has been seen by someone else, say
so rather than assuming sign-out handled it.

The console is at **`/console/`**. Students have their own separate view at
`/dashboard/` — they never see the console, and you never see their view.

---

## What you can see

Your role decides. The navigation only shows what you can actually use, and every
action is checked again on the server — a hidden button is a courtesy, never a
control.

| Role | Sees | Can change |
|---|---|---|
| **Founder / Administrator** | Everything | Everything |
| **Manager** | Everything | Leads, students, partners, tasks; can reassign work |
| **Counsellor** | **Their own** leads and students | Their own records; cannot reassign |
| **Partnerships** | **Their own** institutions | Partners, contacts, meetings |
| **Marketing** | Leads and analytics only | Nothing |
| **Auditor** | Everything, read-only | Nothing |

**"Their own" is enforced, not advisory.** A counsellor cannot open a colleague's
student by guessing the address. Unassigned leads stay visible to everyone,
because a lead nobody can see is a lead nobody calls.

---

## Today

Your morning screen. Six numbers and a queue.

The one that matters most is **"Past the promise"**. Every new lead is promised a
call within **5 minutes**. Until this console existed, nothing measured whether
that happened — which made the promise unfalsifiable. It is now a number, and it
is on the first screen you see.

**Needs attention** is a worked queue, not a notification list. Alerts sort above
actions; within a level, the most urgent first. Work it top-down.

---

## Leads

Newest first, because the lead that just arrived is the one still inside its
window. An uncontacted lead carries an amber edge and a live waiting count.

**Mark contacted** writes an attributed note to the CRM and clears the breach.
Attributed, never anonymous — a note whose author is unknown is worth less than
no note.

Only managers and above can **reassign** a lead.

---

## Students

The operational workspace for one student. Six panels:

**Workspace** — stage, assigned counsellor, destination, next deadline, and
whether a Career Record is linked. If it says *Not linked*, the case has no
history yet and the screen says so rather than showing an empty timeline as if it
meant "nothing happened".

**Applications** — every university applied to, and where each stands. Waiting
times are counted for you. An application that has been submitted with no decision
for 30+ days is surfaced for chasing.

**Documents** — what is held, what is verified, what is missing. *Present is not
verified*: a submitted document shows as submitted and generates a "verify" action.
A rejected or expired document is an **alert**, because it blocks the visa.

**Visa** — status plus a four-step travel checklist. A granted visa says nothing
about whether the student has insurance or anywhere to sleep, so those are tracked
separately.

**Communication** — counselling sessions, notes, calls and meetings in one
history, assembled from the record and the CRM. Not stored separately, so it
cannot drift from either.

> **You will not see a student's name, date of birth or documents here.** Those
> live encrypted, released only through an audited export. You see the record id.
> This is not an oversight — it is the protection that makes erasure possible.

### If the CRM and the record disagree

You will occasionally see: *"The CRM says X while the record says Y."* Both are
shown. Neither quietly wins. Reconcile before relying on either — usually it means
someone updated Zoho directly and the record was not told, or the reverse.

---

## Collaboration

Universities, partner institutions and agents in **one register** — they are the
same organisations at different points on one pipeline.

**Needs attention** here answers "what will break if nobody acts": agreements
expiring or already lapsed, required documents never filed, active partnerships
nobody has touched in 180 days, and prospects gone quiet for 45.

An active partnership runs on a slower clock than a lead. Silence means something
different once something is signed.

Open a partnership for its full profile — accreditation, campuses, international
office — plus contacts, meetings, the **programme catalogue** (degrees, tuition,
intakes, deadlines), **opportunities** (scholarships, exchanges, research,
internships), required documents, and the full history.

Moving a partnership through its stages writes an attributed note every time.

---

## Tasks

Open work, soonest due first. Add a task with a due date and priority. Completed
work leaves the list.

Only managers and above can put a task on **someone else's** list.

---

## Analytics

Conversion and pipeline over a window you choose.

Every rate is shown **with the numbers behind it** — "60%" always appears as
"3 of 5". A percentage without its denominator is the kind of number that gets
repeated in a pitch and cannot be defended when questioned.

---

## Things worth knowing

**Nothing here is invented.** If a number cannot be computed from real data, the
screen says so. There is no sample data and no fallback dataset in any state — a
tool that shows plausible-but-wrong figures is worse than one that shows an error,
because decisions get made on it.

**Nothing is silently overwritten.** Corrections are added beside the original.
The history is a log, not a document.

**Your reads of a student's record are recorded**, the same as anyone else's. A
student reading their own record is not.

**It works on a phone.** The layout is dense by design — this is a tool you open
twenty times a day, not a page you read once.

---

## When something looks wrong

1. **Reload.** Every screen is computed fresh; nothing is cached.
2. **Check the sign-in state** — an expired session shows a clear message.
3. **If a number looks wrong, do not work around it.** Report it with the screen
   and the record id. Every figure traces to a specific record, so a wrong number
   is findable — and a wrong number nobody reported is one everybody starts
   quietly distrusting.
