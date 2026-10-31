# Repos Agent Pipeline for Ubuntu

This is an Ubuntu-specific working copy of the agent pipeline. It leaves the
Windows source tree untouched. The existing video-projection application is
external to this folder and is neither copied nor started here.

## Ubuntu-side differences

- `run_booth.py` is a Linux-safe supervisor. It starts the dashboard, builds
  and serves the pointing HUD, and restarts `live_agent.py` after a crash or
  sustained loss of its HTTP/WebSocket services, using a capped backoff. It
  checks for port conflicts and does not kill processes it does not own.
- `live_agent.py` chooses a usable input device from PortAudio rather than
  assuming a Windows Realtek microphone or a fixed Windows device index.
- The dashboard and projection bridge read `VIDEO_PROJECTION_URL`; both
  default to `http://127.0.0.1:3000`.
- Dashboard services bind to loopback by default. The admin UI is intended to
  be opened on the booth machine.
- Camera/audio device configuration starts fresh. The existing Windows
  device indices are intentionally not carried across.
- Face enrollment data starts empty. Enroll the staff again on the Ubuntu
  machine; this avoids copying personal face images into the deployment copy.
- A recognized arrival opens a voice session for the existing inactivity
  window. Temporary face-tracking loss no longer discards microphone frames;
  after standby, the explicit wake phrase can still recover the session even
  when the camera has temporarily lost the visitor.

## Install on the Ubuntu machine

Use a supported Ubuntu release and install its system libraries first:

```bash
sudo apt update
sudo apt install -y python3-venv python3-dev build-essential ffmpeg \
  portaudio19-dev libportaudio2 libasound2-dev libgl1 libglib2.0-0 espeak-ng
```

Create the Python environment and install the project dependencies:

```bash
cd /path/to/ubuntu_fofc
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Install Node.js/npm on Ubuntu, then build the pointing app:

```bash
cd /path/to/ubuntu_fofc/fofc_point
npm ci
npm run build
```

Install Ollama for Ubuntu separately and make its configured model available:

```bash
ollama pull qwen2.5:3b
```

The first agent startup also downloads the Faster-Whisper, Silero VAD, YuNet,
and SFace models if they are not cached already. Allow network access during
that first setup, or pre-populate the respective model caches before taking
the booth machine offline. The Kokoro ONNX model and voice data are required
runtime assets, but are intentionally excluded from Git because of their size.
Copy `kokoro-v0_19.onnx` and `voices.bin` into this folder from a trusted model
bundle before starting the agent. The loader expects those filenames here.

PyTorch, Faster-Whisper, and ONNX Runtime may use different GPU runtimes. First
confirm that the pipeline works on CPU. Then install GPU-enabled packages that
match the Ubuntu NVIDIA driver and CUDA runtime, and confirm the providers shown
in the agent startup log. Do not copy the Windows virtual environment.

## Start the combined booth setup

Start the already-installed video-projection application normally and confirm
its product API is available at `http://127.0.0.1:3000/api/products`. Then, in
a terminal on the Ubuntu desktop:

```bash
cd /path/to/ubuntu_fofc
source .venv/bin/activate
python run_booth.py
```

If the projection app uses another local address:

```bash
python run_booth.py --projection-url http://127.0.0.1:3000
```

The launcher provides the master dashboard at `http://127.0.0.1:8000`,
the face/admin API at port `8088`, and the pointing HUD at port `5173`. It does
not start or alter the projection application. Staff diagnostics are at
`http://127.0.0.1:8000/diagnostics`; the pipeline supervisor status remains
available there even while the agent is restarting. Use Ctrl+C to stop the pipeline.

If a port is reported as occupied, stop the service that owns it and retry.
The launcher deliberately will not terminate unrelated processes.

## Booth-specific setup

1. Open the dashboard on the Ubuntu machine and choose the actual face and
   pointing cameras. The saved indices will be Ubuntu device indices.
2. Choose the microphone in the dashboard, or set `JARVIS_MIC_DEVICE_NAME` to
   a distinctive substring of its PortAudio name before launching.
3. Enroll staff again, then check camera permissions, microphone capture,
   speaker output, and the browser's local camera permission.
4. Recalibrate point targets on the actual booth display/camera. The copied
   normalized target definitions are a starting point; do not assume the
   Windows camera ordering or display geometry matches Ubuntu.
5. Confirm a spoken product question selects the same product in the running
   projection application and that its catalog descriptions reach the agent.

Run the launcher from the Ubuntu desktop session so Chromium can open the
dashboard and the booth's cameras, microphone, and speakers are available.
For automatic recovery if the launcher itself exits, install the user-level
systemd unit after editing its `WorkingDirectory` and `ExecStart` paths if this
folder is not `~/ubuntu_fofc`:

```bash
mkdir -p ~/.config/systemd/user
cp systemd/repos-booth.service.example ~/.config/systemd/user/repos-booth.service
systemctl --user daemon-reload
systemctl --user enable --now repos-booth.service
```

Use `systemctl --user status repos-booth.service` to check the launcher and
`journalctl --user -u repos-booth.service -f` to follow its output. The
launcher writes rotated restart history to `logs/pipeline_supervisor.log`.
The systemd unit is attached to the graphical session because the booth
browser and camera permissions need the logged-in desktop. Keep the Electron
projection app in that same session and start it before the agent when possible.
