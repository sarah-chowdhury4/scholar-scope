/* ============ Config ============ */
const MAX_PHOTO_MB = 2;                 // change to 5 if you want
const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const MAX_COUNTRIES = 0;                // 0 = no limit

const COUNTRIES = ("Afghanistan,Albania,Algeria,Andorra,Angola,Antigua and Barbuda,Argentina,Armenia,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Brazil,Brunei,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Central African Republic,Chad,Chile,China,Colombia,Comoros,Congo,Costa Rica,Croatia,Cuba,Cyprus,Czech Republic,Denmark,Djibouti,Dominica,Dominican Republic,DR Congo,Ecuador,Egypt,El Salvador,Equatorial Guinea,Eritrea,Estonia,Eswatini,Ethiopia,Fiji,Finland,France,Gabon,Gambia,Georgia,Germany,Ghana,Greece,Grenada,Guatemala,Guinea,Guinea-Bissau,Guyana,Haiti,Honduras,Hungary,Iceland,India,Indonesia,Iran,Iraq,Ireland,Israel,Italy,Ivory Coast,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Kosovo,Kuwait,Kyrgyzstan,Laos,Latvia,Lebanon,Lesotho,Liberia,Libya,Liechtenstein,Lithuania,Luxembourg,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Mauritania,Mauritius,Mexico,Micronesia,Moldova,Monaco,Mongolia,Montenegro,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,New Zealand,Nicaragua,Niger,Nigeria,North Korea,North Macedonia,Norway,Oman,Pakistan,Palau,Palestine,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Poland,Portugal,Qatar,Romania,Russia,Rwanda,Saint Kitts and Nevis,Saint Lucia,Saint Vincent and the Grenadines,Samoa,San Marino,Sao Tome and Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Korea,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Sweden,Switzerland,Syria,Taiwan,Tajikistan,Tanzania,Thailand,Timor-Leste,Togo,Tonga,Trinidad and Tobago,Tunisia,Turkey,Turkmenistan,Tuvalu,Uganda,Ukraine,United Arab Emirates,United Kingdom,United States,Uruguay,Uzbekistan,Vanuatu,Vatican City,Venezuela,Vietnam,Yemen,Zambia,Zimbabwe").split(",");
const POPULAR = ["United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "Netherlands", "Japan", "South Korea", "Sweden", "Singapore", "New Zealand"];

/* ============ State ============ */
// TODO: API call here – load the logged-in student's profile and replace this object.
const profile = {
  name: "Aisha Rahman",
  email: "aisha@example.com",
  photo: null,            // image URL or data URL
  countries: [],
};
let draftCountries = [...profile.countries];

const $ = (id) => document.getElementById(id);

/* ============ Toasts ============ */
function toast(msg, isError = false) {
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " err" : "");
  t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function setErr(id, msg) { $(id).textContent = msg || ""; }
function fakeRequest(ms = 700) { return new Promise((r) => setTimeout(r, ms)); }
async function withLoading(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

/* ============ Header & completeness ============ */
function renderHeader() {
  $("userName").textContent = profile.name;
  $("userEmail").textContent = profile.email;
  const av = $("avatar");
  av.innerHTML = "";
  if (profile.photo) {
    const img = document.createElement("img");
    img.src = profile.photo; img.alt = "Profile photo";
    av.appendChild(img);
  } else {
    const s = document.createElement("span");
    s.textContent = profile.name.trim().charAt(0).toUpperCase() || "S";
    av.appendChild(s);
  }
  $("photoBtn").textContent = profile.photo ? "Change photo" : "Add photo";
  $("photoRemove").hidden = !profile.photo;
  renderCompleteness();
}
function renderCompleteness() {
  // Name + email + password are set at registration (40%). Photo and countries add the rest.
  let pct = 40; const missing = [];
  if (profile.photo) pct += 30; else missing.push("a profile photo");
  if (profile.countries.length) pct += 30; else missing.push("your scholarship countries");
  $("pctText").textContent = pct + "%";
  $("pctBar").style.width = pct + "%";
  $("pctHint").textContent = missing.length ? "Add " + missing.join(" and ") + "." : "Your profile is complete.";
}

/* ============ Photo ============ */
$("photoBtn").onclick = () => $("photoInput").click();
$("photoRemove").onclick = () => {
  // TODO: API call here – delete the profile photo
  profile.photo = null; renderHeader(); toast("Profile photo removed");
};
$("photoInput").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  setErr("photoError", "");
  if (!file) return;
  if (!ALLOWED_TYPES.includes(file.type)) return setErr("photoError", "Use a JPG or PNG image.");
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) return setErr("photoError", `Photo must be under ${MAX_PHOTO_MB} MB.`);

  const bar = $("photoProgressBar"), track = $("photoProgress");
  track.hidden = false; bar.style.width = "0";
  const reader = new FileReader();
  reader.onprogress = (ev) => { if (ev.lengthComputable) bar.style.width = (ev.loaded / ev.total) * 100 + "%"; };
  reader.onload = async () => {
    bar.style.width = "100%";
    // TODO: API call here – upload `file` (FormData) and use the returned URL instead of the data URL
    await fakeRequest(400);
    profile.photo = reader.result;
    track.hidden = true;
    renderHeader(); toast("Profile photo updated");
  };
  reader.onerror = () => { track.hidden = true; setErr("photoError", "Couldn't read that file. Try another."); };
  reader.readAsDataURL(file);
};
$("photoHint").textContent = `JPG or PNG, up to ${MAX_PHOTO_MB} MB.`;

