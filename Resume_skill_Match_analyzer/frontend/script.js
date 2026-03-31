const API_BASE = "http://127.0.0.1:5000";

let allMatches = [];
let scoreChartInstance = null;
let skillsChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  setupDragAndDrop();
  fetchMatches();
  document.getElementById("resumeFile").addEventListener("change", updateSelectedFileName);
});

function showLoader() {
  document.getElementById("loader").classList.remove("hidden");
}

function hideLoader() {
  document.getElementById("loader").classList.add("hidden");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function updateSelectedFileName() {
  const fileInput = document.getElementById("resumeFile");
  const nameText = document.getElementById("selectedFileName");
  nameText.textContent = fileInput.files[0] ? fileInput.files[0].name : "No file selected";
}

function setupDragAndDrop() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("resumeFile");

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");

    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      updateSelectedFileName();
      showToast("Resume selected successfully", "success");
    }
  });
}

async function uploadResume() {
  const fileInput = document.getElementById("resumeFile");
  const uploadMessage = document.getElementById("uploadMessage");

  if (!fileInput.files[0]) {
    uploadMessage.textContent = "Please choose a resume file.";
    showToast("Please choose a resume file", "error");
    return;
  }

  const formData = new FormData();
  formData.append("resume", fileInput.files[0]);

  try {
    showLoader();
    const response = await fetch(`${API_BASE}/resume/upload`, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Resume upload failed");
    }

    uploadMessage.textContent = data.message || "Resume uploaded successfully";
    showToast("Resume uploaded successfully", "success");
    fileInput.value = "";
    document.getElementById("selectedFileName").textContent = "No file selected";
    fetchMatches();
  } catch (error) {
    uploadMessage.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    hideLoader();
  }
}

async function createJob() {
  const role = document.getElementById("role").value.trim();
  const company = document.getElementById("company").value.trim();
  const jobDescription = document.getElementById("jobDescription").value.trim();
  const jobMessage = document.getElementById("jobMessage");

  if (!role || !jobDescription) {
    jobMessage.textContent = "Role and job description are required.";
    showToast("Role and job description are required", "error");
    return;
  }

  try {
    showLoader();
    const response = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role_name: role,
        company_name: company,
        job_description: jobDescription
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Job creation failed");
    }

    jobMessage.textContent = data.message || "Job created successfully";
    showToast("Job created successfully", "success");

    document.getElementById("role").value = "";
    document.getElementById("company").value = "";
    document.getElementById("jobDescription").value = "";

    fetchMatches();
  } catch (error) {
    jobMessage.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    hideLoader();
  }
}

async function fetchMatches() {
  try {
    showLoader();
    const response = await fetch(`${API_BASE}/matches`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to fetch matches");
    }

    allMatches = Array.isArray(data) ? data : [];
    renderMatches(allMatches);
    updateStats(allMatches);
    updateCharts(allMatches);
    updateSemanticSummary(allMatches);
  } catch (error) {
    showToast(error.message, "error");
    allMatches = [];
    renderMatches([]);
    updateStats([]);
    updateCharts([]);
    updateSemanticSummary([]);
  } finally {
    hideLoader();
  }
}

function renderMatches(matches) {
  const matchList = document.getElementById("matchList");
  const emptyState = document.getElementById("emptyState");

  matchList.innerHTML = "";

  if (!matches.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  matches.forEach((match) => {
    const card = document.createElement("div");
    card.className = "match-card";

    const scoreClass =
      match.match_score >= 80
        ? "score-high"
        : match.match_score >= 50
        ? "score-medium"
        : "score-low";

    const matchedSkills = match.matched_skills || [];
    const missingSkills = match.missing_skills || [];
    const extraSkills = match.extra_skills || [];
    const semanticSkills = match.semantic_matches || [];

    card.innerHTML = `
      <h3>${match.role_name || "Unknown Role"}</h3>
      <p><strong>Resume:</strong> ${match.resume_name || "N/A"}</p>
      <p><strong>Company:</strong> ${match.company_name || "N/A"}</p>
      <div class="score-pill ${scoreClass}">Score: ${match.match_score || 0}%</div>

      <div class="card-section">
        <h4>Matched Skills</h4>
        <div class="skill-tags">
          ${matchedSkills.length ? matchedSkills.map(skill => `<span class="tag match">${skill}</span>`).join("") : `<span class="tag match">No exact matches</span>`}
        </div>
      </div>

      <div class="card-section">
        <h4>Missing Skills</h4>
        <div class="skill-tags">
          ${missingSkills.length ? missingSkills.map(skill => `<span class="tag missing">${skill}</span>`).join("") : `<span class="tag missing">No missing skills</span>`}
        </div>
      </div>

      <div class="card-section">
        <h4>Extra Skills</h4>
        <div class="skill-tags">
          ${extraSkills.length ? extraSkills.map(skill => `<span class="tag extra">${skill}</span>`).join("") : `<span class="tag extra">No extra skills</span>`}
        </div>
      </div>

      <div class="card-section">
        <h4>Semantic Matches</h4>
        <div class="skill-tags">
          ${semanticSkills.length ? semanticSkills.map(skill => `<span class="tag semantic">${skill}</span>`).join("") : `<span class="tag semantic">No semantic matches</span>`}
        </div>
      </div>

      <div class="card-actions">
        <button class="details-btn" onclick='openModal(${JSON.stringify(match).replace(/'/g, "&apos;")})'>View Details</button>
      </div>
    `;

    matchList.appendChild(card);
  });
}

function updateStats(matches) {
  document.getElementById("totalMatches").textContent = matches.length;

  const avg =
    matches.length > 0
      ? Math.round(matches.reduce((sum, item) => sum + (item.match_score || 0), 0) / matches.length)
      : 0;
  document.getElementById("avgScore").textContent = `${avg}%`;

  const highMatches = matches.filter((m) => (m.match_score || 0) >= 80).length;
  document.getElementById("highMatches").textContent = highMatches;

  document.getElementById("latestResume").textContent =
    matches.length > 0 ? matches[0].resume_name || "-" : "-";
}

function updateCharts(matches) {
  const scoreLabels = matches.map((m, index) => m.role_name || `Match ${index + 1}`);
  const scoreValues = matches.map((m) => m.match_score || 0);

  const matchedTotal = matches.reduce((sum, m) => sum + ((m.matched_skills || []).length), 0);
  const missingTotal = matches.reduce((sum, m) => sum + ((m.missing_skills || []).length), 0);
  const semanticTotal = matches.reduce((sum, m) => sum + ((m.semantic_matches || []).length), 0);

  if (scoreChartInstance) scoreChartInstance.destroy();
  if (skillsChartInstance) skillsChartInstance.destroy();

  const scoreCtx = document.getElementById("scoreChart").getContext("2d");
  scoreChartInstance = new Chart(scoreCtx, {
    type: "bar",
    data: {
      labels: scoreLabels,
      datasets: [
        {
          label: "Match Score",
          data: scoreValues,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "#fff"
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#fff" },
          grid: { color: "rgba(255,255,255,0.08)" }
        },
        y: {
          ticks: { color: "#fff" },
          grid: { color: "rgba(255,255,255,0.08)" },
          beginAtZero: true,
          max: 100
        }
      }
    }
  });

  const skillsCtx = document.getElementById("skillsChart").getContext("2d");
  skillsChartInstance = new Chart(skillsCtx, {
    type: "doughnut",
    data: {
      labels: ["Matched", "Missing", "Semantic"],
      datasets: [
        {
          data: [matchedTotal, missingTotal, semanticTotal]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "#fff"
          }
        }
      }
    }
  });
}

