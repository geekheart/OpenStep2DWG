"""Check an exported DXF against the DXF read back from the final DWG."""
import argparse
from collections import Counter
import json
from pathlib import Path
import ezdxf
from ezdxf import bbox


def numeric(value):
    if isinstance(value,(int,float)):
        return round(float(value),7)
    return tuple(numeric(v) for v in value)


def signature(e):
    kind=e.dxftype();data=[kind,e.dxf.layer]
    if kind=='LINE':data += [numeric(e.dxf.start),numeric(e.dxf.end)]
    elif kind=='ARC':data += [numeric(e.dxf.center),numeric(e.dxf.radius),numeric(e.dxf.start_angle%360),numeric(e.dxf.end_angle%360)]
    elif kind=='CIRCLE':data += [numeric(e.dxf.center),numeric(e.dxf.radius)]
    elif kind=='SPLINE':data += [e.dxf.degree,numeric(e.control_points),numeric(e.knots),numeric(e.weights)]
    elif kind=='LWPOLYLINE':data += [numeric(e.get_points()),e.closed]
    elif kind=='TEXT':data += [e.dxf.text,numeric(e.dxf.insert),numeric(e.dxf.height),numeric(e.dxf.width)]
    elif kind=='DIMENSION':
        data += [numeric(e.get_measurement()),numeric(e.override().get('dimlfac')),
                 numeric(e.dxf.defpoint2),numeric(e.dxf.defpoint3)]
    else:
        raise ValueError('Unsupported verification entity: '+kind)
    return json.dumps(data)


def verify(before,after,output):
    a=ezdxf.readfile(before);b=ezdxf.readfile(after)
    ca=Counter(e.dxftype() for e in a.modelspace());cb=Counter(e.dxftype() for e in b.modelspace())
    sa=Counter(signature(e) for e in a.modelspace());sb=Counter(signature(e) for e in b.modelspace())
    errors=b.audit().errors
    report={'source':str(before),'roundtrip':str(after),'dxf_version':b.dxfversion,'units':b.units,
            'entity_counts_before':dict(ca),'entity_counts_after':dict(cb),
            'geometry_signature_decimal_places':7,'mismatched_entities':sum((sa-sb).values()),
            'dimension_values_mm':[round(e.get_measurement()*e.override().get('dimlfac'),5)
                                   for e in b.modelspace().query('DIMENSION')],
            'paper_bbox':str(bbox.extents(b.modelspace())),'audit_errors':len(errors)}
    report['passed']=(ca==cb and sa==sb and not errors and b.units==a.units and b.dxfversion==a.dxfversion)
    Path(output).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))
    if not report['passed']:
        raise SystemExit('DWG round-trip verification failed')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('before');p.add_argument('after');p.add_argument('report')
    a=p.parse_args();verify(a.before,a.after,a.report)
