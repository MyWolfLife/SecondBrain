# Importing the book's exercises — plan

*2026-10-24. Builds on `YAYOGAnalysis.md` §7 step 4. Exercises first; the 10-week programs come with the Programs feature later.*

## Decisions (assumptions — tell me if any is wrong)

1. **Personal use, kept out of the repository.** The GitHub repo and site are public, so the book-derived data file is **never committed** (`import-data/` is in `.gitignore`). The app only reads a file you choose from your own computer.
2. **Short paraphrased cues, no pictures from the book** (you add your own pictures/GIFs later).
3. **Exercises only for now.** Programs need the Programs feature first.
4. **The book's variations become levels.** "Easier" variations come before the base exercise and "kick it up a notch" variations after it, so each exercise becomes an easiest → hardest ladder (the levels feature).
5. **Muscles map to your existing list** through a mapping table (pectorals → Chest, deltoids → Shoulders, quadriceps → Quads …). The first two muscles the book lists (it orders them by emphasis) become ★ main; the rest "also". Names that can't be mapped are shown in the review screen and skipped.
6. **Household equipment** (door, towel, table, backpack …) becomes entries in your Equipment list with a one-line description of what can stand in for it.
7. **Nothing is written until you approve it** on a review screen; every imported exercise is stamped `source: "YAYOG"`, and the screen can remove an import again (exercises used in a workout are left alone).

## Two parts

**A. The Import screen (in the app, committed).** `Fitness → Exercises → ⬆ Import`. Choose a JSON file → the app checks it → a **review list** (tick or untick each exercise; muscles shown mapped; new equipment marked ➕; "already have it" flagged; levels counted; cues previewable) → **Import selected**. It writes exercises, new equipment and levels exactly as if you had typed them. A second section **removes everything imported from a source**.

**B. The data file (made by me, local only).** `import-data/yayog-exercises.json`, produced by reading the book's exercise chapter and writing one record per exercise (name, category, muscles in the book's order, difficulty, equipment, sides, short cues, easier/harder variations as levels, precautions). You load it into the Import screen yourself.

## File format (`bishop-exercises-v1`)

```
{ "format": "bishop-exercises-v1", "source": "YAYOG",
  "exercises": [ {
     "name", "category": "push|pull|core|legs|full", "pushPull": "push|pull|both|neither",
     "measure": "reps|time", "amount": 10, "sideMode": "both|each|alternate", "startSide", "swapStart",
     "muscles": ["pectorals", "triceps", ...],      // book order = emphasis
     "equipment": ["Chair"] | [{"name","description"}],
     "precaution": "…", "cues": ["…"],
     "levels": [ {"label", "difficulty": 1-4, "cues": [...], "equipment": [...], "amount": 12} ]   // easiest → hardest
  } ] }
```

## Build steps

1. Plan + file format (this doc).
2. The Import screen and its tests with a small sample in the preview.
3. Read the book's exercise chapter and write the data file in batches; check it with the screen's validator.
4. Docs, commit and push the tool (the data file stays local).
