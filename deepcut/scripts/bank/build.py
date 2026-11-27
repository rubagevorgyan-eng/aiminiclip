"""Build the DEEPCUT question bank.

  python3 scripts/bank/build.py --batch 1      # build the batch's unfinished families (cached queries are reused)
  python3 scripts/bank/build.py --write        # write public/bank from all built batches + curated questions

Output: public/bank/index.json (question metadata) and public/bank/q/<id>.json (answers).
Each family is saved in scripts/bank/built/fam-<id>.json, so finished work is never regenerated.
"""
import argparse, glob, json, math, os, re, sys, time, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import wd
from families import FAMILIES

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BUILT = os.path.join(os.path.dirname(__file__), 'built')
os.makedirs(BUILT, exist_ok=True)
TIERS = ['common', 'uncommon', 'notable', 'rare', 'legendary', 'mythic']
MAX_ANSWERS = 300

ROMAN = re.compile(r'^(x{0,3})(ix|iv|v?i{0,3})$')
def _roman(t):
    if not t or not ROMAN.match(t): return t
    v = {'i': 1, 'v': 5, 'x': 10}; n = 0
    for i, ch in enumerate(t):
        a, b = v[ch], v.get(t[i + 1], 0) if i + 1 < len(t) else 0
        n += -a if a < b else a
    return str(n)
WORD = {'st': 'saint', 'mt': 'mount', 'ft': 'fort'}
def norm(s):
    """Mirror of normalize() in src/engine/match.ts (used for de-duplication and alias clashes)."""
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().replace('&', ' and ')
    s = re.sub(r"['’`.]", '', s)
    words = [w for w in re.sub(r'[^a-z0-9]+', ' ', s).split() if w]
    words = [_roman(WORD.get(w, w)) for w in words]
    if len(words) > 1 and words[0] == 'the': words = words[1:]
    return ' '.join(words)

PAREN = re.compile(r'\s*\([^)]*\)\s*$')
def clean_label(l):
    base = PAREN.sub('', l).strip()
    return base if base else l

def rarity(links, top):
    r = math.log(links + 1) / math.log(top + 1)
    for t, cut in zip(TIERS, (0.82, 0.70, 0.58, 0.46, 0.34)):
        if r >= cut: return t
    return 'mythic'

def make_answers(rows, exclude_qid=None, people=False):
    seen, out = set(), []
    for r in rows:
        if r['qid'] == exclude_qid or re.fullmatch(r'Q\d+', r['label']) or len(r['label']) > 60: continue
        name = clean_label(r['label']); k = norm(name)
        if not k or k in seen: continue
        seen.add(k)
        aliases = []
        if name != r['label']: aliases.append(r['label'])
        aliases += [a for a in r['alts'] if len(a) <= 50 and not re.fullmatch(r'Q\d+', a)]
        out.append({'name': name, 'aliases': aliases, 'links': r['links']})
        if len(out) >= MAX_ANSWERS: break
    if people:  # surname alias when unique in this pool ("Messi")
        from collections import Counter
        sur = Counter(norm(a['name']).split()[-1] for a in out if len(norm(a['name']).split()) > 1)
        for a in out:
            parts = norm(a['name']).split()
            if len(parts) > 1 and len(parts[-1]) >= 4 and sur[parts[-1]] == 1: a['aliases'].append(a['name'].split()[-1])
    # drop aliases that clash with another answer's name/alias (the better-known answer keeps it)
    owner = {}
    for a in out: owner.setdefault(norm(a['name']), a['name'])
    for a in out:
        keep = []
        for al in a['aliases']:
            k = norm(al)
            if not k or k == norm(a['name']): continue
            if owner.setdefault(k, a['name']) != a['name']: continue
            keep.append(al)
        a['aliases'] = list(dict.fromkeys(keep))[:5]
    top = max((a['links'] for a in out), default=1)
    res = []
    for a in out:
        e = {'name': a['name'], 'rarity': rarity(a['links'], top)}
        if a['aliases']: e['aliases'] = a['aliases']
        res.append(e)
    return res

