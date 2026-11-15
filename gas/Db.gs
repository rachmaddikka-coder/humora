/**
 * HUMORA — Db.gs
 * Akses Google Sheets: kolom dicari lewat NAMA header, bukan posisi.
 *
 * Aturan:
 * - Nomor baris (_row) hanya dipakai sementara di dalam satu lock, tidak pernah
 *   sebagai ID dan tidak pernah dikirim ke frontend.
 * - Semua sel ditulis sebagai teks biasa (format '@'), supaya Google Sheets
 *   tidak mengubah google_sub (angka 21 digit) menjadi angka yang terpotong,
 *   atau mengubah timestamp ISO menjadi objek tanggal.
 */

var SS_CACHE_ = null;

function db_() {
  if (!SS_CACHE_) {
    var id = getConfig_('SPREADSHEET_ID', true);
    try {
      SS_CACHE_ = SpreadsheetApp.openById(id);
    } catch (e) {
      console.error('DB_UNAVAILABLE: spreadsheet tidak bisa dibuka (cek SPREADSHEET_ID & izin).');
      throw appError_('DB_UNAVAILABLE', 'Database tidak dapat diakses. Hubungi admin.');
    }
  }
  return SS_CACHE_;
}

function sheet_(name) {
  var sh = db_().getSheetByName(name);
  if (!sh) {
    console.error('DB_NOT_READY: sheet "' + name + '" belum ada. Jalankan setup().');
    throw appError_('DB_NOT_READY', 'Database belum disiapkan. Hubungi admin.');
  }
  return sh;
}

/** { namaHeader: nomorKolom (mulai 1) } */
function headerMap_(sh) {
  var width = sh.getLastColumn();
  if (width < 1) return {};
  var headers = sh.getRange(1, 1, 1, width).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var name = String(headers[i]).trim();
    if (name) map[name] = i + 1;
  }
  return map;
}

function requireColumn_(map, column, sheetName) {
  if (!map[column]) {
    console.error('DB_SCHEMA: kolom "' + column + '" tidak ada di sheet ' + sheetName);
    throw appError_('DB_SCHEMA', 'Struktur database tidak sesuai. Hubungi admin.');
  }
  return map[column];
}

/**
 * Mencari SATU baris yang kolom `column`-nya sama dengan `value`.
 * Hanya membaca satu kolom, lalu satu baris yang cocok (hemat kuota).
 * @return {Object|null} objek {header: nilai, _row: nomorBaris}
 */
function dbFindOne_(sheetName, column, value) {
  var sh = sheet_(sheetName);
  var map = headerMap_(sh);
  var col = requireColumn_(map, column, sheetName);
  var last = sh.getLastRow();
  if (last < 2) return null;

  var target = String(value);
  var values = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === target) {
      return readRow_(sh, map, i + 2);
    }
  }
  return null;
}

function readRow_(sh, map, rowNumber) {
  var width = sh.getLastColumn();
  var vals = sh.getRange(rowNumber, 1, 1, width).getValues()[0];
  var obj = { _row: rowNumber };
  Object.keys(map).forEach(function (key) {
    obj[key] = String(vals[map[key] - 1]);
  });
  return obj;
}

/** Menambah satu baris. Panggil HANYA di dalam withLock_. */
function dbAppend_(sheetName, obj) {
  var sh = sheet_(sheetName);
  var map = headerMap_(sh);
  var width = sh.getLastColumn();
  var row = [];
  for (var c = 0; c < width; c++) row.push('');
  Object.keys(obj).forEach(function (key) {
    if (key.charAt(0) === '_') return;
    var col = requireColumn_(map, key, sheetName);
    row[col - 1] = obj[key] === null || obj[key] === undefined ? '' : String(obj[key]);
  });
  var target = sh.getRange(sh.getLastRow() + 1, 1, 1, width);
  target.setNumberFormat('@');
  target.setValues([row]);
}

/** Mengubah beberapa kolom pada satu baris. Panggil HANYA di dalam withLock_. */
function dbUpdate_(sheetName, rowNumber, changes) {
  var sh = sheet_(sheetName);
  var map = headerMap_(sh);
  var width = sh.getLastColumn();
  var range = sh.getRange(rowNumber, 1, 1, width);
  var row = range.getValues()[0].map(String);
  Object.keys(changes).forEach(function (key) {
    var col = requireColumn_(map, key, sheetName);
    row[col - 1] = changes[key] === null || changes[key] === undefined ? '' : String(changes[key]);
  });
  range.setNumberFormat('@');
  range.setValues([row]);
}

/** Menghapus satu baris. Panggil HANYA di dalam withLock_. */
function dbDeleteRow_(sheetName, rowNumber) {
  sheet_(sheetName).deleteRow(rowNumber);
}
