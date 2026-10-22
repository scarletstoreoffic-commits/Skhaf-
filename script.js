// ШКАФ — маркетплейс. Этап 1: работает в браузере (localStorage). Этап 2: server.py + SQLite.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS = {get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v))};
const money = n => Number(n).toLocaleString('ru') + ' ₽';
const when = ts => new Date(ts).toLocaleString('ru', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});

const DEF = {
  categories: {'Одежда':'👕','Обувь':'👟','Аксессуары':'👜','Электроника':'🎧','Дом':'🛋️','Книги':'📚','Другое':'📦'},
  conditions: ['Новое','Отличное','Хорошее','Б/у'],
  cities: ['Москва','Санкт-Петербург','Казань','Екатеринбург','Другой']
};
const DEMO = [
  ['Джинсовая куртка Levi\'s',3500,'Одежда','M','Отличное','Москва','Классическая джинсовка, носила один сезон. Без дефектов.'],
  ['Кроссовки Nike Air Force 1',6200,'Обувь','42','Хорошее','Санкт-Петербург','Белые, оригинал. Небольшие потёртости на носках.'],
  ['Худи оверсайз чёрное',1800,'Одежда','L','Новое','Казань','Новое, с биркой. Не подошёл размер.'],
  ['Рюкзак городской 25 л',1200,'Аксессуары','','Хорошее','Москва','Вместительный, отделение для ноутбука 15".'],
  ['Наушники беспроводные',2900,'Электроника','','Отличное','Екатеринбург','Работают отлично, коробка и чек в комплекте.'],
  ['Платье вечернее синее',2400,'Одежда','S','Отличное','Москва','Надевала один раз на выпускной.'],
  ['Учебник «Гражданское право»',450,'Книги','','Б/у','Москва','Пометки карандашом, всё читаемо.'],
  ['Настольная лампа лофт',900,'Дом','','Хорошее','Казань','Металл, регулируется по высоте. Лампочка в подарок.']
];

// ---------- Этап 1: «база» в браузере ----------
const Local = {
  _d() { return LS.get('shkaf', {users: [], listings: [], orders: [], msgs: [], seq: 1}) },
  _s(d) { try { LS.set('shkaf', d) } catch { alert('Хранилище браузера переполнено — загрузи фото поменьше') } },
  _h(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h },
  _n(d, id) { return d.users.find(u => u.id === id)?.name || '?' },
  async ping() { return {ok: 1} },
  async register({name, pw}) {
    const d = this._d();
    if (d.users.some(u => u.name.toLowerCase() === name.toLowerCase())) return {error: 'Это имя уже занято'};
    const u = {id: d.seq++, name, pw: this._h(pw)}; d.users.push(u); this._s(d); return {id: u.id, name};
  },
  async login({name, pw}) {
    const u = this._d().users.find(u => u.name === name && u.pw === this._h(pw));
    return u ? {id: u.id, name} : {error: 'Неверное имя или пароль'};
  },
  async list() { const d = this._d(); return d.listings.map(l => ({...l, seller: this._n(d, l.seller_id)})) },
  async save({user, item}) {
    const d = this._d();
    if (item.id) {
      const l = d.listings.find(l => l.id === item.id && l.seller_id === user);
      if (!l) return {error: 'Нет доступа'}; Object.assign(l, item);
    } else d.listings.push({...item, id: d.seq++, seller_id: user, sold: 0, views: 0, ts: Date.now()});
    this._s(d); return {ok: 1};
  },
  async remove({user, id}) { const d = this._d(); d.listings = d.listings.filter(l => !(l.id === id && l.seller_id === user)); this._s(d); return {ok: 1} },
  async view({id}) { const d = this._d(), l = d.listings.find(l => l.id === id); if (l) { l.views++; this._s(d) } return {ok: 1} },
  async review({user, listing, stars, text}) {
    const d = this._d(); d.reviews = (d.reviews || []).filter(r => !(r.listing === listing && r.buyer === user)); const l = d.listings.find(l => l.id === listing);
    if (!l) return {error: 'Нет товара'};
    d.reviews.push({id: d.seq++, listing, buyer: user, seller: l.seller_id, stars: Math.max(1, Math.min(5, +stars || 5)), text: String(text || '').slice(0, 500), ts: Date.now()}); this._s(d); return {ok: 1};
  },
  async allreviews() { const d = this._d(); return (d.reviews || []).slice().reverse().slice(0, 300).map(r => ({id: r.id, stars: r.stars, text: r.text, ts: r.ts, listing: r.listing,
    buyer: this._n(d, r.buyer), seller: this._n(d, r.seller), title: d.listings.find(l => l.id === r.listing)?.title || 'Товар'})) },
  async reviews({seller}) { const d = this._d(); return (d.reviews || []).filter(r => r.seller === seller).map(r => ({...r, buyer: this._n(d, r.buyer)})) },
  async checkout({user, ids}) {
    const d = this._d(); let n = 0;
    for (const id of ids) {
      const l = d.listings.find(l => l.id === id);
      if (l && !l.sold && l.seller_id !== user) {
        l.sold = 1; n++;
        d.orders.push({id: d.seq++, listing: id, buyer: user, seller: l.seller_id, title: l.title, price: l.price, ts: Date.now()});
      }
    }
    this._s(d); return {bought: n};
  },
  async orders({user}) {
    const d = this._d();
    return d.orders.filter(o => o.buyer === user || o.seller === user).map(o => o.buyer === user
      ? {id: o.id, listing: o.listing, title: o.title, price: o.price, role: 'buy', other: this._n(d, o.seller), ts: o.ts}
      : {id: o.id, listing: o.listing, title: o.title, price: o.price, role: 'sell', other: this._n(d, o.buyer), ts: o.ts}).reverse();
  },
  async send({user, to, listing, text}) {
    const d = this._d(); d.msgs.push({id: d.seq++, listing, from: user, to, text, ts: Date.now()}); this._s(d); return {ok: 1};
  },
  async msgs({user}) {
    const d = this._d();
    return d.msgs.filter(m => m.from === user || m.to === user).map(m => ({...m,
      from_name: this._n(d, m.from), to_name: this._n(d, m.to), title: d.listings.find(l => l.id === m.listing)?.title || 'Объявление удалено'}));
  }
};
// ---------- Этап 2: те же методы, но через Python-сервер ----------
const Remote = new Proxy({}, {get: (_, m) => async a => {
  const r = await fetch('/api/' + m, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(a || {})});
  return r.json();
}});

let API = Local, CFG = DEF, me = LS.get('me', null), items = [], view = 'catalog', draft = [];
let favs = LS.get('favs', []), cart = LS.get('cart', []);
const f = {q: '', cat: '', min: '', max: '', cond: '', city: '', sort: 'new', stock: true, favs: false};