def resolve_params(fam):
    kind = fam['param'][0]
    if kind == 'params':
        _, pat, limit, minl = fam['param']; return wd.params(pat, limit, minl)
    if kind == 'counted':
        _, pat, limit, minc = fam['param']
        rows = wd.sparql(f'''SELECT ?item ?label ?links WHERE {{
  hint:Query hint:optimizer "None" .
  {{ SELECT ?item (COUNT(DISTINCT ?x) AS ?n) WHERE {{ {pat} }} GROUP BY ?item HAVING (?n >= {minc}) }}
  ?item wikibase:sitelinks ?links ; rdfs:label ?label . FILTER(lang(?label) = "en")
}} ORDER BY DESC(?links) LIMIT {limit}''') or []
        return [(wd.qid(r['item']), r['label'], int(r['links'])) for r in rows]
    if kind == 'taxa':
        out = []
        for sci, phrase in fam['param'][1]:
            q = wd.taxon(sci)
            if q: out.append((q, phrase, 0))
            else: print('  ! taxon not found', sci)
        return out
    if kind == 'labels':
        out = []
        for item in fam['param'][1]:
            text, phrase = item[0], item[1]; cls = item[2] if len(item) > 2 else fam['param'][2] if len(fam['param']) > 2 else None
            q = wd.by_label(text, cls)
            print(f'    {text} -> {q}')
            if q: out.append((q, phrase, 0))
        return out
    if kind == 'patterns':
        return [(pat, phrase, 0) for phrase, pat in fam['param'][1]]
    raise ValueError(kind)

DISPLAY = {"People's Republic of China": 'China', 'Kingdom of the Netherlands': 'the Netherlands', 'Republic of Ireland': 'Ireland',
           'Kingdom of Denmark': 'Denmark', 'State of Palestine': 'Palestine', 'Federated States of Micronesia': 'Micronesia'}
THE = {'United States', 'United Kingdom', 'Netherlands', 'Philippines', 'Czech Republic', 'Democratic Republic of the Congo',
       'Republic of the Congo', 'Bahamas', 'The Bahamas', 'Gambia', 'Central African Republic', 'Dominican Republic', 'United Arab Emirates',
       'Maldives', 'Marshall Islands', 'Solomon Islands', 'Comoros', 'Seychelles', 'Vatican City', 'Holy See', 'Ivory Coast'}
def place(label):
    """Natural form for a place inside a sentence ("the United States", "China")."""
    label = DISPLAY.get(label, label)
    return ('the ' + label) if label in THE else label

def slug(s): return re.sub(r'[^a-z0-9]+', '-', norm(s)).strip('-')[:40]

def build_family(fam):
    params = resolve_params(fam)
    print(f"{fam['id']}: {len(params)} params", flush=True)
    kind = fam['param'][0]
    pools = {}
    if kind == 'patterns':
        for p, label, _ in params: pools[p] = wd.pool(p, fam.get('min_links', 3))
    else:
        # one query per chunk of parameters; a failed chunk falls back to one query per parameter
        pat = fam['pattern'].replace('wd:{p}', '?p')
        chunk = fam.get('chunk', 10)
        for i in range(0, len(params), chunk):
            ids = [p for p, _, _ in params[i:i + chunk]]
            got = wd.pool_grouped(pat, ids, fam.get('min_links', 3))
            if got is None:
                for p in ids: pools[p] = wd.pool(fam['pattern'].replace('{p}', p), fam.get('min_links', 3))
            else: pools.update(got)
            print(f"  {fam['id']}: {min(i + chunk, len(params))}/{len(params)}", flush=True)
    qs = []
    n = len(params)
    for i, (p, label, _) in enumerate(params):
        rows = pools.get(p)
        if rows is None: continue
        qid_ = slug(label) if kind == 'patterns' else p
        excl = None if kind == 'patterns' else p
        answers = make_answers(rows, excl, fam.get('people', False))
        if len(answers) < fam.get('min_answers', 10):
            print(f"  - skip {label}: {len(answers)} answers"); continue
        diff = fam.get('difficulty') or ('easy' if i < 0.6 * n else 'medium' if i < 0.9 * n else 'hard')
        qs.append({'id': f"{fam['id']}-{qid_}".lower(), 'text': fam['text'].replace('{label}', place(label) if fam.get('place') else label).replace('..', '.').replace('?.', '?'), 'category': fam['category'],
                   'difficulty': diff, 'family': fam['id'], 'answers': answers,
                   'source': {'dataset': 'Wikidata (CC0)', 'param': p if kind != 'patterns' else None, 'retrieved': time.strftime('%Y-%m-%d')}})
    return qs

