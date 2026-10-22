# Сервер «ШКАФ»: python server.py  ->  http://localhost:8000
import json, os, sqlite3, time, hashlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, 'market.db')
CFG = json.load(open(os.path.join(BASE, 'config.json'), encoding='utf-8'))
FIELDS = {'title': 'title', 'price': 'price', 'category': 'category', 'size': 'size', 'condition': 'cond',
          'city': 'city', 'desc': 'descr', 'sold': 'sold'}

def db():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row; return c

def init():
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT UNIQUE, pw TEXT);
    CREATE TABLE IF NOT EXISTS listings(id INTEGER PRIMARY KEY, seller_id INTEGER, title TEXT, price INTEGER, category TEXT,
        size TEXT, cond TEXT, city TEXT, descr TEXT, photos TEXT DEFAULT '[]', sold INTEGER DEFAULT 0, views INTEGER DEFAULT 0, ts INTEGER);
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, listing_id INTEGER, buyer_id INTEGER, seller_id INTEGER, title TEXT, price INTEGER, ts INTEGER);
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, listing_id INTEGER, from_id INTEGER, to_id INTEGER, text TEXT, ts INTEGER);
    CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, listing_id INTEGER, buyer_id INTEGER, seller_id INTEGER, stars INTEGER, text TEXT, ts INTEGER);
    """); c.commit(); c.close()

def export_users(c):
    # копия списка пользователей в обычный текстовый файл users.json (открывается в Блокноте)
    rows = [dict(r) for r in c.execute("SELECT id, name, pw FROM users ORDER BY id")]
    with open(os.path.join(BASE, 'users.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

def hp(name, pw): return hashlib.pbkdf2_hmac('sha256', pw.encode(), name.encode(), 50000).hex()
def now(): return int(time.time() * 1000)

# ----- методы API (те же, что в Local в script.js) -----
def ping(c, b): return {'ok': 1}

def register(c, b):
    name, pw = b['name'].strip()[:20], b['pw']
    if not name or len(pw) < 3: return {'error': 'Введите имя и пароль (от 3 символов)'}
    if c.execute("SELECT 1 FROM users WHERE lower(name)=lower(?)", (name,)).fetchone(): return {'error': 'Это имя уже занято'}
    cur = c.execute("INSERT INTO users(name,pw) VALUES(?,?)", (name, hp(name, pw)))
    export_users(c)
    return {'id': cur.lastrowid, 'name': name}

def login(c, b):
    u = c.execute("SELECT * FROM users WHERE name=? AND pw=?", (b['name'], hp(b['name'], b['pw']))).fetchone()
    return {'id': u['id'], 'name': u['name']} if u else {'error': 'Неверное имя или пароль'}

def list_(c, b):
    out = []
    for r in c.execute("SELECT l.*, u.name seller FROM listings l JOIN users u ON u.id=l.seller_id"):
        d = dict(r); d['photos'] = json.loads(d['photos']); d['condition'] = d.pop('cond'); d['desc'] = d.pop('descr'); out.append(d)
    return out

def save(c, b):
    it, uid = b['item'], b['user']
    if it.get('id'):
        if not c.execute("SELECT 1 FROM listings WHERE id=? AND seller_id=?", (it['id'], uid)).fetchone(): return {'error': 'Нет доступа'}
        for k, col in FIELDS.items():
            if k in it: c.execute(f"UPDATE listings SET {col}=? WHERE id=?", (it[k], it['id']))
        if 'photos' in it: c.execute("UPDATE listings SET photos=? WHERE id=?", (json.dumps(it['photos']), it['id']))
    else:
        if not it.get('title') or int(it.get('price', 0)) <= 0: return {'error': 'Заполните название и цену'}
        c.execute("INSERT INTO listings(seller_id,title,price,category,size,cond,city,descr,photos,ts) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (uid, it['title'][:80], int(it['price']), it['category'], it.get('size', ''), it['condition'], it['city'],
                   it.get('desc', ''), json.dumps(it.get('photos', [])), now()))
    return {'ok': 1}

def remove(c, b):
    c.execute("DELETE FROM listings WHERE id=? AND seller_id=?", (b['id'], b['user'])); return {'ok': 1}

def view(c, b):
    c.execute("UPDATE listings SET views=views+1 WHERE id=?", (b['id'],)); return {'ok': 1}

def checkout(c, b):
    n = 0
    for i in b['ids']:
        l = c.execute("SELECT * FROM listings WHERE id=?", (i,)).fetchone()
        if l and not l['sold'] and l['seller_id'] != b['user']:
            c.execute("UPDATE listings SET sold=1 WHERE id=?", (i,))
            c.execute("INSERT INTO orders(listing_id,buyer_id,seller_id,title,price,ts) VALUES(?,?,?,?,?,?)",
                      (i, b['user'], l['seller_id'], l['title'], l['price'], now())); n += 1
    return {'bought': n}

def orders(c, b):
    u, out = b['user'], []
    for o in c.execute("SELECT * FROM orders WHERE buyer_id=? OR seller_id=? ORDER BY id DESC", (u, u)):
        buy = o['buyer_id'] == u
        other = c.execute("SELECT name FROM users WHERE id=?", (o['seller_id'] if buy else o['buyer_id'],)).fetchone()['name']
        out.append({'id': o['id'], 'listing': o['listing_id'], 'title': o['title'], 'price': o['price'], 'role': 'buy' if buy else 'sell', 'other': other, 'ts': o['ts']})
    return out

def send(c, b):
    t = b['text'].strip()[:500]
    if t: c.execute("INSERT INTO messages(listing_id,from_id,to_id,text,ts) VALUES(?,?,?,?,?)", (b['listing'], b['user'], b['to'], t, now()))
    return {'ok': 1}

def msgs(c, b):
    u = b['user']
    q = """SELECT m.id, m.listing_id listing, m.from_id "from", m.to_id "to", m.text, m.ts, f.name from_name, t.name to_name,
           COALESCE(l.title,'Объявление удалено') title FROM messages m JOIN users f ON f.id=m.from_id JOIN users t ON t.id=m.to_id
           LEFT JOIN listings l ON l.id=m.listing_id WHERE m.from_id=? OR m.to_id=? ORDER BY m.id"""
    return [dict(r) for r in c.execute(q, (u, u))]

def review(c, b):
    o = c.execute("SELECT seller_id FROM orders WHERE listing_id=? AND buyer_id=?", (b['listing'], b['user'])).fetchone()
    if not o: return {'error': 'Отзыв можно оставить только после покупки'}
    c.execute("DELETE FROM reviews WHERE listing_id=? AND buyer_id=?", (b['listing'], b['user']))
    c.execute("INSERT INTO reviews(listing_id,buyer_id,seller_id,stars,text,ts) VALUES(?,?,?,?,?,?)",
              (b['listing'], b['user'], o['seller_id'], max(1, min(5, int(b['stars']))), str(b.get('text', ''))[:500], now()))
    return {'ok': 1}

def reviews(c, b):
    return [dict(r) for r in c.execute("SELECT r.id, r.stars, r.text, r.ts, u.name buyer FROM reviews r JOIN users u ON u.id=r.buyer_id WHERE r.seller_id=? ORDER BY r.id", (b['seller'],))]

def allreviews(c, b):
    q = """SELECT r.id, r.stars, r.text, r.ts, r.listing_id listing, u.name buyer, s.name seller, COALESCE(l.title, 'Товар') title
           FROM reviews r JOIN users u ON u.id=r.buyer_id JOIN users s ON s.id=r.seller_id LEFT JOIN listings l ON l.id=r.listing_id ORDER BY r.id DESC LIMIT 300"""
    return [dict(r) for r in c.execute(q)]

API = {'allreviews': allreviews, 'review': review, 'reviews': reviews, 'ping': ping, 'register': register, 'login': login, 'list': list_, 'save': save, 'remove': remove, 'view': view,
       'checkout': checkout, 'orders': orders, 'send': send, 'msgs': msgs}

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=BASE, **k)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p in ('/', '/index.html', '/style.css', '/script.js', '/config.json'):
            if p == '/': self.path = '/index.html'
            return super().do_GET()
        self.send_error(404)

    def do_POST(self):
        name = self.path.split('?')[0][5:]
        n = int(self.headers.get('Content-Length', 0))
        c = db()
        try:
            res = API[name](c, json.loads(self.rfile.read(n) or b'{}')); c.commit()
        except Exception as e:
            res = {'error': str(e)}
        finally: c.close()
        data = json.dumps(res, ensure_ascii=False).encode('utf-8')
        self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a): pass

if __name__ == '__main__':
    init(); c0 = db(); export_users(c0); c0.close(); port = CFG.get('port', 8000)
    print(f'ШКАФ запущен: http://localhost:{port}  (Ctrl+C — остановить)')
    ThreadingHTTPServer(('0.0.0.0', port), H).serve_forever()
