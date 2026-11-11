// =========================================================================
// 1. KONFIGURASI AKUN STATIS
// =========================================================================
const USERS = [
  {
    username: 'dokter umum',
    password: 'DMU_dokter_umum',
    nama: 'dr. Andi (Dokter Umum)',
    role: 'dokter',
    roleLabel: 'Dokter Umum',
    warnaCard: 'yellow' // Card otomatis warna kuning
  },
  {
    username: 'dokter anak',
    password: 'dokter_anak_DMU',
    nama: 'dr. Sinta (Dokter Anak)',
    role: 'dokter',
    roleLabel: 'Dokter Anak',
    warnaCard: 'red' // Card otomatis warna merah
  },
  {
    username: 'apotek',
    password: 'staff_apotek_DMU',
    nama: 'Staff Apotek Lt. 1',
    role: 'apotek',
    roleLabel: 'Staff Obat / Apotek',
    warnaCard: 'blue'
  }
];

// Batas waktu otomatis pindah dari "New" ke "Pending" = 2 Menit (120.000 ms)
const PENDING_TIMEOUT_MS = 2 * 60 * 1000;

const STORAGE_CARDS_KEY = 'mediboard_resep_cards_v2';
const STORAGE_SESSION_KEY = 'mediboard_logged_user';
const API_URL = 'api.php'; // Endpoint untuk koneksi ke Database MySQL di cPanel

// =========================================================================
// 2. STATE & ELEMEN DOM
// =========================================================================
let currentUser = null;
let cards = [];
let draggedCardId = null;
let useServerDB = false; // Otomatis true ketika sudah di-deploy di cPanel & api.php aktif

// State untuk Mode Pilih & Hapus Card (Khusus Dokter di fase New & Pending)
let isDeleteMode = false;
let selectedCardIds = new Set();

// Elemen Halaman
const loginPage = document.getElementById('login-page');
const boardPage = document.getElementById('board-page');

// Elemen Login
const loginForm = document.getElementById('login-form');
const inputUsername = document.getElementById('username');
const inputPassword = document.getElementById('password');
const loginError = document.getElementById('login-error');
const demoChips = document.querySelectorAll('.demo-chip');

// Elemen Topbar & Profil
const profileAvatar = document.getElementById('profile-avatar');
const profileName = document.getElementById('profile-name');
const profileRole = document.getElementById('profile-role');
const dokterActions = document.getElementById('dokter-actions');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnToggleDelete = document.getElementById('btn-toggle-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const selectedCountSpan = document.getElementById('selected-count');
const deleteModeBanner = document.getElementById('delete-mode-banner');
const rolePermissionHint = document.getElementById('role-permission-hint');
const btnLogout = document.getElementById('btn-logout');

// Elemen History
const btnOpenHistory = document.getElementById('btn-open-history');
const countHistory = document.getElementById('count-history');
const historyOverlay = document.getElementById('history-overlay');
const btnCloseHistory = document.getElementById('btn-close-history');
const btnCloseHistoryBottom = document.getElementById('btn-close-history-bottom');
const btnExportHistory = document.getElementById('btn-export-history');
const historyList = document.getElementById('history-list');
const historyFilterType = document.getElementById('history-filter-type');
const historyFilterDay = document.getElementById('history-filter-day');
const historyFilterMonth = document.getElementById('history-filter-month');
const historyFilterYear = document.getElementById('history-filter-year');
const filterInputDayWrap = document.getElementById('filter-input-day-wrap');
const filterInputMonthWrap = document.getElementById('filter-input-month-wrap');
const filterInputYearWrap = document.getElementById('filter-input-year-wrap');
const historySummaryInfo = document.getElementById('history-summary-info');

// Elemen Modal Tambah / Edit Card
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const editCardIdInput = document.getElementById('edit-card-id');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnSubmitCard = document.getElementById('btn-submit-card');
const cardForm = document.getElementById('card-form');
const inputDokter = document.getElementById('input-dokter');
const inputResep = document.getElementById('input-resep');

// Elemen Kolom Kanban
const columns = {
  new: document.getElementById('list-new'),
  pending: document.getElementById('list-pending'),
  onprogress: document.getElementById('list-onprogress'),
  done: document.getElementById('list-done')
};

const counts = {
  new: document.getElementById('count-new'),
  pending: document.getElementById('count-pending'),
  onprogress: document.getElementById('count-onprogress'),
  done: document.getElementById('count-done')
};

// =========================================================================
// 3. INISIALISASI APLIKASI
// =========================================================================
function initApp() {
  initHistoryFilters();
  loadCardsFromStorage();
  checkSavedSession();
  setupEventListeners();
  setupDragAndDrop();

  // Coba ambil data dari Database MySQL cPanel (api.php) jika sudah di-hosting
  fetchCardsFromServer();

  // Jalankan pengecekan setiap 1 detik untuk aturan > 2 menit otomatis ke Pending & update timer
  setInterval(() => {
    checkAutoPending();
    updateLiveTimers();
  }, 1000);

  // Polling sinkronisasi otomatis ke database cPanel setiap 2.5 detik (antar komputer Dokter & Apotek)
  setInterval(() => {
    if (useServerDB && !draggedCardId && !isDeleteMode) {
      fetchCardsFromServer();
    }
  }, 2500);

  // Sinkronisasi real-time antar tab browser lokal
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_CARDS_KEY) {
      loadCardsFromStorage();
      renderBoard();
    }
  });
}

