# Chorus

A local English text-to-singing studio built with React and Bun. Write lyrics, choose a melody, edit each word’s pitch and duration, then render, play, and download a WAV file.

Chorus provides **LIEE neural singing** through a downloaded DiffSinger voicebank, plus three lightweight **classic synthetic voices**. Audio generation runs on your computer. The browser plays the finished file using an HTML audio element; it does not use browser speech synthesis, Web Audio, or microphone access.

Before installing or using LIEE, read [Voice model rights](VOICE_MODEL_RIGHTS.md) and the [creator’s current terms](https://docs.google.com/document/d/1t13WKc7VA2Q3G_MppznbAwhl3vLIL2MNPyjVN3kWDDg/edit). Credit published vocals as **LIEE**. Hosting requires prior permission; model monetization, training, and generative AI uses are restricted. Permission for an unclear neural workflow must be clarified with the creator. Use `./install.sh --classic-only` if permission for your intended LIEE use has not been established.

## Quick start

On Debian or Ubuntu, run from the project directory as your normal user:

```bash
./install.sh
bun run dev
```

Open **http://localhost:3000**. The installer uses `sudo` only when needed to install system packages with `apt-get`. It installs missing Bun and uv executables in user-local locations and creates a Python environment inside this project. You do not need Node.js, a GPU, an API key, or a cloud synthesis account.

Full installation includes:

- Native tools: curl, unzip, eSpeak, FFmpeg with Rubber Band support, and CPU runtime libraries.
- Bun and the JavaScript dependencies recorded in `bun.lock`.
- uv and a managed Python 3.12 environment in `.venv` (an existing environment must use Python 3.11 or later).
- NumPy, ONNX Runtime’s CPU package, and PyYAML.
- The original LIEE voicebank archive, with SHA-256 verification, and its extracted models.
- A real neural audio smoke test, TypeScript checking, and a browser-assets build.

Internet access is needed for installation. The voicebank archive is about **581 MiB**; allow at least **3 GB of free disk space** for the archive, extraction, dependencies, and temporary files. CPU inference can be memory intensive; start with a short phrase. Once installed, rendering works offline.

### Installer options

```bash
./install.sh --dry-run        # Show commands without installing or changing files
./install.sh --classic-only   # Skip the neural runtime and voice model
./install.sh --skip-system    # Use native dependencies that are already installed
./install.sh --help
```

Options can be combined. Re-running the installer reuses installed tools and verifies an existing model download. Interrupted model downloads resume; extracted models are refreshed during setup. The installer does not start a server or change firewall settings.

Automatic system package installation supports Debian/Ubuntu. On other Unix-like systems, install `curl`, `unzip`, an `espeak` executable, and an FFmpeg build with the `rubberband` filter yourself, then use `--skip-system`. Other systems have not been tested. Native Windows installation is not provided by `install.sh`.

If Bun or uv was just installed, a new terminal may need these user-local directories added to `PATH`:

```bash
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
```

## Using the studio

1. Enter up to **48 English words**, or choose an example phrase. Spell out numbers.
2. Choose **LIEE : Immortal Idol** for neural singing, or Nova, Alto, or Classic for the classic synthesizer.
3. Select a melody preset, key, and tempo (60–180 BPM).
4. Click a word in the piano roll to edit its note or length. Default words last 1.5–2 beats, with a 3-beat ending.
5. Click **Make it sing**, then play, seek, or download the WAV.

Editing lyrics, key, or melody regenerates the notes. Changing voice or tempo preserves manual note edits. Render again after changes; **Reset notes** restores the default melody and durations.

LIEE becomes available when its model files and Python dependencies are present, and is selected by default on page load. If it needs setup, the app shows that state and leaves classic voices available. Neural rendering errors are reported directly; Chorus does not silently substitute a classic voice.

## Manual setup

If you prefer to install dependencies yourself, install [Bun](https://bun.com/docs/installation), [uv](https://docs.astral.sh/uv/getting-started/installation/), eSpeak, and FFmpeg with Rubber Band support. On Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl unzip espeak ffmpeg libgomp1 libstdc++6
bun install --frozen-lockfile
bun run model:download
bun run model:setup
bun run dev
```

`model:setup` creates `.venv` with Python 3.12 when needed, verifies and extracts the model archive, installs Python packages, and renders **Hello world** as a real smoke test. The generated sample is saved to `models/liee-MM2.8/smoke-test.wav`; `runtime.json` records a successful check. Python packages are installed into `.venv`, not into the system Python.

For classic voices only, omit `model:download` and `model:setup`.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the server with hot reload |
| `bun start` | Start without hot reload |
| `bun run build` | Build browser assets into `dist/` |
| `bun run typecheck` | Check TypeScript |
| `bun test` | Run JavaScript, synthesis, and API tests |
| `bun run test:neural` | Run Python pronunciation, timing, extraction, and model-schema tests |
| `bun run model:download` | Download or verify the pinned voicebank archive |
| `bun run model:setup` | Prepare the Python runtime and models, then run a neural audio test |
| `bun run model:check` | Repeat the real neural audio test |

Neural Python tests require the project environment created by `model:setup`. The full test suite exercises native audio tools; model-schema tests use extracted model files when available. `model:check` runs actual CPU inference and can take longer than unit tests.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; set `0.0.0.0` explicitly for LAN access |
| `NODE_ENV` | Unset | Set `production` to disable Bun development mode |
| `CHORUS_PYTHON` | `.venv/bin/python`, then `python3` | Python executable used by neural rendering |

For example:

```bash
NODE_ENV=production PORT=3000 bun start
```

Keep the Bun server running while using the app. `dist/` contains browser assets only; it cannot render audio without the server, native tools, and local models.

## How rendering works

**Neural singing:** the LIEE adapter maps English pronunciation into the voicebank’s phonemes, predicts phoneme durations and vocal tension, and runs the acoustic model and bundled vocoder. eSpeak supplies pronunciation only; none of its audio is used. Notes supply a melody with gentle transitions and vibrato. Output is mono **44.1 kHz, 16-bit PCM WAV**.

Short phrases are rendered as connected sequences. Longer phrases are split at word boundaries into sections of at most 10 seconds to limit activation memory. The runtime uses CPU inference with at most two threads, loads stages separately, and permits one neural render at a time. Rendering times depend on hardware; requests time out after four minutes. This adapter uses hand-mapped English phonemes and a prescribed pitch curve, rather than the optional learned autopitch model. Each word occupies one musical note, including multi-syllable words.

**Classic synthesis:** eSpeak generates pronunciation audio. Voiced regions are sustained and tuned using FFmpeg’s Rubber Band filter while consonants retain clearer articulation. Local PCM processing adds expression and blends adjacent words. Output is mono **22.05 kHz, 16-bit PCM WAV**. These voices have a deliberately robotic timbre.

Temporary rendering files are removed after each request. Downloaded models, extraction artifacts, and the Python environment stay local under ignored `models/` and `.venv/` directories.

## Troubleshooting

- **Download fails:** check DNS, certificates, and outbound access to GitHub, its release-asset hosts, PyPI, the Bun installer, and Astral’s Python/package downloads. If your coding session restricts networking, run the installer in a normal terminal.
- **Checksum mismatch:** remove the named invalid archive or partial download and run `bun run model:download` again. Unverified files are not installed.
- **LIEE says setup required:** run `bun run model:setup`, then refresh the studio. Use `bun run model:check` to test inference directly.
- **Existing Python environment is too old:** rename `.venv` and rerun setup to create a managed Python 3.12 environment. The installer will not delete an existing environment automatically.
- **Missing Rubber Band filter:** check with `ffmpeg -hide_banner -filters`. Install an FFmpeg build containing the `rubberband` filter.
- **A word has too many sounds for its note:** increase its note length or lower the tempo.
- **Rendering is slow or runs out of memory:** try fewer words and close other memory-intensive programs. No GPU is required, but CPU rendering has practical limits.

## License and voice credits

The **Chorus application code and documentation are licensed under the [MIT License](LICENSE)**. This does not relicense the downloaded voicebank, vocoder, tools, or other dependencies.

**LIEE : Immortal Idol ‘Lilia’ — JubiLIEE 2025 1.1** is provided by **julieraptor**. Its original archive and included notices are preserved locally; the linked online terms may be newer. The [voice model rights notice](VOICE_MODEL_RIGHTS.md) explains credit requirements, hosting permissions, prohibited uses, and the unresolved scope of the generative AI restriction. Review the current terms before use or publication. The bundled singing vocoder is provided by **OpenVPI / the DiffSinger Community** under **CC BY-NC-SA 4.0**, with its original notice preserved in the voicebank’s `dsvocoder/NOTICE.txt`. Third-party components retain their respective licenses.

- [Pinned voicebank release](https://github.com/julieraptor/DIFFSINGER-LIEE-Immortal-Idol/releases/tag/MM2.8)
- [Published archive checksum](https://github.com/julieraptor/DIFFSINGER-LIEE-Immortal-Idol/releases/expanded_assets/MM2.8)
- [LIEE usage guide](https://github.com/julieraptor/DIFFSINGER-LIEE-Immortal-Idol/wiki)
- [LIEE terms of use](https://docs.google.com/document/d/1t13WKc7VA2Q3G_MppznbAwhl3vLIL2MNPyjVN3kWDDg/edit)
- [DiffSinger Community vocoder notices](https://openvpi.github.io/vocoders/)

Chorus is an independent project, not the commercial Yamaha VOCALOID software.
# web_vocaloid
