import asyncio
import hmac
import logging
import os
import re
import shlex
import shutil
import signal
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

# No interactive docs or schema: the worker has one private endpoint.
app = FastAPI(title="OCRmyPDF Worker", version="0.2.0", docs_url=None, redoc_url=None, openapi_url=None)
logger = logging.getLogger("ocr-worker")

DEFAULT_MAX_UPLOAD_MB = 75
DEFAULT_TIMEOUT_SECONDS = 240
DEFAULT_OCRMYPDF_JOBS = 2
DEFAULT_MAX_CONCURRENT = 1
DEFAULT_QUEUE_WAIT_SECONDS = 30
COPY_CHUNK_BYTES = 1024 * 1024
OCR_PATH = "/ocr"


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


def get_queue_wait_seconds() -> int:
    return min(get_env_int("OCR_QUEUE_WAIT_SECONDS", DEFAULT_QUEUE_WAIT_SECONDS), 300)


def get_api_key() -> str | None:
    return os.getenv("OCR_WORKER_API_KEY") or None


def unauthenticated_allowed() -> bool:
    # Only for local development: an explicit opt-in to run without a key.
    return os.getenv("OCR_WORKER_ALLOW_UNAUTHENTICATED", "").strip().lower() == "true"


def auth_configured() -> bool:
    return bool(get_api_key()) or unauthenticated_allowed()


def error_response(status_code: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message, "code": code}, headers=headers)


# OCR is CPU-bound; running more jobs than this at once only makes all of them
# slow. The slot is taken before the upload is read, so waiting requests do
# not hold their uploads in memory or on disk.
OCR_SLOTS = asyncio.Semaphore(min(get_env_int("OCR_MAX_CONCURRENT", DEFAULT_MAX_CONCURRENT), 8))

if not get_api_key():
    if unauthenticated_allowed():
        logger.warning("OCR_WORKER_API_KEY is not set and OCR_WORKER_ALLOW_UNAUTHENTICATED=true: /ocr accepts unauthenticated requests.")
    else:
        logger.error("OCR_WORKER_API_KEY is not set: refusing every /ocr request. Set OCR_WORKER_ALLOW_UNAUTHENTICATED=true for local development only.")


def normalize_language(language: str | None) -> str:
    if not language:
        return "eng"
    normalized = language.strip().lower()
    if not normalized:
        return "eng"
    if not re.fullmatch(r"[a-z+]+", normalized):
        return "eng"
    return normalized


def is_authorized(authorization: str | None, x_api_key: str | None) -> bool:
    configured_key = get_api_key()
    if not configured_key:
        return unauthenticated_allowed()

    if x_api_key and hmac.compare_digest(x_api_key.encode(), configured_key.encode()):
        return True

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if hmac.compare_digest(token.encode(), configured_key.encode()):
            return True

    return False


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
async def guard_ocr_requests(request: Request, call_next):
    # Everything here runs before the multipart body is read, so an
    # unauthenticated, unsized or oversized upload is never received, and a
    # busy worker does not buffer uploads it cannot start on yet.
    if request.url.path != OCR_PATH or request.method != "POST":
        return await call_next(request)

    if not auth_configured():
        return error_response(503, "not_configured", "OCR worker is not configured.")

    if not is_authorized(request.headers.get("authorization"), request.headers.get("x-api-key")):
        return error_response(401, "unauthorized", "Unauthorized OCR request.")

    content_length = request.headers.get("content-length")
    if not content_length or not content_length.isdigit():
        return error_response(411, "length_required", "Content-Length is required.")

    max_bytes = get_max_upload_bytes()
    if int(content_length) > max_bytes + COPY_CHUNK_BYTES:  # room for multipart framing
        return error_response(413, "payload_too_large", f"Uploaded file exceeds the {max_bytes // (1024 * 1024)} MB limit.")

    try:
        await asyncio.wait_for(OCR_SLOTS.acquire(), timeout=get_queue_wait_seconds())
    except asyncio.TimeoutError:
        return error_response(503, "busy", "OCR worker is busy. Try again shortly.", {"Retry-After": "30"})
    try:
        # The endpoint builds the whole PDF response before call_next returns,
        # so the slot covers the OCR job itself.
        return await call_next(request)
    finally:
        OCR_SLOTS.release()


def copy_upload(file: UploadFile, destination: Path, max_bytes: int) -> int:
    written = 0
    with destination.open("wb") as handle:
        while chunk := file.file.read(COPY_CHUNK_BYTES):
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Uploaded file exceeds the {max_bytes // (1024 * 1024)} MB limit.",
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


def ocrmypdf_available() -> bool:
    return shutil.which("ocrmypdf") is not None


@app.get("/healthz")
def healthcheck() -> Response:
    if not auth_configured() or not ocrmypdf_available():
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return JSONResponse(content={"status": "ok"})


# A plain def runs in FastAPI's threadpool, so a long OCR job does not block
# the event loop (and /healthz) for everyone else.
@app.post(OCR_PATH)
def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> Response:
    # The middleware already checked this; kept so the endpoint is safe on its own.
    if not is_authorized(authorization, x_api_key):
        raise HTTPException(status_code=401, detail="Unauthorized OCR request.")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if not ocrmypdf_available():
        logger.error("ocrmypdf is not on PATH.")
        return error_response(503, "ocr_unavailable", "OCR engine is not available on this worker.")

    lang = normalize_language(language)
    timeout_seconds = get_timeout_seconds()

    with tempfile.TemporaryDirectory(prefix="ocr-worker-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.pdf"
        output_path = temp_path / "output.pdf"
        if not copy_upload(file, input_path, get_max_upload_bytes()):
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        command = build_ocrmypdf_command(input_path, output_path, lang)

        try:
            result = run_ocrmypdf(command, timeout_seconds)
        except FileNotFoundError:
            logger.error("ocrmypdf could not be started.")
            return error_response(503, "ocr_unavailable", "OCR engine is not available on this worker.")
        except subprocess.TimeoutExpired:
            return error_response(504, "timeout", f"OCR timed out after {timeout_seconds} seconds.")

        if result.returncode != 0:
            # stderr names temp paths and tool internals: log it, don't return it.
            detail = ((result.stderr or "").strip() or (result.stdout or "").strip())[-2000:]
            logger.warning("ocrmypdf exited with %s: %s", result.returncode, detail)
            return JSONResponse(
                status_code=502,
                content={
                    "error": "OCRmyPDF failed to process the document.",
                    "code": "ocr_failed",
                    "exit_code": result.returncode,
                },
            )

        if not output_path.exists():
            return error_response(502, "ocr_failed", "OCRmyPDF completed without output.")

        output_bytes = output_path.read_bytes()
        if not output_bytes:
            return error_response(502, "ocr_failed", "OCRmyPDF produced an empty file.")

        return Response(
            content=output_bytes,
            media_type="application/pdf",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'inline; filename="ocr-output.pdf"',
            },
        )
