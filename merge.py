"""Merge dataset ZIPs exported from several tablets into one dataset, without duplicates.

Run:  python merge.py [zip-or-folder ...] [-o merged.zip]
      (no inputs = every fish-dataset-*.zip in the current folder)

- Each fish is identified by its uid, so the same fish found in several exports
  (e.g. a tablet exported twice) is kept once, using the most recently edited copy.
- If two different fish share a fish_id (two tablets left on the same code, or
  exports from the old app version which numbered every tablet fish_0001...),
  the later one gets the start of its uid appended so nothing is overwritten.
- Identical photos attached to different fish are reported so you can check them.
"""
import argparse, csv, glob, hashlib, io, json, os, re, sys, zipfile
from datetime import datetime, timezone

COLUMNS = ['image_file', 'fish_id', 'uid', 'tablet', 'species', 'scientific_name', 'photo_view', 'length_cm', 'weight_g',
           'sex', 'body_colours', 'markings', 'fins_tail_mouth', 'description', 'recorded_at', 'updated_at']


def slug(s):  # same as slug() in app.js
    return re.sub(r'^_|_$', '', re.sub(r'[^a-z0-9]+', '_', (s or 'unknown').lower())) or 'unknown'


def find_inputs(args):
    paths = []
    for a in args or ['.']:
        if os.path.isdir(a):
            paths += sorted(glob.glob(os.path.join(a, 'fish-dataset-*.zip')))
        else:
            paths.append(a)
    return paths


def read_export(path):
    with zipfile.ZipFile(path) as z:
        meta = json.loads(z.read('records.json').decode('utf-8-sig'))
        for r in meta['records']:
            r['_images'] = [(img.get('view', ''), z.read(img['file'])) for img in r.get('images', [])]
            r['_exported_at'] = meta.get('exported_at', '')
            r['_source'] = os.path.basename(path)
            yield r


def main():
    ap = argparse.ArgumentParser(description='Merge Fish Data Collector exports without duplicates.')
    ap.add_argument('inputs', nargs='*', help='export ZIPs, or folders containing them (default: current folder)')
    ap.add_argument('-o', '--output', default='merged-fish-dataset.zip')
    opt = ap.parse_args()

    out_abs = os.path.abspath(opt.output)
    inputs = [p for p in find_inputs(opt.inputs) if os.path.abspath(p) != out_abs]
    if not inputs:
        sys.exit('No export ZIPs found. Pass the ZIP files or the folder they are in.')

    best, read = {}, 0
    for path in inputs:
        try:
            recs = list(read_export(path))
        except (zipfile.BadZipFile, KeyError, ValueError) as e:
            sys.exit(f'Could not read {path}: {e}')
        print(f'  {os.path.basename(path)}: {len(recs)} fish')
        for r in recs:
            read += 1
            r.setdefault('updated_at', r.get('recorded_at', ''))
            key = (r['updated_at'], r['_exported_at'])
            old = best.get(r['uid'])
            if old is None or key > (old['updated_at'], old['_exported_at']):
                best[r['uid']] = r

    recs = sorted(best.values(), key=lambda r: (r.get('recorded_at', ''), r['uid']))
    used, renamed, seen_photos, dup_photos = set(), [], {}, []
    rows, json_out, files = [], [], []
    for r in recs:
        fid = r.get('fish_id') or 'fish'
        if fid in used:
            new = f"{fid}-{r['uid'][:6]}"
            renamed.append((fid, new, r['_source']))
            fid = new
        used.add(fid)
        imgs = []
        for j, (view, data) in enumerate(r['_images'], 1):
            name = f"images/{slug(r.get('species'))}/{fid}_{j}.jpg"
            h = hashlib.sha1(data).hexdigest()
            if h in seen_photos and seen_photos[h][0] != fid:
                dup_photos.append((seen_photos[h][1], name))
            seen_photos.setdefault(h, (fid, name))
            files.append((name, data))
            imgs.append({'file': name, 'view': view})
            rows.append([name, fid, r['uid'], r.get('tablet', ''), r.get('species', ''), r.get('scientific_name', ''), view,
                         '' if r.get('length_cm') is None else r['length_cm'], '' if r.get('weight_g') is None else r['weight_g'],
                         r.get('sex', ''), r.get('body_colours', ''), r.get('markings', ''), r.get('fins_tail_mouth', ''),
                         r.get('description', ''), r.get('recorded_at', ''), r['updated_at']])
        json_out.append({**{k: v for k, v in r.items() if not k.startswith('_')}, 'fish_id': fid, 'images': imgs})

    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\r\n')
    w.writerow(COLUMNS)
    w.writerows(rows)
    with zipfile.ZipFile(opt.output, 'w', zipfile.ZIP_STORED) as z:
        for name, data in files:
            z.writestr(name, data)
        z.writestr('labels.csv', '﻿' + buf.getvalue())
        z.writestr('records.json', json.dumps({
            'exported_at': datetime.now(timezone.utc).isoformat(), 'merged_from': [os.path.basename(p) for p in inputs],
            'fish_count': len(json_out), 'records': json_out}, indent=2, ensure_ascii=False))

    print(f'\nRead {read} fish from {len(inputs)} export(s); {read - len(recs)} duplicate(s) removed.')
    print(f'Wrote {opt.output}: {len(recs)} fish, {len(rows)} photos.')
    for old, new, src in renamed:
        print(f'  ID clash: {old} (from {src}) renamed to {new}')
    if dup_photos:
        print(f'\nWARNING: {len(dup_photos)} photo(s) appear on more than one fish (same image added twice?):')
        for a, b in dup_photos:
            print(f'  {a}  ==  {b}')


if __name__ == '__main__':
    main()