// =========================================================================
// 4. MANAJEMEN STORAGE (LOCALSTORAGE + DATABASE MYSQL CPANEL)
// =========================================================================
async function fetchCardsFromServer() {
  if (window.location.protocol === 'file:') return;
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.cards)) {
      const wasUsingLocal = !useServerDB;
      useServerDB = true;

      // Jika database MySQL masih kosong (0 baris) tapi di browser sudah ada data card/history,
      // otomatis kirim data yang ada di browser ke dalam database MySQL cPanel!
      if (wasUsingLocal && data.cards.length === 0 && cards.length > 0) {
        for (const c of cards) {
          await syncUpsertCardToServer(c);
        }
      } else {
        cards = data.cards;
        localStorage.setItem(STORAGE_CARDS_KEY, JSON.stringify(cards));
      }
      renderBoard();
    } else if (data && data.error) {
      console.warn('Info Database cPanel:', data.error);
    }
  } catch (err) {
    // Jika dibuka di lokal tanpa server PHP/MySQL, otomatis tetap gunakan localStorage
  }
}

async function syncUpsertCardToServer(card) {
  if (!useServerDB) return;
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', card })
    });
  } catch (err) {
    // Abaikan jika sedang offline
  }
}

async function syncDeleteCardsToServer(ids) {
  if (!useServerDB || !ids || ids.length === 0) return;
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', ids })
    });
  } catch (err) {
    // Abaikan jika sedang offline
  }
}
function loadCardsFromStorage() {
  const raw = localStorage.getItem(STORAGE_CARDS_KEY);
  if (raw) {
    try {
      cards = JSON.parse(raw);
    } catch (e) {
      cards = [];
    }
  } else {
    const now = Date.now();
    cards = [
      {
        id: 'card-sample-1',
        dokter: 'dr. Andi (Dokter Umum)',
        resep: 'Pasien: Bpk. Hendra\nResep: Paracetamol 500mg (3x1), Vitamin C (1x1)',
        warna: 'yellow',
        status: 'new',
        createdAt: now - 30 * 1000, // Baru dibuat 30 detik lalu
        pendingAt: null,
        progressAt: null,
        completedAt: null
      },
      {
        id: 'card-sample-2',
        dokter: 'dr. Sinta (Dokter Anak)',
        resep: 'Pasien: An. Dika (5 thn)\nResep: Sirup Amoxicillin 125mg (3x1 cth), Puyer Batuk (3x1)',
        warna: 'red',
        status: 'onprogress',
        createdAt: now - 5 * 60 * 1000,
        pendingAt: null,
        progressAt: now - 45 * 1000, // Sedang diracik 45 detik
        completedAt: null
      }
    ];
    saveCardsToStorage();
  }
}

function saveCardsToStorage() {
  localStorage.setItem(STORAGE_CARDS_KEY, JSON.stringify(cards));
}

// =========================================================================
// 5. SISTEM LOGIN & SESSION STATIS
// =========================================================================
function checkSavedSession() {
  const saved = sessionStorage.getItem(STORAGE_SESSION_KEY);
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      showBoardPage();
      return;
    } catch (e) {
      sessionStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }
  showLoginPage();
}

