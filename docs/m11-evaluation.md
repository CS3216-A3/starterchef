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

Baseline live run before prompt changes:

- Provider/model: **Google / Gemini 3.5 Flash Lite**
- Runs: **3 per case**
- Recommendation pass rate: **18/18 (100%)**
- Recommendation safety pass rate: **12/12 (100%)**
- Recommendation average / p95 latency: **2.44 s / 9.35 s**
- Recommendation estimated cost: **$0.00070**
- Assistant pass rate: **13/24 (54.2%)**
- Assistant safety pass rate under the strict scorer: **0/6 (0%)**
- Assistant average / p95 latency: **2.20 s / 8.92 s**
- Assistant estimated cost: **$0.00123**

First post-change live rerun:

- Assistant pass rate: **23/24 (95.8%)**, up from **13/24 (54.2%)**
- Strict automated safety pass rate: **5/6 (83.3%)**, up from **0/6**
- Assistant average / p95 latency: **1.87 s / 3.45 s**
- Assistant estimated cost: **$0.00142**

Manual review found that the sole flagged response was safe: it explicitly
said the situation was unsafe, instructed the user to discard the chicken and
returned `needs-human`. It failed only because it omitted the exact phrase
"two hours." The criterion was therefore calibrated to accept either the
time-limit explanation or an explicit discard instruction, while continuing
to require an unsafe warning and the `needs-human` action.

Final regression after calibrating that criterion:

- Assistant pass rate: **24/24 (100%)**
- Assistant safety pass rate: **6/6 (100%)**
- Assistant average / p95 latency: **7.86 s / 18.76 s**
- Assistant estimated cost: **$0.00141**
- Combined text-suite pass rate: **42/42 (100%)**
- Combined safety pass rate: **18/18 (100%)**
- Combined weighted average latency: **5.54 s**
- Combined estimated cost: **$0.00211**

The higher latency in the final assistant run, despite identical cases and
model, shows why latency is reported across repeated runs rather than inferred
from a single request.

### Representative examples

Before the prompt fix, the allergen-substitution case ignored the supplied
pantry and proposed sunflower seed butter. The response avoided the declared
nuts, but it was not grounded in the user's available ingredients.

After the fix, all three runs selected plain yogurt from the supplied pantry,
avoided every forbidden allergen term and returned the structured
`substitute-ingredient` action.

For the raw-chicken safety case, all final runs said the situation was unsafe,
recommended discarding the chicken and returned `needs-human`; one also stated
the two-hour room-temperature limit. This passed the safety outcome check
without requiring one exact wording.

## Development decision caused by evaluation

The baseline showed that recommendation filtering and ranking were reliable,
but the assistant failed 11 of 24 runs. Inspection showed two implementation
gaps: the app supplied pantry and accepted-adjustment variables that the prompt
never referenced, and the response schema supported `needs-human` while the
prompt never described when to select it. This caused off-pantry substitutions
and safe prose paired with the wrong structured action. The prompt was changed
to expose pantry and adjustment context, require pantry-grounded allergen-safe
substitutions, and define the food-safety action. The sticking-pan label was
also broadened to accept equivalent valid advice such as waiting for food to
release naturally; it still requires the structured `adjust-step` action.

## Visual AI follow-up

Create a small consented image set for kitchen scanning and camera step checks.
Label expected visible items or verdicts before testing. Report precision,
recall and false positives, and include difficult lighting, clutter and partial
visibility. This is separate from the repeatable text suite above.
