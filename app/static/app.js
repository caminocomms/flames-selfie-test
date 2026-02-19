function byId(id) {
  return document.getElementById(id);
}

function uuidv4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const OPT_MAX_DIMENSION = 1536;
const OPT_MIME = "image/jpeg";
const OPT_QUALITY_START = 0.92;
const OPT_QUALITY_MIN = 0.72;
const OPT_QUALITY_STEP = 0.06;

function _sourceSize(source) {
  const width = typeof source.naturalWidth === "number" ? source.naturalWidth : source.width;
  const height = typeof source.naturalHeight === "number" ? source.naturalHeight : source.height;
  return { width, height };
}

function _canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not process that photo. Please try another image."));
        return;
      }
      resolve(blob);
    }, mime, quality);
  });
}

async function _decodeImageSource(blob) {
  if (typeof createImageBitmap !== "undefined") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch (err) {
      try {
        return await createImageBitmap(blob);
      } catch (innerErr) {
        // fall through to Image() decode
      }
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo. Please choose a different image."));
    };
    img.src = url;
  });
}

async function optimizePhotoForUpload(inputBlob) {
  const source = await _decodeImageSource(inputBlob);
  const { width: srcW, height: srcH } = _sourceSize(source);
  if (!srcW || !srcH) {
    throw new Error("Could not read that photo. Please choose a different image.");
  }

  let targetW = srcW;
  let targetH = srcH;
  const maxDim = Math.max(srcW, srcH);
  if (maxDim > OPT_MAX_DIMENSION) {
    const scale = OPT_MAX_DIMENSION / maxDim;
    targetW = Math.max(1, Math.round(srcW * scale));
    targetH = Math.max(1, Math.round(srcH * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  let ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, targetW, targetH);

  let quality = OPT_QUALITY_START;
  let outBlob = await _canvasToBlob(canvas, OPT_MIME, quality);

  while (outBlob.size > MAX_UPLOAD_BYTES && quality > OPT_QUALITY_MIN) {
    quality = Math.max(OPT_QUALITY_MIN, quality - OPT_QUALITY_STEP);
    outBlob = await _canvasToBlob(canvas, OPT_MIME, quality);
    if (quality === OPT_QUALITY_MIN) {
      break;
    }
  }

  if (outBlob.size > MAX_UPLOAD_BYTES) {
    // Last resort: scale down further based on size ratio and re-encode at min quality.
    const shrink = Math.sqrt(MAX_UPLOAD_BYTES / outBlob.size) * 0.92;
    const newW = Math.max(512, Math.floor(targetW * shrink));
    const newH = Math.max(512, Math.floor(targetH * shrink));
    if (newW < targetW || newH < targetH) {
      canvas.width = newW;
      canvas.height = newH;
      ctx = canvas.getContext("2d");
      ctx.drawImage(source, 0, 0, newW, newH);
      outBlob = await _canvasToBlob(canvas, OPT_MIME, OPT_QUALITY_MIN);
    }
  }

  if (typeof source.close === "function") {
    try {
      source.close();
    } catch (err) {
      // ignore
    }
  }

  if (outBlob.size > MAX_UPLOAD_BYTES) {
    throw new Error("That photo is too large to upload. Please choose a smaller image.");
  }

  return outBlob;
}

async function postGenerate(photoBlob) {
  const formData = new FormData();
  formData.append("photo", photoBlob, "photo.jpg");
  formData.append("client_request_id", uuidv4());

  const response = await fetch("/api/selfie/generate", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    let detail = "";
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await response.json().catch(() => ({}));
      detail = body.detail || "";
    } else {
      // Drain response body to avoid leaking a stream (some browsers can warn).
      await response.text().catch(() => "");
    }

    if (response.status === 413) {
      throw new Error("That photo is too large to upload. Please choose a smaller image (max 10MB).");
    }
    if (response.status === 429) {
      throw new Error(detail || "Rate limit exceeded. Please try again in a minute.");
    }
    if (response.status === 403) {
      throw new Error(detail || "Request blocked. Please refresh and try again.");
    }
    if (response.status >= 500) {
      throw new Error("Server error while generating your image. Please try again.");
    }

    throw new Error(detail || `Could not generate image (HTTP ${response.status}).`);
  }

  return response.json();
}

async function fetchResult(resultId) {
  const response = await fetch(`/api/selfie/result/${resultId}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Result not available");
  }
  return response.json();
}

function renderResult(payload) {
  const resultPanel = byId("result-panel") || byId("share-result-panel");
  const resultImage = byId("result-image");
  const downloadBtn = byId("download-btn");
  const shareLink = byId("share-link");

  if (resultPanel) {
    resultPanel.classList.remove("hidden");
  }
  if (resultImage) {
    resultImage.src = payload.image_url;
  }
  if (downloadBtn) {
    downloadBtn.href = payload.download_url;
  }
  if (shareLink) {
    shareLink.value = payload.share_url;
  }
}

async function pollUntilDone(resultId, onUpdate) {
  while (true) {
    const payload = await fetchResult(resultId);
    if (onUpdate) {
      onUpdate(payload);
    }
    if (payload.status === "ready" || payload.status === "failed" || payload.status === "expired") {
      return payload;
    }
    const waitSeconds = Number(payload.retry_after_seconds || 2);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, waitSeconds) * 1000));
  }
}

function initGeneratePage() {
  const body = document.body;
  const createContent = byId("create-content");
  const progressPanel = byId("progress-panel");
  const photoPlaceholder = byId("photo-placeholder");
  const cameraActions = byId("camera-actions");
  const uploadInput = byId("photo-upload");
  const startCameraBtn = byId("start-camera");
  const cameraVideo = byId("camera-video");
  const captureCanvas = byId("capture-canvas");
  const captureBtn = byId("capture-btn");
  const retakeBtn = byId("retake-btn");
  const generateBtn = byId("generate-btn");
  const preview = byId("photo-preview");
  const statusText = byId("status-text");
  const errorText = byId("error-text");
  const copyLinkBtn = byId("copy-link");

  let stream = null;
  let selectedBlob = null;
  let cameraReady = false;
  const pendingKey = "pending_result_id";
  const defaultPlaceholder = photoPlaceholder ? photoPlaceholder.textContent : "Selected photo preview";
  let previewObjectUrl = null;

  function showCameraActions(show) {
    if (cameraActions) {
      cameraActions.classList.toggle("hidden", !show);
    }
  }

  function setPlaceholderText(text) {
    if (photoPlaceholder) {
      photoPlaceholder.textContent = text;
    }
  }

  function showPlaceholder(show) {
    if (photoPlaceholder) {
      photoPlaceholder.classList.toggle("hidden", !show);
    }
    if (preview) {
      preview.classList.toggle("hidden", show);
    }
  }

  function showCameraVideo(show) {
    if (cameraVideo) {
      cameraVideo.classList.toggle("hidden", !show);
    }
  }

  function setError(message) {
    if (errorText) {
      errorText.textContent = message || "";
    }
  }

  function setStatus(message) {
    if (statusText) {
      statusText.textContent = message || "";
    }
  }

  function setGeneratingState(isGenerating) {
    if (createContent) {
      createContent.classList.toggle("hidden", isGenerating);
    }
    if (progressPanel) {
      progressPanel.classList.toggle("hidden", !isGenerating);
    }
  }

  function setSelected(blob, previewUrl) {
    selectedBlob = blob;
    generateBtn.disabled = !selectedBlob;
    showPlaceholder(false);
    showCameraVideo(false);
    showCameraActions(true);
    if (captureBtn) {
      captureBtn.classList.add("hidden");
    }
    if (retakeBtn) {
      retakeBtn.classList.remove("hidden");
      retakeBtn.disabled = false;
    }
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    previewObjectUrl = previewUrl;
    preview.onload = () => {
      preview.classList.add("ready");
    };
    preview.src = previewUrl;
    setError("");
  }

  async function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    cameraReady = false;
    showCameraVideo(false);
    showCameraActions(false);
    if (captureBtn) {
      captureBtn.classList.remove("hidden");
    }
    if (retakeBtn) {
      retakeBtn.classList.add("hidden");
      retakeBtn.disabled = true;
    }
  }

  function resetPreviewSelection() {
    selectedBlob = null;
    if (preview) {
      preview.classList.remove("ready");
      preview.onload = null;
      preview.src = "";
    }
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    setPlaceholderText(defaultPlaceholder);
    showPlaceholder(true);
    showCameraVideo(false);
    generateBtn.disabled = true;
  }

  function getNormalizedCaptureCanvas(sourceVideo, targetCanvas) {
    const sourceW = sourceVideo.videoWidth;
    const sourceH = sourceVideo.videoHeight;
    const minDimension = Math.min(sourceW, sourceH);
    const scaleUp = minDimension < 512 ? 512 / minDimension : 1;
    const scaledW = sourceW * scaleUp;
    const scaledH = sourceH * scaleUp;
    const maxDimension = Math.max(scaledW, scaledH);
    const scaleDown = maxDimension > OPT_MAX_DIMENSION ? OPT_MAX_DIMENSION / maxDimension : 1;
    const scale = scaleUp * scaleDown;
    const targetW = Math.round(sourceW * scale);
    const targetH = Math.round(sourceH * scale);

    targetCanvas.width = targetW;
    targetCanvas.height = targetH;

    const ctx = targetCanvas.getContext("2d");
    ctx.drawImage(sourceVideo, 0, 0, targetW, targetH);
    return targetCanvas;
  }

  async function startCameraSession() {
    setError("");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      cameraVideo.srcObject = stream;
      await cameraVideo.play();
      showPlaceholder(false);
      showCameraVideo(true);
      showCameraActions(true);
      if (captureBtn) {
        captureBtn.classList.remove("hidden");
      }
      if (retakeBtn) {
        retakeBtn.classList.add("hidden");
        retakeBtn.disabled = true;
      }
      cameraReady = true;
    } catch (err) {
      setError("Camera access failed. Please upload a photo instead.");
    }
  }

  uploadInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    stopCamera();
    showCameraActions(false);
    if (retakeBtn) {
      retakeBtn.classList.add("hidden");
      retakeBtn.disabled = true;
    }
    setError("");
    setPlaceholderText("Optimising your photo for upload...");
    showPlaceholder(true);
    showCameraVideo(false);
    generateBtn.disabled = true;
    optimizePhotoForUpload(file)
      .then((optimizedBlob) => {
        setPlaceholderText(defaultPlaceholder);
        setSelected(optimizedBlob, URL.createObjectURL(optimizedBlob));
      })
      .catch((err) => {
        resetPreviewSelection();
        setError(err.message || "Could not read that photo. Please try another image.");
      });
  });

  startCameraBtn.addEventListener("click", async () => {
    await startCameraSession();
  });

  captureBtn.addEventListener("click", () => {
    if (!cameraReady || !cameraVideo.videoWidth || !cameraVideo.videoHeight) {
      setError("Camera is not ready yet.");
      return;
    }
    const normalizedCanvas = getNormalizedCaptureCanvas(cameraVideo, captureCanvas);
    normalizedCanvas.toBlob((blob) => {
      if (!blob) {
        setError("Could not capture photo.");
        return;
      }

      setSelected(blob, URL.createObjectURL(blob));
    }, "image/jpeg", OPT_QUALITY_START);
  });

  retakeBtn.addEventListener("click", async () => {
    resetPreviewSelection();
    if (!stream) {
      await startCameraSession();
      return;
    }
    showPlaceholder(false);
    showCameraVideo(true);
    showCameraActions(true);
    if (captureBtn) {
      captureBtn.classList.remove("hidden");
    }
    retakeBtn.classList.add("hidden");
    retakeBtn.disabled = true;
  });

  generateBtn.addEventListener("click", async () => {
    if (!selectedBlob) {
      return;
    }
    const uploadBlob = selectedBlob;

    generateBtn.disabled = true;
    setGeneratingState(true);
    setStatus("Building your FLAMES selfie. This usually takes around 30 seconds.");
    setError("");

    try {
      const payload = await postGenerate(uploadBlob);
      localStorage.setItem(pendingKey, payload.result_id);
      const finalPayload = await pollUntilDone(payload.result_id);
      localStorage.removeItem(pendingKey);

      if (finalPayload.status === "ready") {
        renderResult(finalPayload);
        setStatus("Done. Your image is ready to download and share.");
        body.classList.add("result-live");
        stopCamera();
        return;
      }

      if (finalPayload.status === "expired") {
        setError("This link has expired. Please generate a new image.");
      } else {
        setError(finalPayload.error_message || "We could not generate that image. Please try again.");
      }
      setStatus("");
      setGeneratingState(false);
    } catch (err) {
      setError(err.message || "We could not generate that image. Please try again.");
      setStatus("");
      setGeneratingState(false);
      localStorage.removeItem(pendingKey);
    } finally {
      generateBtn.disabled = !selectedBlob;
    }
  });

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", async () => {
      const linkInput = byId("share-link");
      if (!linkInput || !linkInput.value) {
        return;
      }
      try {
        await navigator.clipboard.writeText(linkInput.value);
        copyLinkBtn.textContent = "Copied";
        setTimeout(() => {
          copyLinkBtn.textContent = "Copy Share Link";
        }, 1200);
      } catch (err) {
        setError("Could not copy the link automatically. You can copy it manually.");
      }
    });
  }

  const pendingResultId = localStorage.getItem(pendingKey);
  if (pendingResultId) {
    setGeneratingState(true);
    setStatus("Resuming your FLAMES selfie. Please wait.");
    pollUntilDone(pendingResultId)
      .then((finalPayload) => {
        if (finalPayload.status === "ready") {
          renderResult(finalPayload);
          body.classList.add("result-live");
          setStatus("Done. Your image is ready to download and share.");
          return;
        }
        if (finalPayload.status === "expired") {
          setError("This link has expired. Please generate a new image.");
        } else {
          setError(finalPayload.error_message || "We could not generate that image. Please try again.");
        }
        setStatus("");
        setGeneratingState(false);
      })
      .finally(() => {
        localStorage.removeItem(pendingKey);
      });
  }
}

async function initSharePage(resultId) {
  const errorText = byId("error-text");
  const progressPanel = byId("share-progress");
  try {
    if (progressPanel) {
      progressPanel.classList.remove("hidden");
    }
    const finalPayload = await pollUntilDone(resultId);
    if (finalPayload.status === "ready") {
      if (progressPanel) {
        progressPanel.classList.add("hidden");
      }
      renderResult(finalPayload);
      return;
    }
    if (errorText) {
      errorText.textContent = finalPayload.error_message || "This link is unavailable right now.";
    }
  } catch (err) {
    if (errorText) {
      errorText.textContent = err.message || "This link is unavailable right now.";
    }
  }
}

function initApp() {
  const body = document.body;
  const page = body.dataset.page;

  if (page === "share") {
    initSharePage(body.dataset.resultId);
    return;
  }

  initGeneratePage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
