"""Wikidata access with an on-disk cache (scripts/bank/.cache, not committed).

Data: Wikidata (https://www.wikidata.org), CC0 1.0. Popularity proxy: wikibase:sitelinks
(number of Wikipedia/Wikimedia editions with an article on the item).
"""
import hashlib, json, os, subprocess, time

ENDPOINT = 'https://query.wikidata.org/sparql'
UA = 'DeepcutBankBuilder/1.0 (offline trivia question builder; CC0 data reuse)'
CACHE = os.path.join(os.path.dirname(__file__), '.cache')
os.makedirs(CACHE, exist_ok=True)
_last = [0.0]

CACHE_ONLY = False

def sparql(query, retries=2):
    key = hashlib.sha1(query.encode()).hexdigest()
    path = os.path.join(CACHE, key + '.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    if CACHE_ONLY:  # rebuild from finished answer queries only (set by build_broad with WD_CACHE_ONLY=1)
        return None
    for attempt in range(retries):
        wait = 0.35 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        # curl, not urllib: some Python installs lack CA certificates.
        try:
            r = subprocess.run(['curl', '-sS', '--fail', '--max-time', '62', '-G', ENDPOINT,
                                '--data-urlencode', 'query=' + query, '-H', 'Accept: application/sparql-results+json', '-A', UA],
                               capture_output=True, text=True, check=True)
            rows = json.loads(r.stdout)['results']['bindings']
            out = [{k: v['value'] for k, v in b.items()} for b in rows]
            with open(path, 'w') as f: json.dump(out, f)
            return out
        except Exception as e:  # timeouts / 429: back off and retry
            if attempt == retries - 1:
                print('  ! query failed:', str(e)[:120]); return None
            time.sleep(4 * (attempt + 1))

def cached(query):
    path = os.path.join(CACHE, hashlib.sha1(query.encode()).hexdigest() + '.json')
    if not os.path.exists(path): return None
    with open(path) as f: return json.load(f)

def qid(uri): return uri.rsplit('/', 1)[-1]

# Standard answer-pool wrapper: distinct items matching PATTERN (which binds ?item),
# English label, up to a few English aliases, sitelink count.
def _pool_old(pattern, min_links, limit):
    return f'''SELECT ?item ?label (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) ?links WHERE {{
  hint:Query hint:optimizer "None" .
  {{ SELECT DISTINCT ?item WHERE {{ {pattern} }} }}
  ?item wikibase:sitelinks ?links . FILTER(?links >= {min_links})
  ?item rdfs:label ?label . FILTER(lang(?label) = "en")
  OPTIONAL {{ ?item skos:altLabel ?alt . FILTER(lang(?alt) = "en") }}
}} GROUP BY ?item ?label ?links ORDER BY DESC(?links) LIMIT {limit}'''

def pool(pattern, min_links=2, limit=350):
    """Best-known items matching PATTERN (binds ?item), with English label and aliases.
    Ranks by sitelinks first and fetches labels only for the top LIMIT items; the optimizer
    hint must sit inside the ranking subquery too, or big classes time out."""
    old = _pool_old(pattern, min_links, limit)
    rows = cached(old)  # results from the earlier query shape are still valid
    if rows is None:
        rows = sparql(f'''SELECT ?item ?label (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) ?links WHERE {{
  hint:Query hint:optimizer "None" .
  {{ SELECT ?item ?links WHERE {{
      hint:Query hint:optimizer "None" .
      {{ SELECT DISTINCT ?item WHERE {{ {pattern} }} }}
      ?item wikibase:sitelinks ?links . FILTER(?links >= {min_links})
    }} ORDER BY DESC(?links) LIMIT {limit} }}
  ?item rdfs:label ?label . FILTER(lang(?label) = "en")
  OPTIONAL {{ ?item skos:altLabel ?alt . FILTER(lang(?alt) = "en") }}
}} GROUP BY ?item ?label ?links''')
    if rows is None: return None
    out = [{'qid': qid(r['item']), 'label': r['label'], 'alts': [a for a in r.get('alts', '').split('|') if a], 'links': int(r['links'])} for r in rows]
    return sorted(out, key=lambda r: -r['links'])

# Parameter lists: items with a label, ordered by sitelinks.
def params(pattern, limit, min_links=20):
    q = f'''SELECT ?item ?label ?links WHERE {{
  hint:Query hint:optimizer "None" .
  {{ SELECT DISTINCT ?item WHERE {{ {pattern} }} }}
  ?item wikibase:sitelinks ?links . FILTER(?links >= {min_links})
  ?item rdfs:label ?label . FILTER(lang(?label) = "en")
}} ORDER BY DESC(?links) LIMIT {limit}'''
    rows = sparql(q) or []
    return [(qid(r['item']), r['label'], int(r['links'])) for r in rows]

def label(q):
    rows = sparql(f'SELECT ?l WHERE {{ wd:{q} rdfs:label ?l . FILTER(lang(?l)="en") }}') or []
    return rows[0]['l'] if rows else None

def labels(qids):
    """English labels for many items in one query."""
    vals = ' '.join('wd:' + q for q in qids)
    rows = sparql(f'SELECT ?i ?l WHERE {{ VALUES ?i {{ {vals} }} ?i rdfs:label ?l . FILTER(lang(?l)="en") }}') or []
    return {qid(r['i']): r['l'] for r in rows}

def taxon(name):
    """Resolve a scientific name (P225) to its QID; picks the best-linked match."""
    rows = sparql(f'SELECT ?i ?links WHERE {{ ?i wdt:P225 "{name}" ; wikibase:sitelinks ?links }} ORDER BY DESC(?links) LIMIT 1') or []
    return qid(rows[0]['i']) if rows else None

def by_label(text, cls=None):
    """Resolve an English label (optionally constrained to instances/subclasses of cls) to the best-linked QID."""
    c = f'?i wdt:P31/wdt:P279* wd:{cls} .' if cls else ''
    rows = sparql(f'SELECT ?i ?links WHERE {{ ?i rdfs:label "{text}"@en . {c} ?i wikibase:sitelinks ?links }} ORDER BY DESC(?links) LIMIT 1') or []
    return qid(rows[0]['i']) if rows else None

def pool_grouped(pattern, pvals, min_links=2):
    """Answer pools for many parameters in one query. PATTERN uses ?p for the parameter.
    Returns {param_qid: [rows sorted by sitelinks]}, or None if the query failed."""
    vals = ' '.join('wd:' + p for p in pvals)
    q = f'''SELECT ?p ?item ?label (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) ?links WHERE {{
  hint:Query hint:optimizer "None" .
  {{ SELECT DISTINCT ?p ?item WHERE {{ VALUES ?p {{ {vals} }} {pattern} }} }}
  ?item wikibase:sitelinks ?links . FILTER(?links >= {min_links})
  ?item rdfs:label ?label . FILTER(lang(?label) = "en")
  OPTIONAL {{ ?item skos:altLabel ?alt . FILTER(lang(?alt) = "en") }}
}} GROUP BY ?p ?item ?label ?links'''
    rows = sparql(q)
    if rows is None: return None
    out = {p: [] for p in pvals}
    for r in rows:
        out.setdefault(qid(r['p']), []).append({'qid': qid(r['item']), 'label': r['label'], 'alts': [a for a in r.get('alts', '').split('|') if a], 'links': int(r['links'])})
    for p in out: out[p].sort(key=lambda r: -r['links'])
    return out
