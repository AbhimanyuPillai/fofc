"""Non-blocking link from pointed product IDs to the video-projection app."""

import os
import queue
import threading
import time
from typing import Any, Dict, Optional

import requests


PROJECTION_BASE_URL = os.environ.get("VIDEO_PROJECTION_URL", "http://127.0.0.1:3000").rstrip("/")
CATALOG_URL = f"{PROJECTION_BASE_URL}/api/products"
VIDEO_CONTROL_URL = f"{PROJECTION_BASE_URL}/api/video-control"

_catalog_lock = threading.Lock()
_catalog_by_id: Dict[int, Dict[str, Any]] = {}
_play_queue: "queue.Queue[int]" = queue.Queue(maxsize=32)
_started = False


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


def _catalog_worker() -> None:
    while True:
        refresh_product_catalog()
        time.sleep(30)


def _play_worker() -> None:
    while True:
        product_id = _play_queue.get()
        try:
            product = get_product(product_id)
            if not product:
                refresh_product_catalog()
                product = get_product(product_id)
            if not product:
                print(f"[PROJECTION BRIDGE] Ignoring unknown product ID {product_id}")
                continue
            video_url = product.get("videoUrl") or product.get("video_url")
            if not video_url:
                print(f"[PROJECTION BRIDGE] Product ID {product_id} has no video URL")
                continue

            response = requests.post(
                VIDEO_CONTROL_URL,
                json={
                    # `swap` is the projection app's existing carousel-selection signal.
                    # The app will resolve productId and move its selected card directly.
                    "action": "swap",
                    "productId": product_id,
                    "productName": product.get("name", f"Product {product_id}"),
                    "videoUrl": video_url,
                },
                timeout=1.5,
            )
            response.raise_for_status()
            result = response.json()
            if result.get("success"):
                print(f"[PROJECTION BRIDGE] Sent product ID {product_id} to projection software")
            else:
                print(f"[PROJECTION BRIDGE] Projection software did not confirm product ID {product_id}: {result}")
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
    """Queue a play command without blocking the pointing or speech pipeline."""
    try:
        if product_id is None:
            return False
        _play_queue.put_nowait(int(product_id))
        return True
    except (TypeError, ValueError):
        return False
    except queue.Full:
        print("[PROJECTION BRIDGE] Command queue is full; dropping pointing update")
        return False
