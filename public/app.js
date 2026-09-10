/**
 * Frontend for the P03 Hotel Booking API.
 *
 * Talks only to the endpoints documented in the README; it adds no behaviour of
 * its own. Price, status and refund figures are always whatever the server
 * returned -- nothing is recomputed here.
 */

const state = {
  token: localStorage.getItem('p03_token') || null,
  user: JSON.parse(localStorage.getItem('p03_user') || 'null'),
  view: null
};

/* ------------------------------------------------------------------ api */

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) {
    const err = new Error(payload.message || `Request failed (${res.status})`);
    err.errorCode = payload.errorCode;
    err.errors = payload.errors;
    err.status = res.status;
    throw err;
  }
  return payload;
}

/* --------------------------------------------------------------- helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let toastTimer;
function toast(message, isError = false, details) {
  const t = $('#toast');
  t.className = isError ? 'toast err' : 'toast';
  t.textContent = message;
  if (details && details.length) {
    const ul = el('ul');
    details.forEach((d) => ul.appendChild(el('li', null, `${d.field}: ${d.message}`)));
    t.appendChild(ul);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 6000 : 3000);
}

const fail = (e) => toast(e.errorCode ? `${e.errorCode} — ${e.message}` : e.message, true, e.errors);
const money = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);
const day = (d) => (d ? String(d).slice(0, 10) : '—');
const formData = (form) => {
  const o = {};
  new FormData(form).forEach((v, k) => { if (v !== '') o[k] = v; });
  return o;
};
const statusChip = (s) => {
  const n = el('span', `status status-${s}`, s);
  return n;
};

/* ------------------------------------------------------------------ auth */

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('p03_token', token);
  localStorage.setItem('p03_user', JSON.stringify(user));
  render();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('p03_token');
  localStorage.removeItem('p03_user');
  state.view = null;
  render();
}

document.querySelectorAll('[data-authtab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-authtab]').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.authtab === 'login';
    $('#loginForm').hidden = !isLogin;
    $('#registerForm').hidden = isLogin;
  });
});

document.querySelectorAll('[data-fill]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const [email, password] = chip.dataset.fill.split('|');
    $('#loginForm').email.value = email;
    $('#loginForm').password.value = password;
  });
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/login', { method: 'POST', body: formData(e.target), auth: false });
    setSession(r.data.token, r.data.user);
    toast(`Welcome back, ${r.data.user.name}`);
  } catch (err) { fail(err); }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/register', { method: 'POST', body: formData(e.target), auth: false });
    setSession(r.data.token, r.data.user);
    toast('Account created');
  } catch (err) { fail(err); }
});

$('#logoutBtn').addEventListener('click', logout);

/* ------------------------------------------------------------- navigation */

const VIEWS = [
  { id: 'search',       label: 'Search',        roles: ['guest', 'staff', 'admin'] },
  { id: 'book',         label: 'Book',          roles: ['guest'] },
  { id: 'mybookings',   label: 'My Bookings',   roles: ['guest'] },
  { id: 'bookings',     label: 'Bookings Desk', roles: ['staff', 'admin'] },
  { id: 'housekeeping', label: 'Housekeeping',  roles: ['staff', 'admin'] },
  { id: 'hotels',       label: 'Properties',    roles: ['admin'] },
  { id: 'roomtypes',    label: 'Room Types',    roles: ['admin'] },
  { id: 'pricing',      label: 'Pricing',       roles: ['admin'] },
  { id: 'reports',      label: 'Reports',       roles: ['admin'] }
];

function render() {
  const authed = Boolean(state.token && state.user);
  $('#authView').hidden = authed;
  $('#appView').hidden = !authed;
  $('#session').hidden = !authed;
  if (!authed) return;

  $('#sessionUser').textContent = state.user.name;
  $('#sessionRole').textContent = state.user.role;

  const allowed = VIEWS.filter((v) => v.roles.includes(state.user.role));
  if (!state.view || !allowed.some((v) => v.id === state.view)) state.view = allowed[0].id;

  const nav = $('#nav');
  nav.innerHTML = '';
  allowed.forEach((v) => {
    const b = el('button', v.id === state.view ? 'active' : null, v.label);
    b.addEventListener('click', () => { state.view = v.id; render(); });
    nav.appendChild(b);
  });

  const content = $('#content');
  content.innerHTML = '';
  content.appendChild($(`#tpl-${state.view}`).content.cloneNode(true));
  MOUNT[state.view]();
}

