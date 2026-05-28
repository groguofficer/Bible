/* ── KJV Bible Reader · script.js ── */

// ── Bible book order & testament membership ────────────────────────────────
// NOTE: The CSV uses "Psalm" (not "Psalms") — must match exactly.
const OLD_TESTAMENT = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy',
  'Joshua','Judges','Ruth','1 Samuel','2 Samuel',
  '1 Kings','2 Kings','1 Chronicles','2 Chronicles',
  'Ezra','Nehemiah','Esther','Job','Psalm','Proverbs',
  'Ecclesiastes','Song of Solomon','Isaiah','Jeremiah',
  'Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
  'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah',
  'Haggai','Zechariah','Malachi'
];

const NEW_TESTAMENT = [
  'Matthew','Mark','Luke','John','Acts','Romans',
  '1 Corinthians','2 Corinthians','Galatians','Ephesians',
  'Philippians','Colossians','1 Thessalonians','2 Thessalonians',
  '1 Timothy','2 Timothy','Titus','Philemon','Hebrews',
  'James','1 Peter','2 Peter','1 John','2 John','3 John',
  'Jude','Revelation'
];

const ALL_BOOKS = [...OLD_TESTAMENT, ...NEW_TESTAMENT];

// ── App State ─────────────────────────────────────────────────────────────
let verseData        = {};   // { "Genesis 1:1": "In the beginning..." }
let chapterData      = {};   // { "Genesis 1": "full chapter text..." }
let booksInData      = [];
let currentBook      = null;
let currentChapter   = null;
let currentTestament = 'OT';
let activeVerseNum   = null; // currently highlighted verse number

// ── CSV Parser ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    const row = [];
    while (i < len) {
      if (text[i] === '"') {
        i++;
        let field = '';
        while (i < len) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else { field += text[i++]; }
        }
        row.push(field);
      } else {
        let field = '';
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++];
        }
        row.push(field.trim());
      }
      if (i < len && text[i] === ',') { i++; }
      else { break; }
    }
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

// ── Book-name extraction (handles multi-word & numbered books) ────────────
// Sort longest first so "Song of Solomon" wins over any shorter prefix match.
const BOOKS_BY_LENGTH = [...ALL_BOOKS].sort((a, b) => b.length - a.length);

function extractBookFromRef(ref) {
  for (const book of BOOKS_BY_LENGTH) {
    if (ref.startsWith(book + ' ')) return book;
  }
  return null;
}

function extractBookFromChapterKey(key) {
  for (const book of BOOKS_BY_LENGTH) {
    if (key.startsWith(book + ' ')) return book;
  }
  return null;
}

// ── Load both CSVs ────────────────────────────────────────────────────────
async function loadData() {
  const grid = document.getElementById('book-grid');
  grid.innerHTML = '<p class="loading-spinner" style="grid-column:1/-1">Loading scripture…</p>';

  try {
    const [verseRes, chapterRes] = await Promise.all([
      fetch('kjv.csv'),
      fetch('kjv_by_chapter.csv')
    ]);
    if (!verseRes.ok || !chapterRes.ok) {
      throw new Error(
        'Could not load CSV files. Make sure kjv.csv and kjv_by_chapter.csv ' +
        'are in the same folder as index.html and serve via a local web server ' +
        '(e.g. python3 -m http.server 8000).'
      );
    }

    const [verseText, chapterText] = await Promise.all([
      verseRes.text(), chapterRes.text()
    ]);

    // Parse kjv.csv → verseData
    const verseRows = parseCSV(verseText);
    for (let r = 1; r < verseRows.length; r++) {
      const ref  = (verseRows[r][0] || '').trim();
      const text = (verseRows[r][1] || '').trim();
      if (ref && text && ref.includes(':')) verseData[ref] = text;
    }

    // Parse kjv_by_chapter.csv → chapterData
    const chapterRows = parseCSV(chapterText);
    for (let r = 1; r < chapterRows.length; r++) {
      const ref  = (chapterRows[r][0] || '').trim();
      const text = (chapterRows[r][1] || '').trim();
      if (ref && text) chapterData[ref] = text;
    }

    // Collect books present in data, preserve canonical order
    const bookSet = new Set();
    Object.keys(chapterData).forEach(k => { const b = extractBookFromChapterKey(k); if (b) bookSet.add(b); });
    Object.keys(verseData).forEach(k => { const b = extractBookFromRef(k); if (b) bookSet.add(b); });

    booksInData = ALL_BOOKS.filter(b => bookSet.has(b));
    const extras = [...bookSet].filter(b => !ALL_BOOKS.includes(b)).sort();
    booksInData = [...booksInData, ...extras];

    renderBookGrid();

  } catch (err) {
    grid.innerHTML =
      `<p style="color:#c87060;font-family:'Crimson Pro',serif;grid-column:1/-1;padding:2rem;">⚠ ${err.message}</p>`;
    console.error(err);
  }
}

