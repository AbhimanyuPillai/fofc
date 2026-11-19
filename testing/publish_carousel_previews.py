"""Copy rendered board frames into the carousel and regenerate its preview index."""

import argparse
import json
from pathlib import Path
from shutil import copyfile

from PIL import Image


PROJECTION = Path(__file__).resolve().parent.parent / "video-projection"
CAROUSEL = PROJECTION / "public" / "images" / "carousel"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("renders", type=Path, help="Directory containing product-ID render folders")
    args = parser.parse_args()
    catalog = json.loads((PROJECTION / "data" / "products.json").read_text(encoding="utf-8"))
    preview_index = {"frames": [], "products": {}}
    copies = []
    for product in catalog:
        product_id = product["id"]
        folder = "one-sync" if product_id == 8 else f"product-{product_id}"
        destination = CAROUSEL / folder
        source = args.renders / f"product-{product_id}"
        if product_id == 8 and not source.exists():
            source = destination
        render = json.loads((source / "frames.json").read_text(encoding="utf-8"))
        if preview_index["frames"] and preview_index["frames"] != render["frames"]:
            parser.error(f"{product['name']} was rendered with different carousel angles.")
        preview_index["frames"] = render["frames"]
        preview_index["products"][product_id] = {
            "modelPath": product["modelPath"], "folder": folder, "width": render["width"], "centersY": [],
        }
        for frame in render["frames"]:
            asset = source / frame["file"]
            if not asset.is_file() or asset.stat().st_size == 0:
                parser.error(f"Missing preview frame: {asset}")
            with Image.open(asset) as image:
                bounds = image.getchannel("A").point(lambda opacity: 255 if opacity >= 32 else 0).getbbox()
                if bounds is None:
                    parser.error(f"Preview frame is empty: {asset}")
                _, top, _, bottom = bounds
                preview_index["products"][product_id]["centersY"].append(
                    round(1 - (top + bottom) / (2 * image.height), 5)
                )
            if source != destination:
                copies.append((asset, destination / frame["file"]))
        if product_id == 8 and source != destination:
            copies.append((source / "frames.json", destination / "frames.json"))

    for source, destination in copies:
        destination.parent.mkdir(parents=True, exist_ok=True)
        copyfile(source, destination)
    (CAROUSEL / "previews.json").write_text(json.dumps(preview_index, indent=2) + "\n", encoding="utf-8")
    print(f"Published {len(preview_index['products'])} board previews.")


if __name__ == "__main__":
    main()
