const state = {
  fileName: "",
  originalBytes: null,
  pageCount: 0,
  outputUrl: "",
  outputBytes: null,
  thumbnails: {}, // Cache of pageNumber -> canvas dataURL
  viewMode: "cards", // "cards" or "pdf"
  zoomFit: true,
  gridView: false,
};

const elements = {
  pdfInput: document.querySelector("#pdfInput"),
  dropzone: document.querySelector("#dropzone"),
  fileState: document.querySelector("#fileState"),
  pageCountBadge: document.querySelector("#pageCountBadge"),
  pageNumberInput: document.querySelector("#pageNumberInput"),
  copiesInput: document.querySelector("#copiesInput"),
  addButton: document.querySelector("#addButton"),
  sequenceInput: document.querySelector("#sequenceInput"),
  appendAllButton: document.querySelector("#appendAllButton"),
  clearOrderButton: document.querySelector("#clearOrderButton"),
  resetButton: document.querySelector("#resetButton"),
  chips: document.querySelector("#cardsWorkspace"), // Redirect chips to the workspace container
  orderSummary: document.querySelector("#orderSummary"),
  statusMessage: document.querySelector("#statusMessage"),
  previewButton: document.querySelector("#previewButton"),
  goButton: document.querySelector("#goButton"),
  printFrame: document.querySelector("#printFrame"),
  
  // New redressed elements
  fileCard: document.querySelector("#fileCard"),
  fileNameText: document.querySelector("#fileNameText"),
  fileInfoText: document.querySelector("#fileInfoText"),
  removeFileBtn: document.querySelector("#removeFileBtn"),
  
  togglePdfViewBtn: document.querySelector("#togglePdfViewBtn"),
  zoomFitBtn: document.querySelector("#zoomFitBtn"),
  gridViewBtn: document.querySelector("#gridViewBtn"),
  closePdfViewBtn: document.querySelector("#closePdfViewBtn"),
  cardsPreviewPanel: document.querySelector("#cardsPreviewPanel"),
  pdfFramePanel: document.querySelector("#pdfFramePanel"),
  scrollLeftBtn: document.querySelector("#scrollLeftBtn"),
  scrollRightBtn: document.querySelector("#scrollRightBtn"),
  footerTotalText: document.querySelector("#footerTotalText"),
};

function parseSequence() {
  return elements.sequenceInput.value
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value));
}

function setSequence(pages) {
  elements.sequenceInput.value = pages.join(" ");
  updateUi();
}

function isValidPage(page) {
  return Number.isInteger(page) && page >= 1 && page <= state.pageCount;
}

function clearGeneratedPdf() {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = "";
  }

  state.outputBytes = null;
  elements.printFrame.removeAttribute("src");
  elements.printFrame.hidden = true;
}

function setStatus(message, type = "neutral") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.dataset.type = type;
  
  const banner = document.querySelector("#statusBanner");
  if (banner) {
    banner.setAttribute("data-type", type);
    const icon = banner.querySelector(".status-icon");
    if (icon) {
      icon.textContent = type === "error" ? "❌" : (type === "success" ? "✅" : "ℹ️");
    }
  }
}

function loadPdfPreview(url) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve();
    };

    elements.printFrame.addEventListener("load", finish, { once: true });
    elements.printFrame.src = url;
    elements.printFrame.hidden = false;
    window.setTimeout(finish, 1200);
  });
}

function formatFileSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// Render dynamic page cards instead of text chips
function renderChips(pages) {
  elements.chips.replaceChildren();

  if (!state.originalBytes) {
    // Show empty workspace state
    const emptyState = document.createElement("div");
    emptyState.className = "empty-workspace-state";
    emptyState.innerHTML = `
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </div>
      <p>Your live page sequence preview will appear here.</p>
      <span>Upload a PDF and type page numbers in the sidebar.</span>
    `;
    elements.chips.append(emptyState);
    elements.footerTotalText.textContent = "Total: 0 pages";
    return;
  }

  if (pages.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-workspace-state";
    emptyState.innerHTML = `
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </div>
      <p>No pages in print sequence.</p>
      <span>Type page numbers in Step 2 to preview pages.</span>
    `;
    elements.chips.append(emptyState);
    elements.footerTotalText.textContent = "Total: 0 pages";
    return;
  }

  elements.footerTotalText.textContent = `Total: ${pages.length} page${pages.length === 1 ? "" : "s"}`;

  pages.forEach((page, index) => {
    const isValid = isValidPage(page);
    
    // Create card container
    const cardContainer = document.createElement("div");
    cardContainer.className = "page-card-container";
    cardContainer.setAttribute("draggable", "true");
    cardContainer.dataset.index = index;

    // Create card body
    const card = document.createElement("div");
    card.className = `page-card${isValid ? "" : " invalid-card"}`;

    // Add thumbnail if available and valid
    if (isValid && state.thumbnails[page]) {
      const img = document.createElement("img");
      img.className = "page-card-thumbnail";
      img.src = state.thumbnails[page];
      img.alt = `Page ${page} Thumbnail`;
      card.appendChild(img);
    }

    // Large card number
    const num = document.createElement("div");
    num.className = "page-card-num";
    num.textContent = page;
    card.appendChild(num);

    // Hover remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "card-remove-btn";
    removeBtn.type = "button";
    removeBtn.title = `Remove page ${page} from sequence`;
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nextPages = parseSequence();
      nextPages.splice(index, 1);
      setSequence(nextPages);
    });
    card.appendChild(removeBtn);

    cardContainer.appendChild(card);

    // POS XX label below card
    const pos = document.createElement("div");
    pos.className = "page-card-pos";
    const posNum = String(index + 1).padStart(2, "0");
    pos.textContent = `POS ${posNum}`;
    cardContainer.appendChild(pos);

    // Drag and Drop Event Listeners
    cardContainer.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", index);
      cardContainer.classList.add("dragging");
    });

    cardContainer.addEventListener("dragend", () => {
      cardContainer.classList.remove("dragging");
      document.querySelectorAll(".page-card-container").forEach(c => {
        c.classList.remove("drag-over");
      });
    });

    cardContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      return false;
    });

    cardContainer.addEventListener("dragenter", () => {
      if (!cardContainer.classList.contains("dragging")) {
        cardContainer.classList.add("drag-over");
      }
    });

    cardContainer.addEventListener("dragleave", () => {
      cardContainer.classList.remove("drag-over");
    });

    cardContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const targetIndex = index;
      
      if (sourceIndex !== targetIndex) {
        const nextPages = parseSequence();
        const [movedPage] = nextPages.splice(sourceIndex, 1);
        nextPages.splice(targetIndex, 0, movedPage);
        setSequence(nextPages);
      }
      return false;
    });

    elements.chips.appendChild(cardContainer);
  });
}

function updateUi() {
  const pages = parseSequence();
  const validPages = pages.filter(isValidPage);
  const invalidCount = pages.length - validPages.length;
  const hasPdf = Boolean(state.originalBytes);
  const canGenerate = hasPdf && pages.length > 0 && invalidCount === 0;

  elements.pageCountBadge.textContent =
    state.pageCount === 1 ? "1 page" : `${state.pageCount} pages`;
  elements.pageNumberInput.max = state.pageCount || "";
  elements.previewButton.disabled = !canGenerate;
  elements.goButton.disabled = !canGenerate;

  if (!hasPdf) {
    elements.orderSummary.textContent = "No PDF loaded";
    elements.fileCard.style.display = "none";
    elements.dropzone.style.display = "flex";
  } else {
    elements.dropzone.style.display = "none";
    elements.fileCard.style.display = "flex";
    elements.fileNameText.textContent = state.fileName;
    elements.fileInfoText.textContent = `${formatFileSize(state.originalBytes.byteLength)} • ${state.pageCount} Page${state.pageCount === 1 ? "" : "s"}`;
    
    if (pages.length === 0) {
      elements.orderSummary.textContent = "Total Pages in Job: 0";
    } else if (invalidCount > 0) {
      elements.orderSummary.textContent = `${invalidCount} invalid page${invalidCount === 1 ? "" : "s"}`;
    } else {
      elements.orderSummary.textContent = `Total Pages in Job: ${pages.length}`;
    }
  }

  renderChips(pages);
}

// Generate page thumbnails in the background when a PDF is loaded
async function generatePdfThumbnails(bytes) {
  if (!window.pdfjsLib) return;
  
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  
  try {
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
    const pdf = await loadingTask.promise;
    
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      // Check if user loaded a new file in the meantime
      if (bytes !== state.originalBytes) break;

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.25 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      
      await page.render({ canvasContext: context, viewport }).promise;
      state.thumbnails[pageNumber] = canvas.toDataURL("image/jpeg", 0.8);
      
      // Update UI incrementally as thumbnails generate
      updateUi();
    }
  } catch (error) {
    console.error("Error generating thumbnails:", error);
  }
}