// ── Data helpers ──────────────────────────────────────────────────────────

function chaptersForBook(book) {
  const nums = new Set();
  Object.keys(chapterData).forEach(key => {
    if (key.startsWith(book + ' ')) {
      const num = parseInt(key.slice(book.length).trim(), 10);
      if (!isNaN(num)) nums.add(num);
    }
  });
  return [...nums].sort((a, b) => a - b);
}

function versesForChapter(book, chapter) {
  const prefix = `${book} ${chapter}:`;
  const nums = [];
  Object.keys(verseData).forEach(key => {
    if (key.startsWith(prefix)) {
      const num = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(num)) nums.push(num);
    }
  });
  return nums.sort((a, b) => a - b);
}

function parseChapterVerses(book, chapter) {
  const prefix = `${book} ${chapter}:`;
  const out = {};
  Object.keys(verseData).forEach(key => {
    if (key.startsWith(prefix)) {
      const num = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(num)) out[num] = verseData[key];
    }
  });
  return out;
}

function filteredBooks() {
  if (currentTestament === 'OT') return booksInData.filter(b => OLD_TESTAMENT.includes(b));
  if (currentTestament === 'NT') return booksInData.filter(b => NEW_TESTAMENT.includes(b));
  return booksInData;
}

// ── Panel switching ───────────────────────────────────────────────────────
function showPanel(id) {
  ['panel-books', 'panel-chapters', 'panel-reading'].forEach(p => {
    const el = document.getElementById(p);
    if (p === id) { el.removeAttribute('hidden'); el.classList.add('active'); }
    else          { el.setAttribute('hidden', ''); el.classList.remove('active'); }
  });
  // Always scroll back to top of page when switching panels
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Breadcrumb ────────────────────────────────────────────────────────────
function updateBreadcrumb() {
  const crumbHome    = document.getElementById('crumb-home');
  const crumbBook    = document.getElementById('crumb-book');
  const crumbChapter = document.getElementById('crumb-chapter');
  const sep1         = document.getElementById('sep-1');
  const sep2         = document.getElementById('sep-2');

  crumbHome.classList.remove('active');
  crumbBook.classList.remove('active');
  crumbChapter.classList.remove('active');
  crumbBook.hidden    = true; sep1.hidden = true;
  crumbChapter.hidden = true; sep2.hidden = true;

  if (!currentBook) {
    crumbHome.classList.add('active');
    return;
  }
  sep1.hidden = false;
  crumbBook.hidden = false;
  crumbBook.textContent = currentBook;

  if (currentChapter) {
    sep2.hidden = false;
    crumbChapter.hidden = false;
    crumbChapter.textContent = `Ch. ${currentChapter}`;
    crumbChapter.classList.add('active');
  } else {
    crumbBook.classList.add('active');
  }
}

// ── RENDER: Book Grid ─────────────────────────────────────────────────────
function renderBookGrid() {
  const grid  = document.getElementById('book-grid');
  const books = filteredBooks();
  if (books.length === 0) {
    grid.innerHTML =
      '<p style="color:var(--parchment-deep);grid-column:1/-1;padding:2rem;font-style:italic;">No books found for this testament.</p>';
    return;
  }
  grid.innerHTML = '';
  books.forEach((book, i) => {
    const btn = document.createElement('button');
    btn.className = 'book-btn' + (book === currentBook ? ' active' : '');
    btn.textContent = book;
    btn.style.animationDelay = `${Math.min(i * 14, 500)}ms`;
    btn.addEventListener('click', () => selectBook(book));
    grid.appendChild(btn);
  });
}

// ── RENDER: Chapter Pills ─────────────────────────────────────────────────
function renderChapterPills(book) {
  const pills    = document.getElementById('chapter-pills');
  const chapters = chaptersForBook(book);
  pills.innerHTML = '';
  chapters.forEach(ch => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn' + (ch === currentChapter ? ' active' : '');
    btn.textContent = ch;
    btn.addEventListener('click', () => selectChapter(book, ch));
    pills.appendChild(btn);
  });
}