function handleLogin(e) {
  e.preventDefault();
  const usernameVal = inputUsername.value.trim();
  const passwordVal = inputPassword.value.trim();

  const foundUser = USERS.find(
    (u) => u.username === usernameVal && u.password === passwordVal
  );

  if (!foundUser) {
    loginError.classList.remove('hidden');
    return;
  }

  loginError.classList.add('hidden');
  currentUser = foundUser;
  sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentUser));
  loginForm.reset();
  showBoardPage();
}

function handleLogout() {
  exitDeleteMode();
  currentUser = null;
  sessionStorage.removeItem(STORAGE_SESSION_KEY);
  showLoginPage();
}

function showLoginPage() {
  loginPage.classList.remove('hidden');
  boardPage.classList.add('hidden');
}

function showBoardPage() {
  loginPage.classList.add('hidden');
  boardPage.classList.remove('hidden');

  // Update tampilan profil di header
  profileName.textContent = currentUser.nama;
  profileRole.textContent = currentUser.roleLabel;
  profileAvatar.textContent = currentUser.nama.charAt(0).toUpperCase();

  // Warna avatar menyesuaikan warna khas akun
  if (currentUser.warnaCard === 'yellow') {
    profileAvatar.style.backgroundColor = '#eab308';
  } else if (currentUser.warnaCard === 'red') {
    profileAvatar.style.backgroundColor = '#ef4444';
  } else {
    profileAvatar.style.backgroundColor = '#10b981';
  }

  // Wewenang Tombol Berdasarkan Role (Dokter vs Staff Apotek)
  if (currentUser.role === 'dokter') {
    dokterActions.classList.remove('hidden');
    rolePermissionHint.innerHTML =
      '👨‍⚕️ <strong>Mode Dokter:</strong> Bisa <em>Tambah</em>, <em>Edit &amp; Hapus (khusus di New &amp; Pending)</em>, serta memindahkan <em>New &rarr; Pending</em>.';
  } else {
    dokterActions.classList.add('hidden');
    exitDeleteMode();
    rolePermissionHint.innerHTML =
      '💊 <strong>Mode Staff Apotek:</strong> Bisa memindahkan fase ke <em>On Progress &rarr; Done &rarr; History</em> (Tidak bisa paksa New ke Pending).';
  }

  checkAutoPending();
  renderBoard();
}

