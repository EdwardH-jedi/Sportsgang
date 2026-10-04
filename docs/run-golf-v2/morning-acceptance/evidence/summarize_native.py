"""Derive wheel selection from native AX row centers and verify Done target frames.
Pixels remain the evidence for complete visible labels. No style assertions.
"""
import json
from pathlib import Path

ev = Path(__file__).resolve().parent
out = []
for p in sorted((ev / 'native').glob('*.json')):
    item = {'capture':p.stem, 'close_targets':[], 'wheels':{}}
    rows = {'hour':[], 'minute':[]}
    def walk(xs, scroll=None):
        for x in xs:
            if x.get('type') == 'ScrollArea':
                current_scroll = x['frame']
            else:
                current_scroll = scroll
            label = x.get('AXLabel') or ''
            if label.startswith('Close ') and label.endswith(' time picker'):
                f=x['frame']
                item['close_targets'].append(dict(label=label,frame=f,fits=f['x']>=0 and f['x']+f['width']<=390 and f['y']>=0 and f['y']+f['height']<=844,minimum_target=f['width']>=44 and f['height']>=44))
            for kind in rows:
                if label.startswith(f'Set {kind} ') and current_scroll:
                    f=x['frame']; center=f['y']+f['height']/2
                    target=current_scroll['y']+current_scroll['height']/2
                    rows[kind].append(dict(label=label,center=center,band_center=target,distance=abs(center-target)))
            walk(x.get('children',[]),current_scroll)
    walk(json.loads(p.read_text()))
    for kind, choices in rows.items():
        if choices:
            item['wheels'][kind]=min(choices,key=lambda x:x['distance'])
    out.append(item)
(ev/'native-layout-and-selection.json').write_text(json.dumps(out,indent=2)+'\n')
for item in out:
    print(item['capture'],item['close_targets'],item['wheels'])
for item in out:
    for close in item['close_targets']:
        assert close['fits'] and close['minimum_target'], item
for name in ['default-15-to-30','default-45-to-30','max-15-to-30','max-45-to-30','max-reopened-start','default-reopened-start','default-end-picker','max-end-picker']:
    item=next(i for i in out if i['capture']==name)
    assert item['wheels']['minute']['label']=='Set minute 30',item
    assert item['wheels']['minute']['distance']<1,item
for name in ['default-swipe-settled','max-after-swipe']:
    item=next(i for i in out if i['capture']==name)
    assert item['wheels']['minute']['label']=='Set minute 45',item
    assert item['wheels']['minute']['distance']<1,item
print('Native frame and centered-minute checks PASS')
