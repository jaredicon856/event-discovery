# Search evaluation evidence — 22 September 2026

This report identifies the six planned live-provider evaluation runs used by
`pricing-margin-research.md`. No new paid evaluation was run to produce this report.
Costs come from `ai_usage.estimated_cost_usd`; each value reconciled exactly with the
corresponding `discovery_runs.estimated_cost_usd` value when checked on 23 September 2026.

These are **real provider-backed search-quality evaluations**, not synthetic test fixtures.
They made live Anthropic/web-search calls and produced the measured costs below. Database
integration fixtures, UI refresh fixtures, and Stripe sandbox accounts are excluded from
this report and from production dashboard metrics. Evaluation runs are retained as
`run_kind = 'evaluation'`; synthetic records use `run_kind = 'fixture'`.

- Healthcare leadership — run `5868fe98-6dfe-43f2-b495-4b3ba84b6d01`;
  completed; $0.216334.
- Financial services — run `708ab83d-258a-4e2a-ac69-9a976238d23f`;
  no verified matches; $0.477784.
- Technology / SaaS — run `ea802a4d-62a6-41a4-bc2c-c939579dc7d5`;
  completed; $0.202114.
- Professional services — run `4cd7446f-84c1-4872-9850-448a8b106cd7`;
  completed; $0.198936.
- Podcasts / standing programs — run `ab36de5a-ac1d-4e30-9fac-db4fe3620d2b`;
  completed; $0.214456.
- Deliberately narrow no-match case — run `5d447965-1865-4bd8-add2-5abdaa721b34`;
  no verified matches; $0.296942.

Measured total: **$1.606566**.

Measured arithmetic mean: **$0.267761 per discovery**.

Observed range: **$0.198936–$0.477784**.

## Returned-result assessment

The links below are the records actually retained for these historical runs. They
are not synthetic fixtures. The assessment was performed from the saved event,
source, match classification, and submission-status fields on 23 September; it
did not make new provider calls.

### Healthcare leadership

- [Becker's Fall Oncology Executive Summit](https://conferences.beckershospitalreview.com/call-for-speakers),
  [17th Annual Meeting](https://conferences.beckershospitalreview.com/upcoming-events),
  [Fall Event](https://conferences.beckershospitalreview.com/upcoming-events), and
  [Spine/ASC Conference](https://conferences.beckershospitalreview.com/upcoming-events)
  were saved as exact matches with an online speaker-proposal path. They are
  relevant to the requested hospital-executive audience, although three use a
  general upcoming-events page rather than an event-specific submission page.
- [HCCA Managed Care Compliance Conference](https://hcca-info.org/conferences/call-speakers/2027-managed-care-compliance-conference-call-speakers)
  was incorrectly retained as exact even though its saved status is `closed` and
  its deadline was 1 June 2026. This historical result is a false positive.
- HCCA Compliance Institute, HCCA Research Compliance, and
  [HIMSS 2027](https://himss.org/call-for-proposals/) were kept as related
  suggestions rather than exact matches.

Assessment: **four relevant exact candidates, one closed false positive**.

### Financial services

No event was retained. This is a valid no-result outcome, but it provides no
positive relevance evidence.

### Technology / SaaS

- [SaaStr AI Annual 2027](https://www.saastrannual.com/speaker-submission) and
  [MicroConf US 2027](https://microconf.com/us-flagship) are relevant to SaaS
  founders and have saved speaker-pitch paths.
- Both saved statuses are `unknown`; therefore this run supports topical
  relevance but **does not prove that submissions were open** when assessed.

### Professional services

- [SCP 2027 Annual Conference](https://www.societyofconsultingpsychology.org/2027-scp-annual-conference/2027-call-for-speakers/)
  is topically relevant, but its saved 14 August 2026 concurrent-session
  deadline had passed by this 23 September assessment.
- [ACMP Global Connect 2027](https://www.acmpglobal.org/page/2027-call-for-speakers)
  is relevant to change-management consulting, but its saved status and dates
  are unknown.
- The ICMCI conference was correctly shown as related/closed.

Assessment: **relevant sources, but no confirmed currently-open exact result**.

### Podcast / standing-program query

The retained exact results were HCCA and AHA conferences, including several
saved as closed. They do not satisfy a podcast-guest query. The HIMSS standing
catalog was correctly marked related. This historical run is a **search-quality
failure**, not positive evidence.

### Deliberately narrow no-match query

No exact result was retained. HFMA Leadership Summit was shown only as related.
That is the expected behavior for the intentionally impossible Antarctica 2099
query.

## Evidence conclusion

These six runs establish measured provider cost and show that sources were
returned. They **do not establish launch-ready result quality**: the retained
sample includes closed exact matches, unknown submission states, and a
wrong-type podcast run. Current validator regression tests cover those known
patterns, but a fresh, budget-approved provider evaluation is still required to
measure the improved pipeline.

Limitations: this is a six-run pre-launch sample, not production-scale evidence. One run
exceeded the $0.40 planning target. The sample should not be used to promise a stable
average, and extraction costs recorded before the 23 September telemetry hardening remain
subject to the instrumentation limitations that existed when those runs were performed.