function filtered() {
  const q = f.q.toLowerCase();
  const r = items.filter(l => (!q || (l.title + ' ' + l.desc).toLowerCase().includes(q)) && (!f.cat || l.category === f.cat)
    && (!f.cond || l.condition === f.cond) && (!f.city || l.city === f.city) && (!f.min || l.price >= +f.min)
    && (!f.max || l.price <= +f.max) && (!f.stock || !l.sold) && (!f.favs || favs.includes(l.id)));
  const s = {new: (a, b) => b.ts - a.ts, cheap: (a, b) => a.price - b.price, exp: (a, b) => b.price - a.price, pop: (a, b) => b.views - a.views}[f.sort];
  return r.sort(s);
}
const pic = l => l.photos?.length ? `<img src="${l.photos[0]}" alt="">` : `<div class="ph"><span>${CFG.categories[l.category] || '📦'}</span></div>`;
const card = (l, own, i = 0) => `<article class="card rv ${l.sold ? 'sold' : ''}" style="--i:${i}"><div data-act="open" data-id="${l.id}">
  <div class="pic">${pic(l)}<span class="price">${money(l.price)}</span>${l.sold ? '<span class="tagsold">Продано</span>' : ''}
  <button class="fav ${favs.includes(l.id) ? 'on' : ''}" data-act="fav" data-id="${l.id}" aria-label="В избранное">♥</button></div>
  <div class="inf"><p>${esc(l.title)}</p><small>${esc(l.city)} · ${esc(l.condition)}${l.size ? ' · ' + esc(l.size) : ''}</small></div></div>
  ${own ? `<div class="acts"><button data-act="edit" data-id="${l.id}">Изменить</button>
  <button class="ghost" data-act="togsold" data-id="${l.id}">${l.sold ? 'Вернуть в продажу' : 'Отметить проданным'}</button>
  <button class="bad" data-act="del" data-id="${l.id}">Удалить</button></div>` : ''}</article>`;

function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 2200) }
function show(html) { $('#dlg').innerHTML = `<div class="dl"><button class="x" data-act="close" aria-label="Закрыть">×</button>${html}</div>`; if (!$('#dlg').open) $('#dlg').showModal() }
const opts = (arr, all) => (all ? `<option value="">${all}</option>` : '') + arr.map(x => `<option>${esc(x)}</option>`).join('');

function head() {
  $('#nav').innerHTML = `<button data-act="io" title="Импорт / экспорт">⇅</button><button data-act="theme" title="Тема">🌓</button>
  <button data-act="favview" title="Избранное">♥${favs.length ? `<span class="n">${favs.length}</span>` : ''}</button>
  <button data-act="cart">🛒${cart.length ? `<span class="n">${cart.length}</span>` : ''}</button>` + (me ?
  `<button data-act="nav" data-v="inbox">💬</button><button data-act="nav" data-v="orders">Заказы</button>
   <button data-act="nav" data-v="mine">Мои объявления</button><button class="sell" data-act="sell">+ Продать</button>
   <button data-act="logout" title="Выйти">${esc(me.name)} ⎋</button>` :
  `<button class="sell" data-act="sell">+ Продать</button><button data-act="login">Войти</button>`);
}
function render() {
  $('#catalog').hidden = view !== 'catalog'; $('#page').hidden = view === 'catalog'; head();
  if (view === 'catalog') {
    const r = filtered();
    $('#grid').innerHTML = r.length ? r.map((l, i) => card(l, false, i)).join('') : '<p class="empty">Ничего не найдено. Измени фильтры или разместите своё объявление.</p>';
    $('#count').textContent = `Найдено: ${r.length}`;
    $('#cats').innerHTML = ['', ...Object.keys(CFG.categories)].map(c => `<button class="chip ${f.cat === c ? 'on' : ''}" data-act="cat" data-c="${esc(c)}">${c ? CFG.categories[c] + ' ' + esc(c) : 'Все'}</button>`).join('');
  } else pages[view]();
  afterRender();
}
const pages = {
  mine() {
    const mine = items.filter(l => l.seller_id === me.id);
    $('#page').innerHTML = `<h2>Мои объявления (${mine.length})</h2><div id="grid">${mine.map((l, i) => card(l, true, i)).join('') || '<p class="empty">Пока пусто. Нажми «+ Продать».</p>'}</div>`;
  },
  async orders() {
    const o = await API.orders({user: me.id});
    const part = role => o.filter(x => x.role === role).map(x => `<div class="li"><div><b>${esc(x.title)}</b><small>${role === 'buy' ? 'Продавец' : 'Покупатель'}: ${esc(x.other)} · ${when(x.ts)}</small></div><div><b>${money(x.price)}</b> ${role === 'buy' && x.listing ? `<button class="ghost" data-act="rvlater" data-l="${x.listing}" data-t="${esc(x.title)}" data-s="${esc(x.other)}">★ Отзыв</button>` : ''}</div></div>`).join('') || '<p class="empty">Пока ничего</p>';
    $('#page').innerHTML = `<h2>Мои покупки</h2><div class="list">${part('buy')}</div><h2 style="margin-top:24px">Мои продажи</h2><div class="list">${part('sell')}</div>`;
  },
  async inbox() {
    const ms = await API.msgs({user: me.id}), th = {};
    ms.forEach(m => { const other = m.from === me.id ? m.to : m.from, k = m.listing + ':' + other;
      th[k] = {listing: m.listing, other, name: m.from === me.id ? m.to_name : m.from_name, title: m.title, last: m.text, ts: m.ts} });
    const arr = Object.values(th).sort((a, b) => b.ts - a.ts);
    $('#page').innerHTML = `<h2>Сообщения</h2><div class="list">${arr.map(t => `<div class="li" data-act="thread" data-l="${t.listing}" data-o="${t.other}" data-n="${esc(t.name)}" data-t="${esc(t.title)}"><div><b>${esc(t.name)} — ${esc(t.title)}</b><small>${esc(t.last)}</small></div><small>${when(t.ts)}</small></div>`).join('') || '<p class="empty">Сообщений нет. Открой товар и нажми «Написать продавцу».</p>'}</div>`;
  }
};

function toCatalog() { const c = $('#catalog'); if (c && !c.hidden && scrollY < c.offsetTop - 120) scrollTo({top: c.offsetTop - 70, behavior: 'smooth'}) }
async function load() { items = await API.list(); render() }
function needLogin() { if (me) return false; loginForm(); return true }

