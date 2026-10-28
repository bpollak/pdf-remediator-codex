import hmac
import logging
import os
import re
import shlex
import signal
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

app = FastAPI(title="OCRmyPDF Worker", version="0.1.0")
logger = logging.getLogger("ocr-worker")

DEFAULT_MAX_UPLOAD_MB = 75
DEFAULT_TIMEOUT_SECONDS = 240
DEFAULT_OCRMYPDF_JOBS = 2
DEFAULT_MAX_CONCURRENT = 1
COPY_CHUNK_BYTES = 1024 * 1024


def get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def get_max_upload_bytes() -> int:
    mb = get_env_int("OCR_MAX_UPLOAD_MB", DEFAULT_MAX_UPLOAD_MB)
    return mb * 1024 * 1024


def get_timeout_seconds() -> int:
    return min(get_env_int("OCR_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS), 900)


def get_ocr_jobs() -> int:
    return min(get_env_int("OCR_OCRMYPDF_JOBS", DEFAULT_OCRMYPDF_JOBS), 8)


# OCR is CPU-bound; running more jobs than this at once only makes all of them slow.
OCR_SLOTS = threading.BoundedSemaphore(min(get_env_int("OCR_MAX_CONCURRENT", DEFAULT_MAX_CONCURRENT), 8))

if not os.getenv("OCR_WORKER_API_KEY"):
    logger.warning("OCR_WORKER_API_KEY is not set: the /ocr endpoint accepts unauthenticated requests.")


def normalize_language(language: str | None) -> str:
    if not language:
        return "eng"
    normalized = language.strip().lower()
    if not normalized:
        return "eng"
    if not re.fullmatch(r"[a-z+]+", normalized):
        return "eng"
    return normalized


def authorize(authorization: str | None, x_api_key: str | None) -> None:
    configured_key = os.getenv("OCR_WORKER_API_KEY")
    if not configured_key:
        return

    if x_api_key and hmac.compare_digest(x_api_key.encode(), configured_key.encode()):
        return

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if hmac.compare_digest(token.encode(), configured_key.encode()):
            return

    raise HTTPException(status_code=401, detail="Unauthorized OCR request.")


def build_ocrmypdf_command(input_path: Path, output_path: Path, language: str) -> list[str]:
    command = [
        "ocrmypdf",
        "--skip-text",
        "--output-type",
        "pdf",
        "--rotate-pages",
        "--deskew",
        "--jobs",
        str(get_ocr_jobs()),
        "-l",
        language,
    ]

    extra_args = (os.getenv("OCRMYPDF_EXTRA_ARGS") or "").strip()
    if extra_args:
        command.extend(shlex.split(extra_args))

    command.extend([str(input_path), str(output_path)])
    return command


@app.middleware("http")
async def reject_oversized_uploads(request: Request, call_next):
    # Refuse before the multipart body is parsed, so an oversized or
    # unauthenticated upload never has to be received in full.
    content_length = request.headers.get("content-length")
    if request.url.path == "/ocr" and content_length and content_length.isdigit():
        limit = get_max_upload_bytes() + COPY_CHUNK_BYTES  # room for multipart framing
        if int(content_length) > limit:
            return JSONResponse(
                status_code=413,
                content={"error": f"Uploaded file exceeds OCR_MAX_UPLOAD_MB ({get_max_upload_bytes() // (1024 * 1024)} MB)."},
            )
    return await call_next(request)


def copy_upload(file: UploadFile, destination: Path, max_bytes: int) -> int:
    written = 0
    with destination.open("wb") as handle:
        while chunk := file.file.read(COPY_CHUNK_BYTES):
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Uploaded file exceeds OCR_MAX_UPLOAD_MB ({max_bytes // (1024 * 1024)} MB).",
                )
            handle.write(chunk)
    return written


def run_ocrmypdf(command: list[str], timeout_seconds: int) -> subprocess.CompletedProcess[str]:
    # Own process group, so a timeout also stops tesseract and ghostscript children.
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


# A plain def runs in FastAPI's threadpool, so a long OCR job does not block
# the event loop (and /healthz) for everyone else.
@app.post("/ocr")
def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> Response:
    authorize(authorization, x_api_key)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    lang = normalize_language(language)
    timeout_seconds = get_timeout_seconds()

    with tempfile.TemporaryDirectory(prefix="ocr-worker-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.pdf"
        output_path = temp_path / "output.pdf"
        if not copy_upload(file, input_path, get_max_upload_bytes()):
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        command = build_ocrmypdf_command(input_path, output_path, lang)

        if not OCR_SLOTS.acquire(timeout=timeout_seconds):
            return JSONResponse(status_code=503, content={"error": "OCR worker is busy. Try again shortly."})
        try:
            result = run_ocrmypdf(command, timeout_seconds)
        except subprocess.TimeoutExpired:
            return JSONResponse(
                status_code=504,
                content={"error": f"OCR timed out after {timeout_seconds} seconds."},
            )
        finally:
            OCR_SLOTS.release()

        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            detail = stderr if stderr else stdout
            return JSONResponse(
                status_code=502,
                content={
                    "error": "OCRmyPDF failed to process the document.",
                    "detail": detail[:2000],
                },
            )

        if not output_path.exists():
            return JSONResponse(
                status_code=502,
                content={"error": "OCRmyPDF completed without output."},
            )

        output_bytes = output_path.read_bytes()
        if not output_bytes:
            return JSONResponse(
                status_code=502,
                content={"error": "OCRmyPDF produced an empty file."},
            )

        return Response(
            content=output_bytes,
            media_type="application/pdf",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'inline; filename="ocr-output.pdf"',
            },
        )
