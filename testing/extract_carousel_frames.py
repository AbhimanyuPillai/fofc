"""Export evenly spaced still WebPs from a turntable animation."""

import argparse
from collections import deque
import json
import math
from pathlib import Path

from PIL import Image, ImageChops


def remove_neutral_background(image):
    """Clear light grey background and shadows connected to the image edges."""
    width, height = image.size
    pixels = list(image.getdata())
    clear = bytearray(width * height)
    pending = deque()

    def visit(x, y):
        index = y * width + x
        if clear[index]:
            return
        r, g, b, a = pixels[index]
        if a == 0 or (min(r, g, b) >= 75 and max(r, g, b) - min(r, g, b) <= 16):
            clear[index] = 1
            pending.append((x, y))

    for x in range(width):
        visit(x, 0)
        visit(x, height - 1)
    for y in range(height):
        visit(0, y)
        visit(width - 1, y)
    while pending:
        x, y = pending.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                visit(nx, ny)

    alpha = Image.frombytes("L", image.size, bytes(0 if pixel else 255 for pixel in clear))
    image.putalpha(ImageChops.darker(image.getchannel("A"), alpha))
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--count", type=int, default=24)
    parser.add_argument("--neutral-background", action="store_true",
                        help="Remove a light grey backdrop from a colored board render")
    parser.add_argument("--carousel-slots", type=int, default=0,
                        help="Also extract exact resting angles for this many carousel slots")
    parser.add_argument("--ring-radius", type=float, default=300)
    parser.add_argument("--camera-distance", type=float, default=400)
    parser.add_argument("--turn-keyframes", nargs=5, type=int, metavar="FRAME",
                        help="Source frame indexes for 0, 90, 180, 270, and 360 degrees")
    args = parser.parse_args()
    with Image.open(args.source) as source:
        if not 1 <= args.count <= source.n_frames:
            parser.error(f"--count must be between 1 and {source.n_frames}.")
        if args.carousel_slots < 0 or not 0 < args.ring_radius < args.camera_distance:
            parser.error("Use a nonnegative slot count and a ring radius smaller than the camera distance.")
        keyframes = args.turn_keyframes
        if keyframes and (keyframes != sorted(set(keyframes)) or not 0 <= keyframes[0] < keyframes[-1] < source.n_frames):
            parser.error("Turn keyframes must be strictly increasing source frame indexes.")

        angles = {round(360 * i / args.count, 4) for i in range(args.count)}
        for slot in range(args.carousel_slots):
            orbit = math.tau * slot / args.carousel_slots
            sightline = math.atan2(-args.ring_radius * math.sin(orbit),
                                   args.camera_distance - args.ring_radius * math.cos(orbit))
            # Source frames rotate the board while the camera stays fixed.
            angles.add(round(math.degrees(orbit - sightline) % 360, 4) % 360)
        angles = sorted(angles)
        frames = []
        bounds = []
        for angle in angles:
            if keyframes:
                quadrant = int(angle // 90)
                fraction = (angle % 90) / 90
                first, last = keyframes[quadrant:quadrant + 2]
                source.seek(round(first + fraction * (last - first)))
            else:
                source.seek(int(angle / 360 * source.n_frames))
            frame = source.convert("RGBA")
            if args.neutral_background:
                frame = remove_neutral_background(frame)
            box = frame.getchannel("A").getbbox()
            if box is None:
                parser.error(f"Frame at {angle} degrees is empty after background removal.")
            frames.append(frame)
            bounds.append(box)
        # A fixed crop keeps the apparent center and size steady between angles.
        left, top = (max(0, min(box[i] for box in bounds) - 2) for i in (0, 1))
        right = min(source.width, max(box[2] for box in bounds) + 2)
        bottom = min(source.height, max(box[3] for box in bounds) + 2)
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for index, (angle, frame) in enumerate(zip(angles, frames)):
        filename = f"angle-{index:02d}.webp"
        frame.crop((left, top, right, bottom)).save(
            args.output / filename, quality=88, method=6
        )
        manifest.append({"angle": angle, "file": filename})
    (args.output / "frames.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(frames)} still frames at {right-left} × {bottom-top} to {args.output}")


if __name__ == "__main__":
    main()