/* --------------------------------------------------------------- M4 search */

function mountSearch() {
  $('#searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = new URLSearchParams(formData(e.target)).toString();
    try {
      const r = await api(`/hotels/search?${q}`, { auth: false });
      renderSearch(r.data);
    } catch (err) { fail(err); }
  });
}

function renderSearch(hotels) {
  const out = $('#searchResults');
  out.innerHTML = '';
  if (!hotels || !hotels.length) {
    out.appendChild(el('div', 'empty', 'No properties with availability for those dates.'));
    return;
  }
  hotels.forEach((entry) => {
    const h = entry.hotel || entry;
    const card = el('div', 'card');
    card.appendChild(el('h4', null, `${h.name} — ${h.city}${h.rating ? ` · ${h.rating}★` : ''}`));
    const meta = el('div', 'kv');
    meta.appendChild(el('span', null, 'Hotel ID'));
    meta.appendChild(el('span', 'mono', h._id));
    card.appendChild(meta);

    const table = el('table');
    table.innerHTML = `<tr><th>Room type</th><th>Available</th><th>Nights</th>
      <th>Quoted total</th><th>Room Type ID</th></tr>`;
    (entry.roomTypes || []).forEach((rt) => {
      const tr = el('tr');
      tr.innerHTML = `<td>${rt.name}</td><td>${rt.availableRooms}/${rt.totalRooms}</td>
        <td>${rt.nights}</td><td>${money(rt.quotedTotal)}</td>
        <td class="mono">${rt._id}</td>`;
      table.appendChild(tr);
    });
    card.appendChild(table);
    out.appendChild(card);
  });
}

/* ----------------------------------------------------------------- M5 book */

function mountBook() {
  $('#bookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.guests = Number(d.guests);
    try {
      const r = await api('/bookings', { method: 'POST', body: d });
      toast(`Booked — ${r.data.bookingRef}`);
      renderBookingDetail(r.data, $('#bookResult'));
    } catch (err) { fail(err); }
  });
}

function renderBookingDetail(b, out) {
  out.innerHTML = '';
  const card = el('div', 'card');
  const head = el('h4');
  head.textContent = `${b.bookingRef} `;
  head.appendChild(statusChip(b.status));
  card.appendChild(head);

  [['Stay', `${day(b.checkIn)} → ${day(b.checkOut)}`],
   ['Nights', b.nights ?? (b.nightlyBreakdown || []).length],
   ['Guests', b.guests],
   ['Tax', money(b.taxAmount)],
   ['Total', money(b.totalAmount)]].forEach(([k, v]) => {
    const row = el('div', 'kv');
    row.appendChild(el('span', null, k));
    row.appendChild(el('span', null, String(v)));
    card.appendChild(row);
  });

  if (b.nightlyBreakdown && b.nightlyBreakdown.length) {
    const t = el('table');
    t.innerHTML = '<tr><th>Night</th><th>Base</th><th>Multiplier</th><th>Rate</th><th>Rule</th></tr>';
    b.nightlyBreakdown.forEach((n) => {
      const tr = el('tr');
      tr.innerHTML = `<td>${day(n.date)}</td><td>${money(n.baseRate)}</td>
        <td>${n.multiplier}×</td><td>${money(n.rate)}</td><td>${n.appliedRule || '—'}</td>`;
      t.appendChild(tr);
    });
    card.appendChild(t);
  }
  out.appendChild(card);
}

/* -------------------------------------------- M11 / M10 / M12 guest history */

function mountMyBookings() {
  const load = async () => {
    const params = new URLSearchParams();
    if ($('#histStatus').value) params.set('status', $('#histStatus').value);
    if ($('#histUpcoming').checked) params.set('upcoming', 'true');
    try {
      const r = await api(`/guests/${state.user._id}/bookings?${params}`);
      renderHistory(Array.isArray(r.data) ? r.data : r.data.bookings || []);
    } catch (err) { fail(err); }
  };
  $('#histRefresh').addEventListener('click', load);
  $('#histStatus').addEventListener('change', load);
  $('#histUpcoming').addEventListener('change', load);
  load();
}