async function loadPdf(file) {
  const looksLikePdf =
    file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  if (!looksLikePdf) {
    setStatus("Choose a PDF file.", "error");
    return;
  }

  if (!window.PDFLib) {
    setStatus("PDF tools did not load. Check your internet connection and refresh.", "error");
    return;
  }

  clearGeneratedPdf();
  setStatus("Reading PDF...");

  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });

    state.fileName = file.name;
    state.originalBytes = bytes;
    state.pageCount = pdf.getPageCount();
    state.thumbnails = {}; // Reset thumbnails cache

    elements.fileState.textContent = `${file.name} - ${state.pageCount} page${state.pageCount === 1 ? "" : "s"} - ${formatFileSize(file.size)}`;
    elements.sequenceInput.value = "";
    elements.pageNumberInput.value = "";
    
    setStatus("Add page numbers in the order you want them printed.", "success");
    
    // Trigger background rendering of thumbnails
    generatePdfThumbnails(bytes);
  } catch (error) {
    state.fileName = "";
    state.originalBytes = null;
    state.pageCount = 0;
    elements.fileState.textContent = "No file selected";
    setStatus(`Could not read this PDF. ${error.message}`, "error");
  }

  updateUi();
}

function addPagesFromControls() {
  const page = Number(elements.pageNumberInput.value);
  const copies = Number(elements.copiesInput.value || 1);

  if (!state.pageCount) {
    setStatus("Upload a PDF before adding pages.", "error");
    return;
  }

  if (!isValidPage(page)) {
    setStatus(`Enter a page number from 1 to ${state.pageCount}.`, "error");
    elements.pageNumberInput.focus();
    return;
  }

  if (!Number.isInteger(copies) || copies < 1) {
    setStatus("Copies must be 1 or more.", "error");
    elements.copiesInput.focus();
    return;
  }

  const pages = parseSequence();
  pages.push(...Array.from({ length: copies }, () => page));
  setSequence(pages);
  elements.pageNumberInput.select();
  setStatus(`Added page ${page}${copies > 1 ? ` ${copies} times` : ""}.`, "success");
}

async function generatePdf() {
  if (!window.PDFLib) {
    throw new Error("PDF tools did not load. Check your internet connection and refresh.");
  }

  const pages = parseSequence();
  const invalidPages = pages.filter((page) => !isValidPage(page));

  if (!state.originalBytes) {
    throw new Error("Upload a PDF first.");
  }

  if (pages.length === 0) {
    throw new Error("Add at least one page number.");
  }

  if (invalidPages.length > 0) {
    throw new Error(`Invalid pages: ${invalidPages.join(", ")}`);
  }

  setStatus("Generating reordered PDF...");
  const sourcePdf = await PDFLib.PDFDocument.load(state.originalBytes, {
    ignoreEncryption: true,
  });
  const outputPdf = await PDFLib.PDFDocument.create();

  for (const pageNumber of pages) {
    const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageNumber - 1]);
    outputPdf.addPage(copiedPage);
  }

  const outputBytes = await outputPdf.save();
  const blob = new Blob([outputBytes], { type: "application/pdf" });

  clearGeneratedPdf();
  state.outputBytes = outputBytes;
  state.outputUrl = URL.createObjectURL(blob);
  await loadPdfPreview(state.outputUrl);

  setStatus(`Generated ${pages.length} page${pages.length === 1 ? "" : "s"} from ${state.fileName}.`, "success");
  return state.outputUrl;
}

async function previewPdf() {
  try {
    await generatePdf();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char];
  });
}

