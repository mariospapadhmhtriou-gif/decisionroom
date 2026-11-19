# DecisionRoom

A focused comparison workspace for the DeepSpace build exercise.

## Current implementation
Open index.html in a modern browser. No install required. Includes responsive charcoal-and-gold UI, editable question, three options, three criteria, weighted rankings, ties, zero-weight handling, evidence notes, editable template brief, stale-brief detection, browser-local persistence and JSON export. Fictional sample data is labeled.

This is a frontend prototype, not a completed full-stack submission. No DeepSpace deployment, authentication, server authorization, cloud storage, collaboration, web search, AI generation, or email delivery is implemented yet. Export is currently download-only; import is not implemented. Browser storage on file URLs may vary.

## Verification
Code authored through an AI assistant. Browser behavior, JavaScript execution, accessibility and end-to-end tests have not yet been run. Do not claim otherwise in the submission.

## Next implementation steps
1. Read the official DeepSpace skill and current docs at https://docs.deep.space/ and https://github.com/deepdotspace/deepspace-skill.
2. Scaffold with the official CLI and preserve generated configuration. Do not guess SDK signatures.
3. Port this UI into the scaffold, extracting scoring into a pure tested function.
4. Add native authenticated owner-private persistence with server-enforced access.
5. Discover current integration schemas; implement web search, evidence-grounded AI briefs and explicit email-to-self sending.
6. Verify isolation with two users, failure recovery and deployed important path before polishing secondary features.

## Tradeoff
Keep scoring deterministic and scope fixed at three options and three criteria. No autonomous browsing, payments or custom login. Add collaboration only after access controls and concurrent updates are tested. Treat source text as untrusted input and keep credentials out of frontend files.