TIER_KEYS = dict(zip('cunrlm', TIERS))
def build_static(fam):
    qs = []
    for qid_, text, cat, diff, tiers in fam['static']:
        answers = []
        for k in 'cunrlm':
            for item in [x for x in tiers.get(k, '').split(';') if x]:
                names = item.split('|'); a = {'name': names[0], 'rarity': TIER_KEYS[k]}
                if len(names) > 1: a['aliases'] = names[1:]
                answers.append(a)
        qs.append({'id': qid_, 'text': text, 'category': cat, 'difficulty': diff, 'family': qid_, 'answers': answers,
                   'source': {'dataset': 'DEEPCUT editorial (complete fixed set, hand-checked)'}})
    return qs

def build_one(fid):
    """Build one family into built/fam-<id>.json (resumable: a finished family is never rebuilt unless --force)."""
    fam = next(f for f in FAMILIES if f['id'] == fid)
    qs = build_static(fam) if fam.get('static') else build_family(fam)
    with open(os.path.join(BUILT, f'fam-{fid}.json'), 'w') as f: json.dump(qs, f, ensure_ascii=False)
    print(f'{fid}: {len(qs)} questions, {sum(len(q["answers"]) for q in qs)} answers', flush=True)

def build_batch(b, force=False, jobs=4):
    """Build every family of a batch, a few in parallel (polite to the Wikidata endpoint)."""
    import subprocess
    todo = [f['id'] for f in FAMILIES if f['batch'] == b and (force or not os.path.exists(os.path.join(BUILT, f'fam-{f["id"]}.json')))]
    running = []
    while todo or running:
        while todo and len(running) < jobs:
            fid = todo.pop(0)
            running.append(subprocess.Popen([sys.executable, '-u', __file__, '--family', fid]))
        time.sleep(2)
        running = [p for p in running if p.poll() is None]
    print(f'batch {b} done')

CAT = {'History': 'History & Civilizations', 'Science': 'Science & Technology', 'Animals': 'Animals & Nature',
       'Movies': 'Movies & TV', 'Cars': 'Cars & Vehicles'}
def curated():
    qs = []
    for fn in sorted(glob.glob(os.path.join(ROOT, 'src', 'data', 'questions', '*.json'))):
        for q in json.load(open(fn)):
            q = dict(q); q['category'] = CAT.get(q['category'], q['category']); q['family'] = 'curated-' + q['id']
            q['source'] = {'dataset': 'DEEPCUT editorial (hand-checked)'}
            qs.append(q)
    return qs

def write():
    allq = curated()
    for fn in sorted(glob.glob(os.path.join(BUILT, 'fam-*.json'))): allq += json.load(open(fn))
    ids = set(); bank = []
    for q in allq:
        if q['id'] in ids: continue
        ids.add(q['id']); bank.append(q)
    out = os.path.join(ROOT, 'public', 'bank'); qdir = os.path.join(out, 'q')
    os.makedirs(qdir, exist_ok=True)
    for f in glob.glob(os.path.join(qdir, '*.json')): os.remove(f)
    index = []
    for q in bank:
        body = {k: q[k] for k in ('id', 'answers', 'ignore', 'reject', 'source') if k in q}
        with open(os.path.join(qdir, q['id'] + '.json'), 'w') as f: json.dump(body, f, ensure_ascii=False, separators=(',', ':'))
        index.append({'id': q['id'], 'text': q['text'], 'category': q['category'], 'difficulty': q['difficulty'], 'family': q['family'], 'n': len(q['answers'])})
    with open(os.path.join(out, 'index.json'), 'w') as f:
        json.dump({'version': 2, 'source': 'Wikidata (CC0 1.0, https://www.wikidata.org) + DEEPCUT editorial', 'questions': index}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {len(index)} questions, {sum(q["n"] for q in index)} answers')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--batch', type=int); ap.add_argument('--family'); ap.add_argument('--force', action='store_true'); ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    if a.family: build_one(a.family)
    if a.batch: build_batch(a.batch, a.force)
    if a.write: write()