function loginForm(reg) {
  show(`<h2>${reg ? 'Регистрация' : 'Вход'}</h2><form class="f" data-form="${reg ? 'register' : 'login'}">
  <label>Имя<input name="name" required maxlength="20" autocomplete="username"></label>
  <label>Пароль<input name="pw" type="password" required minlength="3" autocomplete="current-password"></label>
  <button>${reg ? 'Создать аккаунт' : 'Войти'}</button>
  <button type="button" class="ghost" data-act="${reg ? 'login' : 'reg'}">${reg ? 'Уже есть аккаунт' : 'Создать аккаунт'}</button></form>`);
}
function sellForm(l = {}) {
  draft = [...(l.photos || [])];
  show(`<h2>${l.id ? 'Изменить объявление' : 'Новое объявление'}</h2><form class="f" data-form="save">
  <input type="hidden" name="id" value="${l.id || ''}">
  <label>Название<input name="title" required maxlength="80" value="${esc(l.title)}"></label>
  <div class="row"><label style="flex:1">Цена, ₽<input name="price" type="number" min="1" required value="${l.price || ''}"></label>
  <label style="flex:1">Размер<input name="size" maxlength="12" value="${esc(l.size)}"></label></div>
  <div class="row"><label style="flex:1">Категория<select name="category">${opts(Object.keys(CFG.categories))}</select></label>
  <label style="flex:1">Состояние<select name="condition">${opts(CFG.conditions)}</select></label>
  <label style="flex:1">Город<select name="city">${opts(CFG.cities)}</select></label></div>
  <label>Описание<textarea name="desc" rows="4" maxlength="1000">${esc(l.desc)}</textarea></label>
  <label>Фото (до 4)<input id="files" type="file" accept="image/*" multiple></label><div class="prev" id="prev"></div>
  <button>${l.id ? 'Сохранить' : 'Опубликовать'}</button></form>`);
  const fm = $('[data-form=save]'); ['category', 'condition', 'city'].forEach(k => { if (l[k]) fm[k].value = l[k] }); prevPhotos();
}
const prevPhotos = () => { const p = $('#prev'); if (p) p.innerHTML = draft.map((s, i) => `<img src="${s}" data-act="rmphoto" data-i="${i}" title="Нажми, чтобы убрать">`).join('') };
const readPhoto = file => new Promise(res => { const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => {
  const k = Math.min(1, 700 / Math.max(i.width, i.height)), c = document.createElement('canvas');
  c.width = i.width * k; c.height = i.height * k; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .72)) };
  i.src = r.result }; r.readAsDataURL(file) });

async function openItem(id) {
  const l = items.find(x => x.id === id); if (!l) return;
  API.view({id}); l.views++;
  const own = me && me.id === l.seller_id;
  show(`<div class="pv"><div><div class="big" id="bigpic">${pic(l)}</div>
  <div class="th">${(l.photos || []).map(s => `<img src="${s}" data-act="thumb">`).join('')}</div></div>
  <div><div class="big-price">${money(l.price)}</div><h2 style="font-size:20px;margin:4px 0">${esc(l.title)}</h2>
  <div class="meta"><span>${CFG.categories[l.category] || ''} ${esc(l.category)}</span><span>${esc(l.condition)}</span>${l.size ? `<span>Размер ${esc(l.size)}</span>` : ''}<span>${esc(l.city)}</span><span>👁 ${l.views}</span></div>
  <p>${esc(l.desc) || 'Без описания'}</p><p style="color:var(--mut)">Продавец: <b>${esc(l.seller)}</b> · ${when(l.ts)}</p><div id="rvs"></div>
  ${l.sold ? '<b>Товар продан</b>' : own ? '<p>Это ваше объявление.</p>' : `<div class="row"><button data-act="buynow" data-id="${l.id}" style="flex:1">Купить</button>
  <button class="ghost" data-act="tocart" data-id="${l.id}">${cart.includes(l.id) ? 'В корзине ✓' : 'В корзину'}</button></div>`}
  <div class="row" style="margin-top:8px"><button class="ghost" data-act="fav" data-id="${l.id}">${favs.includes(l.id) ? '♥ В избранном' : '♡ В избранное'}</button>
  ${own ? '' : `<button class="ghost" data-act="thread" data-l="${l.id}" data-o="${l.seller_id}" data-n="${esc(l.seller)}" data-t="${esc(l.title)}">Написать продавцу</button>`}</div></div></div>`);
  countTo($('.big-price'), l.price); showReviews(l.seller_id).then(() => document.querySelectorAll('#rvs .fg').forEach(e => requestAnimationFrame(() => e.style.width = e.dataset.w + '%')));
}
async function openThread(l, other, name, title) {
  if (needLogin()) return;
  const ms = (await API.msgs({user: me.id})).filter(m => m.listing == l && (m.from == other || m.to == other));
  show(`<h2 style="font-size:18px">${esc(name)} — ${esc(title)}</h2><div class="msgs" id="ms">${ms.map(m => `<div class="m ${m.from === me.id ? 'me' : ''}">${esc(m.text)}<small>${when(m.ts)}</small></div>`).join('') || '<small>Напиши первое сообщение</small>'}</div>
  <form class="f" data-form="send"><input type="hidden" name="l" value="${l}"><input type="hidden" name="o" value="${other}"><input type="hidden" name="n" value="${esc(name)}"><input type="hidden" name="t" value="${esc(title)}">
  <div class="row"><input name="text" required maxlength="500" placeholder="Сообщение" autocomplete="off"><button>Отправить</button></div></form>`);
  const b = $('#ms'); b.scrollTop = b.scrollHeight;
}
function cartView() {
  const rows = cart.map(id => items.find(l => l.id === id)).filter(l => l && !l.sold), sum = rows.reduce((s, l) => s + l.price, 0);
  show(`<h2>Корзина</h2><div class="list">${rows.map(l => `<div class="li"><div><b>${esc(l.title)}</b><small>${esc(l.seller)}</small></div><div><b>${money(l.price)}</b> <button class="ghost" data-act="uncart" data-id="${l.id}">✕</button></div></div>`).join('') || '<p class="empty">Корзина пуста</p>'}</div>
  ${rows.length ? `<p style="font:800 20px Georgia">Итого: ${money(sum)}</p><button data-act="checkout" style="width:100%">Оформить заказ</button>` : ''}`);
}
async function checkout(ids) {
  if (needLogin()) return;
  const before = ids.map(id => items.find(l => l.id === id)).filter(l => l && !l.sold && l.seller_id !== me.id);
  const r = await API.checkout({user: me.id, ids});
  cart = cart.filter(id => !ids.includes(id)); LS.set('cart', cart); if (r.bought) view = 'orders'; await load();
  const got = before.filter(l => items.find(x => x.id === l.id)?.sold);
  if (r.bought && got.length) { confetti(); rv = {queue: got.map(l => ({id: l.id, title: l.title, seller: l.seller})), stars: 0, tags: []}; reviewForm() }
  else { $('#dlg').close(); toast('Эти товары уже проданы или ваши') }
}