function renderHistory(list) {
  const out = $('#histList');
  out.innerHTML = '';
  if (!list.length) { out.appendChild(el('div', 'empty', 'No bookings yet.')); return; }

  const table = el('table');
  table.innerHTML = `<tr><th>Ref</th><th>Stay</th><th>Status</th><th>Total</th><th>Actions</th></tr>`;
  list.forEach((b) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'mono', b.bookingRef));
    tr.appendChild(el('td', null, `${day(b.checkIn)} → ${day(b.checkOut)}`));
    const st = el('td'); st.appendChild(statusChip(b.status)); tr.appendChild(st);
    tr.appendChild(el('td', null, money(b.totalAmount)));

    const act = el('td', 'actions');
    const inv = el('button', 'btn btn-sm', 'Invoice');
    inv.addEventListener('click', () => showInvoice(b._id));
    act.appendChild(inv);

    if (['Reserved', 'Confirmed'].includes(b.status)) {
      const c = el('button', 'btn btn-sm', 'Cancel');
      c.addEventListener('click', () => cancelBooking(b._id, renderHistoryReload));
      act.appendChild(c);
    }
    tr.appendChild(act);
    table.appendChild(tr);
  });
  out.appendChild(table);
}

const renderHistoryReload = () => $('#histRefresh').click();

async function cancelBooking(id, after) {
  const reason = prompt('Reason for cancellation (optional):') || undefined;
  try {
    const r = await api(`/bookings/${id}/cancel`, { method: 'PUT', body: reason ? { reason } : {} });
    const c = r.data.cancellation || {};
    toast(`Cancelled — refund ${c.refundPercent}% (${money(c.refundAmount)})`);
    if (after) after();
  } catch (err) { fail(err); }
}

async function showInvoice(id) {
  try {
    const r = await api(`/bookings/${id}/invoice`);
    const out = $('#histList') || $('#bkList');
    const pre = el('pre', null, JSON.stringify(r.data, null, 2));
    out.prepend(pre);
  } catch (err) { fail(err); }
}

/* ------------------------------------------------ M5 / M7 / M8 staff desk */

function mountBookings() {
  const load = async () => {
    const params = new URLSearchParams();
    if ($('#bkStatus').value) params.set('status', $('#bkStatus').value);
    try {
      const r = await api(`/bookings?${params}`);
      renderDesk(Array.isArray(r.data) ? r.data : r.data.bookings || []);
    } catch (err) { fail(err); }
  };
  $('#bkRefresh').addEventListener('click', load);
  $('#bkStatus').addEventListener('change', load);
  load();
}

function renderDesk(list) {
  const out = $('#bkList');
  out.innerHTML = '';
  if (!list.length) { out.appendChild(el('div', 'empty', 'No bookings match.')); return; }

  const table = el('table');
  table.innerHTML = `<tr><th>Ref</th><th>Stay</th><th>Status</th><th>Total</th><th>Actions</th></tr>`;
  list.forEach((b) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'mono', b.bookingRef));
    tr.appendChild(el('td', null, `${day(b.checkIn)} → ${day(b.checkOut)}`));
    const st = el('td'); st.appendChild(statusChip(b.status)); tr.appendChild(st);
    tr.appendChild(el('td', null, money(b.totalAmount)));

    const act = el('td', 'actions');
    const transition = (label, path) => {
      const btn = el('button', 'btn btn-sm', label);
      btn.addEventListener('click', async () => {
        try {
          await api(`/bookings/${b._id}/${path}`, { method: 'PUT' });
          toast(`${label} succeeded`);
          $('#bkRefresh').click();
        } catch (err) { fail(err); }
      });
      act.appendChild(btn);
    };

    if (b.status === 'Reserved') transition('Confirm', 'confirm');
    if (b.status === 'Confirmed') transition('Check in', 'checkin');
    if (b.status === 'CheckedIn') transition('Check out', 'checkout');
    if (['Reserved', 'Confirmed'].includes(b.status)) {
      const c = el('button', 'btn btn-sm', 'Cancel');
      c.addEventListener('click', () => cancelBooking(b._id, () => $('#bkRefresh').click()));
      act.appendChild(c);
    }
    const inv = el('button', 'btn btn-sm', 'Invoice');
    inv.addEventListener('click', () => showInvoice(b._id));
    act.appendChild(inv);

    tr.appendChild(act);
    table.appendChild(tr);
  });
  out.appendChild(table);
}

/* ------------------------------------------------------- M9 housekeeping */

function mountHousekeeping() {
  if (state.user.hotelId) $('#hkHotelId').value = state.user.hotelId;

  $('#hkLoad').addEventListener('click', async () => {
    const id = $('#hkHotelId').value.trim();
    if (!id) return toast('Enter a hotel ID', true);
    try {
      const r = await api(`/hotels/${id}/housekeeping-board`);
      renderBoard(r.data);
    } catch (err) { fail(err); }
  });
}

