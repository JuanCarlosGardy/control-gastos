// ================================
// app.js (ESM) - Control de Gastos
// ================================

// 1) IMPORTS (SOLO AQUÍ, SOLO UNA VEZ)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

import {
  getFirestore, collection, addDoc, doc, runTransaction,
  query, orderBy, onSnapshot, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

console.log("[BOOT] app.js cargado OK");

// 2) FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyD22iGuezGjFOyV3EvXVFXYWxN4GM7Fk1Q",
  authDomain: "gastos-obrantis.firebaseapp.com",
  projectId: "gastos-obrantis",
  storageBucket: "gastos-obrantis.firebasestorage.app",
  messagingSenderId: "634229985957",
  appId: "1:634229985957:web:3457c773c98d775207734c"
};

// 3) INIT APP + DB + AUTH
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// =========================
// UI Helpers
// =========================
const $ = (id) => document.getElementById(id);

// DOM
const form = $("expenseForm");
const statusEl = $("status");
const tbody = $("tbody");

const btnPrint = $("btnPrint");
const btnRefresh = $("btnRefresh");
const btnPrintAll = $("btnPrintAll");

const btnLogin  = $("btnLogin");
const btnLogout = $("btnLogout");
const userBadge = $("userBadge");

const filterText = $("filterText");
const filterYear = $("filterYear");

const sumBase = $("sumBase");
const sumVat = $("sumVat");
const sumTotal = $("sumTotal");

console.log("[DOM] btnLogin:", !!btnLogin, "btnLogout:", !!btnLogout, "userBadge:", !!userBadge);

// =========================
// AUTH UI + LISTENERS
// =========================
function setAuthUI(user) {
  if (user) {
    btnLogin.style.display = "none";
    btnLogout.style.display = "inline-flex";
    userBadge.textContent = user.email || user.displayName || "Usuario";
  } else {
    btnLogin.style.display = "inline-flex";
    btnLogout.style.display = "none";
    userBadge.textContent = "Invitado";
  }
}

// Login
btnLogin.addEventListener("click", async () => {
  console.log("[AUTH] CLICK LOGIN DETECTADO");
  try {
    await signInWithPopup(auth, provider);
    console.log("[AUTH] login OK");
  } catch (err) {
    console.error("[AUTH] ERROR LOGIN:", err);
    alert("Error al iniciar sesión. Mira la consola (F12 → Console).");
  }
});

// Logout
btnLogout.addEventListener("click", async () => {
  console.log("[AUTH] click logout");
  try {
    await signOut(auth);
    console.log("[AUTH] logout OK");
  } catch (err) {
    console.error("[AUTH] error logout:", err);
    alert("Error al cerrar sesión. Mira la consola (F12 → Console).");
  }
});

