# IntellaBets Skills

Two Agent Skills and an agent definition.

| Skill | What it does |
|---|---|
| `pick-writeup` | Turns a raw engine pick into customer-facing copy: the edge explained, the book and stake, and the caveats that have to be there |
| `bet-grading` | Grades settled bets into profit, ROI, win rate and CLV, with the arithmetic traps handled |

Both encode the same constraint the rest of this codebase does: **never state a
number that did not come from real data.** Published performance claims that
could not be supported are what cost this business its first payment processor.

## Build

```bash
bash skills/build.sh
```

Writes `skills/dist/<name>.zip`. The archive contains `<name>/SKILL.md` — the
directory, not a bare `SKILL.md`, which is what the uploader expects.

## Upload

Either drag each zip into the **Skills** section of the Anthropic Console, or:

```bash
ant skills create --file skills/dist/pick-writeup.zip
ant skills create --file skills/dist/bet-grading.zip
```

Each returns an ID like `skill_01AbCdEfGhIjKlMnOpQrStUv`. Keep both.

## Create the agent

Put the two IDs into `intellabets.agent.yaml` in place of the
`REPLACE_WITH_*` placeholders, then:

```bash
AGENT_ID=$(ant beta:agents create < skills/intellabets.agent.yaml --transform id -r)
echo "$AGENT_ID"
```

Store that ID. Create the agent **once** and reference it from your
application — never call `agents.create` in a request path.

To update it later (the version acts as an optimistic lock):

```bash
ant beta:agents update --agent-id "$AGENT_ID" --version 1 < skills/intellabets.agent.yaml
```

## Things that will bite you

**Skills do not sync across surfaces.** A skill uploaded here is not available
on claude.ai, and one uploaded on claude.ai is not available through the API.
Each surface needs its own upload.

**The `description` is the whole trigger.** Claude only sees `name` and
`description` until a skill fires. Both are written as "does X. Use when Y" for
that reason — if you edit them, keep the "use when" half or the skill silently
never activates.

**The API sandbox has no network access** and cannot install packages at
runtime. `grade_bets.py` uses only the standard library, deliberately.

**Skills are instructions with real capability.** Anything in a `SKILL.md` runs
with whatever access the session has. Review changes the way you would review
code, not documentation.

## Testing the grader locally

```bash
python3 skills/bet-grading/scripts/grade_bets.py bets.csv
python3 skills/bet-grading/scripts/grade_bets.py bets.json --format json
```

Columns: `stake`, `odds_decimal`, `status` required; `closing_odds`,
`market_type`, `sport`, `book` optional. `status` is one of `won`, `lost`,
`push`, `void`, `pending`.