function renderBoard(payload) {
  const out = $('#hkBoard');
  out.innerHTML = '';
  const groups = payload.board || {};
  const statuses = ['Clean', 'Dirty', 'Inspected', 'OutOfService'];

  statuses.forEach((s) => {
    const rooms = groups[s] || [];
    const card = el('div', 'card');
    card.appendChild(el('h4', null, `${s} (${rooms.length})`));
    if (!rooms.length) {
      card.appendChild(el('div', 'empty', 'None'));
    } else {
      const table = el('table');
      table.innerHTML = '<tr><th>Room</th><th>Type</th><th>Occupied</th><th>Change to</th></tr>';
      rooms.forEach((room) => {
        const tr = el('tr');
        tr.appendChild(el('td', null, room.roomNumber));
        tr.appendChild(el('td', null, room.roomType || '—'));
        tr.appendChild(el('td', null, room.occupied ? 'Yes' : 'No'));
        const act = el('td', 'actions');
        statuses.filter((x) => x !== s).forEach((target) => {
          const b = el('button', 'btn btn-sm', target);
          b.addEventListener('click', async () => {
            try {
              await api(`/rooms/${room._id}/housekeeping`, {
                method: 'PATCH', body: { housekeepingStatus: target }
              });
              toast(`Room ${room.roomNumber} → ${target}`);
              $('#hkLoad').click();
            } catch (err) { fail(err); }
          });
          act.appendChild(b);
        });
        tr.appendChild(act);
        table.appendChild(tr);
      });
      card.appendChild(table);
    }
    out.appendChild(card);
  });
}

/* ------------------------------------------------------------ M2 hotels */

function mountHotels() {
  const load = async () => {
    const city = $('#hotelCity').value.trim();
    try {
      const r = await api(`/hotels${city ? `?city=${encodeURIComponent(city)}` : ''}`, { auth: false });
      renderHotels(Array.isArray(r.data) ? r.data : r.data.hotels || []);
    } catch (err) { fail(err); }
  };

  $('#hotelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.rating) d.rating = Number(d.rating);
    try {
      await api('/hotels', { method: 'POST', body: d });
      toast('Property created');
      e.target.reset();
      load();
    } catch (err) { fail(err); }
  });

  $('#hotelRefresh').addEventListener('click', load);
  load();
}

function renderHotels(list) {
  const out = $('#hotelList');
  out.innerHTML = '';
  if (!list.length) { out.appendChild(el('div', 'empty', 'No properties.')); return; }

  const table = el('table');
  table.innerHTML = `<tr><th>Name</th><th>City</th><th>Rating</th><th>ID</th><th></th></tr>`;
  list.forEach((h) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${h.name}</td><td>${h.city}</td><td>${h.rating ?? '—'}</td>
      <td class="mono">${h._id}</td>`;
    const act = el('td', 'actions');
    const del = el('button', 'btn btn-sm', 'Deactivate');
    del.addEventListener('click', async () => {
      if (!confirm(`Soft-delete ${h.name}?`)) return;
      try {
        await api(`/hotels/${h._id}`, { method: 'DELETE' });
        toast('Property deactivated');
        $('#hotelRefresh').click();
      } catch (err) { fail(err); }
    });
    act.appendChild(del);
    tr.appendChild(act);
    table.appendChild(tr);
  });
  out.appendChild(table);
}

/* --------------------------------------------------------- M3 room types */

function mountRoomTypes() {
  const load = async () => {
    const id = $('#rtHotelId').value.trim();
    if (!id) return;
    try {
      const r = await api(`/hotels/${id}/room-types`, { auth: false });
      renderRoomTypes(Array.isArray(r.data) ? r.data : r.data.roomTypes || []);
    } catch (err) { fail(err); }
  };

  $('#rtLoad').addEventListener('click', load);

  $('#rtForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hotelId = $('#rtHotelId').value.trim();
    if (!hotelId) return toast('Load a hotel first', true);
    const d = formData(e.target);
    ['basePrice', 'totalRooms', 'capacity'].forEach((k) => { d[k] = Number(d[k]); });
    try {
      await api(`/hotels/${hotelId}/room-types`, { method: 'POST', body: d });
      toast('Room type created');
      e.target.reset();
      load();
    } catch (err) { fail(err); }
  });

  $('#roomForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    try {
      await api(`/room-types/${d.roomTypeId}/rooms`, {
        method: 'POST', body: { roomNumber: d.roomNumber }
      });
      toast(`Room ${d.roomNumber} added`);
      e.target.reset();
    } catch (err) { fail(err); }
  });
}

function renderRoomTypes(list) {
  const out = $('#rtList');
  out.innerHTML = '';
  if (!list.length) { out.appendChild(el('div', 'empty', 'No room types.')); return; }

  const table = el('table');
  table.innerHTML = `<tr><th>Name</th><th>Base price</th><th>Rooms</th><th>Capacity</th><th>ID</th></tr>`;
  list.forEach((rt) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${rt.name}</td><td>${money(rt.basePrice)}</td>
      <td>${rt.totalRooms}</td><td>${rt.capacity}</td><td class="mono">${rt._id}</td>`;
    table.appendChild(tr);
  });
  out.appendChild(table);
}