document.addEventListener('click', async e => {
  if (e.target === $('#dlg')) return $('#dlg').close();
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, id = +t.dataset.id;
  if ((await ioAct(a, t, e)) || rvAct(a, t, e)) return;
  if (a === 'fav') { e.stopPropagation(); if (!favs.includes(id)) burst(e.clientX, e.clientY, '♥'); favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id]; LS.set('favs', favs); if ($('#dlg').open) openItem(id); render(); }
  else if (a === 'open') openItem(id);
  else if (a === 'close') $('#dlg').close();
  else if (a === 'nav') { if (t.dataset.v !== 'catalog' && needLogin()) return; view = t.dataset.v; f.favs = false; render(); }
  else if (a === 'favview') { view = 'catalog'; f.favs = !f.favs; f.stock = !f.favs; $('#stock').checked = f.stock; render(); toast(f.favs ? 'Показано избранное' : 'Все объявления'); }
  else if (a === 'cat') { f.cat = t.dataset.c; render(); if (t.closest('#orbit') || scrollY < innerHeight) toCatalog() }
  else if (a === 'theme') { document.body.classList.toggle('dark'); LS.set('dark', document.body.classList.contains('dark')); }
  else if (a === 'login') loginForm(); else if (a === 'reg') loginForm(true);
  else if (a === 'logout') { me = null; LS.set('me', null); view = 'catalog'; render(); toast('Вы вышли'); }
  else if (a === 'sell') { if (!needLogin()) sellForm() }
  else if (a === 'edit') sellForm(items.find(l => l.id === id));
  else if (a === 'del') { if (confirm('Удалить объявление?')) { await API.remove({user: me.id, id}); toast('Удалено'); load() } }
  else if (a === 'togsold') { const l = items.find(l => l.id === id); await API.save({user: me.id, item: {id, sold: l.sold ? 0 : 1}}); load() }
  else if (a === 'tocart') { if (!cart.includes(id)) cart.push(id); LS.set('cart', cart); toast('Добавлено в корзину'); openItem(id); head() }
  else if (a === 'uncart') { cart = cart.filter(x => x !== id); LS.set('cart', cart); cartView(); head() }
  else if (a === 'cart') cartView();
  else if (a === 'buynow') checkout([id]);
  else if (a === 'checkout') checkout(cart);
  else if (a === 'thumb') $('#bigpic').innerHTML = `<img src="${t.src}">`;
  else if (a === 'rmphoto') { draft.splice(+t.dataset.i, 1); prevPhotos() }
  else if (a === 'thread') openThread(t.dataset.l, +t.dataset.o, t.dataset.n, t.dataset.t);
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'files') return;
  for (const file of e.target.files) if (draft.length < 4) draft.push(await readPhoto(file));
  e.target.value = ''; prevPhotos();
});
document.addEventListener('submit', async e => {
  const k = e.target.dataset.form; if (!k) return; e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (k === 'login' || k === 'register') {
    const r = await API[k]({name: d.name.trim(), pw: d.pw});
    if (r.error) return toast(r.error);
    me = r; LS.set('me', r); $('#dlg').close(); toast('Привет, ' + r.name + '!'); render();
  } else if (k === 'save') {
    const item = {title: d.title.trim(), price: +d.price, size: d.size.trim(), category: d.category, condition: d.condition, city: d.city, desc: d.desc.trim(), photos: draft};
    if (d.id) item.id = +d.id;
    const r = await API.save({user: me.id, item}); if (r.error) return toast(r.error);
    $('#dlg').close(); toast(d.id ? 'Сохранено' : 'Опубликовано'); await load();
  } else if (k === 'send') {
    await API.send({user: me.id, to: +d.o, listing: +d.l, text: d.text.trim()}); openThread(d.l, +d.o, d.n, d.t);
  }
});
for (const [id, key] of [['q', 'q'], ['min', 'min'], ['max', 'max'], ['cond', 'cond'], ['city', 'city'], ['sort', 'sort']])
  $('#' + id).addEventListener('input', e => { f[key] = e.target.value; view = 'catalog'; render(); if (key === 'q') toCatalog() });
$('#stock').onchange = e => { f.stock = e.target.checked; render() };
$('#reset').onclick = () => { Object.assign(f, {q: '', cat: '', min: '', max: '', cond: '', city: '', sort: 'new', stock: true, favs: false});
  ['q', 'min', 'max', 'cond', 'city'].forEach(i => $('#' + i).value = ''); $('#sort').value = 'new'; $('#stock').checked = true; render() };