// ── RENDER: Verse Jump Pills ──────────────────────────────────────────────
function renderVersePills(book, chapter) {
  const pills  = document.getElementById('verse-pills');
  const verses = versesForChapter(book, chapter);
  pills.innerHTML = '';
  verses.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn' + (v === activeVerseNum ? ' active' : '');
    btn.textContent = v;
    btn.addEventListener('click', () => jumpToVerse(v));
    pills.appendChild(btn);
  });
}

// ── RENDER: Full Chapter Reading View ────────────────────────────────────
function renderReadingView(book, chapter) {
  const display  = document.getElementById('reading-display');
  const verseMap = parseChapterVerses(book, chapter);
  const sorted   = Object.keys(verseMap).map(Number).sort((a, b) => a - b);

  if (sorted.length === 0) {
    display.innerHTML = '<p class="hint-text">No verse data found for this chapter.</p>';
    return;
  }

  let html = `<div class="display-chapter-title">${book} &middot; Chapter ${chapter}</div>`;
  sorted.forEach((num, idx) => {
    html +=
      `<div class="verse-row" id="verse-${num}" style="animation-delay:${Math.min(idx * 10, 600)}ms" data-verse="${num}">
        <span class="verse-num" title="Verse ${num}" onclick="jumpToVerse(${num})">${num}</span>
        <span class="verse-text">${verseMap[num]}</span>
       </div>`;
  });
  display.innerHTML = html;
}

// ── Jump to a specific verse ──────────────────────────────────────────────
function jumpToVerse(verseNum) {
  // Clear previous highlight
  if (activeVerseNum !== null) {
    const prev = document.getElementById(`verse-${activeVerseNum}`);
    if (prev) prev.classList.remove('highlighted');
  }

  activeVerseNum = verseNum;

  // Highlight the verse row
  const row = document.getElementById(`verse-${verseNum}`);
  if (row) {
    row.classList.add('highlighted');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Mark pill active
  document.querySelectorAll('#verse-pills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.textContent, 10) === verseNum);
  });
}

// Make jumpToVerse available globally (called from inline onclick on verse-num spans)
window.jumpToVerse = jumpToVerse;

// ── SELECT: Book ──────────────────────────────────────────────────────────
function selectBook(book) {
  currentBook    = book;
  currentChapter = null;
  activeVerseNum = null;

  document.getElementById('chapter-panel-title').textContent = book;
  renderChapterPills(book);
  document.getElementById('chapter-display').innerHTML =
    '<p class="hint-text">Select a chapter above to begin reading.</p>';

  showPanel('panel-chapters');
  updateBreadcrumb();
}

// ── SELECT: Chapter ───────────────────────────────────────────────────────
function selectChapter(book, chapter) {
  currentChapter = chapter;
  activeVerseNum = null;

  // Update title and verse pills in reading panel
  document.getElementById('reading-panel-title').textContent = `${book} · Ch. ${chapter}`;
  renderVersePills(book, chapter);
  renderReadingView(book, chapter);

  showPanel('panel-reading');
  updateBreadcrumb();
}

// ── NAVIGATION: Back buttons & breadcrumb ────────────────────────────────
document.getElementById('back-to-books').addEventListener('click', () => {
  currentBook    = null;
  currentChapter = null;
  activeVerseNum = null;
  showPanel('panel-books');
  updateBreadcrumb();
});

document.getElementById('back-to-chapters').addEventListener('click', () => {
  currentChapter = null;
  activeVerseNum = null;
  // Refresh chapter pills so active state is cleared
  renderChapterPills(currentBook);
  document.getElementById('chapter-display').innerHTML =
    '<p class="hint-text">Select a chapter above to begin reading.</p>';
  showPanel('panel-chapters');
  updateBreadcrumb();
});

document.getElementById('crumb-home').addEventListener('click', () => {
  if (currentBook) document.getElementById('back-to-books').click();
});
document.getElementById('crumb-book').addEventListener('click', () => {
  if (currentChapter) document.getElementById('back-to-chapters').click();
});

// ── Testament tab switcher ────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTestament = btn.dataset.testament;
    renderBookGrid();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────
updateBreadcrumb();
loadData();