/* ============ Show / hide password ============ */
document.querySelectorAll(".toggle").forEach((b) => {
  b.onclick = () => {
    const input = $(b.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    b.textContent = show ? "Hide" : "Show";
  };
});

/* ============ Email change ============ */
$("emailForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("newEmail").value.trim(), pwd = $("emailPwd").value;
  setErr("newEmailErr", ""); setErr("emailPwdErr", "");
  let ok = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr("newEmailErr", "Enter a valid email address."); ok = false; }
  else if (email.toLowerCase() === profile.email.toLowerCase()) { setErr("newEmailErr", "That's already your email."); ok = false; }
  if (!pwd) { setErr("emailPwdErr", "Enter your current password."); ok = false; }
  if (!ok) return;

  await withLoading(e.submitter, "Saving…", async () => {
    // TODO: API call here – change email (send email + current password); handle "wrong password" error
    await fakeRequest();
    profile.email = email; renderHeader();
    e.target.reset();
    toast("Email changed. Check your inbox to verify it.");
  });
};

/* ============ Password change + strength ============ */
function strength(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) && p.length >= 8) s++;
  return p ? Math.max(s, 1) : 0;
}
const LABELS = ["Enter a password", "Weak", "Fair", "Good", "Strong"];
$("newPwd").oninput = (e) => {
  const lvl = strength(e.target.value);
  document.querySelector(".meter").dataset.level = lvl;
  $("meterText").textContent = LABELS[lvl];
};
$("pwdForm").onsubmit = async (e) => {
  e.preventDefault();
  const cur = $("curPwd").value, nw = $("newPwd").value, cf = $("confPwd").value;
  ["curPwdErr", "confPwdErr"].forEach((i) => setErr(i, ""));
  let ok = true;
  if (!cur) { setErr("curPwdErr", "Enter your current password."); ok = false; }
  if (nw.length < 8) { setErr("confPwdErr", "New password must be at least 8 characters."); ok = false; }
  else if (nw !== cf) { setErr("confPwdErr", "Passwords don't match."); ok = false; }
  if (!ok) return;

  await withLoading(e.submitter, "Saving…", async () => {
    // TODO: API call here – change password (current + new)
    await fakeRequest();
    e.target.reset();
    document.querySelector(".meter").dataset.level = 0;
    $("meterText").textContent = LABELS[0];
    toast("Password changed");
  });
};