// =========================================================================
// 6. LOGIKA WAKTU & OTOMATIS PENDING (> 2 MENIT DI FASE NEW)
// =========================================================================
function checkAutoPending() {
  const now = Date.now();
  let hasChanged = false;

  cards.forEach((card) => {
    if (card.status === 'new' && now - card.createdAt >= PENDING_TIMEOUT_MS) {
      card.status = 'pending';
      card.pendingAt = card.createdAt + PENDING_TIMEOUT_MS;
      hasChanged = true;
      syncUpsertCardToServer(card);
    }
  });

  if (hasChanged) {
    saveCardsToStorage();
    renderBoard();
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minStr = String(minutes).padStart(2, '0');
  const secStr = String(seconds).padStart(2, '0');
  return `${minStr}:${secStr}`;
}

function formatTimeClock(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function updateLiveTimers() {
  const now = Date.now();
  const timerElements = document.querySelectorAll('[data-timer-id]');

  timerElements.forEach((el) => {
    const cardId = el.getAttribute('data-timer-id');
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    if (card.status === 'new') {
      const elapsed = now - card.createdAt;
      const remaining = Math.max(0, PENDING_TIMEOUT_MS - elapsed);
      el.textContent = `⏱️ ${formatDuration(elapsed)} (Ke Pending dlm ${formatDuration(remaining)})`;
    } else if (card.status === 'pending') {
      const startPending = card.pendingAt || card.createdAt;
      const pendingElapsed = now - startPending;
      el.textContent = `⚠️ Di Pending: ${formatDuration(pendingElapsed)} (sejak ${formatTimeClock(startPending)})`;
    } else if (card.status === 'onprogress') {
      const startProgress = card.progressAt || now;
      const progressElapsed = now - startProgress;
      el.textContent = `⚗️ Waktu Racik: ${formatDuration(progressElapsed)}`;
    }
  });
}

// =========================================================================
// 7. FITUR TAMBAH & EDIT CARD (KHUSUS DOKTER)
// =========================================================================
function resolveCardColor(dokterInputText) {
  const lower = dokterInputText.toLowerCase();
  if (lower.includes('anak')) return 'red';
  if (lower.includes('umum')) return 'yellow';
  if (currentUser && currentUser.warnaCard) return currentUser.warnaCard;
  return 'blue';
}

function openAddModal() {
  if (!currentUser || currentUser.role !== 'dokter') return;
  exitDeleteMode();

  modalTitle.textContent = 'Tambah Resep Baru';
  btnSubmitCard.textContent = 'Simpan Resep';
  editCardIdInput.value = '';
  inputDokter.value = currentUser.nama;
  inputResep.value = '';

  modalOverlay.classList.remove('hidden');
  inputResep.focus();
}

function openEditModal(card) {
  if (!currentUser || currentUser.role !== 'dokter') return;
  // Hanya boleh diedit apabila card masih di New atau Pending
  if (card.status !== 'new' && card.status !== 'pending') return;

  exitDeleteMode();

  modalTitle.textContent = 'Edit Resep';
  btnSubmitCard.textContent = 'Simpan Perubahan';
  editCardIdInput.value = card.id;
  inputDokter.value = card.dokter;
  inputResep.value = card.resep;

  modalOverlay.classList.remove('hidden');
  inputResep.focus();
}

function closeAddModal() {
  modalOverlay.classList.add('hidden');
}

function handleSaveCard(e) {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'dokter') return;

  const dokterVal = inputDokter.value.trim();
  const resepVal = inputResep.value.trim();
  const editingId = editCardIdInput.value;

  if (!dokterVal || !resepVal) return;

  if (editingId) {
    // Mode Edit Card (Hanya jika masih di New atau Pending)
    const target = cards.find((c) => c.id === editingId);
    if (target && (target.status === 'new' || target.status === 'pending')) {
      target.dokter = dokterVal;
      target.resep = resepVal;
      target.warna = resolveCardColor(dokterVal);
      syncUpsertCardToServer(target);
    }
  } else {
    // Mode Tambah Card Baru
    const newCard = {
      id: 'card-' + Date.now(),
      dokter: dokterVal,
      resep: resepVal,
      warna: resolveCardColor(dokterVal),
      status: 'new',
      createdAt: Date.now(),
      pendingAt: null,
      progressAt: null,
      completedAt: null
    };
    cards.unshift(newCard);
    syncUpsertCardToServer(newCard);
  }

  saveCardsToStorage();
  renderBoard();
  closeAddModal();
}

// =========================================================================
// 8. FITUR PILIH & HAPUS CARD (KHUSUS DOKTER & HANYA DI NEW / PENDING)
// =========================================================================
function enterDeleteMode() {
  if (!currentUser || currentUser.role !== 'dokter') return;
  isDeleteMode = true;
  selectedCardIds.clear();
  updateDeleteModeUI();
  renderBoard();
}

function exitDeleteMode() {
  isDeleteMode = false;
  selectedCardIds.clear();
  updateDeleteModeUI();
  renderBoard();
}

function toggleSelectCardForDelete(cardId) {
  if (!isDeleteMode) return;
  const card = cards.find((c) => c.id === cardId);
  // Hapus hanya bisa dilakukan di fase New dan Pending
  if (!card || (card.status !== 'new' && card.status !== 'pending')) return;

  if (selectedCardIds.has(cardId)) {
    selectedCardIds.delete(cardId);
  } else {
    selectedCardIds.add(cardId);
  }
  updateDeleteModeUI();
  renderBoard();
}

function confirmDeleteSelectedCards() {
  if (!isDeleteMode || selectedCardIds.size === 0) return;
  const idsToDelete = [];
  cards = cards.filter((c) => {
    const canBeDeleted = c.status === 'new' || c.status === 'pending';
    if (canBeDeleted && selectedCardIds.has(c.id)) {
      idsToDelete.push(c.id);
      return false;
    }
    return true;
  });
  syncDeleteCardsToServer(idsToDelete);
  saveCardsToStorage();
  exitDeleteMode();
}

function updateDeleteModeUI() {
  if (isDeleteMode) {
    btnToggleDelete.classList.add('hidden');
    btnConfirmDelete.classList.remove('hidden');
    btnCancelDelete.classList.remove('hidden');
    deleteModeBanner.classList.remove('hidden');
    deleteModeBanner.innerHTML =
      '🎯 <strong>Mode Hapus Card Aktif:</strong> Klik pada card di kolom <strong>New</strong> atau <strong>Pending</strong> yang ingin dihapus, lalu tekan tombol <strong>"Hapus"</strong> di atas.';
    selectedCountSpan.textContent = selectedCardIds.size;
    btnConfirmDelete.disabled = selectedCardIds.size === 0;
    btnConfirmDelete.style.opacity = selectedCardIds.size === 0 ? '0.55' : '1';
  } else {
    btnToggleDelete.classList.remove('hidden');
    btnConfirmDelete.classList.add('hidden');
    btnCancelDelete.classList.add('hidden');
    deleteModeBanner.classList.add('hidden');
  }
}

// =========================================================================
// 9. PINDAH FASE CARD (SESUAI WEWENANG DOKTER VS STAFF APOTEK)
// =========================================================================
function canTransitionStatus(currentStatus, targetStatus) {
  if (!currentUser) return false;
  if (currentStatus === targetStatus) return false;

  // ATURAN DOKTER:
  // Dokter hanya boleh memindahkan card dari "New" ke "Pending".
  // Dari Pending ke On Progress (dst) TIDAK BISA dipindahkan oleh Dokter.
  if (currentUser.role === 'dokter') {
    if (currentStatus === 'new' && targetStatus === 'pending') {
      return true;
    }
    return false;
  }

  // ATURAN STAFF APOTEK:
  // Staff TIDAK BISA memaksa pindah dari "New" ke "Pending".
  // Staff BISA memindahkan dari "New" atau "Pending" ke "On Progress",
  // lalu dari "On Progress" ke "Done", dan dari "Done" ke "History".
  if (currentUser.role === 'apotek') {
    if (
      (currentStatus === 'new' || currentStatus === 'pending') &&
      targetStatus === 'onprogress'
    ) {
      return true;
    }
    if (currentStatus === 'onprogress' && targetStatus === 'done') {
      return true;
    }
    if (currentStatus === 'done' && targetStatus === 'history') {
      return true;
    }
    return false;
  }

  return false;
}

function updateCardStatus(cardId, newStatus) {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return;

  if (!canTransitionStatus(card.status, newStatus)) {
    return;
  }

  const now = Date.now();
  card.status = newStatus;

  if (newStatus === 'pending') {
    card.pendingAt = now;
  } else if (newStatus === 'onprogress') {
    // Ketika dipindah ke On Progress, timer reset mulai dari 00:00
    card.progressAt = now;
  } else if (newStatus === 'done') {
    card.doneAt = now;
  } else if (newStatus === 'history') {
    card.completedAt = now;
  }

  syncUpsertCardToServer(card);
  saveCardsToStorage();
  renderBoard();
}

// =========================================================================
// 10. RENDER BOARD, CARD, & HISTORY
// =========================================================================
function renderBoard() {
  Object.keys(columns).forEach((key) => {
    columns[key].innerHTML = '';
  });

  const grouped = {
    new: [],
    pending: [],
    onprogress: [],
    done: [],
    history: []
  };

  cards.forEach((card) => {
    if (grouped[card.status]) {
      grouped[card.status].push(card);
    }
  });

  // Update jumlah History di tombol atas
  countHistory.textContent = grouped.history.length;

  // Render ke-4 kolom utama
  ['new', 'pending', 'onprogress', 'done'].forEach((statusKey) => {
    const listEl = columns[statusKey];
    const items = grouped[statusKey];
    counts[statusKey].textContent = items.length;

    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'empty-column';
      emptyEl.textContent = 'Belum ada resep di fase ini';
      listEl.appendChild(emptyEl);
      return;
    }

    items.forEach((card) => {
      const cardEl = createCardElement(card);
      listEl.appendChild(cardEl);
    });
  });

  updateLiveTimers();
  renderHistoryList(grouped.history);
}

