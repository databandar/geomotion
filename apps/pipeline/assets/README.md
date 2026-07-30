# Per-stop images

Drop a picture named after the region into a folder named after the script slug,
and the pipeline attaches it to that region's tour stop automatically:

```
pipeline/assets/child-marriage-short/West Bengal.jpg
pipeline/assets/child-marriage-short/Bihar.png
```

Accepted extensions: `.jpg` `.jpeg` `.png` `.webp`. The name must match the region
name in the boundary set exactly (the same spelling the value table uses).

To point at a file somewhere else, or to add a caption, say so on the stop:

```json
{ "region": "Bihar", "say": "…", "image": "~/pics/bihar.jpg", "caption": "Patna, 2024" }
```

Images are embedded into the generated project as data URLs, so the project file
stays self-contained and renders without a server. That does make the project
file large — a 500 KB photo becomes ~680 KB of base64.

## Generated illustrations

The Studio can fill these in for you: **Script** step → **Illustrate** on a stop,
or **Illustrate all**. It writes here under the script's slug, so a generated
image and a hand-picked one are interchangeable — same folder, same naming.

Generated files are ordinary jpgs; delete or replace any of them freely. The
prompt defaults to a flat vector motif rather than a photograph, because an
AI-generated "photo" of a real state presented in a data video implies
documentary footage that doesn't exist.

**Use pictures you have the right to use.** For anything you supply yourself,
nothing here checks licensing.