function updateSemanticSummary(matches) {
  const totalSemantic = matches.reduce((sum, m) => sum + ((m.semantic_matches || []).length), 0);

  document.getElementById("semanticSummary").textContent =
    totalSemantic > 0
      ? `${totalSemantic} semantic skill relationships detected across all matches.`
      : "No semantic matches available yet. Semantic mapping will appear when backend returns related skills.";
}

function filterMatches() {
  const query = document.getElementById("searchInput").value.toLowerCase();

  const filtered = allMatches.filter((match) => {
    const role = (match.role_name || "").toLowerCase();
    const resume = (match.resume_name || "").toLowerCase();
    const company = (match.company_name || "").toLowerCase();

    return role.includes(query) || resume.includes(query) || company.includes(query);
  });

  document.getElementById("filterStatus").textContent =
    query ? `Filtered results for "${query}"` : "Showing all match results";

  renderMatches(filtered);
  updateStats(filtered);
  updateCharts(filtered);
  updateSemanticSummary(filtered);
}

function sortMatches() {
  const sortValue = document.getElementById("sortSelect").value;
  const query = document.getElementById("searchInput").value.toLowerCase();

  let filtered = [...allMatches];

  if (query) {
    filtered = filtered.filter((match) => {
      const role = (match.role_name || "").toLowerCase();
      const resume = (match.resume_name || "").toLowerCase();
      const company = (match.company_name || "").toLowerCase();
      return role.includes(query) || resume.includes(query) || company.includes(query);
    });
  }

  if (sortValue === "highest") {
    filtered.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
  } else if (sortValue === "lowest") {
    filtered.sort((a, b) => (a.match_score || 0) - (b.match_score || 0));
  } else {
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  renderMatches(filtered);
  updateStats(filtered);
  updateCharts(filtered);
  updateSemanticSummary(filtered);
}

function openModal(match) {
  const modal = document.getElementById("detailsModal");
  const modalBody = document.getElementById("modalBody");

  const semanticMatches = match.semantic_matches || [];
  const matchedSkills = match.matched_skills || [];
  const missingSkills = match.missing_skills || [];
  const extraSkills = match.extra_skills || [];

  modalBody.innerHTML = `
    <p><strong>Role:</strong> ${match.role_name || "N/A"}</p>
    <p><strong>Company:</strong> ${match.company_name || "N/A"}</p>
    <p><strong>Resume:</strong> ${match.resume_name || "N/A"}</p>
    <p><strong>Score:</strong> ${match.match_score || 0}%</p>
    <p><strong>Created At:</strong> ${match.created_at || "N/A"}</p>

    <div class="card-section">
      <h4>Matched Skills</h4>
      <div class="skill-tags">
        ${matchedSkills.map(skill => `<span class="tag match">${skill}</span>`).join("") || `<span class="tag match">No exact matches</span>`}
      </div>
    </div>

    <div class="card-section">
      <h4>Missing Skills</h4>
      <div class="skill-tags">
        ${missingSkills.map(skill => `<span class="tag missing">${skill}</span>`).join("") || `<span class="tag missing">No missing skills</span>`}
      </div>
    </div>

    <div class="card-section">
      <h4>Extra Skills</h4>
      <div class="skill-tags">
        ${extraSkills.map(skill => `<span class="tag extra">${skill}</span>`).join("") || `<span class="tag extra">No extra skills</span>`}
      </div>
    </div>

    <div class="card-section">
      <h4>Semantic Matches</h4>
      <div class="skill-tags">
        ${semanticMatches.map(skill => `<span class="tag semantic">${skill}</span>`).join("") || `<span class="tag semantic">No semantic matches</span>`}
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
}

function closeModal() {
  document.getElementById("detailsModal").classList.add("hidden");
}