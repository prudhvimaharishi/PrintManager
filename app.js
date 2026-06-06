const state = {
  fileName: "",
  originalBytes: null,
  pageCount: 0,
  outputBytes: null,
  thumbnails: {}, // Cache of pageNumber -> canvas dataURL
  viewMode: "cards", // "cards" or "pdf"
  zoomFit: true,
  gridView: false,
};

const elements = {};

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
  state.outputBytes = null;
  elements.printFrame.replaceChildren();
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

async function loadPdfPreview(pdfBytes) {
  if (!window.pdfjsLib) {
    throw new Error("PDF preview renderer did not load. Check your internet connection and refresh.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
  const pdf = await loadingTask.promise;
  const previewPages = document.createDocumentFragment();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    canvas.className = "pdf-preview-page";
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.setAttribute("aria-label", `Page ${pageNumber}`);

    await page.render({ canvasContext: context, viewport }).promise;
    previewPages.appendChild(canvas);
  }

  elements.printFrame.replaceChildren(previewPages);
  elements.printFrame.hidden = false;
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

  clearGeneratedPdf();
  state.outputBytes = outputBytes;
  await loadPdfPreview(outputBytes);

  setStatus(`Generated ${pages.length} page${pages.length === 1 ? "" : "s"} from ${state.fileName}.`, "success");
  return outputBytes;
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

// Initialize elements and wire up events once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  elements.pdfInput = document.querySelector("#pdfInput");
  elements.dropzone = document.querySelector("#dropzone");
  elements.fileState = document.querySelector("#fileState");
  elements.pageCountBadge = document.querySelector("#pageCountBadge");
  elements.pageNumberInput = document.querySelector("#pageNumberInput");
  elements.copiesInput = document.querySelector("#copiesInput");
  elements.addButton = document.querySelector("#addButton");
  elements.sequenceInput = document.querySelector("#sequenceInput");
  elements.appendAllButton = document.querySelector("#appendAllButton");
  elements.clearOrderButton = document.querySelector("#clearOrderButton");
  elements.resetButton = document.querySelector("#resetButton");
  elements.chips = document.querySelector("#cardsWorkspace");
  elements.orderSummary = document.querySelector("#orderSummary");
  elements.statusMessage = document.querySelector("#statusMessage");
  elements.previewButton = document.querySelector("#previewButton");
  elements.goButton = document.querySelector("#goButton");
  elements.printFrame = document.querySelector("#printFrame");
  elements.fileCard = document.querySelector("#fileCard");
  elements.fileNameText = document.querySelector("#fileNameText");
  elements.fileInfoText = document.querySelector("#fileInfoText");
  elements.removeFileBtn = document.querySelector("#removeFileBtn");
  elements.togglePdfViewBtn = document.querySelector("#togglePdfViewBtn");
  elements.zoomFitBtn = document.querySelector("#zoomFitBtn");
  elements.gridViewBtn = document.querySelector("#gridViewBtn");
  elements.closePdfViewBtn = document.querySelector("#closePdfViewBtn");
  elements.cardsPreviewPanel = document.querySelector("#cardsPreviewPanel");
  elements.pdfFramePanel = document.querySelector("#pdfFramePanel");
  elements.scrollLeftBtn = document.querySelector("#scrollLeftBtn");
  elements.scrollRightBtn = document.querySelector("#scrollRightBtn");
  elements.footerTotalText = document.querySelector("#footerTotalText");
  elements.saveSequenceNameInput = document.querySelector("#saveSequenceNameInput");
  elements.saveSequenceBtn = document.querySelector("#saveSequenceBtn");
  elements.savedSequencesList = document.querySelector("#savedSequencesList");

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

  elements.saveSequenceBtn.addEventListener("click", handleSaveSequence);
  elements.saveSequenceNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSaveSequence();
    }
  });

  // Initial UI load
  updateUi();
  renderSavedSequences();
  // Trigger default active states
  elements.chips.classList.add("zoom-fit");
});

// Local Storage keys & routines for sequence saving
const STORAGE_KEY = "print_manager_saved_sequences";

function loadSavedSequencesFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Error reading from localStorage", e);
    return [];
  }
}

function saveSavedSequencesToStorage(sequences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sequences));
  } catch (e) {
    console.error("Error writing to localStorage", e);
  }
}

function renderSavedSequences() {
  const list = elements.savedSequencesList;
  list.replaceChildren();
  
  const sequences = loadSavedSequencesFromStorage();
  
  if (sequences.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-list-message";
    empty.textContent = "No saved sequences yet.";
    list.appendChild(empty);
    return;
  }
  
  sequences.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "saved-item";
    
    const info = document.createElement("div");
    info.className = "saved-item-info";
    
    const name = document.createElement("span");
    name.className = "saved-item-name";
    name.textContent = item.name;
    info.appendChild(name);
    
    const seq = document.createElement("span");
    seq.className = "saved-item-seq";
    seq.textContent = item.sequence;
    info.appendChild(seq);
    
    li.appendChild(info);
    
    const actions = document.createElement("div");
    actions.className = "saved-item-actions";
    
    const loadBtn = document.createElement("button");
    loadBtn.className = "btn-item-load";
    loadBtn.type = "button";
    loadBtn.textContent = "Load";
    loadBtn.addEventListener("click", () => {
      elements.sequenceInput.value = item.sequence;
      updateUi();
      setStatus(`Loaded sequence "${item.name}".`, "success");
    });
    actions.appendChild(loadBtn);
    
    const delBtn = document.createElement("button");
    delBtn.className = "btn-item-delete";
    delBtn.type = "button";
    delBtn.title = "Delete sequence";
    delBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;
    delBtn.addEventListener("click", () => {
      const current = loadSavedSequencesFromStorage();
      current.splice(index, 1);
      saveSavedSequencesToStorage(current);
      renderSavedSequences();
      setStatus(`Deleted sequence "${item.name}".`);
    });
    actions.appendChild(delBtn);
    
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function handleSaveSequence() {
  const name = elements.saveSequenceNameInput.value.trim();
  const seq = elements.sequenceInput.value.trim();
  
  if (!seq) {
    setStatus("Cannot save an empty sequence.", "error");
    return;
  }
  
  if (!name) {
    setStatus("Please enter a name for the sequence.", "error");
    elements.saveSequenceNameInput.focus();
    return;
  }
  
  const current = loadSavedSequencesFromStorage();
  
  const existingIndex = current.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
  if (existingIndex !== -1) {
    current[existingIndex].sequence = seq;
    setStatus(`Updated sequence "${name}".`, "success");
  } else {
    current.push({ name, sequence: seq });
    setStatus(`Saved sequence "${name}".`, "success");
  }
  
  saveSavedSequencesToStorage(current);
  elements.saveSequenceNameInput.value = "";
  renderSavedSequences();
}

elements.saveSequenceBtn.addEventListener("click", handleSaveSequence);
elements.saveSequenceNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleSaveSequence();
  }
});

// Initial UI load
updateUi();
renderSavedSequences();
// Trigger default active states
elements.chips.classList.add("zoom-fit");
