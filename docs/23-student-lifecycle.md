# File 23 — The student lifecycle

**Two axes, one record.** This is the central design decision of the student platform, and it is
worth understanding before changing anything here.

```
SALES PIPELINE  (Deals.Stage — 11 stages, drives Probability and forecasting)

  New Inquiry 10% → Counseling Booked 20% → Counseling Done 30% → Agreement Sent 40%
  → Agreement Signed 60% → Documents in Progress 65% → Applications Submitted 70%
  → Offer Received 80% → Visa Filed 90% → Visa Approved — Won 100%
                                                    ↘ Closed Lost 0% (reason mandatory)

JOURNEY AXIS  (Deals.Student_Journey_Stage — post-admission, no probability)

  Pre-Departure → Accommodation Confirmed → Arrived → Enrolled → Success Story → Alumni
```

## Why two axes and not one long pipeline

The brief lists the lifecycle as `Lead → Student Case → Admission → Visa → Accommodation →
Arrival → Success Story → Alumni`, which reads like one sequence. Implementing it as one sequence
would have been wrong.

A Student Case is **genuinely won when the visa is approved** — that is when the service is
delivered and the revenue is real. If `Arrived` and `Alumni` were Deal stages sitting after
`Visa Approved — Won`, then:

- every won case would immediately look "not yet won" again as it moved to Arrived;
- `Probability` would have to be 100% for four more stages, making the field meaningless;
- conversion-rate and forecast reports would count arrival and alumni status as pipeline;
- "how many cases did we win this quarter" would become unanswerable without special-casing.

So the pipeline ends at won, and the journey continues on its own field. **Verified live:** a case
at `Stage: Visa Approved — Won, Probability: 100` simultaneously read
`Student_Journey_Stage: Arrived`. Neither axis disturbed the other.

`Lead` is not a stage on either axis — a Lead is a separate module and stays one. Leads are never
converted or deleted (File 01 §5.2); `createStudentCase` records the originating `lead_id` in the
audit trail instead.

## The two guarded transitions

Both are the only supported way to move a case. Direct field writes bypass validation and audit.

| Function | Moves | Guards |
|---|---|---|
| `updateStudentCaseStage` | sales pipeline | stage exists · `Closed Lost` requires a reason · numeric id · audited |
| `advanceStudentJourney` | journey axis | stage exists · **forward only** · **cannot pass `Arrived` unless the case is won** · audited |

### Two rules worth defending

**Forward only.** The journey never moves backwards. Correcting a mistake is a *data fix*, not a
transition, and should be visible as one rather than hidden inside normal traffic.

**Nothing reaches `Arrived` before the visa is approved.** Verified: attempting it on a case at
`Agreement Sent` returns

```
cannot reach Arrived while the case is at Agreement Sent; visa must be approved first
```

A student cannot arrive on a visa that was never approved. Letting a record claim otherwise would
poison every success metric built on top of it — and success metrics are exactly what a
consultancy is judged on.

## Stage-entry tasks

Raised through `createFollowUpTasks`, so the definition lives in one place. Only at boundaries
where a human must genuinely act — a task at every boundary trains people to ignore tasks.

| Stage | Task | Due |
|---|---|---|
| Agreement Sent | Chase unsigned agreement | +2d, High |
| Agreement Signed | Open document checklist + WorkDrive folder | +1d, High |
| Offer Received | Brief student on offer + start visa prep | +1d, Highest |
| Visa Filed | Check visa progress | +7d, High |
| Pre-Departure | Pre-departure briefing | +3d, High |
| Arrived | Arrival check-in call | +2d, High |
| Enrolled | Ask for success story consent | +14d, Normal |

**`Success Story` deliberately raises no task and publishes nothing.** A story is a public claim
about a real student. It needs their consent (asked for at `Enrolled`) and it is governed by the
claims library — `claims.json` currently records `verified_placements: 15` and bans placement
language beyond it. Automating publication would be automating a compliance breach.

## Verification

Every path below was executed against a live probe case, which was then deleted (`Deals` reads
empty, no `LCPROBE` tasks remain).

| Case | Result |
|---|---|
| `Pre-Departure` before win | allowed — journey may start during visa processing |
| `Arrived` before win | **refused** with the message above |
| backwards to `Pre-Departure` | **refused** — "journey only moves forward; already at …" |
| `Graduated` | **refused** — `ENUM` from `coreValidate` |
| win → `Accommodation Confirmed` → `Arrived` | all allowed; arrival task raised |
| final state | `Stage: Visa Approved — Won`, `Probability: 100`, `Journey: Arrived` |

## Not yet built

- **`Lead → Student Case` is manual.** `createStudentCase` accepts a `lead_id` but nothing calls
  it automatically on qualification. Wiring that needs a "qualified" signal that does not exist
  yet — `Lead_Status` has `Pre-Qualified`, but no rule promotes it.
- **Accommodation has no data of its own** — no provider, address, move-in date or cost fields.
  `Accommodation Confirmed` currently records only that it happened. Add fields when there is a
  real process to record.
- **Alumni is a dead end.** Nothing happens at `Alumni` yet. Referral tracking is the obvious next
  use and does not exist.
