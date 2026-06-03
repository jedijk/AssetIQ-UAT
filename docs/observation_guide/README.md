# How to Create an Observation in AssetIQ

> An **Observation** is the entry point for everything reactive in AssetIQ.
> When you spot a leak, a strange noise, a vibration, a corroded bolt — you
> tell the AI assistant what you saw. AssetIQ turns it into a structured
> **Threat** with the right equipment, severity, and a maintenance follow-up.

This guide walks through the full flow end-to-end.

---

## Quick map

```
[ FAB (+) ]  →  [ Chat opens ]  →  [ Describe issue ]
                                          ↓
                              [ "Here is what I understood" ]
                                          ↓
              Yes  ────────  Revise  ────────  Cancel
                  ↓
          [ Threat saved ]
                  ↓
      [ Add more context? ] ───────→ ( Skip / Done / close window )
                  ↓
          [ Conversation finalized — done ]
```

---

## Step 1 — Open the chat

From **any page** in AssetIQ, look at the **bottom-right corner**. There's a
blue circular **+** button (Floating Action Button).

![Step 1 — Dashboard with FAB visible](./01_dashboard_fab.png)

* Click it. The chat sidebar slides in from the right.
* You can also press the FAB from the Dashboard, the Equipment Manager, the
  Causal Engine — anywhere. The chat is global.

> **Tip:** the FAB has `data-testid="fab-report-observation"` if you're
> automating tests.

---

## Step 2 — Describe what you observed

The chat opens with a friendly prompt asking what you'd like to report.

* Type your observation in **plain language** — English or Dutch.
* You can also **paste an image** (a photo of the equipment, a thermal-imaging
  reading, an oscilloscope screenshot) — drag-and-drop or click the
  paperclip icon.
* No need to use technical jargon. The AI handles synonyms, typos and
  Dutch → English translation automatically.

**Examples that all work:**

| What you type                                       | What AssetIQ understands                |
|-----------------------------------------------------|-----------------------------------------|
| `Pump P-104 is leaking oil from the seal area`      | Pump P-104, oil leak, seal              |
| `Lager op gearbox 1F-3001-0123 maakt herrie`        | Bearing on gearbox 1F-3001-0123, noise  |
| `Vibration on motor MTR-12 way higher than normal`  | Motor MTR-12, abnormal vibration        |
| `Filter 1C-1005-0033 is fully blocked`              | Filter 1C-1005-0033, blockage           |

Press **Enter** (or click the send arrow) to submit.

---

## Step 3 — Confirm the AI understood

Within ~5 seconds, the assistant replies with a card titled
**"Here is what I understood"**. It contains:

* **Issue description** — cleaned-up English summary
* **Equipment** — best-match equipment node from your hierarchy
* **Severity** — Low / Medium / High based on the issue type
* **Three buttons:**

| Button     | Color           | What it does                                              |
|------------|-----------------|-----------------------------------------------------------|
| **Yes**    | Green (filled)  | Confirm the summary — creates the Threat                  |
| **Revise** | White (outline) | Let the AI re-parse — type a clarification or correction  |
| **Cancel** | Red (outline)   | Abort the observation entirely (no Threat created)        |

> If anything's wrong (wrong equipment, wrong severity), use **Revise** — the
> chat goes back into listening mode so you can refine. You can revise as many
> times as you want.

---

## Step 4 — Threat is created

Once you click **Yes**, AssetIQ:

1. Creates a **Threat** record in MongoDB (visible in the Observations page).
2. Links it to the matched **equipment node**.
3. Auto-assigns severity, criticality and an initial status of `open`.
4. Posts a confirmation message in the chat with a **threat card**:
   * Threat ID
   * Equipment tag + name
   * Severity badge
   * "View full details" link → opens the Observations page filtered to this threat

---

## Step 5 — Add more context (optional)

After saving, the assistant asks **"Would you like to add more details?"**.

This is the moment to attach things like:

* **Temperature** — "Was running at 78 °C, normal is 60 °C"
* **Sound** — "Grinding noise from the drive end"
* **Vibration readings** — "8.5 mm/s on the NDE bearing"
* **Photos** — drag in an image
* **Process state** — "Happened during start-up after maintenance"

You have three options:

| Option        | What happens                                                                      |
|---------------|-----------------------------------------------------------------------------------|
| **Type more** | The AI adds the context to the threat as a structured note                        |
| **Skip**      | Conversation closes cleanly. The threat is final as-is                            |
| **Just close**| The chat auto-skips for you and finalizes the threat — same result as pressing Skip|

There's also a **60-second auto-skip timer** so if you walk away the threat
won't sit half-finished. The countdown is visible next to the **Done** button.

---

## Step 6 — Conversation finalizes

When you skip or click Done, the bot replies:

> **"Got it! Your observation has been saved. What else would you like to report?"**

You can immediately type the next observation — the chat stays open. To close
entirely, click the **X** in the top-right of the sidebar or click outside it.

---

## What happens behind the scenes

| Step       | Endpoint hit                       | What gets written                                            |
|------------|------------------------------------|--------------------------------------------------------------|
| Send msg   | `POST /api/chat/send`              | User message stored                                          |
| AI parse   | (server-side, your OpenAI key)     | Issue summary, equipment match, severity                     |
| Yes        | `POST /api/chat/send` (`"yes"`)    | Creates threat in `threats` collection                       |
| Skip       | `POST /api/chat/send` (`"skip"`)   | Marks the threat as finalized                                |
| Cancel     | `POST /api/chat/cancel`            | Drops state, no threat created, posts "Cancelled" message   |
| Close (X)  | (frontend wrapper)                 | Sends a hidden skip if a Skip prompt was active              |

The chat language (EN / NL) is auto-detected from your message, but you can
override it in your user profile.

---

## Where do observations show up?

* **Observations page** (top-nav): table of all threats with severity, equipment,
  status, and date.
* **Dashboard widgets**: KPI counts (open threats, this week's threats, etc.).
* **Equipment Manager → equipment node → "Threats" panel**: per-equipment list.
* **Causal Engine**: can pick up open threats to suggest root causes.
* **Actions / Work Orders**: a threat can be promoted to a Work Order via the
  threat detail page.

---

## Common questions

**Q: I made a typo — what now?**
Use **Revise**. The AI re-parses everything from scratch.

**Q: I started typing but realized I don't want to report anything.**
Click the **X** to close the chat. Nothing gets stored unless you confirm.
If you'd already clicked Yes, use **Cancel** on the next prompt.

**Q: Can I attach a photo?**
Yes — drag it into the chat or click the attachment icon. The AI will use it
to enrich the equipment match and severity.

**Q: I see "Here is what I understood: skip" — what's that?**
That used to happen if a stray Skip arrived after the conversation had
already ended. It's now suppressed at the backend (Feb 2026 fix).

**Q: How do I revisit a finalized threat?**
Open the **Observations** page from the top navigation. Click the row to open
the full detail view — change status, add notes, promote to Work Order, etc.

---

## Recap

1. Click the **+** FAB.
2. Type or paste what you observed.
3. Click **Yes** if the AI got it right (or **Revise** / **Cancel**).
4. Optionally add more context, or just close the window — both work.
5. Find the new threat in **Observations**.

That's it. Observations are designed to be a 30-second action — the friction
between "I saw something" and "AssetIQ knows about it" should be near zero.