function createCardElement(card) {
  const isStaff = currentUser && currentUser.role === 'apotek';
  const isDokter = currentUser && currentUser.role === 'dokter';
  const isDeletablePhase = card.status === 'new' || card.status === 'pending';
  const isSelected = selectedCardIds.has(card.id);

  const div = document.createElement('div');
  div.className = `resep-card card-${card.warna || 'yellow'}`;
  div.setAttribute('data-id', card.id);

  // Drag and Drop:
  // - Staff Apotek bisa drag card di New, Pending, On Progress (untuk maju ke On Progress / Done)
  // - Dokter bisa drag card di New (untuk dipindah ke Pending)
  const canDrag =
    (isStaff && card.status !== 'done') ||
    (isDokter && !isDeleteMode && card.status === 'new');

  if (canDrag) {
    div.setAttribute('draggable', 'true');
    div.classList.add('draggable-card');

    div.addEventListener('dragstart', (e) => {
      draggedCardId = card.id;
      div.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.id);
    });

    div.addEventListener('dragend', () => {
      draggedCardId = null;
      div.classList.remove('dragging');
    });
  } else {
    div.setAttribute('draggable', 'false');
  }

  // Jika Dokter sedang mengaktifkan Mode Pilih Hapus Card (Hanya New & Pending yang bisa dipilih)
  if (isDokter && isDeleteMode && isDeletablePhase) {
    div.classList.add('selectable-card');
    if (isSelected) {
      div.classList.add('selected-for-delete');
    }
    div.addEventListener('click', () => {
      toggleSelectCardForDelete(card.id);
    });
  }

  // Bagian Atas Card: Nama Dokter + Tombol Edit / Badge Pilih Hapus
  const topRow = document.createElement('div');
  topRow.className = 'card-top';

  const dokterBadge = document.createElement('span');
  dokterBadge.className = 'card-dokter-badge';
  dokterBadge.textContent = `👨‍⚕️ ${card.dokter}`;
  topRow.appendChild(dokterBadge);

  if (isDokter && isDeleteMode) {
    if (isDeletablePhase) {
      const selectBadge = document.createElement('span');
      selectBadge.className = 'select-checkbox-badge';
      selectBadge.textContent = isSelected ? '☑️ Terpilih' : '⬜ Pilih';
      topRow.appendChild(selectBadge);
    }
  } else if (isDokter && isDeletablePhase) {
    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-edit-card';
    btnEdit.textContent = '✏️ Edit';
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(card);
    });
    topRow.appendChild(btnEdit);
  }

  // Isi Tulisan Resep Dokter
  const resepText = document.createElement('div');
  resepText.className = 'card-resep-text';
  resepText.textContent = card.resep;

  div.appendChild(topRow);
  div.appendChild(resepText);

  // Fase DONE: Tidak ada timer/cooldown, tampilkan banner selesai
  if (card.status === 'done') {
    const doneBanner = document.createElement('div');
    doneBanner.className = 'status-ready-banner';
    doneBanner.textContent = '✅ Selesai Diracik — Pasien Boleh Ambil di Lt. 1';
    div.appendChild(doneBanner);
  } else {
    // Fase NEW, PENDING, ON PROGRESS: Tampilkan Timer sesuai aturan
    const metaRow = document.createElement('div');
    metaRow.className = 'card-meta';

    const timerSpan = document.createElement('span');
    if (card.status === 'pending') {
      timerSpan.className = 'timer-badge timer-warning';
    } else if (card.status === 'onprogress') {
      timerSpan.className = 'timer-badge timer-progress';
    } else {
      timerSpan.className = 'timer-badge';
    }
    timerSpan.setAttribute('data-timer-id', card.id);

    metaRow.appendChild(timerSpan);
    div.appendChild(metaRow);
  }

  // Tombol Pindah Fase Terkunci Sesuai Role:
  // 1) Untuk DOKTER: Saat di "New", dokter bisa memindahkan manual ke "Pending"
  if (isDokter && !isDeleteMode && card.status === 'new') {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'card-controls';

    const btnToPending = document.createElement('button');
    btnToPending.type = 'button';
    btnToPending.className = 'btn-quick-action btn-to-pending';
    btnToPending.textContent = '⏳ Alihkan ke Pending';
    btnToPending.addEventListener('click', () =>
      updateCardStatus(card.id, 'pending')
    );
    controlsDiv.appendChild(btnToPending);
    div.appendChild(controlsDiv);
  }

  // 2) Untuk STAFF APOTEK:
  // - Di New / Pending -> Alihkan ke On Progress
  // - Di On Progress -> Selesai Diracik (Ke Done)
  // - Di Done -> Resep Telah Diambil (Ke History)
  if (isStaff) {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'card-controls';

    if (card.status === 'new' || card.status === 'pending') {
      const btnToProgress = document.createElement('button');
      btnToProgress.type = 'button';
      btnToProgress.className = 'btn-quick-action btn-to-progress';
      btnToProgress.textContent = '⚡ Alihkan ke On Progress';
      btnToProgress.addEventListener('click', () =>
        updateCardStatus(card.id, 'onprogress')
      );
      controlsDiv.appendChild(btnToProgress);
    } else if (card.status === 'onprogress') {
      const btnToDone = document.createElement('button');
      btnToDone.type = 'button';
      btnToDone.className = 'btn-quick-action btn-to-done';
      btnToDone.textContent = '✅ Selesai Diracik (Ke Done)';
      btnToDone.addEventListener('click', () =>
        updateCardStatus(card.id, 'done')
      );
      controlsDiv.appendChild(btnToDone);
    } else if (card.status === 'done') {
      const btnToHistory = document.createElement('button');
      btnToHistory.type = 'button';
      btnToHistory.className = 'btn-quick-action btn-to-history';
      btnToHistory.textContent = '📦 Resep Telah Diambil (Ke History)';
      btnToHistory.addEventListener('click', () =>
        updateCardStatus(card.id, 'history')
      );
      controlsDiv.appendChild(btnToHistory);
    }

    div.appendChild(controlsDiv);
  }

  return div;
}

