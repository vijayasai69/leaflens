"""Serve LeafLens and run its local or Hugging Face classifier."""

from __future__ import annotations

import io
import json
import os
import threading
from email import policy
from email.parser import BytesParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, UnidentifiedImageError


ROOT = Path(__file__).resolve().parent
BASE_MODEL_ID = "vijayasai69/leaflens-plant-disease"
LOCAL_MODEL_DIR = ROOT / "models" / "verdant-field-continued"
MODEL_ID = os.environ.get("HF_MODEL_ID") or str(
    LOCAL_MODEL_DIR if (LOCAL_MODEL_DIR / "config.json").is_file() else BASE_MODEL_ID
)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

_model = None
_processor = None
_model_lock = threading.Lock()


def load_model():
    global _model, _processor
    if _model is not None:
        return _model, _processor
    with _model_lock:
        if _model is None:
            import torch
            from transformers import AutoImageProcessor, AutoModelForImageClassification

            token = os.environ.get("HF_TOKEN")
            _processor = AutoImageProcessor.from_pretrained(MODEL_ID, token=token)
            _model = AutoModelForImageClassification.from_pretrained(MODEL_ID, token=token)
            _model.eval()
    return _model, _processor


class LeafLensHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # Avoid logging submitted filenames or request payloads.
        if self.path.startswith("/api/"):
            print(f"{self.address_string()} {self.command} {urlparse(self.path).path}")
        else:
            super().log_message(fmt, *args)

    def do_GET(self):
        if urlparse(self.path).path == "/api/health":
            self._json(200, {"ok": True, "model": MODEL_ID, "loaded": _model is not None})
            return
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/analyze":
            self._json(404, {"detail": "Not found."})
            return

        try:
            image = self._read_image()
            model, processor = load_model()
            inputs = processor(images=image, return_tensors="pt")
            import torch

            with torch.inference_mode():
                logits = model(**inputs).logits[0]
                scores = torch.softmax(logits, dim=-1)
                count = min(3, scores.shape[0])
                values, indices = torch.topk(scores, count)

            predictions = []
            for score, index in zip(values.tolist(), indices.tolist()):
                label = model.config.id2label.get(index, str(index))
                predictions.append({"label": label, "score": round(float(score), 6)})
            self._json(200, {"model": MODEL_ID, "predictions": predictions})
        except ValueError as exc:
            self._json(400, {"detail": str(exc)})
        except (UnidentifiedImageError, Image.DecompressionBombError):
            self._json(400, {"detail": "That image could not be opened. Try a smaller JPG, PNG, or WEBP photo."})
        except Exception as exc:
            print(f"Analysis failed ({type(exc).__name__}): {exc}")
            self._json(503, {"detail": "The model service is unavailable. Start it again and retry the photo."})

    def _read_image(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Invalid upload size.") from exc
        if length <= 0 or length > MAX_UPLOAD_BYTES + 128_000:
            raise ValueError("Choose an image smaller than 10 MB.")
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            raise ValueError("Upload a photo using the LeafLens photo picker.")

        body = self.rfile.read(length)
        envelope = (
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("ascii") + body
        )
        message = BytesParser(policy=policy.default).parsebytes(envelope)
        for part in message.iter_parts():
            if part.get_content_disposition() == "form-data" and part.get_param("name", header="content-disposition") == "image":
                payload = part.get_payload(decode=True) or b""
                if len(payload) > MAX_UPLOAD_BYTES:
                    raise ValueError("Choose an image smaller than 10 MB.")
                with Image.open(io.BytesIO(payload)) as uploaded:
                    if uploaded.width * uploaded.height > MAX_IMAGE_PIXELS:
                        raise ValueError("This photo is too large to analyze. Choose a smaller image.")
                    uploaded.verify()
                with Image.open(io.BytesIO(payload)) as uploaded:
                    return uploaded.convert("RGB")
        raise ValueError("No photo was found in the request.")

    def _json(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    host = os.environ.get("LEAFLENS_HOST", "127.0.0.1")
    port = int(os.environ.get("LEAFLENS_PORT", "8000"))
    print(f"LeafLens is running at http://{host}:{port}")
    print(f"Model: {MODEL_ID} (weights load on the first photo check)")
    ThreadingHTTPServer((host, port), LeafLensHandler).serve_forever()
