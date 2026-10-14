"""Non-blocking link from pointed product IDs to the video-projection app."""

import os
import queue
import re
import threading
import time
from typing import Any, Dict, Optional

import requests


PROJECTION_BASE_URL = os.environ.get("VIDEO_PROJECTION_URL", "http://127.0.0.1:3000").rstrip("/")
CATALOG_URL = f"{PROJECTION_BASE_URL}/api/products"
VIDEO_CONTROL_URL = f"{PROJECTION_BASE_URL}/api/video-control"

_catalog_lock = threading.Lock()
_catalog_by_id: Dict[int, Dict[str, Any]] = {}
_play_queue: "queue.Queue[tuple[str, Optional[int]]]" = queue.Queue(maxsize=32)
_started = False

# Likely speech-to-text renderings for the current table labels. Keep these
# keyed by the normalized product name so catalog IDs remain dynamic. New
# products can also provide an `aliases` list in their product metadata.
SPOKEN_NAME_ALIASES = {
    "smart c": {"smart see", "smart sea"},
    "r cam": {"are cam", "our cam"},
    "r atg ultrasonic": {"r a t g ultrasonic", "are a t g ultrasonic"},
    "is barrier": {"i s barrier", "ice barrier"},
    "r atg capacitance": {"r a t g capacitance", "are a t g capacitance"},
    "one sync": {"onesync", "one sink", "1 sync", "1sync", "1 sink", "one six"},
    "data link": {"data lynk", "data link board"},
    "fire shield": {"fire sheild", "fire shield board"},
    "rfid": {"r f i d", "are f i d"},
    "secure fueling": {"secure fuelling"},
}


def refresh_product_catalog() -> bool:
    """Refresh board names, descriptions, and media paths from the projection app."""
    try:
        response = requests.get(CATALOG_URL, timeout=1.5)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise ValueError("Product catalog response must be an array")

        catalog: Dict[int, Dict[str, Any]] = {}
        for product in payload:
            if not isinstance(product, dict):
                continue
            try:
                product_id = int(product["id"])
            except (KeyError, TypeError, ValueError):
                continue
            catalog[product_id] = product

        with _catalog_lock:
            _catalog_by_id.clear()
            _catalog_by_id.update(catalog)
        print(f"[PROJECTION BRIDGE] Loaded {len(catalog)} products from {CATALOG_URL}")
        return True
    except Exception as exc:
        print(f"[PROJECTION BRIDGE] Product catalog unavailable: {exc}")
        return False


def get_product(product_id: Optional[int]) -> Optional[Dict[str, Any]]:
    if product_id is None:
        return None
    try:
        product_id = int(product_id)
    except (TypeError, ValueError):
        return None
    with _catalog_lock:
        product = _catalog_by_id.get(product_id)
        return dict(product) if product else None


def _product_aliases(product: Dict[str, Any]) -> set[str]:
    """Build conservative spoken/text aliases from live product metadata."""
    name = str(product.get("name") or "").strip()
    aliases = {name}
    extra = product.get("aliases", [])
    if isinstance(extra, str):
        extra = [extra]
    if isinstance(extra, list):
        aliases.update(str(alias).strip() for alias in extra if alias)
    # Match punctuation-free forms such as SMART#C -> SMART C and One-Sync -> One Sync.
    aliases.add(re.sub(r"[^a-z0-9]+", " ", name.lower()).strip())
    compact = re.sub(r"[^a-z0-9]+", "", name.lower())
    if len(compact) >= 5:
        aliases.add(compact)
    normalized = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
    aliases.update(SPOKEN_NAME_ALIASES.get(normalized, set()))
    return {re.sub(r"\s+", " ", alias.lower()).strip() for alias in aliases if alias}


def find_product_by_text(text: str) -> Optional[Dict[str, Any]]:
    """Return a product only when user text identifies exactly one catalog item."""
    if not text:
        return None
    with _catalog_lock:
        products = [dict(product) for product in _catalog_by_id.values()]
    if not products:
        refresh_product_catalog()
        with _catalog_lock:
            products = [dict(product) for product in _catalog_by_id.values()]

    normalized_text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    compact_text = re.sub(r"[^a-z0-9]+", "", text.lower())
    matches: Dict[int, Dict[str, Any]] = {}
    for product in products:
        try:
            product_id = int(product["id"])
        except (KeyError, TypeError, ValueError):
            continue
        for alias in _product_aliases(product):
            alias_words = re.sub(r"[^a-z0-9]+", " ", alias).strip()
            if not alias_words:
                continue
            if re.search(rf"(?<![a-z0-9]){re.escape(alias_words)}(?![a-z0-9])", normalized_text):
                matches[product_id] = product
                break
            compact_alias = re.sub(r"[^a-z0-9]+", "", alias)
            if len(compact_alias) >= 5 and compact_alias in compact_text:
                matches[product_id] = product
                break
    return next(iter(matches.values())) if len(matches) == 1 else None