function initHistoryFilters() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  if (historyFilterDay) historyFilterDay.value = `${yyyy}-${mm}-${dd}`;
  if (historyFilterMonth) historyFilterMonth.value = `${yyyy}-${mm}`;
  if (historyFilterYear) historyFilterYear.value = `${yyyy}`;
}

function handleHistoryFilterTypeChange() {
  const type = historyFilterType ? historyFilterType.value : 'day';
  filterInputDayWrap.classList.toggle('hidden', type !== 'day');
  filterInputMonthWrap.classList.toggle('hidden', type !== 'month');
  filterInputYearWrap.classList.toggle('hidden', type !== 'year');
  renderHistoryList();
}

function getFilteredHistoryCards() {
  const allHistory = cards.filter((c) => c.status === 'history');
  const type = historyFilterType ? historyFilterType.value : 'day';

  return allHistory.filter((c) => {
    const ts = c.completedAt || c.createdAt;
    if (!ts) return false;
    const d = new Date(ts);
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    if (type === 'day') {
      const targetDay = historyFilterDay ? historyFilterDay.value : '';
      return `${yyyy}-${mm}-${dd}` === targetDay;
    }
    if (type === 'month') {
      const targetMonth = historyFilterMonth ? historyFilterMonth.value : '';
      return `${yyyy}-${mm}` === targetMonth;
    }
    if (type === 'year') {
      const targetYear = historyFilterYear ? String(historyFilterYear.value).trim() : '';
      return yyyy === targetYear;
    }
    return true;
  });
}