$('.logo').innerHTML = [...'ШКАФ'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
(async function init() {
  if (LS.get('dark', false)) document.body.classList.add('dark');
  try { CFG = await (await fetch('config.json')).json() } catch {}
  try { if (location.protocol === 'file:') throw 0; if (!(await Remote.ping()).ok) throw 0; API = Remote; } catch { API = Local }
  $('#mode').textContent = API === Remote ? '🟢 Сервер Python + SQLite' : '🟡 Режим браузера (localStorage)';
  $('#cond').innerHTML = opts(CFG.conditions, 'Любое'); $('#city').innerHTML = opts(CFG.cities, 'Любой');
  items = await API.list();
  if (!items.length) {   // первое открытие — добавляем демо-товары
    await API.register({name: 'Магазин', pw: 'demo'}); const u = await API.login({name: 'Магазин', pw: 'demo'});
    for (const [title, price, category, size, condition, city, desc] of DEMO) await API.save({user: u.id, item: {title, price, category, size, condition, city, desc, photos: []}});
    items = await API.list();
  }
  render(); loadReviews();
})();

// ================= АНИМАЦИИ =================
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches, mouse = {x: -999, y: -999};
function countTo(el, to, fmt = money, ms = 900) {
  if (!el) return; if (RM) return void (el.textContent = fmt(to));
  const t0 = performance.now(), from = +el.dataset.v || 0; el.dataset.v = to;
  (function st(t) { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(2, -10 * p);
    el.textContent = fmt(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(st) })(t0);
}
function fxLayer() { const h = $('#fx'); try { if (h.matches(':popover-open')) h.hidePopover(); h.showPopover() } catch {} return h }
function burst(x, y, ch = '✦') {
  if (RM) return; const h = fxLayer();
  for (let i = 0; i < 12; i++) { const s = document.createElement('i'), a = Math.PI * 2 * i / 12, d = 40 + Math.random() * 40;
    s.textContent = ch; s.className = 'sp'; s.style.cssText = `left:${x}px;top:${y}px;color:hsl(${340 + i * 8} 90% 60%)`; h.append(s);
    s.animate([{transform: 'translate(-50%,-50%) scale(.4)', opacity: 1},
      {transform: `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px)) scale(1.4) rotate(${Math.random() * 360}deg)`, opacity: 0}],
      {duration: 700, easing: 'cubic-bezier(.2,.8,.3,1)'}).onfinish = () => s.remove() }
}
function confetti() {
  if (RM) return; const h = fxLayer();
  for (let i = 0; i < 110; i++) { const s = document.createElement('i'), dx = (Math.random() - .5) * innerWidth * .9, up = 150 + Math.random() * 350;
    s.className = 'cf'; s.style.cssText = `left:${innerWidth / 2 + (Math.random() - .5) * 200}px;top:${innerHeight * .6}px;background:hsl(${Math.random() * 360} 90% 60%)`; h.append(s);
    s.animate([{transform: 'translate(0,0) rotate(0)', opacity: 1}, {transform: `translate(${dx * .6}px,-${up}px) rotate(300deg)`, opacity: 1, offset: .35},
      {transform: `translate(${dx}px,${innerHeight}px) rotate(900deg)`, opacity: 0}], {duration: 1800 + Math.random() * 1200, easing: 'cubic-bezier(.3,.6,.5,1)'}).onfinish = () => s.remove() }
}
let cardEls = [];
const CLOTHES = [['🧥','Куртки','Одежда',350],['👕','Футболки','Одежда',20],['👗','Платья','Одежда',290],['👖','Джинсы','Одежда',210],['👟','Кроссовки','Обувь',160],
  ['👜','Сумки','Аксессуары',320],['🧢','Кепки','Аксессуары',45],['🧣','Шарфы','Аксессуары',0],['🕶️','Очки','Аксессуары',190],['👠','Туфли','Обувь',330],['🧤','Перчатки','Аксессуары',100],['🎒','Рюкзаки','Аксессуары',240]];
function buildIntro() {
  const t = $('#bigtitle'); if (t.dataset.ok) return; t.dataset.ok = 1;
  t.innerHTML = [...(CFG.site_name || 'ШКАФ')].map((c, i) => `<span class="l" style="--i:${i}">${c}</span>`).join('');
  const pos = [[6,14],[84,12],[14,70],[78,68],[46,6],[92,44],[3,42],[60,82],[30,24],[68,26]], fl = ['🧥','👗','👟','👜','🧢','🧣','👖','🕶️','👠','🎒'];
  $('#intro').insertAdjacentHTML('beforeend', fl.map((e, k) => `<div class="fl" style="--x:${pos[k][0]}%;--y:${pos[k][1]}%;--s:${46 + (k * 17) % 40}px;--d:${(k % 5 + 1) * 9 * (k % 2 ? 1 : -1)};--k:${k}"><span style="--t:${3 + k % 4}s">${e}</span></div>`).join(''));
}
function buildOrbit() {
  const r = $('#orbit'); if (r.dataset.ok) return; r.dataset.ok = 1; r.style.setProperty('--n', CLOTHES.length);
  r.innerHTML = CLOTHES.map(([e, name, cat, h], k) => `<button class="oc" style="--k:${k};--h:${h}" data-act="cat" data-c="${cat}"><b>${e}</b><small>${name}</small></button>`).join('');
}
function afterRender() {
  const cat = view === 'catalog'; $('#intro').hidden = $('#showcase').hidden = $('#reviews').hidden = !cat;
  cardEls = [...document.querySelectorAll('.card.rv')];
  if (cat) { const a = items.filter(l => !l.sold), v = {items: a.length, sellers: new Set(a.map(l => l.seller_id)).size, cats: Object.keys(CFG.categories).length};
    buildIntro(); buildOrbit(); document.querySelectorAll('[data-n]').forEach(e => countTo(e, v[e.dataset.n], n => n)) }
  sceneFrame(true);
}
document.addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  const c = e.target.closest?.('.card'); if (!c || RM || e.pointerType !== 'mouse') return;
  const b = c.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
  c.style.setProperty('--rx', (.5 - y) * 12 + 'deg'); c.style.setProperty('--ry', (x - .5) * 14 + 'deg');
  c.style.setProperty('--gx', x * 100 + '%'); c.style.setProperty('--gy', y * 100 + '%');
});
document.addEventListener('pointerout', e => { const c = e.target.closest?.('.card');
  if (c && !c.contains(e.relatedTarget)) ['--rx', '--ry'].forEach(k => c.style.removeProperty(k)) });
(function particles() {
  const cv = $('#bg'), g = cv.getContext('2d'); if (RM) return; let W, H, P = [];
  const size = () => { W = cv.width = innerWidth; H = cv.height = innerHeight;
    P = Array.from({length: Math.min(70, W / 18 | 0)}, () => ({x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5), vy: (Math.random() - .5)})) };
  size(); addEventListener('resize', size);
  (function loop() {
    if (!document.hidden) { g.clearRect(0, 0, W, H); g.fillStyle = g.strokeStyle = getComputedStyle(document.body).getPropertyValue('--acc').trim() || '#3a5bff';
      for (const p of P) { const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
        if (d < 160 && d > 1) { p.vx += dx / d * .03; p.vy += dy / d * .03 }
        const sp = Math.hypot(p.vx, p.vy); if (sp > .8) { p.vx *= .8 / sp; p.vy *= .8 / sp }
        p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H; g.globalAlpha = .5; g.beginPath(); g.arc(p.x, p.y, 2, 0, 7); g.fill() }
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y);
        if (d < 120) { g.globalAlpha = (1 - d / 120) * .25; g.beginPath(); g.moveTo(P[i].x, P[i].y); g.lineTo(P[j].x, P[j].y); g.stroke() } } }
    requestAnimationFrame(loop) })();
})();

// ================= ИМПОРТ / ЭКСПОРТ =================
let ioTab = 'exp', imp = null;
const ALIAS = {title: ['title', 'name', 'название', 'наименование', 'товар'], price: ['price', 'цена', 'стоимость'], category: ['category', 'категория'],
  size: ['size', 'размер'], condition: ['condition', 'состояние'], city: ['city', 'город'], desc: ['desc', 'description', 'описание'], photos: ['photos', 'photo', 'фото', 'images', 'image']};
const COLS = [['title', 'Название'], ['price', 'Цена'], ['category', 'Категория'], ['size', 'Размер'], ['condition', 'Состояние'], ['city', 'Город'], ['desc', 'Описание'], ['photos', 'Фото']];
function parseCSV(t) {
  t = t.replace(/^\uFEFF/, ''); const l1 = t.split(/\r?\n/)[0], dl = [';', '\t', ','].sort((a, b) => l1.split(b).length - l1.split(a).length)[0];
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch }
    else if (ch === '"') q = true; else if (ch === dl) { r.push(c); c = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; rows.push(r); r = [] } else c += ch }
  if (c || r.length) { r.push(c); rows.push(r) }
  const [h = [], ...b] = rows.filter(r => r.some(x => x.trim()));
  return b.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