/* ============ Forgot password ============ */
$("forgotBtn").onclick = () => { $("fpEmail").textContent = profile.email; $("forgotModal").hidden = false; $("fpSend").focus(); };
$("fpCancel").onclick = () => ($("forgotModal").hidden = true);
$("forgotModal").onclick = (e) => { if (e.target.id === "forgotModal") $("forgotModal").hidden = true; };
$("fpSend").onclick = async () => {
  await withLoading($("fpSend"), "Sending…", async () => {
    // TODO: API call here – send password reset link to profile.email
    await fakeRequest();
    $("forgotModal").hidden = true;
    toast("Reset link sent to " + profile.email);
  });
};

/* ============ Countries ============ */
function toggleCountry(name) {
  const i = draftCountries.indexOf(name);
  if (i > -1) draftCountries.splice(i, 1);
  else {
    if (MAX_COUNTRIES && draftCountries.length >= MAX_COUNTRIES) return toast(`You can pick up to ${MAX_COUNTRIES} countries.`, true);
    draftCountries.push(name);
  }
  renderCountries();
}
function renderCountries() {
  const pop = $("popular"); pop.innerHTML = "";
  POPULAR.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (draftCountries.includes(c) ? " on" : "");
    b.textContent = c; b.setAttribute("aria-pressed", draftCountries.includes(c));
    b.onclick = () => toggleCountry(c);
    pop.appendChild(b);
  });
  const sel = $("selected"); sel.innerHTML = "";
  draftCountries.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip picked"; b.setAttribute("aria-label", "Remove " + c);
    b.append(c + " ");
    const x = document.createElement("b"); x.textContent = "×"; b.appendChild(x);
    b.onclick = () => toggleCountry(c);
    sel.appendChild(b);
  });
  $("emptyMsg").hidden = draftCountries.length > 0;
  $("countBadge").textContent = draftCountries.length + " selected";
  $("clearAll").hidden = !draftCountries.length;
}

// Searchable dropdown
const search = $("countrySearch"), list = $("countryList");
let activeIdx = -1;
function openList() {
  const q = search.value.trim().toLowerCase();
  const matches = COUNTRIES.filter((c) => !draftCountries.includes(c) && c.toLowerCase().includes(q));
  list.innerHTML = ""; activeIdx = -1;
  if (!matches.length) {
    const li = document.createElement("li"); li.className = "none"; li.textContent = "No matching countries"; list.appendChild(li);
  }
  matches.forEach((c) => {
    const li = document.createElement("li"); li.role = "option"; li.textContent = c;
    li.onmousedown = (e) => { e.preventDefault(); pick(c); };
    list.appendChild(li);
  });
  list.hidden = false; search.setAttribute("aria-expanded", "true");
}
function closeList() { list.hidden = true; search.setAttribute("aria-expanded", "false"); }
function pick(c) { toggleCountry(c); search.value = ""; openList(); search.focus(); }
function moveActive(d) {
  const items = [...list.querySelectorAll("li[role=option]")]; if (!items.length) return;
  items[activeIdx]?.classList.remove("active");
  activeIdx = (activeIdx + d + items.length) % items.length;
  items[activeIdx].classList.add("active"); items[activeIdx].scrollIntoView({ block: "nearest" });
}
search.onfocus = openList;
search.oninput = openList;
search.onblur = closeList;
search.onkeydown = (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) openList(); moveActive(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
  else if (e.key === "Enter") {
    e.preventDefault();
    const items = list.querySelectorAll("li[role=option]");
    const target = items[activeIdx] || items[0];
    if (target) pick(target.textContent);
  } else if (e.key === "Escape") closeList();
};

$("clearAll").onclick = () => { draftCountries = []; renderCountries(); };
$("saveCountries").onclick = async () => {
  await withLoading($("saveCountries"), "Saving…", async () => {
    // TODO: API call here – save the array of selected countries
    await fakeRequest();
    profile.countries = [...draftCountries];
    renderCompleteness();
    toast(profile.countries.length ? "Scholarship countries saved" : "Scholarship countries cleared");
  });
};

/* ============ Init ============ */
renderHeader();
renderCountries();