function getSelectedPeriodLabel() {
  const type = historyFilterType ? historyFilterType.value : 'day';
  if (type === 'day') {
    return {
      text: `1 Hari (${historyFilterDay.value || '-'})`,
      fileSuffix: `harian-${historyFilterDay.value || 'all'}`
    };
  }
  if (type === 'month') {
    return {
      text: `1 Bulan (${historyFilterMonth.value || '-'})`,
      fileSuffix: `bulanan-${historyFilterMonth.value || 'all'}`
    };
  }
  return {
    text: `1 Tahun (${historyFilterYear.value || '-'})`,
    fileSuffix: `tahunan-${historyFilterYear.value || 'all'}`
  };
}

function renderHistoryList() {
  if (!historyList) return;
  historyList.innerHTML = '';

  const filtered = getFilteredHistoryCards();
  const periodInfo = getSelectedPeriodLabel();

  if (historySummaryInfo) {
    historySummaryInfo.textContent = `Menampilkan ${filtered.length} riwayat resep untuk periode ${periodInfo.text}.`;
  }

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-column';
    empty.textContent = `Belum ada riwayat resep pada periode ${periodInfo.text}.`;
    historyList.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const box = document.createElement('div');
    box.className = `history-item card-${item.warna || 'yellow'}`;

    const top = document.createElement('div');
    top.className = 'history-item-top';

    const docSpan = document.createElement('span');
    docSpan.textContent = `👨‍⚕️ ${item.dokter}`;

    const d = new Date(item.completedAt || item.createdAt);
    const dateStr = d.toLocaleDateString('id-ID');
    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-item-time';
    timeSpan.textContent = `Diambil: ${dateStr} pukul ${formatTimeClock(item.completedAt)}`;

    top.appendChild(docSpan);
    top.appendChild(timeSpan);

    const resepDiv = document.createElement('div');
    resepDiv.className = 'history-item-resep';
    resepDiv.textContent = item.resep;

    box.appendChild(top);
    box.appendChild(resepDiv);
    historyList.appendChild(box);
  });
}