def detect_video_intent(text: str) -> Optional[str]:
    """Detect explicit playback controls without treating board questions as commands."""
    normalized = re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()
    if not normalized:
        return None
    if re.search(r"\b(stop|end|close)\b.{0,24}\b(video|demo|playback)\b|\bstop playing\b", normalized):
        return "stop"
    if re.search(r"\bpause\b.{0,24}\b(video|demo|playback)\b|\bpause playing\b", normalized):
        return "pause"
    if re.search(r"\b(play|start|show|watch|see)\b.{0,40}\b(demo|video)\b", normalized):
        return "play"
    return None


def _catalog_worker() -> None:
    while True:
        refresh_product_catalog()
        time.sleep(30)


def _play_worker() -> None:
    while True:
        action, product_id = _play_queue.get()
        try:
            product = get_product(product_id) if product_id is not None else None
            if product_id is not None and not product:
                refresh_product_catalog()
                product = get_product(product_id)
            if product_id is not None and not product:
                print(f"[PROJECTION BRIDGE] Ignoring unknown product ID {product_id}")
                continue
            product = product or {}
            video_url = product.get("videoUrl") or product.get("video_url")
            if action == "play" and not video_url:
                print(f"[PROJECTION BRIDGE] Product ID {product_id} has no video URL")
                continue

            payload = {"action": action}
            if product_id is not None:
                payload.update({
                    "productId": product_id,
                    "productName": product.get("name", f"Product {product_id}"),
                })
            if video_url:
                payload["videoUrl"] = video_url

            response = requests.post(
                VIDEO_CONTROL_URL,
                json=payload,
                timeout=1.5,
            )
            response.raise_for_status()
            result = response.json()
            if result.get("success"):
                product_suffix = f" for product ID {product_id}" if product_id is not None else ""
                print(f"[PROJECTION BRIDGE] Sent {action} command{product_suffix} to projection software")
            else:
                print(f"[PROJECTION BRIDGE] Projection software did not confirm {action}: {result}")
        except Exception as exc:
            print(f"[PROJECTION BRIDGE] Could not send product ID {product_id}: {exc}")
        finally:
            _play_queue.task_done()


def start() -> None:
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_catalog_worker, daemon=True, name="ProjectionCatalogWorker").start()
    threading.Thread(target=_play_worker, daemon=True, name="ProjectionCommandWorker").start()


def point_to_product(product_id: Optional[int]) -> bool:
    """Queue selection of a product without blocking the pointing/speech pipeline."""
    try:
        if product_id is None:
            return False
        _play_queue.put_nowait(("swap", int(product_id)))
        return True
    except (TypeError, ValueError):
        return False
    except queue.Full:
        print("[PROJECTION BRIDGE] Command queue is full; dropping pointing update")
        return False


def play_product(product_id: Optional[int]) -> bool:
    """Queue playback of the selected product's demo video."""
    try:
        if product_id is None:
            return False
        product_id = int(product_id)
        product = get_product(product_id)
        if not product:
            refresh_product_catalog()
            product = get_product(product_id)
        if not product or not (product.get("videoUrl") or product.get("video_url")):
            return False
        _play_queue.put_nowait(("play", product_id))
        return True
    except (TypeError, ValueError):
        return False
    except queue.Full:
        print("[PROJECTION BRIDGE] Command queue is full; dropping video play request")
        return False


def stop_video() -> bool:
    """Queue a stop command for the projection TV."""
    try:
        _play_queue.put_nowait(("stop", None))
        return True
    except queue.Full:
        print("[PROJECTION BRIDGE] Command queue is full; dropping video stop request")
        return False


def pause_video() -> bool:
    """Queue a pause command for the projection TV."""
    try:
        _play_queue.put_nowait(("pause", None))
        return True
    except queue.Full:
        print("[PROJECTION BRIDGE] Command queue is full; dropping video pause request")
        return False
