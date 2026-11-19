# Booth agent review

Run these commands from the repository root using the Python environment you normally use for the booth.

## Hear the agent answer the board questions

Leave the projection software running so the agent can load its product catalog. Stop `run_booth.py` first. This script starts its own copy of the agent using the configured microphone and speakers, then closes it when the review ends. Run it somewhere quiet so live microphone input and face greetings don't interrupt the review.

```sh
python testing/review_agent.py questions --step
```

With `--step`, press Enter between questions. Omit it to run the full list automatically, or use `--board "ONE SYNC"` to hear one board. The script selects the Windows agent on Windows and the Ubuntu agent on Linux. Keep the questions in order for follow-ups that refer to “it” or “this board.”

Each run saves `answers.jsonl` with the prompts, transcripts, and review notes, and `agent.log` with the full agent output. Silence cases report whether the agent stayed quiet. Other answers are for you to review against the notes.

## Replay specific words

Start `run_booth.py` as usual and leave it running. In a second terminal using the booth Python environment, run:

```sh
python testing/review_agent.py pronunciation
python testing/review_agent.py pronunciation --term atg
```

This uses the running agent's Kokoro voice and pronunciation rules. It plays each sample and saves a WAV to replay later. Use `--save-only` if you only want the audio files. Edit `pronunciations.json` to add an exact sentence you heard at the booth.

Results are saved under `testing/runs/`. Question mode uses typed input, so `one sink` checks how the agent interprets that transcript. To check whether Whisper hears the spoken name correctly, ask a few questions through the booth microphone and compare the dashboard transcripts.

## Measure projection memory before and after

Leave video-projection running on port 3000. From the repository root, use a Python environment with `psutil` installed.

```sh
python testing/measure_projection_memory.py --label baseline
python testing/measure_projection_memory.py --browser-pid 12345 --label baseline-carousel
```

The first command measures the server. Replace `12345` with the root PID of a browser or Electron instance dedicated to the projection display for the second command. Close unrelated tabs in that instance. The script includes the renderer and GPU processes in that browser tree and counts each process once.

For a repeatable laptop benchmark, pass `--chrome-exe` with the full path to Chrome instead of `--browser-pid`. This opens an isolated headless browser, records the WebGL renderer and GLB requests, and measures the page after it settles. That mode also needs `websockets`. Use the same browser mode, window size, server mode, and display pages before and after a change. For the Ubuntu booth baseline, prefer the actual kiosk browser or Electron PID.

The script prints median and peak memory in MiB and writes a CSV in `testing/runs/`. Compare private resident memory (USS) on Windows or proportional resident memory (PSS) on Linux when available. RSS can count shared pages more than once. Private commit measures allocated memory rather than physical RAM in use. The CSV does not measure GPU VRAM.

## Carousel previews

The standard carousel uses still WebP angles for all ten boards while they are off center. The selected board shows its live GLB. Open the carousel with `?carousel=glb` to compare the previous all-GLB behavior.

To render frames directly from the original GLB, install the projection app dependencies and use a Python environment with Pillow and websockets:

```sh
python testing/render_carousel_frames.py video-projection/public/3dModels/One_Sync-1759317036847-1766051504093.glb testing/runs/carousel-rollout/product-8 --chrome-exe "/path/to/chrome"
python testing/publish_carousel_previews.py testing/runs/carousel-rollout
```

The renderer runs Three.js in an isolated local Chrome instance and saves transparent 512 × 512 WebPs. It includes frames every 15 degrees for movement and additional frames for the resting slots. To publish a set, stage each catalog board's render under its `product-ID` folder. The publisher can reuse the existing published OneSync frames if there is no `product-8` folder. Use the matching ring radius, camera distance, and slot count if those settings change. The separate `extract_carousel_frames.py` still works for extracting images from an existing animation.
