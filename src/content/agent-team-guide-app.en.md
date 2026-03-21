# Agent Team Guide

## When To Use It

Agent team works best when you want to **review the same topic from multiple angles**, rather than get one fast answer.

- Before designing a new feature, when you want to uncover missing requirements
- Before release, when you want to review bugs, security, and test gaps together
- When you want UX/UI improvements from product, design, and implementation perspectives
- When you want to inspect performance issues across implementation, bottlenecks, and regression risk

For simple one-off questions or tasks where you just need to fix a single file, regular chat is usually more efficient.

## Quick Start

1. Create a team and choose at least two agents.
2. Pick the discussion mode that fits your goal.
3. Enter the topic as an open-ended question.
4. When the discussion finishes, compare each agent's responses and summarize the conclusion.

## Recommended Team Setups

### Feature Design Team
Architect + Developer + Critic + Tester

- When: before locking in a new feature structure
- Good prompt:

```text
Review this feature design. From each perspective, summarize missing requirements, implementation risks, and test points.
```

### Product Improvement Team
Architect + UI designer + Developer + Critic

- When: improving onboarding, conversion, or usability
- Good prompt:

```text
Suggest ways to reduce onboarding drop-off from product, design, and implementation perspectives.
```

### Release Review Team
Developer + Tester + Security expert + Critic

- When: checking risk right before shipping
- Good prompt:

```text
Review whether this change is ready to ship. Focus on bug risk, security risk, and test gaps.
```

### Performance Optimization Team
Developer + Optimizer + Critic + Tester

- When: analyzing bottlenecks and regression risk
- Good prompt:

```text
Analyze why this screen is slow, then suggest optimizations in order of impact versus implementation cost.
```

## Discussion Modes

### Sequential (`→`)
Agents speak one by one while referencing the earlier responses.

- Best for deeper review
- Agreement, disagreement, and refinements build naturally

### Parallel (`⇉`)
All agents create an independent first response at the same time.

- Early responses are less biased by each other
- Good for fast brainstorming

### Meeting (`◎`)
Multiple rounds help narrow the discussion over time.

- Best for important design decisions or topics with disagreement
- Takes longer, but the path to consensus is easier to follow

## How To Write A Good Topic

A good topic includes the **thing to judge + constraints + desired output**.

Good example:

```text
Review whether we should refactor the Electron session state structure. Existing IPC event names must stay the same, and migration cost should stay low. For each perspective, summarize the problems, two alternatives, and one recommendation.
```

Poor example:

```text
What should this function be called?
```

## How To Read The Result

- Click a character to see that agent's full responses in the right detail panel.
- Click `Latest cue` to jump to the start of that round.
- Use the copy icon in the top-right of a speech bubble to copy an individual response.
- Click the central `TASK` board to reopen the full current topic.

## Interaction Tips

- `Enter`: send
- `Shift + Enter`: newline
- While streaming, press `Esc` twice quickly to stop the discussion.
- Teams can include up to 8 agents, but 4 to 6 is usually the easiest to read.