/* ------------------------------------------------------------ M6 pricing */

function mountPricing() {
  const load = async () => {
    const id = $('#prRoomTypeId').value.trim();
    if (!id) return;
    try {
      const r = await api(`/room-types/${id}/pricing-rules`);
      renderRules(Array.isArray(r.data) ? r.data : r.data.pricingRules || []);
    } catch (err) { fail(err); }
  };

  $('#prLoad').addEventListener('click', load);

  $('#prForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#prRoomTypeId').value.trim();
    if (!id) return toast('Load a room type first', true);
    const d = formData(e.target);
    d.multiplier = Number(d.multiplier);
    if (d.priority) d.priority = Number(d.priority);
    d.appliesToWeekend = e.target.appliesToWeekend.checked;
    try {
      await api(`/room-types/${id}/pricing-rules`, { method: 'POST', body: d });
      toast('Pricing rule created');
      e.target.reset();
      load();
    } catch (err) { fail(err); }
  });

  $('#quoteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const q = new URLSearchParams({ checkIn: d.checkIn, checkOut: d.checkOut });
    try {
      const r = await api(`/room-types/${d.roomTypeId}/quote?${q}`, { auth: false });
      $('#quoteResult').innerHTML = '';
      $('#quoteResult').appendChild(el('pre', null, JSON.stringify(r.data, null, 2)));
    } catch (err) { fail(err); }
  });
}

function renderRules(list) {
  const out = $('#prList');
  out.innerHTML = '';
  if (!list.length) { out.appendChild(el('div', 'empty', 'No pricing rules.')); return; }

  const table = el('table');
  table.innerHTML = `<tr><th>Season</th><th>Multiplier</th><th>Window</th>
    <th>Weekend</th><th>Priority</th><th></th></tr>`;
  list.forEach((r) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${r.season}</td><td>${r.multiplier}×</td>
      <td>${day(r.startDate)} → ${day(r.endDate)}</td>
      <td>${r.appliesToWeekend ? 'Yes' : 'No'}</td><td>${r.priority ?? 0}</td>`;
    const act = el('td', 'actions');
    const del = el('button', 'btn btn-sm', 'Delete');
    del.addEventListener('click', async () => {
      try {
        await api(`/pricing-rules/${r._id}`, { method: 'DELETE' });
        toast('Rule deleted');
        $('#prLoad').click();
      } catch (err) { fail(err); }
    });
    act.appendChild(del);
    tr.appendChild(act);
    table.appendChild(tr);
  });
  out.appendChild(table);
}

/* ------------------------------------------------------------ M13 reports */

function mountReports() {
  $('#reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const win = new URLSearchParams({ from: d.from, to: d.to });
    try {
      const occ = await api(`/admin/reports/occupancy?${win}`);
      const rev = await api(`/admin/reports/revenue?${win}&groupBy=${d.groupBy}`);
      const out = $('#reportResult');
      out.innerHTML = '';
      out.appendChild(el('h3', null, 'Occupancy'));
      out.appendChild(el('pre', null, JSON.stringify(occ.data, null, 2)));
      out.appendChild(el('h3', null, `Revenue by ${d.groupBy}`));
      out.appendChild(el('pre', null, JSON.stringify(rev.data, null, 2)));
    } catch (err) { fail(err); }
  });
}

/* ------------------------------------------------------------------ boot */

const MOUNT = {
  search: mountSearch,
  book: mountBook,
  mybookings: mountMyBookings,
  bookings: mountBookings,
  housekeeping: mountHousekeeping,
  hotels: mountHotels,
  roomtypes: mountRoomTypes,
  pricing: mountPricing,
  reports: mountReports
};

render();