function exportHistoryToCSV() {
  const filteredCards = getFilteredHistoryCards();
  const periodInfo = getSelectedPeriodLabel();

  if (filteredCards.length === 0) {
    alert(`Tidak ada data History pada periode ${periodInfo.text} untuk di-download.`);
    return;
  }

  const headers = ['ID Card', 'Nama Dokter', 'Resep / Keterangan', 'Tanggal & Waktu Diambil'];
  const rows = filteredCards.map((c) => {
    const waktu = c.completedAt ? new Date(c.completedAt).toLocaleString('id-ID') : '-';
    const cleanDokter = `"${(c.dokter || '').replace(/"/g, '""')}"`;
    const cleanResep = `"${(c.resep || '').replace(/"/g, '""')}"`;
    return [c.id, cleanDokter, cleanResep, `"${waktu}"`].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `history-resep-${periodInfo.fileSuffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =========================================================================
// 11. DRAG AND DROP (SESUAI ATURAN DOKTER VS STAFF)
// =========================================================================
function setupDragAndDrop() {
  const columnBoxes = document.querySelectorAll('.board-column');

  columnBoxes.forEach((colBox) => {
    const targetStatus = colBox.getAttribute('data-status');

    colBox.addEventListener('dragover', (e) => {
      if (!currentUser) return;
      e.preventDefault();

      const card = cards.find((c) => c.id === draggedCardId);
      if (card && canTransitionStatus(card.status, targetStatus)) {
        colBox.classList.add('drag-over');
        colBox.classList.remove('drag-blocked');
      } else {
        colBox.classList.add('drag-blocked');
        colBox.classList.remove('drag-over');
      }
    });

    colBox.addEventListener('dragleave', () => {
      colBox.classList.remove('drag-over', 'drag-blocked');
    });

    colBox.addEventListener('drop', (e) => {
      e.preventDefault();
      colBox.classList.remove('drag-over', 'drag-blocked');

      if (!currentUser) return;

      const cardId = draggedCardId || e.dataTransfer.getData('text/plain');
      if (cardId && targetStatus) {
        updateCardStatus(cardId, targetStatus);
      }
    });
  });
}

// =========================================================================
// 12. EVENT LISTENERS
// =========================================================================
function setupEventListeners() {
  loginForm.addEventListener('submit', handleLogin);
  btnLogout.addEventListener('click', handleLogout);

  demoChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      inputUsername.value = chip.getAttribute('data-user');
      inputPassword.value = chip.getAttribute('data-pass');
      loginError.classList.add('hidden');
    });
  });

  // Tombol Tambah / Edit Card (Dokter)
  btnOpenModal.addEventListener('click', openAddModal);
  btnCloseModal.addEventListener('click', closeAddModal);
  btnCancelModal.addEventListener('click', closeAddModal);
  cardForm.addEventListener('submit', handleSaveCard);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeAddModal();
  });

  // Tombol Pilih & Hapus Card di samping kiri Tambah Card (Dokter)
  btnToggleDelete.addEventListener('click', enterDeleteMode);
  btnCancelDelete.addEventListener('click', exitDeleteMode);
  btnConfirmDelete.addEventListener('click', confirmDeleteSelectedCards);

  // Modal History
  btnOpenHistory.addEventListener('click', () => {
    renderHistoryList();
    historyOverlay.classList.remove('hidden');
  });
  btnCloseHistory.addEventListener('click', () => {
    historyOverlay.classList.add('hidden');
  });
  btnCloseHistoryBottom.addEventListener('click', () => {
    historyOverlay.classList.add('hidden');
  });
  if (historyFilterType) {
    historyFilterType.addEventListener('change', handleHistoryFilterTypeChange);
  }
  if (historyFilterDay) {
    historyFilterDay.addEventListener('change', renderHistoryList);
  }
  if (historyFilterMonth) {
    historyFilterMonth.addEventListener('change', renderHistoryList);
  }
  if (historyFilterYear) {
    historyFilterYear.addEventListener('input', renderHistoryList);
  }
  if (btnExportHistory) {
    btnExportHistory.addEventListener('click', exportHistoryToCSV);
  }
  historyOverlay.addEventListener('click', (e) => {
    if (e.target === historyOverlay) historyOverlay.classList.add('hidden');
  });
}

document.addEventListener('DOMContentLoaded', initApp);
