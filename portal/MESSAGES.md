# Student & parent message templates

Every message below is written to be sent **as-is**. Merge fields are `{{like_this}}`
and all of them come from `submitApplication()` or `caseState()` — none require a
human to look anything up.

**Rules these obey, from the Constitution:**
- No message claims an outcome we cannot deliver.
- No message contains a cost figure without its source.
- Nothing customer-facing goes out without approval — see the approval note at the end.
- Bad news is sent on the same schedule as good news.

---

## 1 · WhatsApp — immediately on submission (student)

> Hello {{first_name}}, this is RichenQuest.
>
> We have your application. Your reference is *{{case_no}}* — quote it in any message
> to us and we will find your file straight away.
>
> A counsellor will call you by *{{call_by}}*. They will have read everything you sent,
> so you will not be asked the same questions twice.
>
> Nothing to do until then.

### 1a · Appended only when `passport_urgent` is true

> One thing that cannot wait for our call:
>
> *Apply for your passport this week.* You told us you do not have one yet. A new
> Indian passport takes several weeks, and until it exists nothing else in your
> application can move — not the university, not the visa. Everything else we can do
> in parallel. This one we cannot do for you.

---

## 2 · WhatsApp — the document checklist (student, same day)

> {{first_name}}, here is what we still need from you. This list is only the things
> you have not already told us you have:
>
> {{#checklist}}
> • {{.}}
> {{/checklist}}
>
> Send them here whenever you have them — photos are fine as long as all four corners
> are visible and the text is readable.
>
> We are *not* asking for bank statements or financial documents yet. Those are needed
> for the visa, not the application, and there is no reason for you to gather them now.

---

## 3 · WhatsApp — parent, first contact

*Only sent when `Parent_Consent` is true.*

> Namaste {{parent_name}}, this is RichenQuest in Patna.
>
> {{first_name}} has started an application with us and asked us to keep you informed.
> Reference *{{case_no}}*.
>
> We will send you a short written update every Friday, and we will tell you the full
> cost of any option before {{first_name}} commits to it — tuition, living costs,
> insurance, visa and permit fees, and flights. One number, not a tuition fee with
> surprises after it.
>
> If you would prefer we did not message you, reply STOP and we will not write again.

---

## 4 · Email — submission confirmation (student, cc parent if consented)

**Subject:** Your RichenQuest application — {{case_no}}

> Dear {{first_name}},
>
> We have received your application. Your reference number is **{{case_no}}**.
>
> **What happens next**
>
> 1. A counsellor calls you by {{call_by}}. They will already have read your file.
> 2. You will get a shortlist of courses, each with its full cost — tuition, living
>    costs, insurance, visa and permit fees — and where each figure came from.
> 3. We will tell you exactly which documents are missing. Only those.
>
> **What we still need**
>
> {{#checklist}}
> - {{.}}
> {{/checklist}}
>
> **What we will not do**
>
> We will not guarantee you admission or a visa, because nobody can. We will not sign
> anything on your behalf. And if the timing stops working for your intake, we will
> tell you early — while there is still a next intake to plan for.
>
> You can ask us at any time to show you what we hold about you, correct it, or delete
> it.
>
> RichenQuest
> Patna, Bihar

---

## 5 · WhatsApp — the Friday update

*Sent every Friday whether or not there is news. `{{state}}`, `{{next_action}}` and
`{{days}}` come straight from `caseState()`, so this message can never claim progress
the system does not actually show.*

### When something moved

> {{first_name}} — your Friday update on {{case_no}}.
>
> Where you are: *{{state}}*
> This week: {{what_moved}}
> Next: {{next_action}}
> {{#deadline}}Your next deadline is {{deadline}}, which is {{days}} days away.{{/deadline}}

### When nothing moved

> {{first_name}} — your Friday update on {{case_no}}.
>
> Nothing moved this week, and I would rather tell you that than send nothing.
>
> Where you are: *{{state}}*
> What we are waiting on: {{blocker}}
> What I am doing about it: {{next_action}}

---

## 6 · WhatsApp — timing has been lost (`TIMING_LOST`)

*This is the hardest message in the business and it must go out the day the engine
raises the block, not a week later.*

> {{first_name}}, I need to be straight with you about {{case_no}}.
>
> The last date we could safely have filed your visa for {{intake}} has passed. I am
> not going to tell you it might still work, because it very likely will not, and you
> would be spending money on that hope.
>
> What I would like to do is move you to {{next_intake}}. Your application work is not
> wasted — the documents, the shortlist and the offers carry over.
>
> Can I call you and your {{parent_relation}} together this evening?

---

## 7 · WhatsApp — visa refused

> {{first_name}}, the decision on your visa has come back and it is a refusal.
>
> I am sorry. Before anything else, please send me a photo of the *entire* refusal
> letter, including the reasons listed on it. Do not summarise it for me — I need the
> exact wording, because refusals fall into two very different categories and which one
> this is decides whether we appeal, reapply, or change country.
>
> I will call you within the hour.

---

## 7a · Sender block — append to templates 1, 3 and 4

Every first contact must identify the sender and offer an exit. A message from an
unknown Indian number asking a family for documents is indistinguishable from a scam
unless it says who it is.

> — RICHENQUEST PVT LTD, Boring Road, Patna · support@richenquest.com · +91 76312 07948
> Reply STOP and we will not message you again.

Italy-based students and university correspondence: **+39 327 186 6329**.

---

## 8 · Approval gate

> **Nothing in this file may be sent to a real family until the founder has approved
> the final wording**, and templates 6 and 7 in particular should be read aloud once
> before they are ever used.
>
> Two items are still blocked and are marked FOUNDER DECISION REQUIRED elsewhere in
> this repo: the WhatsApp business number, and the registered entity details required
> in the privacy notice. Messages 1–5 cannot legally go out until the privacy notice
> is complete, because they are the first processing of personal data.
