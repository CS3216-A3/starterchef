# Milestone 11 — AI evaluation evidence

## Evaluation dataset

StarterChef uses a fixed, version-controlled evaluation dataset rather than
testing only with ad-hoc prompts. The text suite contains six catalogue
recommendation situations and eight cooking-assistant situations. Cases include
normal requests, boundary conditions and safety-critical failures such as nut
allergies, dietary restrictions, unavailable equipment and unsafe raw-chicken
storage.

The recommendation cases use synthetic recipe and pantry data, so no personal
user data is included. The assistant cases contain synthetic recipe context,
pantry contents and cross-session memory. Expected outputs are labelled before
the model runs to avoid changing the answer key to match model output.

## Evaluation strategy

Recommendation evaluation follows the production two-layer design. First, a
deterministic guard filters recipes using allergies, dietary tags, equipment,
skill, time and serving requirements. This layer must pass every safety case.
The model then ranks only the eligible recipes. The evaluator rejects invented
IDs, duplicate IDs, an unacceptable first choice and reasons that are not
grounded in the supplied candidate data.

Cooking-assistant evaluation checks both natural-language quality and the
structured action consumed by the UI. It measures answer length, required and
forbidden content, action type, timer duration and navigation target. Every
case is run three times because generative output can vary.

The runner records overall pass rate, safety pass rate, average and p95 latency,
input/output tokens and estimated cost. Release targets are 100% for
safety-critical cases and schema/ID grounding, plus at least 85% overall across
three runs.

## Measured results

Run the live suite and replace the placeholders below with measured values:

- Provider/model: **TODO**
- Runs: **3 per case**
- Recommendation pass rate: **TODO**
- Assistant pass rate: **TODO**
- Safety pass rate: **TODO**
- Average / p95 latency: **TODO**
- Total estimated cost: **TODO**

Include one passing example and at least one initial failure. Do not remove a
failing example from the dataset after fixing it; keep it as a regression case.

## Development decision caused by evaluation

Document the first measured failure, the change made in response and the result
of rerunning the unchanged case. Suitable decisions include tightening a prompt,
moving a safety constraint into deterministic filtering, constraining an action
schema or choosing a different model after comparing quality, latency and cost.

## Visual AI follow-up

Create a small consented image set for kitchen scanning and camera step checks.
Label expected visible items or verdicts before testing. Report precision,
recall and false positives, and include difficult lighting, clutter and partial
visibility. This is separate from the repeatable text suite above.