// =========================
// Helpers
// =========================
function euro(n){
  return (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function yearFromDate(isoDate){
  return Number(String(isoDate).slice(0,4));
}

function pad4(n){
  return String(n).padStart(4, "0");
}

function setStatus(msg, isError=false){
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ffb4b4" : "";
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// =========================
// Correlativo seguro (transacción)
// Doc contador: counters/gastos_YYYY
// Campo: value (number)
// =========================
async function nextExpenseNumber(year){
  const counterRef = doc(db, "counters", `gastos_${year}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    let current = 0;
    if (snap.exists()) current = Number(snap.data().value || 0);
    const updated = current + 1;
    tx.set(counterRef, { value: updated }, { merge: true });
    return updated;
  });

  return `GAS-${year}-${pad4(next)}`;
}

// =========================
// Firestore: colección gastos
// =========================
const expensesCol = collection(db, "expenses");

// Estado local
let allExpenses = [];
let unsubLive = null; // para cortar snapshot si hace falta

function refreshYearOptions(){
  const years = Array.from(new Set(allExpenses.map(e => e.year))).sort((a,b)=>b-a);
  const current = filterYear.value;

  filterYear.innerHTML = `<option value="">Todos los años</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");
  if (current && years.includes(Number(current))) filterYear.value = current;
}

function render(){
  const txt = (filterText.value || "").trim().toLowerCase();
  const yr = filterYear.value;

  const filtered = allExpenses.filter(e => {
    const matchesText =
      !txt ||
      (e.concept || "").toLowerCase().includes(txt) ||
      (e.supplier || "").toLowerCase().includes(txt) ||
      (e.category || "").toLowerCase().includes(txt) ||
      (e.number || "").toLowerCase().includes(txt);

    const matchesYear = !yr || String(e.year) === String(yr);
    return matchesText && matchesYear;
  });

  tbody.innerHTML = "";

  let sBase=0, sVat=0, sTot=0;

  for(const e of filtered){
    const base = Number(e.amount) || 0;
    const vatPct = Number(e.vatPct) || 0;
    const vat = base * (vatPct/100);
    const total = base + vat;

    sBase += base; sVat += vat; sTot += total;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${e.number || ""}</strong></td>
      <td>${e.date || ""}</td>
      <td>${escapeHtml(e.concept || "")}</td>
      <td>${escapeHtml(e.supplier || "")}</td>
      <td>${escapeHtml(e.category || "")}</td>
      <td class="right">${euro(base)}</td>
      <td class="right">${euro(vat)}</td>
      <td class="right"><strong>${euro(total)}</strong></td>
      <td>${escapeHtml(e.payment || "")}</td>
      <td class="no-print">
        <button data-del="${e.id}" type="button">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  sumBase.textContent = euro(sBase);
  sumVat.textContent = euro(sVat);
  sumTotal.textContent = euro(sTot);
}

function startLive(){
  if (unsubLive) unsubLive(); // por si ya estaba suscrito
  const q = query(expensesCol, orderBy("date", "desc"), orderBy("createdAt", "desc"));

  unsubLive = onSnapshot(q, (snap) => {
    allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshYearOptions();
    render();
    setStatus(`Cargados ${allExpenses.length} registros.`);
  }, (err) => {
    console.error(err);
    setStatus("Error cargando datos. Revisa configuración y reglas de Firestore.", true);
  });
}

// =========================
// Guardar gasto
// =========================
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  setStatus("Guardando...");

  const date = $("date").value;
  const concept = $("concept").value.trim();
  const supplier = $("supplier").value.trim();
  const category = $("category").value;
  const amount = Number($("amount").value);
  const vatPct = Number($("vat").value || 0);
  const payment = $("payment").value;
  const notes = $("notes").value.trim();

  if(!date || !concept || !category || !payment || !(amount >= 0)){
    setStatus("Faltan datos obligatorios o el importe no es válido.", true);
    return;
  }

  try{
    const year = yearFromDate(date);
    const number = await nextExpenseNumber(year);

    await addDoc(expensesCol, {
      number, year, date, concept, supplier, category,
      amount, vatPct, payment, notes,
      createdAt: Date.now()
    });

    form.reset();
    $("date").valueAsDate = new Date();
    setStatus(`Guardado: ${number}`);
  }catch(err){
    console.error(err);
    setStatus("No se pudo guardar. Revisa Firebase Config / Reglas / Permisos.", true);
  }
});

// =========================
// Eliminar
// =========================
tbody.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if(!btn) return;

  const id = btn.getAttribute("data-del");
  if(!id) return;

  if(!confirm("¿Eliminar este registro?")) return;

  try{
    await deleteDoc(doc(db, "expenses", id));
    setStatus("Registro eliminado.");
  }catch(err){
    console.error(err);
    setStatus("No se pudo eliminar.", true);
  }
});

// =========================
// Filtros + imprimir
// =========================
filterText.addEventListener("input", render);
filterYear.addEventListener("change", render);

btnRefresh.addEventListener("click", () => render());

// Imprimir último (tu función existente)
btnPrint.addEventListener("click", printLast);

// Imprimir listado (tu lógica existente)
btnPrintAll?.addEventListener("click", () => {
  document.body.classList.add("print-listado");
  window.print();
  document.body.classList.remove("print-listado");
});

// =========================
// INIT
// =========================
(function init(){
  $("date").valueAsDate = new Date();
  // Importante: arrancamos live igualmente por ahora.
  // Cuando cierres reglas, si no hay login, dará error -> y lo verás.
  startLive();
})();

// =========================
// TU FUNCIÓN EXISTENTE (NO LA TOCO)
// =========================
function printLast() {
  const tbody = document.querySelector("tbody");
  if (!tbody) {
    alert("No hay datos para imprimir");
    return;
  }

  const filas = [...tbody.querySelectorAll("tr")];
  if (filas.length === 0) {
    alert("No hay registros");
    return;
  }

  const fila = filas[0];
  const celdas = [...fila.querySelectorAll("td")].map(td => td.textContent.trim());
  const [n, fecha, concepto, proveedor, categoria, base, iva, total, pago] = celdas;

  const ahora = new Date();
  const impFecha = ahora.toLocaleDateString("es-ES");
  const impHora = ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const html = `
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Último gasto</title>
      <style>
        @media print { body { margin: 0; } }
        body{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          padding: 12px;
          width: 74mm;
          max-width: 74mm;
        }
        .h1{ font-weight: 800; font-size: 14px; text-align: center; letter-spacing: .5px; margin: 6px 0 2px; }
        .sub{ text-align: center; font-size: 11px; margin: 0 0 10px; opacity: .85; }
        .hr{ border-top: 1px dashed #000; margin: 8px 0; }
        .row{ display: flex; justify-content: space-between; gap: 10px; margin: 4px 0; }
        .k{ font-weight: 700; }
        .v{ text-align: right; white-space: nowrap; }
        .wrap{ white-space: normal; text-align: left; }
        .big{ font-size: 13px; font-weight: 900; }
        .foot{ margin-top: 10px; font-size: 10px; text-align: center; opacity: .85; }
      </style>
    </head>
    <body>
      <div class="empresa">OBRANTIS, S.L.</div>
      <div class="empresa-sub">Control interno de gastos</div>
      <div class="h1">CONTROL DE GASTOS</div>
      <div class="sub">Ticket / ficha del último registro</div>

      <div class="hr"></div>

      <div class="row"><div class="k">Nº</div><div class="v">${n || "-"}</div></div>
      <div class="row"><div class="k">Fecha</div><div class="v">${fecha || "-"}</div></div>

      <div class="hr"></div>

      <div class="row"><div class="k">Concepto</div><div class="v"></div></div>
      <div class="wrap">${concepto || "-"}</div>

      <div class="row"><div class="k">Proveedor</div><div class="v"></div></div>
      <div class="wrap">${proveedor || "-"}</div>

      <div class="row"><div class="k">Categoría</div><div class="v"></div></div>
      <div class="wrap">${categoria || "-"}</div>

      <div class="hr"></div>

      <div class="row"><div class="k">Base</div><div class="v">${base || "-"}</div></div>
      <div class="row"><div class="k">IVA</div><div class="v">${iva || "-"}</div></div>
      <div class="row big"><div class="k">TOTAL</div><div class="v">${total || "-"}</div></div>

      <div class="row"><div class="k">Pago</div><div class="v">${pago || "-"}</div></div>

      <div class="hr"></div>

      <div class="foot">Impreso: ${impFecha} ${impHora}</div>

      <script>
        window.onload = () => window.print();
      </script>
    </body>
  </html>
  `;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
}