function norm(raw, n) {
  const o = {}; for (const [k, v] of Object.entries(raw)) { const key = Object.keys(ALIAS).find(a => ALIAS[a].includes(k.trim().toLowerCase())); if (key) o[key] = v }
  const s = v => String(v ?? '').trim().replace(/^'(?=[=+@-])/, ''), pick = (v, arr, d) => arr.find(x => x.toLowerCase() === s(v).toLowerCase()) || d;
  const title = s(o.title).slice(0, 80), price = Math.round(parseFloat(s(o.price).replace(/[^\d.,]/g, '').replace(',', '.')));
  if (!title) return {n, err: 'нет названия'}; if (!(price > 0)) return {n, err: 'нет цены'};
  const ph = (Array.isArray(o.photos) ? o.photos : s(o.photos).split(/[|\n]/)).map(x => String(x).trim()).filter(x => /^(https?:\/\/|data:image\/)/.test(x)).slice(0, 4);
  return {n, item: {title, price, size: s(o.size).slice(0, 12), desc: s(o.desc).slice(0, 1000), photos: ph, category: pick(o.category, Object.keys(CFG.categories), 'Другое'),
    condition: pick(o.condition, CFG.conditions, 'Хорошее'), city: pick(o.city, CFG.cities, 'Другой')}};
}
function parseFile(name, text, allowDup) {
  let raws; if (/\.json$/i.test(name) || /^\s*[\[{]/.test(text)) { const j = JSON.parse(text); raws = Array.isArray(j) ? j : j.items || j.listings || [] } else raws = parseCSV(text);
  const seen = new Set(allowDup ? [] : items.filter(l => l.seller_id === me?.id).map(l => l.title.toLowerCase() + l.price)), ok = [], bad = []; let dup = 0;
  raws.slice(0, 500).forEach((r, i) => { const x = norm(r, i + 1); if (x.err) return bad.push(x);
    const k = x.item.title.toLowerCase() + x.item.price; if (seen.has(k)) return dup++; if (!allowDup) seen.add(k); ok.push(x.item) });
  return {name, ok, bad, dup, total: raws.length, text, allowDup};
}
const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.style.display = 'none'; document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 1e4) };
const cell = (v, t) => { v = String(v ?? ''); if (t && /^[=+@-]/.test(v) && isNaN(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v };
function exportItems(kind, scope) {
  const rows = scope === 'all' ? items : items.filter(l => l.seller_id === me?.id), day = new Date().toISOString().slice(0, 10);
  if (!rows.length) return toast('Нечего выгружать');
  if (kind === 'json') dl(`shkaf-${scope}-${day}.json`, JSON.stringify({app: 'shkaf', exported: new Date().toISOString(), count: rows.length,
    items: rows.map(l => ({title: l.title, price: l.price, category: l.category, size: l.size, condition: l.condition, city: l.city, desc: l.desc, photos: l.photos || [], sold: l.sold, seller: l.seller}))}, null, 2), 'application/json');
  else dl(`shkaf-${scope}-${day}.csv`, '\uFEFF' + [COLS.map(c => c[1]), ...rows.map(l => COLS.map(([k]) => cell(k === 'photos' ? (l.photos || []).filter(p => p.startsWith('http')).join(' | ') : l[k], 1)))].map(r => r.join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast(`Выгружено: ${rows.length}`); burst(innerWidth / 2, innerHeight / 2, '⬇');
}
const tpl = () => dl('shkaf-template.csv', '\uFEFFНазвание;Цена;Категория;Размер;Состояние;Город;Описание;Фото\r\nКуртка кожаная;5000;Одежда;M;Хорошее;Москва;Почти новая;https://example.com/1.jpg | https://example.com/2.jpg\r\nЛампа;900;Дом;;Новое;Казань;Металл;\r\n', 'text/csv;charset=utf-8');
function ioDialog() { show(`<h2>Импорт и экспорт</h2><div class="seg" id="seg"><i></i><button data-act="iotab" data-t="exp">⬇ Экспорт</button><button data-act="iotab" data-t="imp">⬆ Импорт</button></div><div id="iobody"></div>`); ioRender() }
function ioRender() {
  $('#seg').dataset.t = ioTab; const mine = me ? items.filter(l => l.seller_id === me.id).length : 0;
  $('#iobody').innerHTML = ioTab === 'exp' ? `<div class="iop"><p class="hint"><b>JSON</b> — всё вместе с фото. <b>CSV</b> — открывается в Excel (фото только ссылками).</p>
  <div class="cards2"><div><b>Мои объявления</b><span>${mine} шт.</span><div class="row"><button data-act="exp" data-k="json" data-s="mine">JSON</button><button data-act="exp" data-k="csv" data-s="mine">CSV</button></div></div>
  <div><b>Весь каталог</b><span>${items.length} шт.</span><div class="row"><button data-act="exp" data-k="json" data-s="all">JSON</button><button data-act="exp" data-k="csv" data-s="all">CSV</button></div></div></div>
  <button class="ghost" data-act="tpl">📄 Скачать шаблон CSV</button></div>`
  : !me ? `<div class="iop"><p class="hint">Чтобы импортировать товары, войди в аккаунт.</p><button data-act="login">Войти</button></div>`
  : imp?.done ? `<div class="iop okbox"><div class="big-ok">✓</div><b>Импортировано: ${imp.done}</b><button data-act="gomine">К моим объявлениям</button></div>`
  : imp ? `<div class="iop"><p><b>${esc(imp.name)}</b>: к импорту <b class="okc">${imp.ok.length}</b>${imp.dup ? `, дубликатов пропущено <b>${imp.dup}</b>` : ''}${imp.bad.length ? `, с ошибками <b class="badc">${imp.bad.length}</b>` : ''}</p>
  <div class="list">${imp.ok.slice(0, 6).map((x, i) => `<div class="li" style="--i:${i}"><div><b>${esc(x.title)}</b><small>${esc(x.category)} · ${esc(x.city)}</small></div><b>${money(x.price)}</b></div>`).join('')}${imp.ok.length > 6 ? `<small class="hint">…и ещё ${imp.ok.length - 6}</small>` : ''}</div>
  ${imp.bad.length ? `<small class="badc">Пропущены строки: ${imp.bad.slice(0, 8).map(b => `${b.n} (${b.err})`).join(', ')}</small>` : ''}
  <div class="bar2"><i id="pg"></i></div><div class="row">${imp.ok.length ? `<button data-act="doimp" style="flex:1">Импортировать ${imp.ok.length}</button>` : imp.dup ? `<button data-act="impdup" style="flex:1">Эти товары уже есть — добавить копии (${imp.dup})</button>` : `<button disabled style="flex:1">Нечего импортировать</button>`}<button class="ghost" data-act="impclear">Другой файл</button></div></div>`
  : `<div class="iop"><label class="dz" id="dz"><input id="ifile" type="file" accept=".json,.csv,.tsv,.txt" hidden><span class="up">⬆</span><b>Перетащи файл сюда</b><small>или нажми для выбора · JSON или CSV · до 500 товаров</small></label>
  <button class="ghost" data-act="tpl">📄 Шаблон CSV</button></div>`;
}
async function takeFile(file) {
  if (!file) return;
  if (!$('#dlg').open || ioTab !== 'imp') { ioTab = 'imp'; if (!$('#dlg').open || !$('#seg')) ioDialog(); }
  if (/\.(xlsx?|ods)$/i.test(file.name)) { imp = null; ioRender(); return toast('Excel-файл не читается напрямую: «Сохранить как» → CSV (разделитель «;») и загрузи его') }
  try { imp = parseFile(file.name, await file.text()); if (!imp.total) toast('В файле нет товаров') } catch { imp = null; toast('Не удалось прочитать файл — нужен JSON или CSV') }
  ioRender();
}
async function ioAct(a, t) {
  if (a === 'io') { ioTab = 'exp'; imp = null; ioDialog() }
  else if (a === 'iotab') { ioTab = t.dataset.t; ioRender() }
  else if (a === 'exp') exportItems(t.dataset.k, t.dataset.s)
  else if (a === 'tpl') tpl()
  else if (a === 'impclear') { imp = null; ioRender() }
  else if (a === 'impdup') { imp = parseFile(imp.name, imp.text, true); ioRender() }
  else if (a === 'gomine') { $('#dlg').close(); imp = null; view = 'mine'; f.favs = false; render() }
  else if (a === 'doimp') { t.disabled = true; let n = 0;
    let bad = 0;
    for (const item of imp.ok) { try { const r = await API.save({user: me.id, item}); if (r?.error) bad++; else n++ } catch { bad++ } const pg = $('#pg'); if (pg) pg.style.width = (n + bad) / imp.ok.length * 100 + '%' }
    if (!n) { toast('Не удалось сохранить товары'); t.disabled = false; return true }
    imp.done = n; ioRender(); confetti(); if (bad) toast('Не сохранено: ' + bad); load() }
  else return false;
  return true;
}
['dragover', 'dragleave', 'drop'].forEach(ev => addEventListener(ev, e => {
  if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
  e.preventDefault(); const z = e.target.closest?.('#dz'); if (z) z.classList.toggle('over', ev === 'dragover');
  if (ev === 'drop') { imp = null; ioTab = 'imp'; if (!$('#dlg').open) ioDialog(); takeFile(e.dataTransfer.files[0]) } }));
document.addEventListener('change', e => { if (e.target.id === 'ifile') takeFile(e.target.files[0]) });

// ================= ОТЗЫВЫ =================
let rv = {queue: [], stars: 0, tags: []};
const POS = ['Быстрая отправка', 'Как на фото', 'Приятный продавец', 'Рекомендую', 'Отличное состояние', 'Всё супер'], NEG = ['Не как на фото', 'Долго отвечал', 'Есть дефекты', 'Не рекомендую'];
function reviewForm() {
  const it = rv.queue[0], n = rv.queue.length;
  show(`<h2>Спасибо за покупку! 🎉</h2><p class="hint">${esc(it.title)} · продавец ${esc(it.seller)}${n > 1 ? ` · ещё товаров: ${n - 1}` : ''}</p>
  <div class="stars">${[1, 2, 3, 4, 5].map(i => `<button class="st" data-act="star" data-n="${i}" style="--i:${i}" aria-label="${i}">★</button>`).join('')}</div>
  <div class="chips" id="rtags" style="justify-content:center"></div>
  <form class="f" data-form="review" style="margin-top:12px"><label>Свой отзыв (необязательно)<textarea name="text" rows="3" maxlength="400" placeholder="Расскажи, как прошла сделка"></textarea></label>
  <div class="row"><button style="flex:1">Отправить отзыв</button><button type="button" class="ghost" data-act="skiprv">Пропустить</button></div></form>`);
  paintRv();
}
function paintRv() {
  const list = rv.stars && rv.stars < 3 ? NEG : POS; rv.tags = rv.tags.filter(t => list.includes(t));
  document.querySelectorAll('.st').forEach(b => b.classList.toggle('on', +b.dataset.n <= rv.stars));
  $('#rtags').innerHTML = list.map(t => `<button type="button" class="chip ${rv.tags.includes(t) ? 'on' : ''}" data-act="tag" data-t="${esc(t)}">${esc(t)}</button>`).join('');
}
function nextRv() { rv.queue.shift(); rv.stars = 0; rv.tags = []; if (rv.queue.length) reviewForm(); else $('#dlg').close() }
function rvAct(a, t, e) {
  if (a === 'star') { rv.stars = +t.dataset.n; paintRv(); burst(e.clientX, e.clientY, '★') }
  else if (a === 'tag') { const x = t.dataset.t; rv.tags = rv.tags.includes(x) ? rv.tags.filter(y => y !== x) : [...rv.tags, x]; paintRv() }
  else if (a === 'skiprv') nextRv()
  else if (a === 'rvlater') { rv = {queue: [{id: +t.dataset.l, title: t.dataset.t, seller: t.dataset.s}], stars: 0, tags: []}; reviewForm() }
  else return false;
  return true;
}
document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'review') return; e.preventDefault();
  if (!rv.stars) return toast('Поставьте оценку звёздами');
  const text = [...rv.tags, String(new FormData(e.target).get('text') || '').trim()].filter(Boolean).join('. ');
  const r = await API.review({user: me.id, listing: rv.queue[0].id, stars: rv.stars, text});
  toast(r.error || 'Спасибо за отзыв! ★'); if (!r.error) { confetti(); loadReviews() } nextRv();
});
async function showReviews(sid) {
  const r = await API.reviews({seller: sid}), el = $('#rvs'); if (!el || !Array.isArray(r) || !r.length) return;
  const avg = r.reduce((s, x) => s + x.stars, 0) / r.length;
  el.innerHTML = `<div class="rvbox"><b>${starsHtml(avg, 'sm')} ${avg.toFixed(1)}</b> <small>· отзывов: ${r.length}</small>${r.slice(-3).reverse().map(x => `<div class="rvi"><b>${starsHtml(x.stars, 'sm')}</b> ${esc(x.buyer)}${x.text ? `<small>${esc(x.text)}</small>` : ''}</div>`).join('')}</div>`;
}

// ================= ОТЗЫВЫ НА ГЛАВНОЙ =================
let allRv = [];
const starsHtml = (v, cls = '') => `<span class="sr ${cls}" title="${(+v).toFixed(1)} из 5"><span class="bg">★★★★★</span><span class="fg" data-w="${clamp(v / 5) * 100}" style="width:0">★★★★★</span></span>`;
const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
function rvStats(list) {
  const cnt = [0, 0, 0, 0, 0, 0]; list.forEach(r => cnt[clamp(Math.round(+r.stars || 0), 1, 5)]++);
  const n = list.length, avg = n ? list.reduce((s, r) => s + clamp(Math.round(+r.stars || 0), 1, 5), 0) / n : 0; return {cnt, n, avg};
}
async function loadReviews() { try { const r = await API.allreviews({}); allRv = Array.isArray(r) ? r : [] } catch { allRv = [] } renderReviews() }
const rvCard = r => `<article class="rc2"><div class="rtop"><i class="av" style="--h:${hue(r.buyer)}">${esc([...r.buyer][0] || '?').toUpperCase()}</i><div><b>${esc(r.buyer)}</b><small>${when(r.ts)}</small></div>${starsHtml(r.stars, 'sm')}</div>
  <p>${r.text ? esc(r.text) : '<em>Без комментария</em>'}</p><small class="on">🛍 ${esc(r.title)} · продавец ${esc(r.seller)}</small></article>`;
function renderReviews() {
  const box = $('#reviews'); if (!box) return;
  const {cnt, n, avg} = rvStats(allRv);
  $('#rsum').innerHTML = n ? `<div class="rnum" data-avg="${avg}">0.0</div>${starsHtml(avg, 'big')}<div class="rcount">${n} ${n % 10 === 1 && n % 100 !== 11 ? 'отзыв' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'отзыва' : 'отзывов'}</div>
    <div class="dist">${[5, 4, 3, 2, 1].map((s, i) => `<div class="dr" style="--d:${i * 120}ms"><span>${s}★</span><div class="tr2"><i data-w="${cnt[s] / n * 100}" style="width:0"></i></div><em>${cnt[s]}</em></div>`).join('')}</div>`
    : `<div class="rnum">—</div>${starsHtml(0, 'big')}<div class="rcount">Пока нет отзывов</div><p class="hint">Купи любой товар и оцени продавца — отзыв сразу появится здесь.</p>`;
  let list = '';
  if (n) {
    if (n < 4) list = `<div class="mq static"><div class="tr">${allRv.map(rvCard).join('')}</div></div>`;
    else { const fill = a => { let o = a.slice(); while (o.length < 6) o = o.concat(a); return o },
      row = (a, rev) => { const f = fill(a), d = f.map(rvCard).join(''); return `<div class="mq ${rev ? 'rev' : ''}"><div class="tr" style="--dur:${f.length * 7}s">${d}${d}</div></div>` };
      list = row(allRv, 0) + row(allRv.slice().reverse(), 1) }
  } else list = `<div class="rempty"><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span></div>`;
  $('#rlist').innerHTML = list;
  box.classList.remove('on'); rvIO.unobserve(box); rvIO.observe(box);
}
const rvIO = new IntersectionObserver(es => es.forEach(en => { if (!en.isIntersecting) return; rvIO.unobserve(en.target); en.target.classList.add('on');
  en.target.querySelectorAll('.fg').forEach(e => e.style.width = e.dataset.w + '%');
  en.target.querySelectorAll('.tr2 i').forEach(e => e.style.width = e.dataset.w + '%');
  const num = en.target.querySelector('.rnum[data-avg]'); if (num) countTo(num, +num.dataset.avg * 10, v => (v / 10).toFixed(1), 1600);
}), {threshold: .25});

// ================= АНИМАЦИИ ПРОКРУТКИ =================
(function scrollFx() {
  const bar = document.createElement('div'), up = document.createElement('button'), R = document.documentElement.style;
  bar.id = 'prog'; up.id = 'up'; up.textContent = '🚀'; up.title = 'Наверх'; document.body.append(bar, up);
  up.onclick = () => { up.classList.add('go'); scrollTo({top: 0, behavior: 'smooth'}); setTimeout(() => up.classList.remove('go'), 900) };
  let last = scrollY, v = 0;
  (function loop() {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight; v += ((y - last) * .05 - v) * .2; last = y;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`; R.setProperty('--sy', y); R.setProperty('--v', (RM ? 0 : Math.max(-3, Math.min(3, v))).toFixed(2) + 'deg');
    document.body.classList.toggle('scrolled', y > 20); up.classList.toggle('show', y > 500); requestAnimationFrame(loop);
  })();
})();


// ================= СЦЕНА: интро + вращающаяся одежда + карточки (без библиотек) =================
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), ease = t => 1 - Math.pow(1 - t, 3);
const M = {x: 0, y: 0, tx: 0, ty: 0};
addEventListener('pointermove', e => { M.tx = e.clientX / innerWidth * 2 - 1; M.ty = e.clientY / innerHeight * 2 - 1 });
let sc = scrollY, tStart = performance.now(), lastSpin = 0;
function sceneFrame(force) {
  const now = performance.now(), vh = innerHeight;
  sc += (scrollY - sc) * (force ? 1 : .16); if (Math.abs(scrollY - sc) < .2) sc = scrollY;
  M.x += (M.tx - M.x) * .06; M.y += (M.ty - M.y) * .06;
  if (RM) { cardEls.forEach(c => c.style.removeProperty('--so')); return }

  const intro = $('#intro'), show = $('#showcase');
  if (!intro.hidden) {
    intro.style.setProperty('--p', clamp(sc / (vh * .85)).toFixed(4));
    intro.style.setProperty('--mx', M.x.toFixed(3)); intro.style.setProperty('--my', M.y.toFixed(3));
  }
  if (!show.hidden) {
    const r = show.getBoundingClientRect(), total = Math.max(1, show.offsetHeight - vh), p = clamp(-r.top / total);
    if (r.top < vh && r.bottom > 0) {
      const orbit = $('#orbit'), stage = $('.stage3d'), tx = $('.shtxt'), n = CLOTHES.length;
      const enter = ease(clamp((vh - r.top) / vh)), grow = ease(clamp(p / .22)), out = clamp((p - .88) / .12);
      const spin = p * 900 + (now - tStart) / 1000 * 7, tilt = -14 + M.y * 8;
      orbit.style.transform = `rotateX(${tilt}deg) rotateY(${-spin}deg) rotateZ(${M.x * 4}deg)`;
      stage.style.transform = `translateY(${(1 - grow) * 120 + out * -60}px) scale(${(.3 + .7 * grow) * (1 + out * .35)})`;
      stage.style.opacity = (enter * (1 - out * .9)).toFixed(3);
      tx.style.transform = `translateY(${(1 - enter) * 80 - out * 70}px) scale(${.85 + .15 * enter})`; tx.style.opacity = (enter * (1 - out * 1.2)).toFixed(3);
      $('#p3').style.transform = `scaleX(${p})`;
      for (let k = 0; k < orbit.children.length; k++) {
        const z = Math.cos((k * 360 / n - spin) * Math.PI / 180), el = orbit.children[k];
        el.style.opacity = (.3 + .7 * (z + 1) / 2).toFixed(2); el.style.filter = z < -.2 ? `blur(${((-z - .2) * 2.5).toFixed(1)}px)` : 'none';
      }
    }
  }
  // карточки каталога: вылетают, крутятся по оси и встают на место, пока листаешь
  for (const c of cardEls) {
    const r = c.getBoundingClientRect(); if (r.bottom < -200 || r.top > vh + 200) continue;
    const col = Math.round((r.left - (cardEls[0]?.parentElement.getBoundingClientRect().left || 0)) / 40) % 3;
    const t = ease(clamp((vh * 1.02 - r.top - col * 18) / (vh * .5))), k = 1 - t;
    c.style.setProperty('--ty', (k * 120).toFixed(1) + 'px'); c.style.setProperty('--srx', (k * 40).toFixed(1) + 'deg');
    c.style.setProperty('--sry', (k * (col % 2 ? 140 : -140)).toFixed(1) + 'deg'); c.style.setProperty('--ss', (.55 + .45 * t).toFixed(3)); c.style.setProperty('--so', clamp(t * 1.6).toFixed(2));
  }
}
(function loop() { if (!document.hidden) sceneFrame(); requestAnimationFrame(loop) })();