async function renderPrintImages(pdfBytes) {
  if (!window.pdfjsLib) {
    throw new Error("Print renderer did not load. Check your internet connection and refresh.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
  const pdf = await loadingTask.promise;
  const images = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    images.push({
      src: canvas.toDataURL("image/png"),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return images;
}

function writePrintDocument(printWindow, images) {
  const pages = images
    .map(
      (image, index) => `
        <section class="print-page">
          <img
            src="${image.src}"
            width="${Math.round(image.width)}"
            height="${Math.round(image.height)}"
            alt="Page ${index + 1}"
          >
        </section>`,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(state.fileName || "Print Manager")}</title>
    <style>
      html,
      body {
        margin: 0;
        background: #ffffff;
      }

      .print-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        break-after: page;
        page-break-after: always;
      }

      .print-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      img {
        display: block;
        max-width: 100%;
        max-height: 100vh;
      }

      @media print {
        @page {
          margin: 0;
        }

        .print-page {
          height: 100vh;
          min-height: 100vh;
        }
      }
    </style>
  </head>
  <body>
    ${pages}
    <script>
      window.addEventListener("load", () => {
        window.focus();
        window.print();
      });
    <\/script>
  </body>
</html>`);
  printWindow.document.close();
}

async function printPdf() {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    setStatus("Allow popups for this page so the print screen can open.", "error");
    return;
  }

  try {
    await generatePdf();
    setStatus("Preparing print screen...");
    printWindow.document.write("<p>Preparing print screen...</p>");
    const images = await renderPrintImages(state.outputBytes);
    writePrintDocument(printWindow, images);
    setStatus("Print dialog opened for the reordered PDF.", "success");
  } catch (error) {
    if (printWindow) {
      printWindow.close();
    }

    setStatus(error.message, "error");
  }
}

function resetAll() {
  clearGeneratedPdf();
  state.fileName = "";
  state.originalBytes = null;
  state.pageCount = 0;
  state.thumbnails = {}; // Reset thumbnails cache
  
  elements.pdfInput.value = "";
  elements.pageNumberInput.value = "";
  elements.copiesInput.value = "1";
  elements.sequenceInput.value = "";
  elements.fileState.textContent = "No file selected";
  
  // Reset view mode if pdf panel is active
  showCardsView();
  
  setStatus("Upload a PDF and add page numbers to begin.");
  updateUi();
}

// Workspace UI control actions
function showCardsView() {
  state.viewMode = "cards";
  elements.cardsPreviewPanel.style.display = "flex";
  elements.pdfFramePanel.style.display = "none";
  elements.togglePdfViewBtn.classList.remove("active");
}

async function showPdfView() {
  if (!state.originalBytes || parseSequence().length === 0) {
    setStatus("Please upload a PDF and create a sequence first.", "error");
    return;
  }
  
  setStatus("Generating PDF preview...");
  try {
    await generatePdf();
    state.viewMode = "pdf";
    elements.cardsPreviewPanel.style.display = "none";
    elements.pdfFramePanel.style.display = "flex";
    elements.togglePdfViewBtn.classList.add("active");
  } catch (error) {
    setStatus(`Failed to generate preview: ${error.message}`, "error");
  }
}

// Wire up events
elements.pdfInput.addEventListener("change", (event) => {
  loadPdf(event.target.files[0]);
});

elements.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropzone.classList.add("dragging");
});

elements.dropzone.addEventListener("dragleave", () => {
  elements.dropzone.classList.remove("dragging");
});

elements.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropzone.classList.remove("dragging");
  loadPdf(event.dataTransfer.files[0]);
});

elements.addButton.addEventListener("click", addPagesFromControls);
elements.pageNumberInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addPagesFromControls();
  }
});

elements.appendAllButton.addEventListener("click", () => {
  if (!state.pageCount) {
    setStatus("Upload a PDF before adding pages.", "error");
    return;
  }

  setSequence(Array.from({ length: state.pageCount }, (_, index) => index + 1));
  setStatus("Added all pages in normal order.", "success");
});

elements.clearOrderButton.addEventListener("click", () => {
  elements.sequenceInput.value = "";
  setStatus("Print order cleared.");
  updateUi();
});

elements.resetButton.addEventListener("click", resetAll);
elements.removeFileBtn.addEventListener("click", resetAll);
elements.sequenceInput.addEventListener("input", updateUi);
elements.previewButton.addEventListener("click", previewPdf);
elements.goButton.addEventListener("click", printPdf);

// Horizontal scroll buttons
elements.scrollLeftBtn.addEventListener("click", () => {
  elements.chips.scrollBy({ left: -300, behavior: "smooth" });
});

elements.scrollRightBtn.addEventListener("click", () => {
  elements.chips.scrollBy({ left: 300, behavior: "smooth" });
});

// Zoom & view mode controls
elements.zoomFitBtn.addEventListener("click", () => {
  state.zoomFit = !state.zoomFit;
  elements.zoomFitBtn.classList.toggle("active", state.zoomFit);
  elements.chips.classList.toggle("zoom-fit", state.zoomFit);
});

elements.gridViewBtn.addEventListener("click", () => {
  state.gridView = !state.gridView;
  elements.gridViewBtn.classList.toggle("active", state.gridView);
  elements.chips.classList.toggle("grid-mode", state.gridView);
  
  // Hide scroll buttons in grid mode
  const footer = document.querySelector(".preview-panel-footer");
  if (state.gridView) {
    elements.scrollLeftBtn.style.visibility = "hidden";
    elements.scrollRightBtn.style.visibility = "hidden";
  } else {
    elements.scrollLeftBtn.style.visibility = "visible";
    elements.scrollRightBtn.style.visibility = "visible";
  }
});

elements.togglePdfViewBtn.addEventListener("click", () => {
  if (state.viewMode === "cards") {
    showPdfView();
  } else {
    showCardsView();
  }
});

elements.closePdfViewBtn.addEventListener("click", showCardsView);

// Initial UI load
updateUi();
// Trigger default active states
elements.chips.classList.add("zoom-fit");
